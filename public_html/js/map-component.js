// Mapbox Access Token Logic
let map; // Global map instance

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
        style: 'mapbox://styles/mapbox/light-v11', // starting style
        projection: 'globe', // display the map as a 3D globe
        zoom: 1.5, // starting zoom
        center: [30, 15], // starting center [lng, lat]
        pitch: 0,
        bearing: 0,
        antialias: true // create the gl context with MSAA antialiasing
    });

    map.on('style.load', () => {
        // 1. Visual Palette: Flat Matte #F0F0F0
        const baseColor = '#F0F0F0';
        map.setPaintProperty('background', 'background-color', baseColor);

        // Flatten Land & Water
        const layers = map.getStyle().layers;
        layers.forEach(layer => {
            if (layer.id.includes('water')) {
                if (layer.type === 'fill') {
                    map.setPaintProperty(layer.id, 'fill-color', baseColor);
                    map.setPaintProperty(layer.id, 'fill-opacity', 1);
                }
                if (layer.type === 'line') map.setLayoutProperty(layer.id, 'visibility', 'none');
            }
            if (layer.id.includes('land')) {
                if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', baseColor);
            }
            // Flatten other landuse
            if (layer.id.match(/landuse|park|natural|building/)) {
                if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', baseColor);
            }
            // Remove POIs/labels
            if (layer.id.match(/label|text|place|road|poi|transit|airport/)) {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
            }
        });

        // 2. Terrain Source: Force mapbox-raster-dem 512
        if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem');
        map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
        });
        
        // 3. Extreme Exaggeration: 3.5
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 3.5 });

        // 3. Hillshade: Glassiat Lighting
        if (!map.getLayer('hillshading')) {
            map.addLayer({
                'id': 'hillshading',
                'type': 'hillshade',
                'source': 'mapbox-dem',
                'layout': { 'visibility': 'visible' },
                'paint': {
                    'hillshade-shadow-color': '#111111', 
                    'hillshade-highlight-color': '#FFFFFF', 
                    'hillshade-accent-color': '#111111', 
                    'hillshade-illumination-direction': 315, 
                    'hillshade-illumination-anchor': 'map', 
                    'hillshade-exaggeration': 1.0
                }
            });
        } else {
            map.setPaintProperty('hillshading', 'hillshade-shadow-color', '#111111');
            map.setPaintProperty('hillshading', 'hillshade-highlight-color', '#FFFFFF');
            map.setPaintProperty('hillshading', 'hillshade-illumination-direction', 315);
            map.setPaintProperty('hillshading', 'hillshade-illumination-anchor', 'map');
            map.setPaintProperty('hillshading', 'hillshade-exaggeration', 1.0);
        }
        
        // 4. Boundaries: Subtle
        const boundaryLayers = map.getStyle().layers.filter(layer => layer.id.includes('admin') || layer.id.includes('boundary'));
        boundaryLayers.forEach(layer => {
            if (layer.type === 'line') {
                map.setPaintProperty(layer.id, 'line-color', '#E7E7E7'); 
                map.setPaintProperty(layer.id, 'line-width', 0.5); 
            }
        });

        // 5. Atmosphere: Remove fog
        map.setFog({
            'color': 'rgba(255, 255, 255, 0)',
            'horizon-blend': 0,
            'high-color': 'rgba(255, 255, 255, 0)',
            'space-color': 'rgba(255, 255, 255, 0)',
            'star-intensity': 0
        });
    });
}

// Event Listeners for Token Input
document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('mapbox-token-input');
    const updateBtn = document.getElementById('update-map-btn');
    
    // Check for saved token
    const savedToken = localStorage.getItem('mapbox_access_token');
    if (savedToken) {
        tokenInput.value = savedToken;
        initializeMap(savedToken);
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
