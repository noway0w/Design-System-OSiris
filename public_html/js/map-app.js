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
let apiMisconfigured = false;
let isAdmin = false;
let scrollDragJustEnded = false;

let mapDataState = { buildings: true, topography: true, names: false, propertyBoundaries: true };
let mapDataTileOrder = ['buildings', 'topography', 'names', 'propertyBoundaries'];
const userProfilePanels = new Map();
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

function getUsersDeleteUrl(id) {
  const b = getApiBase();
  return b ? `${b}/api/users/${id}` : `api/users-delete.php?id=${id}`;
}

function getUsersMeUrl() {
  const b = getApiBase();
  return b ? `${b}/api/users/me` : 'api/users-me.php';
}

async function fetchIsAdmin() {
  try {
    const res = await fetch(getUsersMeUrl() + '?_=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      isAdmin = !!data?.isAdmin;
    }
  } catch (_) {}
}

async function deleteUser(id) {
  const b = getApiBase();
  const url = getUsersDeleteUrl(id);
  const opts = b ? { method: 'DELETE' } : { method: 'GET' };
  const res = await fetch(url, opts);
  if (res.status === 403) {
    showToastError('You do not have the rights to use this feature');
    return false;
  }
  return res.ok;
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
    const b = getApiBase();
    const res = await fetch(getUsersClearUrl(), b ? { method: 'DELETE' } : { method: 'GET' });
    if (res.status === 403) {
      showToastError('You do not have the rights to use this feature');
      return;
    }
    if (res.ok) await refreshNearby();
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
    id: u.id,
    name: u.name,
    avatar: AVATARS[i % AVATARS.length],
    lastSeen: u.lastSeen,
    lat: u.lat,
    lng: u.lng,
    city: u.city ?? null,
    country: u.country ?? null,
    widgets: Array.isArray(u.widgets) ? u.widgets : []
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
  const currentUserName = sessionStorage.getItem('osiris_user_name')?.trim() || '';

  let html = '';
  if (isAdmin) {
    html = `
    <button id="nearby-clear-all" type="button" class="w-48 flex-shrink-0 bg-card-light/70 dark:bg-card-dark/50 hover:bg-card-light dark:hover:bg-card-dark/80 p-3 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col gap-3 items-center justify-center transition-colors cursor-pointer" title="Clear all visitor tiles">
      <span class="material-symbols-outlined text-3xl text-text-secondary">delete</span>
      <span class="text-text-secondary text-sm font-medium">Clear all</span>
    </button>`;
  }

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
    const dataId = tile.id != null ? `data-user-id="${tile.id}"` : '';
    const fadeClass = previousUserNames.has(tile.name) ? '' : ' tile-fade-in';
    const canDelete = tile.id && (isAdmin || tile.name === currentUserName);
    const deleteBtn = canDelete ? `<button type="button" class="user-tile-delete p-1.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors z-10" data-user-id="${tile.id}" data-user-name="${tile.name}" aria-label="Delete ${tile.name}"><span class="material-symbols-outlined text-[16px]">delete</span></button>` : '';
    html += `
      <div ${dataAttr} ${dataId} class="w-48 bg-card-light dark:bg-card-dark p-3 rounded-2xl border ${borderClass} flex flex-col gap-3 relative overflow-hidden group ${cardClass}${fadeClass}">
        <div class="absolute top-0 right-0 p-2 flex items-center gap-1">
          ${deleteBtn}
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

  previousUserNames = newNames;
  container.innerHTML = html;
  if (countEl) {
    countEl.textContent = apiMisconfigured && total === 0
      ? 'Discover my world needs PHP enabled on server'
      : total === 0 ? 'No Tech enthusiasts yet' : `${total} Tech enthusiast${total === 1 ? '' : 's'} worldwide`;
  }

  document.getElementById('nearby-clear-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearAllUsers();
  });

  container.querySelectorAll('.user-tile-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.getAttribute('data-user-id');
      if (!id) return;
      if (await deleteUser(id)) {
        const panel = Array.from(document.querySelectorAll('.user-profile-panel')).find((p) => p.getAttribute('data-user-id') === id);
        if (panel) closeUserProfilePanel(panel);
        await refreshNearby();
      }
    });
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
    antialias: true,
    config: {
      basemap: {
        showPlaceLabels: mapDataState.names,
        showRoadLabels: mapDataState.names,
        showPointOfInterestLabels: mapDataState.names,
        showTransitLabels: mapDataState.names
      }
    }
  });

  appMap.on('load', () => {
    applyMapTheme();
    wirePOITabs();
    wirePOITileCards();
    wireMapDataTiles();
    discoverMapLayers();
    renderMapDataTiles(mapDataState);
    applyMapDataState(mapDataState);
    appMap.once('idle', () => {
      discoverMapLayers();
      applyMapDataState(mapDataState);
    });
    LocationService.getIPLocation().then(async (loc) => {
      await fetchIsAdmin();
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
    if (e.target.closest('.user-tile-delete')) return;
    if (scrollDragJustEnded) {
      scrollDragJustEnded = false;
      return;
    }
    const el = e.target.closest('[data-user-tile]');
    if (!el || !appMap) return;
    const name = el.getAttribute('data-user-tile');
    const tile = currentTiles.find((t) => t.name === name);
    if (tile && tile.lat != null && tile.lng != null) {
      flyToLocation(tile.lng, tile.lat, 18, { pitch: 45 });
      openUserProfilePanel(tile);
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
  const tabWidgets = document.getElementById('tab-widgets');
  const tilesNearby = document.getElementById('nearby-friends-tiles');
  const tilesPOI = document.getElementById('poi-tiles');
  const tilesMapData = document.getElementById('map-data-tiles');
  const tilesWidgets = document.getElementById('widget-tiles');
  if (!tabNearby || !tabPOI || !tilesNearby || !tilesPOI) return;

  function setActiveTab(active) {
    [tabNearby, tabPOI, tabMapData, tabWidgets].forEach((t) => {
      if (t) {
        t.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
        t.classList.add('bg-transparent', 'text-text-secondary', 'border-slate-200', 'dark:border-white/10');
      }
    });
    [tilesNearby, tilesPOI, tilesMapData, tilesWidgets].forEach((c) => {
      if (c) c.classList.add('hidden');
    });
    const tabMap = { nearby: tabNearby, poi: tabPOI, 'map-data': tabMapData, widgets: tabWidgets };
    const tilesMap = { nearby: tilesNearby, poi: tilesPOI, 'map-data': tilesMapData, widgets: tilesWidgets };
    const activeTab = tabMap[active];
    const activeTiles = tilesMap[active];
    if (activeTab) {
      activeTab.classList.remove('bg-transparent', 'text-text-secondary', 'border-slate-200', 'dark:border-white/10');
      activeTab.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
    }
    if (activeTiles) activeTiles.classList.remove('hidden');
    if (active === 'map-data') {
      discoverMapLayers();
      applyMapDataState(mapDataState);
    }
  }

  tabNearby.addEventListener('click', () => setActiveTab('nearby'));
  tabPOI.addEventListener('click', () => setActiveTab('poi'));
  tabMapData?.addEventListener('click', () => setActiveTab('map-data'));
  tabWidgets?.addEventListener('click', () => {
    setActiveTab('widgets');
    renderWidgetTilesInTab();
  });
}

async function renderWidgetTilesInTab() {
  const container = document.getElementById('widget-tiles');
  const addWeatherBtn = document.getElementById('add-weather-widget');
  const addStockBtn = document.getElementById('add-stock-widget');
  if (!container) return;
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  let widgets = [];
  if (name) {
    try {
      const url = (typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php') + '?name=' + encodeURIComponent(name);
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        widgets = data.widgets || [];
      }
    } catch (_) {}
  }
  const weatherWidgets = widgets.filter((w) => w.type === 'weather');
  const stockWidgets = widgets.filter((w) => w.type === 'stock');
  const isDark = document.documentElement.classList.contains('dark');
  let cardsHtml = '';
  for (const w of weatherWidgets) {
    const imgPath = w.image || w.imageClear || w.imageDark || '';
    try {
      const forecastUrl = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + w.lat + '&lng=' + w.lng;
      const res = await fetch(forecastUrl);
      const weather = res.ok ? await res.json() : {};
      cardsHtml += buildWidgetCardHtml(w, weather, imgPath, isDark, true, 'tile');
    } catch (_) {
      cardsHtml += buildWidgetCardHtml(w, {}, imgPath, isDark, true, 'tile');
    }
  }
  for (const w of stockWidgets) {
    try {
      const stockUrl = typeof getStockUrl === 'function' ? getStockUrl() : 'stock.php';
      const quoteRes = await fetch(stockUrl + '?action=quote&symbol=' + encodeURIComponent(w.symbol || ''));
      const quote = quoteRes.ok ? await quoteRes.json() : {};
      cardsHtml += buildStockWidgetCardHtml(w, quote, [], isDark, true, 'tile');
    } catch (_) {
      cardsHtml += buildStockWidgetCardHtml(w, {}, [], isDark, true, 'tile');
    }
  }
  const addHtml = (addWeatherBtn ? addWeatherBtn.outerHTML : '') + (addStockBtn ? addStockBtn.outerHTML : '');
  container.innerHTML = addHtml + cardsHtml;
  container.querySelector('#add-weather-widget')?.addEventListener('click', () => {
    document.getElementById('weather-widget-config-overlay')?.classList.remove('hidden');
  });
  container.querySelector('#add-stock-widget')?.addEventListener('click', () => {
    document.getElementById('stock-widget-config-overlay')?.classList.remove('hidden');
  });
  container.querySelectorAll('[data-delete-widget-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteWidgetId;
      if (!id || !name) return;
      await deleteWidget(id);
      renderWidgetTilesInTab();
    });
  });
}

function buildWidgetCardHtml(w, weather, imgPath, isDark, showDelete, variant) {
  const temp = weather.temperature != null ? Math.round(weather.temperature) + '°C' : '—';
  const humidity = weather.humidity != null ? weather.humidity + '% humidity' : '—';
  const overlayClass = isDark ? 'bg-black/50' : 'bg-black/10';
  const deleteId = w.id || ('w-' + (w.city || '') + '-' + (w.lat ?? '') + '-' + (w.lng ?? ''));
  const deleteBtn = showDelete
    ? `<button type="button" data-delete-widget-id="${String(deleteId).replace(/"/g, '&quot;')}" class="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer" aria-label="Delete widget">
         <span class="material-symbols-outlined text-[18px]">delete</span>
       </button>`
    : '';
  const sizeClass = variant === 'panel' ? 'w-[260px] h-[260px] flex-shrink-0' : 'w-[260px] h-[260px] flex-shrink-0';
  const layoutClass = variant === 'panel' ? 'flex items-start gap-3' : 'flex flex-col justify-end min-h-0';
  const textClass = isDark ? 'text-white' : 'text-black';
  const textMutedClass = isDark ? 'text-white/80' : 'text-black/80';
  const innerLayout = variant === 'panel'
    ? `<img src="${getWeatherIcon(weather.weatherCode || 0)}" alt="" class="w-8 h-8 flex-shrink-0" style="filter:${isDark ? 'brightness(0) invert(1)' : 'brightness(0)'};"/>
       <div class="min-w-0 flex-1">
         <div class="text-xs ${textMutedClass} font-medium">Current local weather</div>
         <div class="${textClass} font-bold text-sm">${(w.city || '—').replace(/</g, '&lt;')}</div>
         <div class="${textClass} text-sm mt-0.5">${temp} · ${humidity}</div>
       </div>`
    : `<img src="${getWeatherIcon(weather.weatherCode || 0)}" alt="" class="absolute top-3 left-3 w-8 h-8" style="filter:${isDark ? 'brightness(0) invert(1)' : 'brightness(0)'};"/>
       <div class="mt-auto">
         <div class="text-xs ${textMutedClass} font-medium">Current local weather</div>
         <div class="${textClass} font-bold text-sm">${(w.city || '—').replace(/</g, '&lt;')}</div>
         <div class="${textClass} text-sm mt-0.5">${temp} · ${humidity}</div>
       </div>`;
  const bgSrc = imgPath
    ? (typeof resolveCityImageUrl === 'function' ? resolveCityImageUrl(imgPath) : imgPath)
    : '';
  const bgImg = bgSrc
    ? `<img src="${String(bgSrc).replace(/"/g, '&quot;')}" alt="" class="absolute inset-0 w-full h-full object-cover pointer-events-none" style="transform:scale(1.11)" />`
    : '';
  return `
    <div class="group relative ${sizeClass} rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
      ${bgImg}
      <div class="absolute inset-0 ${overlayClass}"></div>
      ${deleteBtn}
      <div class="relative p-3 ${layoutClass} h-full z-[1]">
        ${innerLayout}
      </div>
    </div>
  `;
}

