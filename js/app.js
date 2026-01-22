/**
 * Fuel Calculator Application
 * Calculates fuel costs for trips between Argentine Air Force bases
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    DATA_PATH: {
        vehicles: 'data/vehicles.json',
        locations: 'data/locations.json',
        fuelPrices: 'data/fuel_prices.json',
        routesCache: 'data/routes_cache.json'
    }
};

// ============================================================================
// State Management
// ============================================================================

const state = {
    vehicles: [],
    locations: [],
    fuelPrices: {},
    routesCache: {},
    selectedOrigin: null,
    selectedDestination: null,
    selectedVehicle: null,
    tripType: 'one-way'
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format number as Argentine currency
 * @param {number} value - The value to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Format number with Argentine locale
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number string
 */
function formatNumber(value, decimals = 2) {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}

/**
 * Format duration from seconds to human readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours === 0) {
        return `${minutes} min`;
    }
    return `${hours}h ${minutes}min`;
}

/**
 * Generate cache key for a route
 * @param {string} originId - Origin location ID
 * @param {string} destinationId - Destination location ID
 * @returns {string} Cache key
 */
function getRouteCacheKey(originId, destinationId) {
    return `${originId}_${destinationId}`;
}

/**
 * Get fuel type display label
 * @param {string} fuelType - Fuel type code
 * @returns {string} Display label
 */
function getFuelTypeLabel(fuelType) {
    const labels = {
        'NAFTA': 'Nafta Super',
        'ULTRA': 'Gasoil',
        'INFINIA_DIESEL': 'Infinia Diesel'
    };
    return labels[fuelType] || fuelType;
}

/**
 * Get fuel badge CSS class
 * @param {string} fuelType - Fuel type code
 * @returns {string} CSS class
 */
function getFuelBadgeClass(fuelType) {
    const classes = {
        'NAFTA': 'fuel-badge-nafta',
        'ULTRA': 'fuel-badge-ultra',
        'INFINIA_DIESEL': 'fuel-badge-infinia'
    };
    return classes[fuelType] || '';
}

// ============================================================================
// Data Loading
// ============================================================================

/**
 * Load all application data
 */
async function loadData() {
    try {
        const [vehiclesRes, locationsRes, fuelPricesRes, routesCacheRes] = await Promise.all([
            fetch(CONFIG.DATA_PATH.vehicles),
            fetch(CONFIG.DATA_PATH.locations),
            fetch(CONFIG.DATA_PATH.fuelPrices),
            fetch(CONFIG.DATA_PATH.routesCache).catch(() => ({ ok: false }))
        ]);

        if (!vehiclesRes.ok || !locationsRes.ok || !fuelPricesRes.ok) {
            throw new Error('Error al cargar los datos de la aplicación');
        }

        state.vehicles = await vehiclesRes.json();
        state.locations = await locationsRes.json();
        state.fuelPrices = await fuelPricesRes.json();

        // Load routes cache if available
        if (routesCacheRes.ok) {
            state.routesCache = await routesCacheRes.json();
        }

        initializeUI();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('No se pudieron cargar los datos. Intente recargar la página.');
    }
}

// ============================================================================
// UI Initialization
// ============================================================================

/**
 * Initialize all UI components
 */
function initializeUI() {
    initializeDropdowns();
    initializeTripTypeToggle();
    initializeForm();
    displayFuelPrices();
}

/**
 * Display current fuel prices in the footer section
 */
function displayFuelPrices() {
    const container = document.getElementById('fuel-prices-display');
    const lastUpdatedEl = document.getElementById('prices-last-updated');

    const pricesHTML = Object.keys(state.fuelPrices)
        .filter(key => key !== 'last_updated' && key !== 'source' && key !== 'labels')
        .map(fuelType => `
            <div class="price-card">
                <div class="price-card-label">${getFuelTypeLabel(fuelType)}</div>
                <div class="price-card-value">${formatCurrency(state.fuelPrices[fuelType])}</div>
            </div>
        `).join('');

    container.innerHTML = pricesHTML;

    if (state.fuelPrices.last_updated) {
        lastUpdatedEl.textContent = `Última actualización: ${state.fuelPrices.last_updated}`;
    }
}

