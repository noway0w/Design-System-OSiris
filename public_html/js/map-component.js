// Mapbox Access Token (set via mapbox-config.js or localStorage)
mapboxgl.accessToken = localStorage.getItem('mapbox_access_token') || (typeof window.MAPBOX_DEFAULT_TOKEN === 'string' ? window.MAPBOX_DEFAULT_TOKEN : '') || '';

const map = new mapboxgl.Map({
    container: 'map-container', // container ID
    style: 'mapbox://styles/glassiat/cmls0szp3002g01qofq7m5j2e', // Outdoors Winter style
    projection: 'globe', // display the map as a 3D globe
    zoom: 10.46, // starting zoom from URL
    center: [-122.9848, 49.7331], // starting center [lng, lat] from URL
    pitch: 0,
    bearing: 0,
    antialias: true // create the gl context with MSAA antialiasing
});

// Add zoom and rotation controls to the map.
map.addControl(new mapboxgl.NavigationControl());