async function deleteWidget(widgetId) {
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  if (!name) return false;
  try {
    const url = (typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php') + '?name=' + encodeURIComponent(name);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return false;
    const data = await res.json();
    let widgets = data.widgets || [];
    widgets = widgets.filter((w) => {
      const id = w.id || (w.type === 'stock' ? 'w-' + (w.symbol || '') : 'w-' + (w.city || '') + '-' + (w.lat ?? '') + '-' + (w.lng ?? ''));
      return id !== widgetId;
    });
    const patchUrl = typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php';
    const patchRes = await fetch(patchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, widgets })
    });
    if (patchRes.ok) await refreshNearby();
    return patchRes.ok;
  } catch (_) {
    return false;
  }
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
  toggle.setAttribute('aria-label', 'Open Discover my world');
  toggle.querySelector('.material-symbols-outlined')?.classList.remove('rotate-180');
}

const PANEL_CASCADE_OFFSET = 28;
const PANEL_BASE_Z = 40;

function getPanelPosition(panelEl) {
  const rect = panelEl.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

function setPanelPosition(panelEl, left, top) {
  const maxLeft = window.innerWidth - panelEl.offsetWidth;
  const maxTop = window.innerHeight - panelEl.offsetHeight;
  left = Math.max(0, Math.min(left, maxLeft));
  top = Math.max(0, Math.min(top, maxTop));
  panelEl.style.left = left + 'px';
  panelEl.style.top = top + 'px';
  panelEl.style.transform = 'none';
}

function closeUserProfilePanel(panelEl) {
  if (!panelEl) return;
  const name = panelEl.getAttribute('data-user-name');
  if (name) userProfilePanels.delete(name);
  panelEl.remove();
}

async function openUserProfilePanel(tile) {
  const container = document.getElementById('user-profile-panels-container');
  if (!container) return;
  const name = tile.name || tile.id || 'user';
  if (userProfilePanels.has(name)) {
    const { el } = userProfilePanels.get(name);
    el.style.zIndex = PANEL_BASE_Z + userProfilePanels.size;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    return;
  }

  const currentUserName = sessionStorage.getItem('osiris_user_name')?.trim() || '';
  const canDelete = tile.id && (isAdmin || tile.name === currentUserName);
  const count = userProfilePanels.size;
  const baseX = window.innerWidth / 2 - 144;
  const baseY = window.innerHeight / 2 - 120;
  const left = baseX + count * PANEL_CASCADE_OFFSET;
  const top = baseY + count * PANEL_CASCADE_OFFSET;

  const panel = document.createElement('div');
  panel.className = 'user-profile-panel fixed w-72 rounded-2xl overflow-hidden bg-background-light/20 dark:bg-background-dark/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto';
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('data-user-name', name);
  panel.setAttribute('data-user-id', tile.id || '');
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.zIndex = String(PANEL_BASE_Z + count);

  const deleteBtnHtml = canDelete
    ? `<button type="button" class="user-profile-panel-delete w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-500/20 text-slate-600 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors" data-user-id="${String(tile.id || '').replace(/"/g, '&quot;')}" aria-label="Delete user"><span class="material-symbols-outlined text-[20px]">delete</span></button>`
    : '';

  panel.innerHTML = `
    <div class="user-profile-drag-handle flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none bg-card-light/50 dark:bg-card-dark/50 border-b border-slate-200/50 dark:border-white/5">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <img class="user-profile-avatar w-12 h-12 rounded-full object-cover border-2 border-primary/30 flex-shrink-0" src="${(tile.avatar || '').replace(/"/g, '&quot;')}" alt="${(tile.name || '').replace(/"/g, '&quot;')}"/>
        <div class="min-w-0">
          <h3 class="user-profile-name font-bold text-slate-800 dark:text-white truncate">${(tile.name || '—').toString().replace(/</g, '&lt;')}</h3>
          <div class="flex items-center gap-1 text-text-secondary text-sm truncate">
            <span class="material-symbols-outlined text-[16px] flex-shrink-0">location_on</span>
            <span class="user-profile-location truncate">${(tile.city || tile.country || 'Unknown').toString().replace(/</g, '&lt;')}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        ${deleteBtnHtml}
        <button type="button" class="user-profile-panel-close w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors" aria-label="Close profile"><span class="material-symbols-outlined text-[20px]">close</span></button>
      </div>
    </div>
    <div class="user-profile-widgets p-3 space-y-2 hidden"></div>
  `;

  const widgetsEl = panel.querySelector('.user-profile-widgets');
  const allWidgets = tile.widgets || [];
  const weatherWidgets = allWidgets.filter((w) => w.type === 'weather');
  const stockWidgets = allWidgets.filter((w) => w.type === 'stock');
  const showDelete = canDelete && allWidgets.length > 0;

  if (allWidgets.length > 0) {
    widgetsEl.classList.remove('hidden');
    const isDark = document.documentElement.classList.contains('dark');
    let html = '';
    for (const w of weatherWidgets) {
      try {
        const url = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + w.lat + '&lng=' + w.lng;
        const res = await fetch(url);
        const weather = res.ok ? await res.json() : {};
        const imgPath = w.image || w.imageDark || w.imageClear;
        html += buildWidgetCardHtml(w, weather, imgPath, isDark, showDelete, 'panel');
      } catch (_) {
        html += buildWidgetCardHtml(w, {}, w.image || w.imageDark || w.imageClear, isDark, showDelete, 'panel');
      }
    }
    for (const w of stockWidgets) {
      try {
        const stockUrl = typeof getStockUrl === 'function' ? getStockUrl() : 'stock.php';
        const quoteRes = await fetch(stockUrl + '?action=quote&symbol=' + encodeURIComponent(w.symbol || ''));
        const quote = quoteRes.ok ? await quoteRes.json() : {};
        html += buildStockWidgetCardHtml(w, quote, [], isDark, showDelete, 'panel');
      } catch (_) {
        html += buildStockWidgetCardHtml(w, {}, [], isDark, showDelete, 'panel');
      }
    }
    widgetsEl.innerHTML = html;
    if (showDelete) {
      widgetsEl.querySelectorAll('[data-delete-widget-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.deleteWidgetId;
          if (!id || tile.name !== currentUserName) return;
          await deleteWidget(id);
          closeUserProfilePanel(panel);
          await refreshNearby();
        });
      });
    }
  }

  container.appendChild(panel);
  userProfilePanels.set(name, { el: panel, tile });

  const handle = panel.querySelector('.user-profile-drag-handle');
  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.user-profile-panel-close')) return;
      const pos = getPanelPosition(panel);
      window._userPanelDrag = { panel, startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top };
    });
    handle.addEventListener('touchstart', (e) => {
      if (e.target.closest('.user-profile-panel-close')) return;
      const pos = getPanelPosition(panel);
      window._userPanelDrag = { panel, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startLeft: pos.left, startTop: pos.top };
    }, { passive: true });
  }
}