// ============================================================================
// Searchable Dropdown Component
// ============================================================================

/**
 * Initialize all searchable dropdowns
 */
function initializeDropdowns() {
    // Origin dropdown
    createSearchableDropdown('origin', state.locations, {
        displayField: 'nombre',
        subtitleField: 'ubicacion',
        onSelect: (item) => {
            state.selectedOrigin = item;
            clearError('origin');
        }
    });

    // Destination dropdown
    createSearchableDropdown('destination', state.locations, {
        displayField: 'nombre',
        subtitleField: 'ubicacion',
        onSelect: (item) => {
            state.selectedDestination = item;
            clearError('destination');
        }
    });

    // Vehicle dropdown
    createSearchableDropdown('vehicle', state.vehicles, {
        displayField: 'name',
        subtitleField: (item) => {
            const consumption = item.consumption_type === 'per_100km'
                ? `${item.consumption} L/100km`
                : `${item.consumption} L/hora`;
            return `${getFuelTypeLabel(item.fuel_type)} - ${consumption}`;
        },
        onSelect: (item) => {
            state.selectedVehicle = item;
            clearError('vehicle');
            toggleHoursInput(item.consumption_type === 'per_hour');
        }
    });
}

/**
 * Create a searchable dropdown component
 * @param {string} name - Dropdown identifier
 * @param {Array} items - Items to display
 * @param {Object} options - Configuration options
 */
function createSearchableDropdown(name, items, options) {
    const container = document.querySelector(`[data-dropdown="${name}"]`);
    const input = document.getElementById(`${name}-search`);
    const hiddenInput = document.getElementById(`${name}-value`);
    const listContainer = container.querySelector('.dropdown-list');

    let highlightedIndex = -1;
    let filteredItems = [...items];
    let isOpen = false;

    /**
     * Render dropdown items
     */
    function renderItems(itemsToRender) {
        if (itemsToRender.length === 0) {
            listContainer.innerHTML = '<div class="dropdown-no-results">No se encontraron resultados</div>';
            return;
        }

        listContainer.innerHTML = itemsToRender.map((item, index) => {
            const subtitle = typeof options.subtitleField === 'function'
                ? options.subtitleField(item)
                : item[options.subtitleField];

            return `
                <div class="dropdown-item" data-index="${index}">
                    <div class="dropdown-item-title">${item[options.displayField]}</div>
                    ${subtitle ? `<div class="dropdown-item-subtitle">${subtitle}</div>` : ''}
                </div>
            `;
        }).join('');

        // Add click handlers
        listContainer.querySelectorAll('.dropdown-item').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                selectItem(filteredItems[index]);
            });
        });
    }

    /**
     * Select an item
     */
    function selectItem(item) {
        input.value = item[options.displayField];
        hiddenInput.value = item.id;
        closeDropdown();
        options.onSelect(item);
    }

    /**
     * Open the dropdown
     */
    function openDropdown() {
        isOpen = true;
        listContainer.classList.remove('hidden');
        highlightedIndex = -1;
    }

    /**
     * Close the dropdown
     */
    function closeDropdown() {
        isOpen = false;
        listContainer.classList.add('hidden');
        highlightedIndex = -1;
    }

    /**
     * Update highlight
     */
    function updateHighlight() {
        listContainer.querySelectorAll('.dropdown-item').forEach((el, index) => {
            el.classList.toggle('highlighted', index === highlightedIndex);
        });

        // Scroll highlighted item into view
        const highlighted = listContainer.querySelector('.highlighted');
        if (highlighted) {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }

    // Event: Input focus
    input.addEventListener('focus', () => {
        filteredItems = [...items];
        renderItems(filteredItems);
        openDropdown();
    });

    // Event: Input typing
    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query === '') {
            filteredItems = [...items];
        } else {
            filteredItems = items.filter(item => {
                const mainText = item[options.displayField].toLowerCase();
                const subtitle = typeof options.subtitleField === 'function'
                    ? options.subtitleField(item).toLowerCase()
                    : (item[options.subtitleField] || '').toLowerCase();
                return mainText.includes(query) || subtitle.includes(query);
            });
        }

        renderItems(filteredItems);
        highlightedIndex = -1;

        if (!isOpen) {
            openDropdown();
        }
    });

    // Event: Keyboard navigation
    input.addEventListener('keydown', (e) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                highlightedIndex = Math.min(highlightedIndex + 1, filteredItems.length - 1);
                updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                highlightedIndex = Math.max(highlightedIndex - 1, 0);
                updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
                    selectItem(filteredItems[highlightedIndex]);
                }
                break;
            case 'Escape':
                closeDropdown();
                break;
        }
    });

    // Event: Click outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            closeDropdown();
        }
    });
}

