#!/usr/bin/env python3
"""
Generate routes cache using Google Distance Matrix API.
Calculates real road distances between all location pairs.
"""

import json
import os
import time
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: requests library not installed")
    print("Run: pip install requests")
    sys.exit(1)

# Configuration
# Set GOOGLE_API_KEY environment variable before running
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
LOCATIONS_FILE = DATA_DIR / "locations.json"
ROUTES_CACHE_FILE = DATA_DIR / "routes_cache.json"


def load_locations():
    """Load locations from JSON file."""
    with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_distance_matrix(origins, destinations):
    """
    Fetch distance matrix from Google API.

    Args:
        origins: List of location dicts with latitud/longitud
        destinations: List of location dicts with latitud/longitud

    Returns:
        API response data or None on error
    """
    # Format coordinates as "lat,lng|lat,lng|..."
    origins_str = "|".join(
        f"{loc['latitud']},{loc['longitud']}" for loc in origins
    )
    destinations_str = "|".join(
        f"{loc['latitud']},{loc['longitud']}" for loc in destinations
    )

    params = {
        "origins": origins_str,
        "destinations": destinations_str,
        "mode": "driving",
        "key": GOOGLE_API_KEY
    }

    response = requests.get(DISTANCE_MATRIX_URL, params=params, timeout=30)

    if not response.ok:
        print(f"HTTP Error: {response.status_code}")
        return None

    data = response.json()

    if data.get("status") != "OK":
        print(f"API Error: {data.get('status')} - {data.get('error_message', '')}")
        return None

    return data


def process_matrix_response(data, origins, destinations):
    """
    Process Distance Matrix API response into route cache entries.

    Args:
        data: API response
        origins: List of origin locations
        destinations: List of destination locations

    Returns:
        Dict of cache_key -> route_info
    """
    routes = {}
    rows = data.get("rows", [])

    for i, row in enumerate(rows):
        origin = origins[i]
        elements = row.get("elements", [])

        for j, element in enumerate(elements):
            destination = destinations[j]

            # Skip same origin/destination
            if origin["id"] == destination["id"]:
                continue

            cache_key = f"{origin['id']}_{destination['id']}"

            if element.get("status") == "OK":
                distance_m = element["distance"]["value"]
                duration_s = element["duration"]["value"]

                routes[cache_key] = {
                    "distance_km": round(distance_m / 1000, 1),
                    "duration_seconds": duration_s
                }
            else:
                print(f"  Warning: {origin['nombre'][:20]} -> {destination['nombre'][:20]}: {element.get('status')}")

    return routes


def main():
    print("=" * 60)
    print("Route Generation Script (Google Distance Matrix API)")
    print("=" * 60)

    if not GOOGLE_API_KEY:
        print("Error: GOOGLE_API_KEY environment variable not set")
        print("Usage: GOOGLE_API_KEY=your_key python scripts/generate_all_routes.py")
        sys.exit(1)

    locations = load_locations()
    n = len(locations)
    print(f"Found {n} locations")
    print(f"Total routes to calculate: {n * (n - 1)}")
    print()

    cache = {}

    # Google Distance Matrix API limits:
    # - Max 25 origins or 25 destinations per request
    # - Max 100 elements (origins × destinations) per request
    #
    # With 16 locations, we can do it in batches:
    # Batch size of 10 origins × 10 destinations = 100 elements max

    BATCH_SIZE = 10
    request_count = 0

    # Process in batches
    for i_start in range(0, n, BATCH_SIZE):
        i_end = min(i_start + BATCH_SIZE, n)
        batch_origins = locations[i_start:i_end]

        for j_start in range(0, n, BATCH_SIZE):
            j_end = min(j_start + BATCH_SIZE, n)
            batch_destinations = locations[j_start:j_end]

            print(f"Request {request_count + 1}: origins [{i_start+1}-{i_end}] × destinations [{j_start+1}-{j_end}]")

            data = get_distance_matrix(batch_origins, batch_destinations)

            if data:
                routes = process_matrix_response(data, batch_origins, batch_destinations)
                cache.update(routes)
                print(f"  Got {len(routes)} routes")
            else:
                print("  Failed!")

            request_count += 1
            time.sleep(0.5)  # Small delay between requests

    # Save cache
    with open(ROUTES_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"API requests made: {request_count}")
    print(f"Total routes cached: {len(cache)}")
    print(f"Expected routes: {n * (n - 1)}")
    print(f"Saved to: {ROUTES_CACHE_FILE}")

    if len(cache) < n * (n - 1):
        print(f"\nWarning: {n * (n - 1) - len(cache)} routes failed!")


if __name__ == "__main__":
    main()