function initUserProfilePanel() {
  document.addEventListener('mousemove', (e) => {
    if (!window._userPanelDrag) return;
    const { panel, startX, startY, startLeft, startTop } = window._userPanelDrag;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    setPanelPosition(panel, startLeft + dx, startTop + dy);
  });
  document.addEventListener('mouseup', () => { window._userPanelDrag = null; });
  document.addEventListener('touchmove', (e) => {
    if (!window._userPanelDrag) return;
    const { panel, startX, startY, startLeft, startTop } = window._userPanelDrag;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    setPanelPosition(panel, startLeft + dx, startTop + dy);
  }, { passive: true });
  document.addEventListener('touchend', () => { window._userPanelDrag = null; });

  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.user-profile-panel-close');
    if (closeBtn) {
      const panel = closeBtn.closest('.user-profile-panel');
      closeUserProfilePanel(panel);
      return;
    }
    const deleteBtn = e.target.closest('.user-profile-panel-delete');
    if (deleteBtn) {
      e.preventDefault();
      const id = deleteBtn.getAttribute('data-user-id');
      if (!id) return;
      const panel = deleteBtn.closest('.user-profile-panel');
      deleteUser(id).then((ok) => {
        if (ok) {
          closeUserProfilePanel(panel);
          refreshNearby();
        }
      });
    }
  });
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
  document.getElementById('map-gps')?.addEventListener('click', async () => {
    const btn = document.getElementById('map-gps');
    const icon = btn?.querySelector('.material-symbols-outlined');
    const origContent = icon?.innerHTML;
    if (icon) icon.textContent = 'hourglass_empty';
    btn?.setAttribute('disabled', 'true');
    try {
      const loc = await LocationService.getAccurateLocation();
      flyToLocation(loc.lng, loc.lat, 16);
      addCurrentLocationMarker(loc.lng, loc.lat);
    } catch (e) {
      const code = e?.code;
      const msg = code === 1 ? 'Location access denied. Allow it in your browser to use GPS.'
        : code === 3 ? 'GPS timed out. Using approximate location.'
        : code === 2 ? 'Position unavailable. Using approximate location.'
        : typeof location !== 'undefined' && location?.protocol === 'http:' && !location?.hostname?.includes('localhost')
          ? 'GPS requires HTTPS. Using approximate location.'
          : 'Could not get GPS. Using approximate location.';
      showToastError(msg);
      const loc = await LocationService.getIPLocation();
      if (loc) {
        flyToLocation(loc.lng, loc.lat, 14);
        addCurrentLocationMarker(loc.lng, loc.lat);
      } else {
        showToastError('Unable to determine your location');
      }
    } finally {
      if (icon) icon.textContent = origContent || 'navigation';
      btn?.removeAttribute('disabled');
    }
  });
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
    toggle.setAttribute('aria-label', 'Open Discover my world');
    toggle.querySelector('.material-symbols-outlined')?.classList.remove('rotate-180');
    document.removeEventListener('click', handleClickOutside);
  }

  function openPanel() {
    panel.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close Discover my world');
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

  const scrollEl = document.getElementById('bottom-panel-tiles-scroll');
  const scrollRightBtn = document.getElementById('bottom-panel-scroll-right');
  if (scrollEl) {
    const DRAG_THRESHOLD = 6;
    let isDragScrolling = false;
    let dragPending = false;
    let startX = 0;
    let startScrollLeft = 0;
    const endDrag = () => {
      if (isDragScrolling) scrollDragJustEnded = true;
      isDragScrolling = false;
      dragPending = false;
      scrollEl.style.cursor = 'grab';
      scrollEl.style.userSelect = '';
      scrollEl.style.scrollBehavior = 'smooth';
    };
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      if (dragPending && Math.abs(clientX - startX) >= DRAG_THRESHOLD) {
        dragPending = false;
        isDragScrolling = true;
        scrollEl.style.cursor = 'grabbing';
        scrollEl.style.userSelect = 'none';
        scrollEl.style.scrollBehavior = 'auto';
      }
      if (!isDragScrolling) return;
      e.preventDefault();
      scrollEl.scrollLeft = startScrollLeft + (startX - clientX);
    };
    const onDown = (e) => {
      if (e.target.closest('.map-data-tile-draggable, .user-tile-delete, #nearby-clear-all')) return;
      scrollDragJustEnded = false;
      dragPending = true;
      isDragScrolling = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      startX = clientX;
      startScrollLeft = scrollEl.scrollLeft;
    };
    scrollEl.addEventListener('mousedown', onDown);
    scrollEl.addEventListener('touchstart', onDown, { passive: true });
    scrollEl.addEventListener('mousemove', onMove);
    scrollEl.addEventListener('touchmove', onMove, { passive: false });
    scrollEl.addEventListener('mouseup', endDrag);
    scrollEl.addEventListener('mouseleave', endDrag);
    scrollEl.addEventListener('touchend', endDrag);
    scrollEl.addEventListener('touchcancel', endDrag);
  }
  scrollRightBtn?.addEventListener('click', () => {
    if (scrollEl) scrollEl.scrollBy({ left: 200, behavior: 'smooth' });
  });
}