/**
 * Toggle hours input visibility for per_hour vehicles
 * @param {boolean} show - Whether to show the hours input
 */
function toggleHoursInput(show) {
    const hoursGroup = document.getElementById('hours-group');
    hoursGroup.classList.toggle('hidden', !show);

    if (!show) {
        document.getElementById('hours-input').value = '';
    }
}

// ============================================================================
// Trip Type Toggle
// ============================================================================

/**
 * Initialize trip type toggle buttons
 */
function initializeTripTypeToggle() {
    const buttons = document.querySelectorAll('.trip-type-btn');
    const hiddenInput = document.getElementById('trip-type');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.tripType = btn.dataset.value;
            hiddenInput.value = btn.dataset.value;
        });
    });
}

// ============================================================================
// Form Handling
// ============================================================================

/**
 * Initialize form submission
 */
function initializeForm() {
    const form = document.getElementById('calculator-form');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        calculateCost();
    });
}

/**
 * Validate form inputs
 * @returns {boolean} Whether the form is valid
 */
function validateForm() {
    let isValid = true;

    // Validate origin
    if (!state.selectedOrigin) {
        showFieldError('origin');
        isValid = false;
    }

    // Validate destination
    if (!state.selectedDestination) {
        showFieldError('destination');
        isValid = false;
    }

    // Validate same origin and destination
    if (state.selectedOrigin && state.selectedDestination &&
        state.selectedOrigin.id === state.selectedDestination.id) {
        showError('El origen y destino no pueden ser el mismo');
        isValid = false;
    }

    // Validate vehicle
    if (!state.selectedVehicle) {
        showFieldError('vehicle');
        isValid = false;
    }

    // Validate hours for per_hour vehicles
    if (state.selectedVehicle && state.selectedVehicle.consumption_type === 'per_hour') {
        const hoursInput = document.getElementById('hours-input');
        const hours = parseFloat(hoursInput.value);

        if (isNaN(hours) || hours <= 0) {
            showFieldError('hours');
            isValid = false;
        }
    }

    return isValid;
}

/**
 * Show error for a specific field
 * @param {string} fieldName - Field identifier
 */
function showFieldError(fieldName) {
    const input = document.getElementById(`${fieldName}-search`) ||
                  document.getElementById(`${fieldName}-input`);
    const errorEl = document.getElementById(`${fieldName}-error`);

    if (input) {
        input.classList.add('error');
    }
    if (errorEl) {
        errorEl.classList.remove('hidden');
    }
}

/**
 * Clear error for a specific field
 * @param {string} fieldName - Field identifier
 */
function clearError(fieldName) {
    const input = document.getElementById(`${fieldName}-search`) ||
                  document.getElementById(`${fieldName}-input`);
    const errorEl = document.getElementById(`${fieldName}-error`);

    if (input) {
        input.classList.remove('error');
    }
    if (errorEl) {
        errorEl.classList.add('hidden');
    }
}

// ============================================================================
// Route Calculation
// ============================================================================

/**
 * Get route information from cache
 * @param {Object} origin - Origin location
 * @param {Object} destination - Destination location
 * @returns {Object} Route information
 */
