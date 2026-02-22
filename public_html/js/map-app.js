/* OSiris Map App - Live Tracking Map Dashboard with IP + GPS */

let appMap = null;
let currentLocationMarker = null;
let userTileMarkers = [];
let poiMarkers = [];
let currentPOIs = [];
let globeRotationEnabled = false;
let globeRotationState = 'off'; // 'off' | 'easing-in' | 'running' | 'easing-out'

const HEARTBEAT_MS = 5000;
const AVATARS = [
  'avatars/avatar-1.png',
  'avatars/avatar-2.png',
  'avatars/avatar-3.png',
  'avatars/avatar-4.png',
  'avatars/avatar-5.png',
  'avatars/avatar-6.png',
  'avatars/avatar-7.png',
  'avatars/avatar-8.png',
  'avatars/avatar-9.png',
  'avatars/avatar-10.png'
];
const MS_1_MIN = 60 * 1000;
const MS_24H = 24 * 60 * 60 * 1000;

function getStatusFromLastSeen(lastSeen) {
  const age = Date.now() - lastSeen;
  if (age < MS_1_MIN) return 'connected';
  if (age < MS_24H) return 'recently';
  return 'offline';
}

function getStatusDot(status) {
  if (status === 'connected' || status === 'online') return 'bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]';
  if (status === 'recently' || status === 'idle') return 'bg-orange-500 rounded-full';
  return 'bg-gray-500 rounded-full';
}

let heartbeatIntervalId = null;
let currentTiles = [];
let previousUserNames = new Set();
let apiMisconfigured = false; // true when server returns PHP source instead of JSON

let mapDataState = { buildings: true, topography: true, names: true, propertyBoundaries: true };
let mapDataTileOrder = ['buildings', 'topography', 'names', 'propertyBoundaries'];
let mapLayerInfo = { buildingLayerIds: [], labelLayerIds: [], propertyBoundaryLayerIds: [], terrainConfig: null };

const MAP_DATA_ORDER_KEY = 'osiris_map_data_tile_order';
function loadMapDataTileOrder() {
  try {
    const stored = localStorage.getItem(MAP_DATA_ORDER_KEY);
    if (stored) {
      const order = JSON.parse(stored);
      const valid = ['buildings', 'topography', 'names', 'propertyBoundaries'];
      if (Array.isArray(order) && order.length === valid.length && valid.every((k) => order.includes(k))) {
        mapDataTileOrder = order;
      }
    }
  } catch (_) {}
}
function saveMapDataTileOrder() {
  try {
    localStorage.setItem(MAP_DATA_ORDER_KEY, JSON.stringify(mapDataTileOrder));
  } catch (_) {}
}


function getApiBase() {
  const base = typeof window.OSIRIS_API_URL === 'string' ? window.OSIRIS_API_URL : '';
  return base || '';
}

function getUsersListUrl() {
  const b = getApiBase();
  return b ? `${b}/api/users` : 'api/users.php';
}

function getUsersRegisterUrl() {
  const b = getApiBase();
  return b ? `${b}/api/users` : 'api/users-register.php';
}

function getUsersClearUrl() {
  const b = getApiBase();
  return b ? `${b}/api/users` : 'api/users-clear.php';
}

async function fetchUsers() {
  const url = getUsersListUrl() + '?_=' + Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) {
      if (!apiMisconfigured) console.warn('[Nearby] fetchUsers failed:', res.status, text.slice(0, 80));
      return [];
    }
    if (text.trimStart().startsWith('<') || text.trimStart().startsWith('<?php')) {
      if (!apiMisconfigured) {
        console.warn('[Nearby] API returns PHP source—enable PHP on server (see api/README-SERVER.md)');
        apiMisconfigured = true;
        stopHeartbeat();
      }
      return [];
    }
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    const isPhpSource = e.message && (e.message.includes('Unexpected token') || e.message.includes('<?php'));
    if (isPhpSource) {
      if (!apiMisconfigured) {
        console.warn('[Nearby] API returns PHP source—enable PHP on server (see api/README-SERVER.md)');
        apiMisconfigured = true;
        stopHeartbeat();
      }
    } else if (!apiMisconfigured) {
      console.warn('[Nearby] fetchUsers error:', e.message || e);
    }
    return [];
  }
}

async function registerUser(loc) {
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  if (!name) return;
  const ip = loc?.ip ?? LocationService.currentIP ?? '';
  const params = new URLSearchParams({
    ip: ip || '',
    name,
    lat: String(loc?.lat ?? ''),
    lng: String(loc?.lng ?? ''),
    city: loc?.city ?? '',
    country: loc?.country ?? ''
  });
  const url = getUsersRegisterUrl() + '?' + params.toString() + '&_=' + Date.now();
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      console.warn('[Nearby] registerUser failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[Nearby] Failed to register user:', e);
  }
}

async function clearAllUsers() {
  try {
    await fetch(getUsersClearUrl(), { method: 'GET' });
  } catch (e) {
    console.warn('Failed to clear users:', e);
  }
}