const WMO_TO_ICON = {
  0: 'weather_icons/clear_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  1: 'weather_icons/partly_cloudy_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  2: 'weather_icons/partly_cloudy_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  3: 'weather_icons/cloud_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  45: 'weather_icons/foggy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  48: 'weather_icons/foggy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  51: 'weather_icons/rainy_light_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  53: 'weather_icons/rainy_light_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  55: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  61: 'weather_icons/rainy_light_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  63: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  65: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  71: 'weather_icons/snowing_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  73: 'weather_icons/snowing_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  75: 'weather_icons/snowing_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  80: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  81: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  82: 'weather_icons/rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  95: 'weather_icons/thunderstorm_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  96: 'weather_icons/thunderstorm_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg',
  99: 'weather_icons/thunderstorm_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg'
};
function getWeatherIcon(code) {
  if (WMO_TO_ICON[code]) return WMO_TO_ICON[code];
  if (code >= 4 && code <= 9) return WMO_TO_ICON[3];
  if (code >= 56 && code <= 67) return WMO_TO_ICON[61];
  if (code >= 77 && code <= 82) return WMO_TO_ICON[80];
  return WMO_TO_ICON[0];
}

function initWeatherWidgetConfig() {
  const addBtn = document.getElementById('add-weather-widget');
  const overlay = document.getElementById('weather-widget-config-overlay');
  const closeBtn = document.getElementById('weather-widget-config-close');
  const byLocation = document.getElementById('weather-config-by-location');
  const byCity = document.getElementById('weather-config-by-city');
  const locationSection = document.getElementById('weather-config-location');
  const citySection = document.getElementById('weather-config-city');
  const cityInput = document.getElementById('weather-config-city-input');
  const cityResults = document.getElementById('weather-config-city-results');
  const validateLocation = document.getElementById('weather-config-validate-location');
  const validateCity = document.getElementById('weather-config-validate-city');
  const loadingEl = document.getElementById('weather-widget-loading');
  if (!overlay || !addBtn) return;

  let mode = 'location';
  let selectedCity = null;

  function showLoading(v) {
    loadingEl?.classList.toggle('hidden', !v);
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    mode = 'location';
    selectedCity = null;
    locationSection?.classList.remove('hidden');
    citySection?.classList.add('hidden');
    validateCity?.classList.add('hidden');
    cityInput.value = '';
    cityResults.innerHTML = '';
  }

  function closePanel() {
    overlay.classList.add('hidden');
    showLoading(false);
  }

  addBtn?.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });

  byLocation?.addEventListener('click', () => {
    mode = 'location';
    selectedCity = null;
    locationSection?.classList.remove('hidden');
    citySection?.classList.add('hidden');
    byLocation.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
    byCity?.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
  });
  byCity?.addEventListener('click', () => {
    mode = 'city';
    locationSection?.classList.add('hidden');
    citySection?.classList.remove('hidden');
    byCity?.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
    byLocation?.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
  });

  let searchTimeout = null;
  cityInput?.addEventListener('input', () => {
    selectedCity = null;
    validateCity?.classList.add('hidden');
    const q = cityInput.value.trim();
    if (q.length < 2) {
      cityResults.innerHTML = '';
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const url = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=search&name=' + encodeURIComponent(q);
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const results = data.results || [];
        cityResults.innerHTML = results.slice(0, 5).map((r) => {
          const cc = (r.country_code || r.countryCode || '').toString().toUpperCase().slice(0, 2);
          return `
          <button type="button" class="weather-city-result w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-white" data-lat="${r.latitude}" data-lng="${r.longitude}" data-city="${r.name}" data-country="${(r.country || '').toString().replace(/"/g, '&quot;')}" data-country-code="${cc}">
            ${r.name}${r.admin1 ? ', ' + r.admin1 : ''} (${cc})
          </button>
        `;
        }).join('');
        cityResults.querySelectorAll('.weather-city-result').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedCity = {
              lat: parseFloat(btn.dataset.lat),
              lng: parseFloat(btn.dataset.lng),
              city: btn.dataset.city,
              country: btn.dataset.country,
              countryCode: (btn.dataset.countryCode || '').toUpperCase().slice(0, 2)
            };
            cityInput.value = selectedCity.city + ' (' + selectedCity.countryCode + ')';
            cityResults.innerHTML = '';
            validateCity?.classList.remove('hidden');
          });
        });
      } catch (_) {}
    }, 300);
  });

  async function addWeatherWidget(payload) {
    const name = sessionStorage.getItem('osiris_user_name')?.trim();
    if (!name) {
      showToastError('Please log in to add a widget');
      return;
    }
    showLoading(true);
    try {
      const url = typeof getCityImageUrl === 'function' ? getCityImageUrl() : 'city-image.php';
      const imgRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: payload.city,
          countryCode: payload.countryCode,
          lat: payload.lat,
          lng: payload.lng,
          weatherCode: payload.weatherCode || 0
        })
      });
      const imgData = await imgRes.json();
      const hasImage = imgData.image || imgData.imageClear || imgData.imageDark;
      if (imgData.error && !hasImage) {
        showToastError(imgData.detail ? `${imgData.error}: ${imgData.detail}` : (imgData.error || 'Failed to get city image'));
        showLoading(false);
        return;
      }
      const img = imgData.image || imgData.imageClear || imgData.imageDark || '';
      const widget = {
        id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
        type: 'weather',
        city: payload.city,
        countryCode: payload.countryCode,
        lat: payload.lat,
        lng: payload.lng,
        image: img,
        imageClear: img,
        imageDark: img
      };
      const widgetsUrl = (typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php') + '?name=' + encodeURIComponent(name);
      const usersRes = await fetch(widgetsUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      let widgets = [];
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        widgets = usersData.widgets || [];
      }
      const patchUrl = typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php';
      const patchRes = await fetch(patchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          widgets: [...widgets, widget]
        })
      });
      if (!patchRes.ok) {
        showToastError('Failed to save widget');
        showLoading(false);
        return;
      }
      closePanel();
      await refreshNearby();
      const tabWidgets = document.getElementById('tab-widgets');
      const tilesWidgets = document.getElementById('widget-tiles');
      if (tabWidgets?.classList.contains('bg-primary/20') && tilesWidgets) {
        await renderWidgetTilesInTab();
      }
    } catch (e) {
      showToastError('Failed to add weather widget');
    }
    showLoading(false);
  }

  validateLocation?.addEventListener('click', async () => {
    const loc = LocationService?.currentLocation || {};
    if (!loc.lat || !loc.lng) {
      showToastError('Location not available. Enable GPS or try by city.');
      return;
    }
    const city = loc.city || 'Unknown';
    const countryCode = (loc.country || '').slice(0, 2).toUpperCase();
    try {
      const url = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + loc.lat + '&lng=' + loc.lng;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      const weather = await res.json();
      await addWeatherWidget({
        city, countryCode,
        lat: loc.lat, lng: loc.lng,
        weatherCode: weather.weatherCode || 0
      });
    } catch (_) {
      showToastError('Failed to get weather data');
    }
  });

  validateCity?.addEventListener('click', async () => {
    if (!selectedCity) {
      showToastError('Select a city from the results');
      return;
    }
    try {
      const url = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + selectedCity.lat + '&lng=' + selectedCity.lng;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      const weather = await res.json();
      await addWeatherWidget({
        city: selectedCity.city,
        countryCode: selectedCity.countryCode,
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        weatherCode: weather.weatherCode || 0
      });
    } catch (_) {
      showToastError('Failed to get weather data');
    }
  });
}

