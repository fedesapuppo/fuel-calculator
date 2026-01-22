#!/usr/bin/env python3
"""
Scrape fuel prices from naftas.com.ar and update fuel_prices.json
This script is designed to run monthly via GitHub Actions.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Error: Required libraries not installed")
    print("Run: pip install requests beautifulsoup4")
    sys.exit(1)

# Configuration
NAFTAS_URL = "https://naftas.com.ar"

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
FUEL_PRICES_FILE = DATA_DIR / "fuel_prices.json"

# Mapping from website names to our internal fuel type codes
FUEL_TYPE_MAPPING = {
    "super": "NAFTA",           # Nafta Super
    "gasoil": "ULTRA",          # Gasoil / Diesel Común (Ultra)
    "euro": "INFINIA_DIESEL",   # Euro / Infinia Diesel
}


def fetch_page(url):
    """
    Fetch webpage content.

    Args:
        url: URL to fetch

    Returns:
        Response text or None on error
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {url}: {e}")
        return None


def parse_price(price_text):
    """
    Parse price text to float.

    Args:
        price_text: Price string (e.g., "1.566" or "1566")

    Returns:
        Float price value
    """
    # Remove currency symbols, spaces, and normalize
    cleaned = re.sub(r"[^\d.,]", "", price_text)

    # Handle Argentine format (1.566,00 or 1.566)
    if "," in cleaned:
        # Format: 1.566,00 -> 1566.00
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif cleaned.count(".") > 1:
        # Format: 1.566 (thousand separator) -> 1566
        cleaned = cleaned.replace(".", "")
    elif "." in cleaned:
        # Could be decimal (15.66) or thousand (1.566)
        # If 3 digits after dot, it's a thousand separator
        parts = cleaned.split(".")
        if len(parts) == 2 and len(parts[1]) == 3:
            cleaned = cleaned.replace(".", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def scrape_fuel_prices():
    """
    Scrape fuel prices from naftas.com.ar

    Returns:
        dict with fuel prices or None on error
    """
    print(f"Fetching prices from {NAFTAS_URL}...")

    html = fetch_page(NAFTAS_URL)
    if not html:
        return None

    soup = BeautifulSoup(html, "html.parser")

    prices = {}

    # naftas.com.ar structure: Look for price elements
    # The site typically has sections for each fuel type

    # Try to find price cards or sections
    # Look for common patterns in the page

    # Method 1: Look for text patterns with prices
    text = soup.get_text()

    # Common patterns to look for
    patterns = [
        # Pattern: "Super $1.566" or "Super: $1.566"
        (r"super[:\s]*\$?\s*([\d.,]+)", "NAFTA"),
        (r"nafta\s+super[:\s]*\$?\s*([\d.,]+)", "NAFTA"),
        # Pattern: "Gasoil $1.601"
        (r"gasoil[:\s]*\$?\s*([\d.,]+)", "ULTRA"),
        (r"diesel\s+com[úu]n[:\s]*\$?\s*([\d.,]+)", "ULTRA"),
        # Pattern: "Euro $1.809"
        (r"euro[:\s]*\$?\s*([\d.,]+)", "INFINIA_DIESEL"),
        (r"infinia\s+diesel[:\s]*\$?\s*([\d.,]+)", "INFINIA_DIESEL"),
        (r"diesel\s+premium[:\s]*\$?\s*([\d.,]+)", "INFINIA_DIESEL"),
    ]

    for pattern, fuel_type in patterns:
        if fuel_type not in prices:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                price = parse_price(match.group(1))
                if price and price > 100:  # Sanity check: price should be > 100 ARS
                    prices[fuel_type] = price
                    print(f"  Found {fuel_type}: ${price}")

    # Method 2: Look for specific HTML elements
    # Try finding cards, tables, or specific class names
    price_elements = soup.find_all(class_=re.compile(r"price|precio|valor", re.I))

    for elem in price_elements:
        text = elem.get_text().lower()
        price_text = re.search(r"\$?\s*([\d.,]+)", elem.get_text())

        if price_text:
            price = parse_price(price_text.group(1))
            if price and price > 100:
                if "super" in text or "nafta" in text:
                    if "NAFTA" not in prices:
                        prices["NAFTA"] = price
                elif "gasoil" in text or "diesel" in text and "euro" not in text:
                    if "ULTRA" not in prices:
                        prices["ULTRA"] = price
                elif "euro" in text or "infinia" in text or "premium" in text:
                    if "INFINIA_DIESEL" not in prices:
                        prices["INFINIA_DIESEL"] = price

    # Validate we got all prices
    required_types = ["NAFTA", "ULTRA", "INFINIA_DIESEL"]
    missing = [t for t in required_types if t not in prices]

    if missing:
        print(f"Warning: Could not find prices for: {missing}")
        print("Attempting to extract prices from page structure...")

        # Fallback: Try to extract any numbers that look like fuel prices
        all_prices = re.findall(r"\b(1[0-9]{3}(?:\.[0-9]{2})?)\b", text)

        if len(all_prices) >= 3:
            # Sort and assume: cheapest=NAFTA, middle=ULTRA, highest=INFINIA_DIESEL
            numeric_prices = sorted([float(p) for p in all_prices[:6]])

            # Remove duplicates and get 3 distinct prices
            unique_prices = list(dict.fromkeys(numeric_prices))

            if len(unique_prices) >= 3:
                if "NAFTA" not in prices:
                    prices["NAFTA"] = unique_prices[0]
                if "ULTRA" not in prices:
                    prices["ULTRA"] = unique_prices[1]
                if "INFINIA_DIESEL" not in prices:
                    prices["INFINIA_DIESEL"] = unique_prices[2]

                print(f"  Extracted fallback prices: {prices}")

    return prices if len(prices) >= 3 else None


def load_current_prices():
    """Load current fuel prices from JSON file."""
    if FUEL_PRICES_FILE.exists():
        with open(FUEL_PRICES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_prices(prices):
    """
    Save fuel prices to JSON file.

    Args:
        prices: dict with NAFTA, ULTRA, INFINIA_DIESEL prices
    """
    data = {
        "NAFTA": prices.get("NAFTA", 0),
        "ULTRA": prices.get("ULTRA", 0),
        "INFINIA_DIESEL": prices.get("INFINIA_DIESEL", 0),
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "source": "naftas.com.ar",
        "labels": {
            "NAFTA": "Nafta Super",
            "ULTRA": "Gasoil",
            "INFINIA_DIESEL": "Infinia Diesel (Euro)"
        }
    }

    with open(FUEL_PRICES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nPrices saved to: {FUEL_PRICES_FILE}")


def main():
    """Main function."""
    print("=" * 60)
    print("Fuel Price Scraper - naftas.com.ar")
    print("=" * 60)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Load current prices for comparison
    current = load_current_prices()
    print("Current prices:")
    for fuel_type in ["NAFTA", "ULTRA", "INFINIA_DIESEL"]:
        print(f"  {fuel_type}: ${current.get(fuel_type, 'N/A')}")
    print()

    # Scrape new prices
    new_prices = scrape_fuel_prices()

    if not new_prices:
        print("\nError: Could not scrape fuel prices")
        print("Keeping existing prices")
        sys.exit(1)

    print("\nNew prices found:")
    for fuel_type, price in new_prices.items():
        old_price = current.get(fuel_type, 0)
        change = ""
        if old_price:
            diff = price - old_price
            pct = (diff / old_price) * 100 if old_price else 0
            if diff > 0:
                change = f" (+${diff:.0f}, +{pct:.1f}%)"
            elif diff < 0:
                change = f" (-${abs(diff):.0f}, {pct:.1f}%)"
        print(f"  {fuel_type}: ${price:.0f}{change}")

    # Save new prices
    save_prices(new_prices)

    print("\nDone!")


if __name__ == "__main__":
    main()