function getRoute(origin, destination) {
    const cacheKey = getRouteCacheKey(origin.id, destination.id);

    if (state.routesCache[cacheKey]) {
        return state.routesCache[cacheKey];
    }

    throw new Error('Ruta no encontrada. Contacte al administrador.');
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Calculate and display the fuel cost
 */
function calculateCost() {
    showLoading(true);
    hideResults();
    hideError();

    try {
        const { selectedOrigin, selectedDestination, selectedVehicle, tripType } = state;

        // Get route information from cache
        const route = getRoute(selectedOrigin, selectedDestination);

        let distanceKm = route.distance_km;
        let durationSeconds = route.duration_seconds;

        // Double for round trip
        if (tripType === 'round-trip') {
            distanceKm *= 2;
            durationSeconds *= 2;
        }

        // Calculate fuel consumption
        let litersNeeded;

        if (selectedVehicle.consumption_type === 'per_100km') {
            litersNeeded = (distanceKm / 100) * selectedVehicle.consumption;
        } else {
            // per_hour - use user-provided hours
            const hours = parseFloat(document.getElementById('hours-input').value);
            litersNeeded = hours * selectedVehicle.consumption;

            // Double hours for round trip
            if (tripType === 'round-trip') {
                litersNeeded *= 2;
            }
        }

        // Calculate total cost
        const fuelPrice = state.fuelPrices[selectedVehicle.fuel_type];
        const totalCost = litersNeeded * fuelPrice;

        // Display results
        displayResults({
            origin: selectedOrigin,
            destination: selectedDestination,
            vehicle: selectedVehicle,
            tripType,
            distanceKm,
            durationSeconds,
            litersNeeded,
            fuelPrice,
            totalCost
        });

    } catch (error) {
        console.error('Calculation error:', error);
        showError(error.message || 'Error al calcular el costo. Intente nuevamente.');
    } finally {
        showLoading(false);
    }
}

/**
 * Display calculation results
 * @param {Object} results - Calculation results
 */
function displayResults(results) {
    const {
        origin, destination, vehicle, tripType,
        distanceKm, durationSeconds, litersNeeded, fuelPrice, totalCost
    } = results;

    // For per_hour vehicles, distance/duration are not relevant
    const isPerHour = vehicle.consumption_type === 'per_hour';

    // Route
    document.getElementById('result-route').textContent = isPerHour
        ? '-'
        : `${origin.nombre} → ${destination.nombre}`;

    // Distance
    document.getElementById('result-distance').textContent = isPerHour
        ? '-'
        : `${formatNumber(distanceKm, 1)} km`;

    // Duration
    if (isPerHour) {
        const hours = parseFloat(document.getElementById('hours-input').value);
        const displayHours = tripType === 'round-trip' ? hours * 2 : hours;
        document.getElementById('result-duration').textContent =
            `${formatNumber(displayHours, 1)} horas (ingresadas)`;
    } else {
        document.getElementById('result-duration').textContent =
            formatDuration(durationSeconds);
    }

    // Vehicle
    document.getElementById('result-vehicle').textContent = vehicle.name;

    // Fuel type
    document.getElementById('result-fuel-type').innerHTML =
        `<span class="fuel-badge ${getFuelBadgeClass(vehicle.fuel_type)}">${getFuelTypeLabel(vehicle.fuel_type)}</span>`;

    // Liters
    document.getElementById('result-liters').textContent =
        `${formatNumber(litersNeeded, 1)} L`;

    // Price per liter
    document.getElementById('result-price-per-liter').textContent =
        formatCurrency(fuelPrice);

    // Total cost
    document.getElementById('result-total-cost').textContent =
        formatCurrency(totalCost);

    // Trip type label
    document.getElementById('result-trip-type').textContent =
        tripType === 'round-trip' ? 'Ida y vuelta' : 'Solo ida';

    // Show results card
    document.getElementById('results-card').classList.remove('hidden');
}

// ============================================================================
// UI State Management
// ============================================================================

/**
 * Show/hide loading state
 * @param {boolean} show - Whether to show loading
 */
function showLoading(show) {
    const loadingEl = document.getElementById('loading-state');
    const calculateBtn = document.getElementById('calculate-btn');

    loadingEl.classList.toggle('hidden', !show);
    calculateBtn.disabled = show;
    calculateBtn.textContent = show ? 'Calculando...' : 'Calcular Costo';
}

/**
 * Hide results card
 */
function hideResults() {
    document.getElementById('results-card').classList.add('hidden');
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
    const errorEl = document.getElementById('error-state');
    const messageEl = document.getElementById('error-message');

    messageEl.textContent = message;
    errorEl.classList.remove('hidden');
}

/**
 * Hide error state
 */
function hideError() {
    document.getElementById('error-state').classList.add('hidden');
}

// ============================================================================
// Application Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', loadData);