async function fetchPointsOfInterest() {
  const url = (typeof window.getPointsOfInterestUrl === 'function' ? window.getPointsOfInterestUrl() : 'points-of-interest.php') + '?_=' + Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) return [];
    if (text.trimStart().startsWith('<') || text.trimStart().startsWith('<?php')) return [];
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function toTiles(users) {
  currentTiles = users.map((u, i) => ({
    name: u.name,
    avatar: AVATARS[i % AVATARS.length],
    lastSeen: u.lastSeen,
    lat: u.lat,
    lng: u.lng,
    city: u.city ?? null
  }));
  return currentTiles;
}

function renderNearbyTiles(tiles) {
  const container = document.getElementById('nearby-friends-tiles');
  const countEl = document.getElementById('nearby-friends-count');
  if (!container) return;

  const userTiles = Array.isArray(tiles) ? tiles : [];
  const total = userTiles.length;
  const newNames = new Set(userTiles.map((t) => t.name));

  let html = '';

  userTiles.forEach((tile) => {
    const status = getStatusFromLastSeen(tile.lastSeen);
    const dotClass = getStatusDot(status);
    const isActive = status === 'connected';
    const subtext = tile.city || 'Unknown';
    const hasLocation = tile.lat != null && tile.lng != null;
    const iconClass = isActive ? 'text-primary' : 'text-text-secondary';
    const borderClass = isActive ? 'border-primary/30' : 'border-slate-200 dark:border-white/5';
    const imgBorder = isActive ? 'border-primary' : 'border-transparent';
    const imgClass = isActive ? '' : 'grayscale group-hover:grayscale-0 transition-all';
    const cardClass = hasLocation ? 'cursor-pointer hover:border-primary/50 transition-colors' : '';
    const dataAttr = hasLocation ? `data-user-tile="${tile.name}"` : '';
    const fadeClass = previousUserNames.has(tile.name) ? '' : ' tile-fade-in';
    html += `
      <div ${dataAttr} class="w-48 bg-card-light dark:bg-card-dark p-3 rounded-2xl border ${borderClass} flex flex-col gap-3 relative overflow-hidden group ${cardClass}${fadeClass}">
        <div class="absolute top-0 right-0 p-3">
          <div class="w-2.5 h-2.5 ${dotClass}"></div>
        </div>
        <div class="w-14 h-14 rounded-full border-2 ${imgBorder} p-0.5 ${imgClass}">
          <img alt="${tile.name}" class="w-full h-full object-cover rounded-full" src="${tile.avatar}"/>
        </div>
        <div>
          <h3 class="text-slate-800 dark:text-white font-bold text-base leading-tight">${tile.name}</h3>
          <div class="flex items-center gap-1 mt-1 ${iconClass} text-sm ${isActive ? 'font-medium' : ''}">
            <span class="material-symbols-outlined text-[16px]">${isActive ? 'near_me' : 'location_on'}</span>
            <span>${subtext}</span>
          </div>
        </div>
      </div>`;
  });

  html += `
    <button id="nearby-clear-all" type="button" class="w-48 bg-card-light/70 dark:bg-card-dark/50 hover:bg-card-light dark:hover:bg-card-dark/80 p-3 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col gap-3 items-center justify-center transition-colors cursor-pointer" title="Clear all visitor tiles">
      <span class="material-symbols-outlined text-3xl text-text-secondary">delete</span>
      <span class="text-text-secondary text-sm font-medium">Clear all</span>
    </button>`;

  previousUserNames = newNames;
  container.innerHTML = html;
  if (countEl) {
    countEl.textContent = apiMisconfigured && total === 0
      ? 'Emerging Tech Specialist needs PHP enabled on server'
      : total === 0 ? 'No users yet' : `${total} user${total === 1 ? '' : 's'} worldwide`;
  }

  document.getElementById('nearby-clear-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showToastError('You do not have the rights to use this feature');
  });
}