function initStockWidgetConfig() {
  const addBtn = document.getElementById('add-stock-widget');
  const overlay = document.getElementById('stock-widget-config-overlay');
  const closeBtn = document.getElementById('stock-widget-config-close');
  const searchInput = document.getElementById('stock-config-search');
  const resultsEl = document.getElementById('stock-config-results');
  const addBtnSubmit = document.getElementById('stock-config-add');
  const loadingEl = document.getElementById('stock-widget-loading');
  if (!overlay || !addBtn) return;

  let selectedStock = null;

  function showLoading(v) {
    loadingEl?.classList.toggle('hidden', !v);
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    selectedStock = null;
    searchInput.value = '';
    resultsEl.innerHTML = '';
    addBtnSubmit?.classList.add('hidden');
  }

  function closePanel() {
    overlay.classList.add('hidden');
    showLoading(false);
  }

  addBtn?.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });

  let searchTimeout = null;
  searchInput?.addEventListener('input', () => {
    selectedStock = null;
    addBtnSubmit?.classList.add('hidden');
    const q = searchInput.value.trim();
    if (q.length < 1) {
      resultsEl.innerHTML = '';
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const url = (typeof getStockUrl === 'function' ? getStockUrl() : 'stock.php') + '?action=search&q=' + encodeURIComponent(q);
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          resultsEl.innerHTML = '<p class="text-sm text-red-500 px-3 py-2">' + (err.error || 'Search failed') + '</p>';
          return;
        }
        const data = await res.json();
        const results = data.result || data.results || [];
        if (results.length === 0) {
          resultsEl.innerHTML = '<p class="text-sm text-text-secondary px-3 py-2">No symbols found</p>';
          return;
        }
        resultsEl.innerHTML = results.map((r) => {
          const symbol = (r.symbol || r['1. symbol'] || '').replace(/"/g, '&quot;');
          const desc = (r.description || r.name || r['2. name'] || r.type || r['3. type'] || symbol).toString().replace(/</g, '&lt;');
          return `<button type="button" class="stock-search-result w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-slate-800 dark:text-white" data-symbol="${symbol}" data-description="${desc.replace(/"/g, '&quot;')}">${symbol} — ${desc}</button>`;
        }).join('');
        resultsEl.querySelectorAll('.stock-search-result').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedStock = { symbol: btn.dataset.symbol, description: btn.dataset.description || btn.dataset.symbol };
            searchInput.value = selectedStock.symbol + ' — ' + (selectedStock.description || '');
            resultsEl.innerHTML = '';
            addBtnSubmit?.classList.remove('hidden');
          });
        });
      } catch (_) {
        resultsEl.innerHTML = '<p class="text-sm text-red-500 px-3 py-2">Search failed</p>';
      }
    }, 400);
  });

  addBtnSubmit?.addEventListener('click', async () => {
    if (!selectedStock) {
      showToastError('Select a symbol from the results');
      return;
    }
    await addStockWidget(selectedStock.symbol, selectedStock.description, showLoading, closePanel);
  });
}

