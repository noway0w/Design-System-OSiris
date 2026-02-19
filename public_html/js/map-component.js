// Mapbox Access Token Logic
let map; // Global map instance

function getMapboxToken() {
  return localStorage.getItem('mapbox_access_token') || (typeof window.MAPBOX_DEFAULT_TOKEN === 'string' ? window.MAPBOX_DEFAULT_TOKEN : '') || '';
}

function initializeMap(token) {
    if (!token) {
        console.warn('Mapbox token is missing.');
        return;
    }

    // Save token to localStorage
    localStorage.setItem('mapbox_access_token', token);
    
    // Set the token
    mapboxgl.accessToken = token;

    // Remove existing map if it exists
    if (map) {
        map.remove();
    }

    // Initialize Map
    map = new mapboxgl.Map({
        container: 'map-container', // container ID
        style: 'mapbox://styles/glassiat/cmls0szp3002g01qofq7m5j2e', // Outdoors Winter style
        projection: 'globe', // display the map as a 3D globe
        zoom: 10.46, // starting zoom from URL
        center: [-122.9848, 49.7331], // starting center [lng, lat] from URL
        pitch: 0,
        bearing: 0,
        antialias: true // create the gl context with MSAA antialiasing
    });

    // Note: Manual style overrides have been removed in favor of the custom Mapbox style.
}

// Event Listeners for Token Input
document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('mapbox-token-input');
    const updateBtn = document.getElementById('update-map-btn');
    
    // Check for saved token or default token
    const token = getMapboxToken();
    if (token) {
        tokenInput.value = token;
        initializeMap(token);
    }

    // Handle button click
    updateBtn.addEventListener('click', () => {
        const token = tokenInput.value.trim();
        if (token) {
            initializeMap(token);
        } else {
            alert('Please enter a valid Mapbox Access Token.');
        }
    });
});