async function refreshNearby() {
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  const loc = LocationService.currentLocation || {};
  if (name) {
    registerUser({ ...loc, ip: loc.ip ?? LocationService.currentIP });
  }
  const users = await fetchUsers();
  const tiles = toTiles(users);
  addUserTileMarkers(tiles);
  renderNearbyTiles(tiles);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatIntervalId = setInterval(refreshNearby, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

function getMapboxToken() {
  return localStorage.getItem('mapbox_access_token') || (typeof window.MAPBOX_DEFAULT_TOKEN === 'string' ? window.MAPBOX_DEFAULT_TOKEN : '') || '';
}

function initMapApp() {
  const token = getMapboxToken();
  const overlay = document.getElementById('map-token-overlay');
  const root = document.getElementById('map-app-root');

  if (!token) {
    overlay?.classList.remove('hidden');
    root?.classList.add('hidden');
    document.getElementById('load-map-app')?.addEventListener('click', () => {
      const t = document.getElementById('mapbox-token-app')?.value?.trim();
      if (t) {
        localStorage.setItem('mapbox_access_token', t);
        overlay?.classList.add('hidden');
        root?.classList.remove('hidden');
        initMap();
      }
    });
    return;
  }

  overlay?.classList.add('hidden');
  root?.classList.remove('hidden');
  initMap();
  document.addEventListener('osiris-theme-change', () => {
    applyMapTheme();
    renderMapDataTiles(mapDataState);
  });
}

function applyMapTheme() {
  const effective = typeof ThemeService !== 'undefined' ? ThemeService.resolveEffectiveTheme(ThemeService.getTheme()) : 'dark';
  const isLight = effective === 'light';
  try {
    if (appMap && typeof appMap.setConfigProperty === 'function') {
      appMap.setConfigProperty('basemap', 'lightPreset', isLight ? 'day' : 'night');
    }
  } catch (_) {}
}

function initMap() {
  if (appMap) return;

  const container = document.getElementById('map-app-container');
  if (!container) return;

  mapboxgl.accessToken = getMapboxToken();
  appMap = new mapboxgl.Map({
    container: 'map-app-container',
    style: 'mapbox://styles/glassiat/cmls0szp3002g01qofq7m5j2e',
    projection: 'globe',
    zoom: 1,
    center: [0, 20],
    pitch: 0,
    bearing: 0,
    antialias: true
  });

  appMap.on('load', () => {
    applyMapTheme();
    wirePOITabs();
    wirePOITileCards();
    wireMapDataTiles();
    discoverMapLayers();
    renderMapDataTiles(mapDataState);
    applyMapDataState(mapDataState);
    LocationService.getIPLocation().then(async (loc) => {
      if (loc) {
        flyToLocation(loc.lng, loc.lat, 10);
        addCurrentLocationMarker(loc.lng, loc.lat);
      }
      await registerUser(loc || {});
      await refreshNearby();
      const pois = await fetchPointsOfInterest();
      addPOIMarkers(pois);
      renderPOITiles(pois);
      startHeartbeat();
      wireUserTileCards();
    });
    wireControls();
  });
}

function addCurrentLocationMarker(lng, lat) {
  if (currentLocationMarker) currentLocationMarker.remove();
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center';
  const pulse = document.createElement('div');
  pulse.className = 'map-marker-pulse';
  pulse.style.cssText = 'position:absolute;width:64px;height:64px;background:rgba(19,164,236,0.3);border-radius:50%;margin-left:-32px;margin-top:-32px';
  const dot = document.createElement('div');
  dot.style.cssText = 'width:24px;height:24px;background:#101c22;border-radius:50%;border:3px solid #13a4ec;box-shadow:0 0 15px rgba(19,164,236,0.6);position:relative;z-index:10';
  el.appendChild(pulse);
  el.appendChild(dot);
  currentLocationMarker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(appMap);
}

function addUserTileMarkers(tiles = []) {
  userTileMarkers.forEach(m => m.remove());
  userTileMarkers = [];
  if (!appMap) return;
  const withLoc = (tiles.length ? tiles : currentTiles).filter((t) => t.lat != null && t.lng != null);
  withLoc.forEach((tile) => {
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    const avatar = document.createElement('div');
    const status = getStatusFromLastSeen(tile.lastSeen);
    avatar.style.cssText = `width:40px;height:40px;border-radius:50%;border:2px solid ${status === 'connected' ? '#13a4ec' : 'rgba(255,255,255,0.2)'};overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);background:#1c262d`;
    const img = document.createElement('img');
    img.src = tile.avatar;
    img.alt = tile.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none';
    avatar.appendChild(img);
    el.appendChild(avatar);
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([tile.lng, tile.lat])
      .addTo(appMap);
    el.addEventListener('click', () => {
      flyToLocation(tile.lng, tile.lat, 18, { pitch: 45 });
      openUserProfilePanel(tile);
    });
    userTileMarkers.push(marker);
  });
}

const ZOOM_ANIMATION_MS = 1200;

function wireUserTileCards() {
  const panelContent = document.getElementById('bottom-panel-content');
  if (!panelContent) return;
  panelContent.addEventListener('click', (e) => {
    const el = e.target.closest('[data-user-tile]');
    if (!el || !appMap) return;
    const name = el.getAttribute('data-user-tile');
    const tile = currentTiles.find((t) => t.name === name);
    if (tile && tile.lat != null && tile.lng != null) {
      flyToLocation(tile.lng, tile.lat, 18, { pitch: 45 });
    }
  });
}

function addPOIMarkers(pois) {
  poiMarkers.forEach(m => m.remove());
  poiMarkers = [];
  if (!appMap) return;
  const valid = (Array.isArray(pois) ? pois : currentPOIs).filter((p) => p.lat != null && p.lng != null);
  valid.forEach((poi) => {
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    const icon = document.createElement('div');
    icon.style.cssText = 'width:40px;height:40px;border-radius:50%;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);background:#1c262d;border:2px solid rgba(255,255,255,0.2)';
    const img = document.createElement('img');
    img.src = poi.icon || 'brand/placeholder.png';
    img.alt = poi.brand;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none';
    icon.appendChild(img);
    el.appendChild(icon);
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([poi.lng, poi.lat])
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>${poi.brand || ''}</strong><br>${poi.location || ''}<br>${poi.type || ''}`))
      .addTo(appMap);
    el.addEventListener('click', () => flyToLocation(poi.lng, poi.lat, 14));
    poiMarkers.push(marker);
  });
}

function renderPOITiles(pois) {
  const container = document.getElementById('poi-tiles');
  if (!container) return;
  currentPOIs = Array.isArray(pois) ? pois : currentPOIs;
  let html = '';
  currentPOIs.forEach((poi) => {
    const hasLocation = poi.lat != null && poi.lng != null;
    const cardClass = hasLocation ? 'cursor-pointer hover:border-primary/50 transition-colors' : '';
    const dataAttr = hasLocation ? `data-poi-id="${poi.id}"` : '';
    html += `
      <div ${dataAttr} class="w-48 bg-card-light dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col gap-3 overflow-hidden group ${cardClass}">
        <div class="w-14 h-14 rounded-full border-2 border-slate-200 dark:border-white/10 p-0.5 overflow-hidden">
          <img alt="${poi.brand || ''}" class="w-full h-full object-cover rounded-full" src="${poi.icon || 'brand/placeholder.png'}"/>
        </div>
        <div>
          <h3 class="text-slate-800 dark:text-white font-bold text-base leading-tight">${poi.brand || ''}</h3>
          <div class="flex items-center gap-1 mt-1 text-text-secondary text-sm">
            <span class="material-symbols-outlined text-[16px]">location_on</span>
            <span>${poi.location || ''}</span>
          </div>
          <div class="text-text-secondary text-xs mt-0.5">${poi.type || ''}</div>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function wirePOITabs() {
  const tabNearby = document.getElementById('tab-nearby');
  const tabPOI = document.getElementById('tab-poi');
  const tabMapData = document.getElementById('tab-map-data');
  const tilesNearby = document.getElementById('nearby-friends-tiles');
  const tilesPOI = document.getElementById('poi-tiles');
  const tilesMapData = document.getElementById('map-data-tiles');
  if (!tabNearby || !tabPOI || !tilesNearby || !tilesPOI) return;

  function setActiveTab(active) {
    [tabNearby, tabPOI, tabMapData].forEach((t) => {
      if (t) {
        t.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
        t.classList.add('bg-transparent', 'text-text-secondary', 'border-slate-200', 'dark:border-white/10');
      }
    });
    [tilesNearby, tilesPOI, tilesMapData].forEach((c) => {
      if (c) c.classList.add('hidden');
    });
    const activeTab = active === 'nearby' ? tabNearby : active === 'poi' ? tabPOI : tabMapData;
    const activeTiles = active === 'nearby' ? tilesNearby : active === 'poi' ? tilesPOI : tilesMapData;
    if (activeTab) {
      activeTab.classList.remove('bg-transparent', 'text-text-secondary', 'border-slate-200', 'dark:border-white/10');
      activeTab.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
    }
    if (activeTiles) activeTiles.classList.remove('hidden');
  }

  tabNearby.addEventListener('click', () => setActiveTab('nearby'));
  tabPOI.addEventListener('click', () => setActiveTab('poi'));
  tabMapData?.addEventListener('click', () => setActiveTab('map-data'));
}

function discoverMapLayers() {
  if (!appMap || !appMap.isStyleLoaded()) return;
  const style = appMap.getStyle();
  if (!style?.layers) return;
  const buildingIds = [];
  const labelIds = [];
  const propertyBoundaryIds = [];
  style.layers.forEach((layer) => {
    const id = layer.id?.toLowerCase() || '';
    const type = layer.type || '';
    if (type === 'fill-extrusion' || id.includes('building')) buildingIds.push(layer.id);
    const isTerrainRelated = id.includes('terrain') || id.includes('hillshade') || id.includes('elevation') || id.includes('dem') || id.includes('contour');
    if (type === 'symbol' && !isTerrainRelated) labelIds.push(layer.id);
    if (type === 'line' && (id.includes('boundary') || id.includes('parcel') || id.includes('property') || id.includes('cadastral'))) propertyBoundaryIds.push(layer.id);
  });
  mapLayerInfo.buildingLayerIds = buildingIds;
  mapLayerInfo.labelLayerIds = labelIds;
  mapLayerInfo.propertyBoundaryLayerIds = propertyBoundaryIds;
  if (style.terrain) {
    mapLayerInfo.terrainConfig = { ...style.terrain };
  } else {
    const demSource = Object.keys(style.sources || {}).find((s) => s.toLowerCase().includes('dem'));
    mapLayerInfo.terrainConfig = demSource
      ? { source: demSource, exaggeration: 1.2 }
      : appMap.getSource?.('mapbox-dem')
        ? { source: 'mapbox-dem', exaggeration: 1.2 }
        : null;
  }
}

function applyBuildingsState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  mapLayerInfo.buildingLayerIds.forEach((id) => {
    try { appMap.setLayoutProperty(id, 'visibility', state.buildings ? 'visible' : 'none'); } catch {}
  });
  try {
    if (typeof appMap.setConfigProperty === 'function') {
      appMap.setConfigProperty('basemap', 'show3dBuildings', state.buildings);
      appMap.setConfigProperty('basemap', 'show3dObjects', state.buildings);
    }
  } catch {}
}

function applyNamesState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  mapLayerInfo.labelLayerIds.forEach((id) => {
    try { appMap.setLayoutProperty(id, 'visibility', state.names ? 'visible' : 'none'); } catch {}
  });
  try {
    if (typeof appMap.setConfigProperty === 'function') {
      appMap.setConfigProperty('basemap', 'showPlaceLabels', state.names);
      appMap.setConfigProperty('basemap', 'showRoadLabels', state.names);
      appMap.setConfigProperty('basemap', 'showPointOfInterestLabels', state.names);
      appMap.setConfigProperty('basemap', 'showTransitLabels', state.names);
    }
  } catch {}
}

function applyTopographyState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  let cfg = mapLayerInfo.terrainConfig;
  if (state.topography && !cfg) {
    discoverMapLayers();
    cfg = mapLayerInfo.terrainConfig;
  }
  try {
    if (state.topography && cfg) {
      appMap.setTerrain(cfg);
    } else {
      appMap.setTerrain(null);
    }
  } catch {}
}

function applyPropertyBoundariesState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  mapLayerInfo.propertyBoundaryLayerIds.forEach((id) => {
    try { appMap.setLayoutProperty(id, 'visibility', state.propertyBoundaries ? 'visible' : 'none'); } catch {}
  });
}

function applyMapDataState(state) {
  applyBuildingsState(state);
  applyNamesState(state);
  applyPropertyBoundariesState(state);
  applyTopographyState(state);
}

function renderMapDataTiles(state) {
  const container = document.getElementById('map-data-tiles');
  if (!container) return;
  const thumbLight = {
    buildings: 'assets/map-data/3D_Building-16df9d4f-a37a-4b28-82b4-29102ba973cc.png',
    topography: 'assets/map-data/Topography-f0f7d58d-01de-4a71-a672-5645b1839686.png',
    names: 'assets/map-data/Local_Information-761468aa-38c3-4dab-98e3-194b0ddc73ad.png',
    propertyBoundaries: 'assets/map-data/Road_Boundaries-d086e440-e5a5-49d5-95bb-a00e264e36ab.png'
  };
  const thumbDark = {
    buildings: 'assets/map-data/3D_Building_Dark_Mode-03ad4b23-3a78-423f-afef-6a0c97118e27.png',
    topography: 'assets/map-data/Topography_Dark_Mode-0e13759c-17de-477e-abde-b9aa409f14b7.png',
    names: 'assets/map-data/Local_Information_Dark_Mode-c3aa1a4b-5a4b-4225-a85d-d2ce6d35a065.png',
    propertyBoundaries: 'assets/map-data/Road_Boundaries_Dark_Mode-ca300c9d-f9de-4023-b087-67bc7a8f0127.png'
  };
  const icons = { buildings: 'apartment', topography: 'terrain', names: 'label', propertyBoundaries: 'route' };
  const labels = { buildings: 'Buildings', topography: 'Topography', names: 'Local informations', propertyBoundaries: 'Road boundaries' };
  const tiles = mapDataTileOrder.map((key) => ({ key, label: labels[key], on: state[key] }));
  const isDark = document.documentElement.classList.contains('dark');
  let html = '';
  tiles.forEach((t, i) => {
    const thumbSrc = isDark ? thumbDark[t.key] : thumbLight[t.key];
    const toggleId = `map-data-toggle-${t.key}-${i}`;
    html += `
      <div data-toggle="${t.key}" data-tile-key="${t.key}" draggable="true" class="map-data-tile-draggable group flex flex-col w-60 min-w-[240px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 cursor-grab active:cursor-grabbing">
        <div class="h-20 overflow-hidden relative">
          <img src="${thumbSrc}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"/>
        </div>
        <div class="p-4 flex flex-col flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-slate-400 text-base flex-shrink-0">${icons[t.key]}</span>
            <h3 class="text-base font-semibold text-slate-900 dark:text-white truncate text-left">${t.label}</h3>
          </div>
          <div class="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[8px] font-medium text-slate-400 uppercase tracking-widest">${t.on ? 'Enabled' : 'Disabled'}</span>
            <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
              <input class="toggle-checkbox map-data-toggle absolute top-0 block w-5 h-5 rounded-full bg-white dark:bg-slate-100 border-4 border-slate-300 dark:border-slate-600 appearance-none cursor-pointer focus:ring-0 outline-none" id="${toggleId}" type="checkbox" data-key="${t.key}" ${t.on ? 'checked' : ''}/>
              <label class="toggle-label block overflow-hidden h-5 rounded-full bg-slate-300 dark:bg-slate-700 cursor-pointer" for="${toggleId}"></label>
            </div>
          </div>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function wireMapDataTiles() {
  const container = document.getElementById('map-data-tiles');
  if (!container) return;
  loadMapDataTileOrder();

  function handleToggleChange(key, checked) {
    switch (key) {
      case 'buildings': mapDataState.buildings = checked; applyBuildingsState(mapDataState); break;
      case 'topography': mapDataState.topography = checked; applyTopographyState(mapDataState); break;
      case 'names': mapDataState.names = checked; applyNamesState(mapDataState); break;
      case 'propertyBoundaries': mapDataState.propertyBoundaries = checked; applyPropertyBoundariesState(mapDataState); break;
      default: return;
    }
    renderMapDataTiles(mapDataState);
  }

  container.addEventListener('change', (e) => {
    const toggleEl = e.target.closest('.map-data-toggle');
    if (toggleEl) {
      e.stopPropagation();
      const key = toggleEl.getAttribute('data-key');
      handleToggleChange(key, toggleEl.checked);
    }
  });

  container.addEventListener('click', (e) => {
    if (e.target.closest('.map-data-toggle, label[for^="map-data-toggle"]')) return;
    const el = e.target.closest('[data-toggle]');
    if (!el || !appMap) return;
    e.stopPropagation();
    const key = el.getAttribute('data-toggle');
    const toggle = el.querySelector('.map-data-toggle');
    if (toggle) {
      const newChecked = !toggle.checked;
      toggle.checked = newChecked;
      handleToggleChange(key, newChecked);
    }
  });

  let draggedKey = null;
  let draggedEl = null;
  let dragStartFromToggle = false;
  let droppedInContainer = false;
  let orderBeforeDrag = null;

  const MAGNET_RADIUS = 28;
  function reorderOnHover(cursorX) {
    if (!draggedEl) return;
    const tiles = Array.from(container.querySelectorAll('.map-data-tile-draggable')).filter((t) => t !== draggedEl);
    if (tiles.length === 0) return;
    const rects = tiles.map((t) => {
      const r = t.getBoundingClientRect();
      return { key: t.getAttribute('data-tile-key'), el: t, left: r.left, right: r.right };
    });
    rects.sort((a, b) => a.left - b.left);
    const boundaries = [
      { x: rects[0].left, insertIdx: 0 },
      ...rects.flatMap((r, i) => (i < rects.length - 1 ? [{ x: (r.right + rects[i + 1].left) / 2, insertIdx: i + 1 }] : [])),
      { x: rects[rects.length - 1].right, insertIdx: rects.length }
    ];
    let newToIdx = null;
    let closestDist = Infinity;
    for (const b of boundaries) {
      const d = Math.abs(cursorX - b.x);
      if (d < MAGNET_RADIUS && d < closestDist) {
        closestDist = d;
        newToIdx = b.insertIdx;
      }
    }
    if (newToIdx === null) {
      let effectiveX = cursorX;
      newToIdx = rects.length;
      for (let i = 0; i < rects.length; i++) {
        if (effectiveX < rects[i].left) {
          newToIdx = i;
          break;
        }
        if (effectiveX <= rects[i].right) {
          const mid = rects[i].left + (rects[i].right - rects[i].left) / 2;
          newToIdx = effectiveX < mid ? i : i + 1;
          break;
        }
      }
    }
    const fromIdx = mapDataTileOrder.indexOf(draggedKey);
    if (fromIdx === -1 || newToIdx === fromIdx) return;
    mapDataTileOrder.splice(fromIdx, 1);
    mapDataTileOrder.splice(newToIdx, 0, draggedKey);
    const nextSibling = newToIdx >= rects.length ? null : rects[newToIdx].el;
    container.insertBefore(draggedEl, nextSibling);
  }

  container.addEventListener('mousedown', (e) => {
    dragStartFromToggle = !!e.target.closest('.map-data-toggle, label[for^="map-data-toggle"]');
  });
  container.addEventListener('dragstart', (e) => {
    if (dragStartFromToggle) {
      e.preventDefault();
      return;
    }
    const el = e.target.closest('.map-data-tile-draggable');
    if (!el) return;
    draggedKey = el.getAttribute('data-tile-key');
    draggedEl = el;
    el.classList.add('opacity-50');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedKey);
    orderBeforeDrag = [...mapDataTileOrder];
  });
  container.addEventListener('dragend', (e) => {
    const el = e.target.closest('.map-data-tile-draggable');
    if (el) el.classList.remove('opacity-50');
    if (!droppedInContainer && orderBeforeDrag) {
      mapDataTileOrder = orderBeforeDrag;
      renderMapDataTiles(mapDataState);
    }
    draggedKey = null;
    draggedEl = null;
    droppedInContainer = false;
    orderBeforeDrag = null;
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedEl) reorderOnHover(e.clientX);
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    droppedInContainer = true;
    saveMapDataTileOrder();
  });
}

function wirePOITileCards() {
  const container = document.getElementById('poi-tiles');
  container?.addEventListener('click', (e) => {
    const el = e.target.closest('[data-poi-id]');
    if (!el || !appMap) return;
    const id = el.getAttribute('data-poi-id');
    const poi = currentPOIs.find((p) => String(p.id) === String(id));
    if (poi && poi.lat != null && poi.lng != null) {
      flyToLocation(poi.lng, poi.lat, 14);
    }
  });
}

function showToastError(message) {
  const toast = document.getElementById('toast-error');
  const msgEl = document.getElementById('toast-error-message');
  if (toast) {
    if (msgEl && message) msgEl.textContent = message;
    toast.classList.add('visible');
  }
}

function initNotImplementedToast() {
  const toast = document.getElementById('toast-error');
  const closeBtn = document.getElementById('toast-error-close');
  closeBtn?.addEventListener('click', () => toast?.classList.remove('visible'));
}

function closeBottomPanel() {
  const panel = document.getElementById('bottom-panel');
  const toggle = document.getElementById('bottom-panel-toggle');
  if (!panel || !toggle) return;
  panel.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open Emerging Tech Specialist');
  toggle.querySelector('.material-symbols-outlined')?.classList.remove('rotate-180');
}

function openUserProfilePanel(tile) {
  const panel = document.getElementById('user-profile-panel');
  const avatar = document.getElementById('user-profile-avatar');
  const nameEl = document.getElementById('user-profile-name');
  const locationEl = document.getElementById('user-profile-location');
  if (!panel || !avatar || !nameEl || !locationEl) return;
  avatar.src = tile.avatar || '';
  avatar.alt = tile.name || '';
  nameEl.textContent = tile.name || '—';
  locationEl.textContent = tile.city || tile.country || 'Unknown';
  panel.style.left = '50%';
  panel.style.top = '50%';
  panel.style.transform = 'translate(-50%, -50%)';
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function closeUserProfilePanel() {
  const panel = document.getElementById('user-profile-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
}

function initUserProfilePanel() {
  const panel = document.getElementById('user-profile-panel');
  const handle = document.getElementById('user-profile-drag-handle');
  const closeBtn = document.getElementById('user-profile-close');
  if (!panel || !handle) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function getPanelPosition() {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  function setPanelPosition(left, top) {
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.transform = 'none';
  }

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('#user-profile-close')) return;
    isDragging = true;
    const pos = getPanelPosition();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = pos.left;
    startTop = pos.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    setPanelPosition(startLeft + dx, startTop + dy);
  });

  document.addEventListener('mouseup', () => isDragging = false);

  handle.addEventListener('touchstart', (e) => {
    if (e.target.closest('#user-profile-close')) return;
    isDragging = true;
    const pos = getPanelPosition();
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startLeft = pos.left;
    startTop = pos.top;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    setPanelPosition(startLeft + dx, startTop + dy);
  }, { passive: true });

  document.addEventListener('touchend', () => isDragging = false);

  closeBtn?.addEventListener('click', () => closeUserProfilePanel());
}

function initGeneralMenu() {
  const wrapper = document.getElementById('general-menu-wrapper');
  const panel = document.getElementById('general-menu-panel');
  const btn = document.getElementById('btn-general-menu');
  const themeOptions = document.getElementById('theme-options');

  function closeMenu() {
    panel?.classList.remove('visible');
    panel?.setAttribute('aria-hidden', 'true');
  }

  function openMenu() {
    closeBottomPanel();
    panel?.classList.add('visible');
    panel?.setAttribute('aria-hidden', 'false');
    updateThemeButtonStates();
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  }

  function handleClickOutside(e) {
    if (!panel?.classList.contains('visible')) return;
    if (wrapper?.contains(e.target)) return;
    closeMenu();
    document.removeEventListener('click', handleClickOutside);
  }

  function updateThemeButtonStates() {
    const mode = typeof ThemeService !== 'undefined' ? ThemeService.getTheme() : 'system';
    themeOptions?.querySelectorAll('.neumorphic-btn').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-theme') === mode);
    });
  }

  btn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel?.classList.contains('visible')) {
      closeMenu();
      document.removeEventListener('click', handleClickOutside);
    } else {
      openMenu();
    }
  });

  panel?.addEventListener('click', (e) => e.stopPropagation());

  themeOptions?.addEventListener('click', (e) => {
    const btnEl = e.target.closest('.neumorphic-btn[data-theme]');
    if (!btnEl || typeof ThemeService === 'undefined') return;
    const mode = btnEl.getAttribute('data-theme');
    ThemeService.setTheme(mode);
    updateThemeButtonStates();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel?.classList.contains('visible')) {
      closeMenu();
      document.removeEventListener('click', handleClickOutside);
    }
  });
}

function wireControls() {
  document.getElementById('map-zoom-in')?.addEventListener('click', () => appMap?.zoomIn({ duration: ZOOM_ANIMATION_MS }));
  document.getElementById('map-zoom-out')?.addEventListener('click', () => appMap?.zoomOut({ duration: ZOOM_ANIMATION_MS }));
  document.getElementById('gps-status-btn')?.addEventListener('click', () => {
    if (currentLocationMarker) {
      const { lng, lat } = currentLocationMarker.getLngLat();
      flyToLocation(lng, lat, 14);
    } else if (LocationService.currentLocation) {
      flyToLocation(LocationService.currentLocation.lng, LocationService.currentLocation.lat, 14);
    } else {
      LocationService.getIPLocation().then((loc) => {
        if (loc) {
          flyToLocation(loc.lng, loc.lat, 14);
          addCurrentLocationMarker(loc.lng, loc.lat);
        }
      });
    }
  });
  const MAX_SPIN_ZOOM = 5;
  const SECONDS_PER_REVOLUTION = 60;
  const EASE_DURATION_MS = 300;
  const EASE_STEPS = 3;
  const EASE_IN_MULTIPLIERS = [0.2, 0.6, 1];
  const EASE_OUT_MULTIPLIERS = [0.8, 0.4, 0];
  const SEGMENT_DURATION_MS = EASE_DURATION_MS / EASE_STEPS;
  let globeEaseStepIndex = 0;

  function getSpeedMultiplier() {
    if (globeRotationState === 'easing-in') {
      return EASE_IN_MULTIPLIERS[Math.min(globeEaseStepIndex, EASE_IN_MULTIPLIERS.length - 1)] ?? 1;
    }
    if (globeRotationState === 'easing-out') {
      return EASE_OUT_MULTIPLIERS[Math.min(globeEaseStepIndex, EASE_OUT_MULTIPLIERS.length - 1)] ?? 0;
    }
    return 1;
  }

  function spinGlobe() {
    if (!appMap) return;
    if (globeRotationState === 'off') return;
    const zoom = appMap.getZoom();
    if (zoom >= MAX_SPIN_ZOOM && globeRotationState !== 'easing-out') return;

    const baseDistancePerSecond = 360 / SECONDS_PER_REVOLUTION;
    const multiplier = getSpeedMultiplier();

    if (globeRotationState === 'easing-out' && multiplier <= 0) {
      globeRotationState = 'off';
      globeRotationEnabled = false;
      document.getElementById('map-rotate')?.setAttribute('aria-pressed', 'false');
      document.getElementById('map-rotate')?.classList.remove('bg-primary/20', 'text-primary');
      return;
    }

    const isEasing = globeRotationState === 'easing-in' || globeRotationState === 'easing-out';
    const duration = isEasing ? SEGMENT_DURATION_MS : 1000;
    const center = appMap.getCenter();
    center.lng -= baseDistancePerSecond * multiplier * (duration / 1000);
    appMap.easeTo({ center, duration, easing: (n) => n });

    if (globeRotationState === 'easing-in') {
      globeEaseStepIndex++;
      if (globeEaseStepIndex >= EASE_IN_MULTIPLIERS.length) {
        globeRotationState = 'running';
        globeEaseStepIndex = 0;
      }
    } else if (globeRotationState === 'easing-out') {
      globeEaseStepIndex++;
    }
  }

  appMap.on('moveend', () => {
    if (globeRotationState !== 'off') spinGlobe();
  });

  function stopGlobeRotation() {
    if (globeRotationState === 'off') return;
    globeRotationState = 'easing-out';
    globeEaseStepIndex = 0;
    document.getElementById('map-rotate')?.setAttribute('aria-pressed', 'false');
    document.getElementById('map-rotate')?.classList.remove('bg-primary/20', 'text-primary');
    spinGlobe();
  }

  appMap.on('click', stopGlobeRotation);
  appMap.on('dragstart', stopGlobeRotation);

  document.getElementById('map-rotate')?.addEventListener('click', () => {
    const btn = document.getElementById('map-rotate');
    const pressed = btn?.getAttribute('aria-pressed') === 'true';
    if (pressed) {
      stopGlobeRotation();
    } else {
      globeRotationEnabled = true;
      globeRotationState = 'easing-in';
      globeEaseStepIndex = 0;
      btn?.setAttribute('aria-pressed', 'true');
      btn?.classList.add('bg-primary/20', 'text-primary');
      spinGlobe();
    }
  });
  document.getElementById('map-gps')?.addEventListener('click', () => showToastError('Feature not yet implemented'));
}

function flyToLocation(lng, lat, zoom, opts = {}) {
  if (!appMap) return;
  const { pitch = 0, duration = 4000 } = opts;
  appMap.flyTo({
    center: [lng, lat],
    zoom,
    pitch,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    duration
  });
}

function initBottomPanel() {
  const wrapper = document.getElementById('bottom-panel-wrapper');
  const panel = document.getElementById('bottom-panel');
  const toggle = document.getElementById('bottom-panel-toggle');
  const closeBtn = document.getElementById('bottom-panel-close');
  if (!wrapper || !panel || !toggle) return;

  function closePanel() {
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open Emerging Tech Specialist');
    toggle.querySelector('.material-symbols-outlined')?.classList.remove('rotate-180');
    document.removeEventListener('click', handleClickOutside);
  }

  function openPanel() {
    panel.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close Emerging Tech Specialist');
    toggle.querySelector('.material-symbols-outlined')?.classList.add('rotate-180');
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
  }

  function handleClickOutside(e) {
    if (!panel.classList.contains('visible')) return;
    if (wrapper.contains(e.target)) return;
    closePanel();
  }

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.classList.contains('visible')) closePanel();
    else openPanel();
  });

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.classList.contains('visible')) closePanel();
  });

  panel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('visible')) closePanel();
  });
}

function initResumeEmbed() {
  const btn = document.getElementById('btn-resume');
  const overlay = document.getElementById('resume-embed-overlay');
  const iframe = document.getElementById('resume-embed-iframe');
  const closeBtn = document.getElementById('resume-embed-close');

  function openResume() {
    if (overlay && iframe) {
      iframe.src = 'resume.html';
      overlay.classList.remove('hidden');
    }
  }

  function closeResume() {
    if (overlay) overlay.classList.add('hidden');
    if (iframe) iframe.src = 'about:blank';
  }

  btn?.addEventListener('click', openResume);
  closeBtn?.addEventListener('click', closeResume);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeResume();
  });
}

window.initMapApp = initMapApp;
window.initBottomPanel = initBottomPanel;
window.initResumeEmbed = initResumeEmbed;