async function addStockWidget(symbol, description, showLoading, closePanel) {
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  if (!name) {
    showToastError('Please log in to add a widget');
    return;
  }
  showLoading?.(true);
  try {
    const stockUrl = typeof getStockUrl === 'function' ? getStockUrl() : 'stock.php';
    const quoteRes = await fetch(stockUrl + '?action=quote&symbol=' + encodeURIComponent(symbol));
    const quote = quoteRes.ok ? await quoteRes.json() : {};
    if (quoteRes.status === 503) {
      showToastError('Stock API not configured. Add ALPHAVANTAGE_API_KEY to config.');
      showLoading?.(false);
      return;
    }
    const widget = {
      id: 'w-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      type: 'stock',
      symbol: symbol.toUpperCase(),
      name: description || symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      duration: '1 month'
    };
    const widgetsUrl = (typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php') + '?name=' + encodeURIComponent(name);
    const usersRes = await fetch(widgetsUrl, { headers: { 'Accept': 'application/json' } });
    let widgets = [];
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      widgets = usersData.widgets || [];
    }
    const patchRes = await fetch(typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, widgets: [...widgets, widget] })
    });
    if (!patchRes.ok) {
      showToastError('Failed to save widget');
      showLoading?.(false);
      return;
    }
    closePanel?.();
    await refreshNearby();
    const tabWidgets = document.getElementById('tab-widgets');
    if (tabWidgets?.classList.contains('bg-primary/20')) {
      await renderWidgetTilesInTab();
    }
  } catch (e) {
    showToastError('Failed to add stock widget');
  }
  showLoading?.(false);
}

function buildStockWidgetCardHtml(w, quote, _chartData, isDark, showDelete, variant) {
  const pct = quote?.changePercent ?? w.changePercent;
  const isUp = pct != null && pct > 0;
  const isDown = pct != null && pct < 0;
  const colorClass = isUp ? 'bg-emerald-500/20 dark:bg-emerald-400/20 border-emerald-400/40' : isDown ? 'bg-rose-500/20 dark:bg-rose-400/20 border-rose-400/40' : 'bg-slate-500/20 dark:bg-slate-400/20 border-slate-400/40';
  const textColorClass = isUp ? 'text-emerald-700 dark:text-emerald-400' : isDown ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400';
  const price = quote?.price ?? w.price ?? '—';
  const priceStr = typeof price === 'number' ? '$' + price.toFixed(2) : price;
  const changeStr = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';
  const durationLabel = w.duration ?? '1 month';
  const deleteId = w.id || ('w-' + (w.symbol || ''));
  const deleteBtn = showDelete
    ? `<button type="button" data-delete-widget-id="${String(deleteId).replace(/"/g, '&quot;')}" class="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer" aria-label="Delete widget">
         <span class="material-symbols-outlined text-[18px]">delete</span>
       </button>`
    : '';
  const isPanel = variant === 'panel';
  const sizeClass = isPanel ? 'w-[260px] h-[95px] flex-shrink-0' : 'w-[260px] h-[268px] flex-shrink-0';
  const padClass = isPanel ? 'p-2' : 'p-3';
  const symbolClass = isPanel ? 'font-bold text-sm' : 'font-bold text-lg';
  return `
    <div class="group relative ${sizeClass} rounded-xl overflow-hidden border-2 ${colorClass}">
      <div class="absolute inset-0 bg-gradient-to-br from-white/60 to-white/30 dark:from-black/20 dark:to-black/40"></div>
      ${deleteBtn}
      <div class="relative ${padClass} flex flex-col justify-between h-full z-[1]">
        <div class="relative z-10">
          <div class="text-xs text-slate-600 dark:text-slate-400 font-medium">Stock</div>
          <div class="${symbolClass} text-slate-800 dark:text-white">${(w.symbol || w.name || '—').toString().replace(/</g, '&lt;')}</div>
          <div class="text-sm ${textColorClass} font-semibold mt-0.5">${priceStr} · ${changeStr}</div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${durationLabel}</div>
        </div>
      </div>
    </div>
  `;
}

function initResumeEmbed() {
  const btn = document.getElementById('btn-resume');
  const overlay = document.getElementById('resume-embed-overlay');
  const iframe = document.getElementById('resume-embed-iframe');
  const closeBtn = document.getElementById('resume-embed-close');

  function openResume() {
    if (overlay && iframe) {
      iframe.src = 'resume.html?v=' + Date.now();
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
window.initWeatherWidgetConfig = initWeatherWidgetConfig;
