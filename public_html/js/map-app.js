/* OSiris Map App - Live Tracking Map Dashboard with IP + GPS */

let appMap = null;
let currentLocationMarker = null;
let userTileMarkers = [];
let poiMarkers = [];
let currentPOIs = [];
let currentOpenPOI = null;
let poiViewerGallery = { items: [], index: 0 };
let globeRotationEnabled = false;
let globeRotationState = 'off'; // 'off' | 'easing-in' | 'running' | 'easing-out'

const HEARTBEAT_MS = 5000;
const USER_PICT_IMAGES = [
  'pict/random1.png',
  'pict/random2.png',
  'pict/random3.png',
  'pict/random4.png',
  'pict/random5.png',
  'pict/random6.png',
  'pict/random7.png',
  'pict/random8.png',
  'pict/random9.png'
];

function getUserImage(userName) {
  if (!userName || typeof userName !== 'string') return USER_PICT_IMAGES[0];
  let h = 0;
  for (let i = 0; i < userName.length; i++) {
    h = ((h << 5) - h) + userName.charCodeAt(i);
    h = h & h;
  }
  const idx = Math.abs(h) % USER_PICT_IMAGES.length;
  return USER_PICT_IMAGES[idx];
}
const MS_1_MIN = 60 * 1000;
const MS_24H = 24 * 60 * 60 * 1000;

function getStatusFromLastSeen(lastSeen) {
  const age = Date.now() - lastSeen;
  if (age < MS_1_MIN) return 'connected';
  if (age < MS_24H) return 'recently';
  return 'offline';
}

function getStatusDot(status) {
  if (status === 'connected' || status === 'online') return 'bg-green-500 rounded-lg shadow-[0_0_8px_rgba(34,197,94,0.6)]';
  if (status === 'recently' || status === 'idle') return 'bg-orange-500 rounded-lg';
  return 'bg-gray-500 rounded-lg';
}

let heartbeatIntervalId = null;
let currentTiles = [];
let previousUserNames = new Set();
let apiMisconfigured = false;
let isAdmin = false;
let scrollDragJustEnded = false;

let mapDataState = { buildings: true, topography: true, names: false, propertyBoundaries: true, volumetricWeather: false, liveCloudCoverage: false, auroraNorthernLights: false, airports: false };
const SHOW_OTHER_USERS_KEY = 'osiris_show_other_users_on_map';
function getShowOtherUsersOnMap() { return localStorage.getItem(SHOW_OTHER_USERS_KEY) === 'true'; }
function setShowOtherUsersOnMap(on) { localStorage.setItem(SHOW_OTHER_USERS_KEY, on ? 'true' : ''); }
let mapDataTileOrder = ['buildings', 'topography', 'names', 'propertyBoundaries', 'volumetricWeather', 'liveCloudCoverage', 'auroraNorthernLights', 'airports'];
const userProfilePanels = new Map();
const recProfilePanels = new Map();
const widgetProfilePanels = new Map();
let mapLayerInfo = { buildingLayerIds: [], labelLayerIds: [], propertyBoundaryLayerIds: [], terrainConfig: null, volumetricWeatherLayerId: null, volumetricWeatherSourceId: null, liveCloudCoverageLayerId: null, liveCloudCoverageSourceId: null, auroraLayerId: null, auroraSourceId: null };

const MAP_DATA_ORDER_KEY = 'osiris_map_data_tile_order';
function loadMapDataTileOrder() {
  try {
    const stored = localStorage.getItem(MAP_DATA_ORDER_KEY);
    if (stored) {
      const order = JSON.parse(stored);
      const valid = ['buildings', 'topography', 'names', 'propertyBoundaries', 'volumetricWeather', 'liveCloudCoverage', 'auroraNorthernLights', 'airports'];
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

function updateAdminMenuVisibility() {
  const link = document.getElementById('admin-city-processor-link');
  if (link) {
    link.style.display = isAdmin ? '' : 'none';
    link.classList.toggle('hidden', !isAdmin);
  }
}

async function fetchIsAdmin() {
  try {
    const res = await fetch(getUsersMeUrl() + '?_=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      isAdmin = !!data?.isAdmin;
      updateAdminMenuVisibility();
    }
  } catch (_) {}
}

async function deleteUser(id) {
  const b = getApiBase();
  const url = getUsersDeleteUrl(id);
  const opts = b ? { method: 'DELETE' } : { method: 'GET' };
  try {
    const res = await fetch(url, opts);
    if (res.ok) {
      showToastSuccess('User deleted successfully');
      return true;
    }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const debug = body.debug;
      const msg = debug?.clientIp
        ? `Delete denied. Server sees your IP as ${debug.clientIp} (admin IPs: ${(debug.adminIps || []).join(', ')})`
        : 'You do not have the rights to delete users';
      showToastError(msg);
      return false;
    }
    const body = await res.json().catch(() => ({}));
    const msg = body.error || `Failed to delete user (HTTP ${res.status})`;
    showToastError(msg);
    return false;
  } catch (e) {
    showToastError(e?.message || 'Network error: could not delete user');
    return false;
  }
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
    if (res.ok) {
      showToastSuccess('All users cleared successfully');
      await refreshNearby();
      return;
    }
    if (res.status === 403) {
      showToastError('You do not have the rights to clear all users');
      return;
    }
    const body = await res.json().catch(() => ({}));
    showToastError(body.error || `Failed to clear users (HTTP ${res.status})`);
  } catch (e) {
    showToastError(e?.message || 'Network error: could not clear users');
  }
}

async function fetchPointsOfInterest() {
  const baseUrl = typeof window.getPointsOfInterestUrl === 'function' ? window.getPointsOfInterestUrl() : 'points-of-interest.php';
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) {
      const fallback = await fetchPointsOfInterestFallback();
      return fallback;
    }
    if (text.trimStart().startsWith('<') || text.trimStart().startsWith('<?php')) {
      const fallback = await fetchPointsOfInterestFallback();
      return fallback;
    }
    const data = JSON.parse(text);
    if (Array.isArray(data) && data.length > 0) return data;
    return await fetchPointsOfInterestFallback();
  } catch {
    return await fetchPointsOfInterestFallback();
  }
}

async function fetchPointsOfInterestFallback() {
  try {
    const base = typeof window.OSIRIS_API_URL === 'string' ? window.OSIRIS_API_URL : '';
    const url = (base ? base.replace(/\/$/, '') + '/' : '') + 'points-of-interest.json?_=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function toTiles(users) {
  currentTiles = users.map((u) => ({
    id: u.id,
    name: u.name,
    avatar: u.profilePicture || getUserImage(u.name),
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

  const showOthers = getShowOtherUsersOnMap();
  const toggleId = 'nearby-show-others-toggle';
  let html = `
    <div id="nearby-show-others-tile" class="bottom-section-tile w-48 flex-shrink-0 p-3 rounded border border-slate-200/50 dark:border-white/5 flex flex-col gap-3 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent dark:from-primary/20 dark:via-primary/10 dark:to-transparent">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-primary text-xl">people</span>
        <span class="text-slate-800 dark:text-white font-bold text-sm">Show others on map</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="nearby-toggle-status text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">${showOthers ? 'On' : 'Off'}</span>
        <div class="relative inline-block w-10 align-middle select-none">
          <input class="toggle-checkbox absolute top-0 block w-5 h-5 rounded-lg bg-white dark:bg-slate-100 border-4 border-slate-300 dark:border-slate-600 appearance-none cursor-pointer focus:ring-0 outline-none" id="${toggleId}" type="checkbox" ${showOthers ? 'checked' : ''}/>
          <label class="toggle-label block overflow-hidden h-5 rounded-lg bg-slate-300 dark:bg-slate-700 cursor-pointer" for="${toggleId}"></label>
        </div>
      </div>
    </div>`;

  if (isAdmin) {
    html += `
    <button id="nearby-clear-all" type="button" class="bottom-section-tile w-48 flex-shrink-0 bg-card-light/70 dark:bg-card-dark/50 hover:bg-card-light dark:hover:bg-card-dark/80 p-3 rounded border border-slate-200 dark:border-white/5 flex flex-col gap-3 items-center justify-center transition-colors cursor-pointer" title="Clear all visitor tiles">
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
    const isOwnTile = tile.name === currentUserName;
    const deleteBtn = canDelete ? `<button type="button" class="user-tile-delete p-1.5 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors z-10" data-user-id="${tile.id}" data-user-name="${tile.name}" aria-label="Delete ${tile.name}"><span class="material-symbols-outlined text-[16px]">delete</span></button>` : '';
    const avatarHtml = isOwnTile
      ? `<button type="button" class="user-tile-avatar-edit relative w-14 h-14 rounded-lg border-2 ${imgBorder} p-0.5 ${imgClass} flex-shrink-0 overflow-hidden cursor-pointer group/avatar transition-all" data-user-tile="${tile.name}" aria-label="Change profile picture">
          <img alt="${tile.name}" class="w-full h-full object-cover rounded-lg" src="${tile.avatar}"/>
          <span class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none rounded-lg"><span class="material-symbols-outlined text-white text-2xl">edit</span></span>
        </button>`
      : `<div class="w-14 h-14 rounded-lg border-2 ${imgBorder} p-0.5 ${imgClass}"><img alt="${tile.name}" class="w-full h-full object-cover rounded-lg" src="${tile.avatar}"/></div>`;
    html += `
      <div ${dataAttr} ${dataId} class="bottom-section-tile w-48 flex-shrink-0 bg-card-light dark:bg-card-dark p-3 rounded border ${borderClass} flex flex-col gap-3 relative overflow-hidden group ${cardClass}${fadeClass}">
        <div class="absolute top-0 right-0 p-2 flex items-center gap-1">
          ${deleteBtn}
          <div class="w-2.5 h-2.5 ${dotClass}"></div>
        </div>
        ${avatarHtml}
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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const short = isMobile;
    countEl.textContent = apiMisconfigured && total === 0
      ? (short ? 'PHP needed' : 'Discover my world needs PHP enabled on server')
      : total === 0
        ? (short ? 'No enthusiasts yet' : 'No Tech enthusiasts yet')
        : short
          ? `${total} enthusiast${total === 1 ? '' : 's'} worldwide`
          : `${total} Tech enthusiast${total === 1 ? '' : 's'} worldwide`;
  }

  document.getElementById(toggleId)?.addEventListener('change', (e) => {
    const on = e.target.checked;
    setShowOtherUsersOnMap(on);
    addUserTileMarkers(currentTiles);
    const tileEl = document.getElementById('nearby-show-others-tile');
    const label = tileEl?.querySelector('.nearby-toggle-status');
    if (label) label.textContent = on ? 'On' : 'Off';
  });

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

function initMapApp(opts = {}) {
  const { showNameGate = false } = opts;
  const token = getMapboxToken();
  const overlay = document.getElementById('map-token-overlay');
  const nameGateOverlay = document.getElementById('name-gate-overlay');
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
        initMap({ deferUserInit: showNameGate });
        if (showNameGate) initNameGateOverlay();
      }
    });
    return;
  }

  overlay?.classList.add('hidden');
  root?.classList.remove('hidden');
  initMap({ deferUserInit: showNameGate });
  if (showNameGate) initNameGateOverlay();
  document.addEventListener('osiris-theme-change', () => {
    applyMapTheme();
    renderMapDataTiles(mapDataState);
  });
}

const GATE_MIN_TIME_MS = 2500;

function initNameGateOverlay() {
  const overlay = document.getElementById('name-gate-overlay');
  const nameInput = document.getElementById('gate-name-input');
  const honeypotInput = document.getElementById('gate-honeypot');
  const validateBtn = document.getElementById('gate-validate-map');
  const errorEl = document.getElementById('gate-error-map');
  if (!overlay || !nameInput || !validateBtn) return;

  const gateLoadTime = Date.now();

  document.addEventListener('osiris-show-name-gate', function onShow() {
    document.removeEventListener('osiris-show-name-gate', onShow);
    overlay.classList.remove('hidden');
    nameInput.focus();
  }, { once: true });

  async function validateAndSubmit() {
    const name = nameInput.value.trim();
    const honeypot = honeypotInput?.value?.trim() || '';
    errorEl.textContent = '';

    if (!name) {
      errorEl.textContent = 'Please enter your name.';
      nameInput.focus();
      return;
    }
    if (honeypot) {
      errorEl.textContent = 'Something went wrong. Please try again.';
      return;
    }
    if (Date.now() - gateLoadTime < GATE_MIN_TIME_MS) {
      errorEl.textContent = 'Something went wrong. Please try again.';
      return;
    }

    sessionStorage.setItem('osiris_authenticated', '1');
    sessionStorage.setItem('osiris_user_name', name);
    overlay.classList.add('hidden');
    await runPostGateInit();
  }

  validateBtn.addEventListener('click', () => validateAndSubmit());
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') validateAndSubmit(); });
}

let _postGateInitPromise = null;

async function runPostGateInit() {
  if (_postGateInitPromise) return _postGateInitPromise;
  _postGateInitPromise = (async () => {
    const loc = await LocationService.getIPLocation();
    if (loc) {
      await flyToLocationAsync(loc.lng, loc.lat, 16, { pitch: 50 });
      addCurrentLocationMarker(loc.lng, loc.lat);
    }
    await registerUser(loc || {});
    await refreshNearby();
    startHeartbeat();
    wireUserTileCards();
    document.dispatchEvent(new CustomEvent('osiris-gate-zoom-complete'));
  })();
  return _postGateInitPromise;
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

function initMap(opts = {}) {
  if (appMap) return;

  const { deferUserInit = false } = opts;
  const container = document.getElementById('map-app-container');
  if (!container) return;

  mapboxgl.accessToken = getMapboxToken();
  appMap = new mapboxgl.Map({
    container: 'map-app-container',
    style: 'mapbox://styles/glassiat/cmls0szp3002g01qofq7m5j2e',
    projection: 'globe',
    zoom: deferUserInit ? 2.5 : 1,
    center: deferUserInit ? [15, 50] : [0, 20],
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
    Promise.all([LocationService.getIPLocation(), fetchPointsOfInterest()]).then(async ([loc, pois]) => {
      addPOIMarkers(pois);
      renderPOITiles(pois);
      await fetchIsAdmin();
      if (deferUserInit) {
        flyToEarthFractionAsync(15, 50, 0.2, { duration: 2000 }).then(() => {
          document.dispatchEvent(new CustomEvent('osiris-show-name-gate'));
        });
      } else {
        if (loc) {
          flyToLocationAsync(loc.lng, loc.lat, 16, { pitch: 50 }).then(() => {
            document.dispatchEvent(new CustomEvent('osiris-gate-zoom-complete'));
          });
          addCurrentLocationMarker(loc.lng, loc.lat);
        }
        await registerUser(loc || {});
        await refreshNearby();
        startHeartbeat();
        wireUserTileCards();
      }
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

const MARKER_SIZE = 40;
const MARKER_GAP = 4;
const MARKER_STEP = MARKER_SIZE + MARKER_GAP;

function getMarkerOffsetForPosition(tiles, idx, lat, lng) {
  const key = (a, b) => `${Math.round(a * 1e5)}_${Math.round(b * 1e5)}`;
  const posKey = key(lat, lng);
  const samePos = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.lat != null && t.lng != null && key(t.lat, t.lng) === posKey)
    .sort((a, b) => a.i - b.i);
  const rank = samePos.findIndex(({ i }) => i === idx);
  if (rank <= 0) return [0, 0];
  const rowSize = 5;
  const row = Math.floor(rank / rowSize);
  const col = rank % rowSize;
  const cx = Math.floor(rowSize / 2);
  return [(col - cx) * MARKER_STEP, row * MARKER_STEP];
}

function addUserTileMarkers(tiles = []) {
  userTileMarkers.forEach(m => m.remove());
  userTileMarkers = [];
  if (!appMap) return;
  const all = (tiles.length ? tiles : currentTiles).filter((t) => t.lat != null && t.lng != null);
  const currentUserName = sessionStorage.getItem('osiris_user_name')?.trim() || '';
  const showOthers = getShowOtherUsersOnMap();
  const withLoc = showOthers ? all : all.filter((t) => t.name === currentUserName);
  withLoc.forEach((tile, idx) => {
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    const avatar = document.createElement('div');
    const status = getStatusFromLastSeen(tile.lastSeen);
    avatar.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;border:2px solid ${status === 'connected' ? '#13a4ec' : 'rgba(255,255,255,0.2)'};overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);background:#1c262d`;
    const img = document.createElement('img');
    img.src = tile.avatar;
    img.alt = tile.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none';
    avatar.appendChild(img);
    el.appendChild(avatar);
    const [ox, oy] = getMarkerOffsetForPosition(withLoc, idx, tile.lat, tile.lng);
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center', offset: [ox, oy] })
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
    const avatarEdit = e.target.closest('.user-tile-avatar-edit');
    if (avatarEdit) {
      e.stopPropagation();
      e.preventDefault();
      const name = avatarEdit.getAttribute('data-user-tile');
      const tile = currentTiles.find((t) => t.name === name);
      if (tile) openProfilePicturePicker(tile, null);
      return;
    }
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

function getPOIMarkerOffset(pois, idx, lat, lng) {
  const key = (a, b) => `${Math.round(a * 1e5)}_${Math.round(b * 1e5)}`;
  const posKey = key(lat, lng);
  const samePos = pois
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.lat != null && p.lng != null && key(p.lat, p.lng) === posKey)
    .sort((a, b) => a.i - b.i);
  const rank = samePos.findIndex(({ i }) => i === idx);
  if (rank <= 0) return [0, 0];
  const rowSize = 5;
  const row = Math.floor(rank / rowSize);
  const col = rank % rowSize;
  const cx = Math.floor(rowSize / 2);
  return [(col - cx) * MARKER_STEP, row * MARKER_STEP];
}

function addPOIMarkers(pois) {
  poiMarkers.forEach(m => m.remove());
  poiMarkers = [];
  if (!appMap) return;
  const valid = (Array.isArray(pois) ? pois : currentPOIs).filter((p) => p.lat != null && p.lng != null);
  valid.forEach((poi, idx) => {
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    const icon = document.createElement('div');
    icon.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;border-radius:50%;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);background:#1c262d;border:2px solid rgba(255,255,255,0.2)`;
    const img = document.createElement('img');
    img.src = poi.icon || 'brand/placeholder.png';
    img.alt = poi.brand;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none';
    icon.appendChild(img);
    el.appendChild(icon);
    const [ox, oy] = getPOIMarkerOffset(valid, idx, poi.lat, poi.lng);
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center', offset: [ox, oy] })
      .setLngLat([poi.lng, poi.lat])
      .addTo(appMap);
    el.addEventListener('click', () => flyToPOI(poi));
    poiMarkers.push(marker);
  });
}

function renderPOITiles(pois) {
  const container = document.getElementById('poi-tiles');
  if (!container) return;
  currentPOIs = Array.isArray(pois) ? pois : currentPOIs;
  let html = '';
  if (currentPOIs.length === 0) {
    html = `<div class="bottom-section-tile w-48 flex-shrink-0 p-4 rounded border border-slate-200/50 dark:border-white/5 flex flex-col items-center justify-center gap-2 text-center">
      <span class="material-symbols-outlined text-3xl text-text-secondary">folder_off</span>
      <span class="text-sm text-text-secondary">No featured projects yet</span>
      <span class="text-xs text-slate-400">Ensure points-of-interest.php is configured</span>
    </div>`;
  } else {
    currentPOIs.forEach((poi) => {
      const hasLocation = poi.lat != null && poi.lng != null;
      const cardClass = hasLocation ? 'cursor-pointer hover:border-primary/50 transition-colors' : '';
      const dataAttr = hasLocation ? `data-poi-id="${poi.id}"` : '';
      html += `
        <div ${dataAttr} class="bottom-section-tile w-48 flex-shrink-0 bg-card-light dark:bg-card-dark p-3 rounded border border-slate-200 dark:border-white/5 flex flex-col gap-3 overflow-hidden group ${cardClass}">
          <div class="w-14 h-14 rounded-lg border-2 border-slate-200 dark:border-white/10 p-0.5 overflow-hidden">
            <img alt="${poi.brand || ''}" class="w-full h-full object-cover rounded-lg" src="${poi.icon || 'brand/placeholder.png'}"/>
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
  }
  container.innerHTML = html;
}

function wirePOITabs() {
  const tabNearby = document.getElementById('tab-nearby');
  const tabPOI = document.getElementById('tab-poi');
  const tabMapData = document.getElementById('tab-map-data');
  const tabWidgets = document.getElementById('tab-widgets');
  const tabRecommendations = document.getElementById('tab-recommendations');
  const tilesNearby = document.getElementById('nearby-friends-tiles');
  const tilesPOI = document.getElementById('poi-tiles');
  const tilesMapData = document.getElementById('map-data-tiles');
  const tilesWidgets = document.getElementById('widget-tiles');
  const tilesRecommendations = document.getElementById('recommendations-tiles');
  if (!tabNearby || !tabPOI || !tilesNearby || !tilesPOI) return;

  function setActiveTab(active) {
    [tabNearby, tabPOI, tabMapData, tabWidgets, tabRecommendations].forEach((t) => {
      if (t) {
        t.classList.remove('text-primary', 'border-primary/30');
        t.classList.add('text-slate-600', 'dark:text-slate-400', 'border-slate-300', 'dark:border-white/10');
      }
    });
    [tilesNearby, tilesPOI, tilesMapData, tilesWidgets, tilesRecommendations].forEach((c) => {
      if (c) c.classList.add('hidden');
    });
    const tabMap = { nearby: tabNearby, poi: tabPOI, 'map-data': tabMapData, widgets: tabWidgets, recommendations: tabRecommendations };
    const tilesMap = { nearby: tilesNearby, poi: tilesPOI, 'map-data': tilesMapData, widgets: tilesWidgets, recommendations: tilesRecommendations };
    const activeTab = tabMap[active];
    const activeTiles = tilesMap[active];
    if (activeTab) {
      activeTab.classList.remove('text-slate-600', 'dark:text-slate-400', 'border-slate-300', 'dark:border-white/10');
      activeTab.classList.add('text-primary', 'border-primary/30');
    }
    if (activeTiles) activeTiles.classList.remove('hidden');
    if (active === 'map-data') {
      discoverMapLayers();
      applyMapDataState(mapDataState);
      requestAnimationFrame(() => adaptVolumetricSliderHeight(tilesMapData));
    }
    if (active === 'recommendations') {
      renderRecommendationsTiles();
    }
  }

  tabNearby.addEventListener('click', () => setActiveTab('nearby'));
  tabPOI.addEventListener('click', () => {
    setActiveTab('poi');
    if (currentPOIs.length > 0) renderPOITiles(currentPOIs);
  });
  tabMapData?.addEventListener('click', () => setActiveTab('map-data'));
  tabWidgets?.addEventListener('click', () => {
    setActiveTab('widgets');
    renderWidgetTilesInTab();
  });
  tabRecommendations?.addEventListener('click', () => setActiveTab('recommendations'));

  setActiveTab('poi');
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function renderRecommendationsTiles() {
  const container = document.getElementById('recommendations-tiles');
  if (!container) return;
  const url = (typeof window.getRecommendationsUrl === 'function' ? window.getRecommendationsUrl() : 'recommendations.json') + '?_=' + Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!Array.isArray(data)) return;
    container.innerHTML = '';
    data.forEach((rec) => {
      const tile = document.createElement('div');
      tile.className = 'rec-tile';
      tile.setAttribute('data-rec-id', rec.id);
      const roleTruncated = (rec.role || '').length > 50 ? (rec.role || '').slice(0, 47) + '...' : (rec.role || '');
      const avatarHtml = rec.avatar
        ? `<img src="${escapeHtml(rec.avatar)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
           <span class="rec-tile-avatar" style="display:none">${escapeHtml(getInitials(rec.name))}</span>`
        : `<span class="rec-tile-avatar">${escapeHtml(getInitials(rec.name))}</span>`;
      tile.innerHTML = `
        <div class="rec-tile-avatar-wrap" style="display:flex;justify-content:center;align-items:center;">${avatarHtml}</div>
        <span class="rec-tile-name">${escapeHtml(rec.name)}</span>
        <span class="rec-tile-role">${escapeHtml(roleTruncated)}</span>
        <span class="rec-tile-read"><span class="material-symbols-outlined text-sm">format_quote</span> Read</span>
      `;
      tile.addEventListener('click', () => openRecommendationFloatingPanel(rec));
      container.appendChild(tile);
    });
  } catch (_) {
    container.innerHTML = '<p class="text-text-secondary text-sm p-4">Unable to load recommendations.</p>';
  }
}

function openRecommendationFloatingPanel(rec) {
  const container = document.getElementById('user-profile-panels-container');
  if (!container) return;
  const recId = rec.id || 'rec_' + Date.now();
  if (recProfilePanels.has(recId)) {
    const { el } = recProfilePanels.get(recId);
    el.style.zIndex = String(PANEL_BASE_Z + recProfilePanels.size + userProfilePanels.size);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    return;
  }

  const displayText = (rec.textEn != null && rec.textEn !== '') ? rec.textEn : (rec.text || '');
  const isTranslated = !!rec.textEn;
  const paras = displayText.split(/\n\n+/).filter(Boolean);
  const bodyHtml = paras.map((p) => `<p class="rec-panel-body-p">${escapeHtml(p)}</p>`).join('');

  const initials = getInitials(rec.name);
  const avatarHtml = rec.avatar
    ? `<img src="${escapeHtml(rec.avatar)}" alt="" class="w-12 h-12 rounded-lg object-cover border-2 border-primary/30" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
       <span style="display:none" class="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-lg border-2 border-primary/30">${escapeHtml(initials)}</span>`
    : `<span class="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-lg border-2 border-primary/30">${escapeHtml(initials)}</span>`;

  const translatedTagHtml = isTranslated
    ? '<p class="rec-panel-translated text-[11px] text-slate-500 dark:text-slate-400 italic mb-2">Translated from original</p>'
    : '';

  const count = recProfilePanels.size + userProfilePanels.size;
  const isMobile = isMobileViewport();
  const topBarMargin = 24;
  const baseX = window.innerWidth * (0.5 + 0.07);
  const baseY = topBarMargin;
  const left = baseX + count * PANEL_CASCADE_OFFSET;
  const top = baseY + count * PANEL_CASCADE_OFFSET;

  const panel = document.createElement('div');
  const mobileSheetClasses = isMobile ? ' user-profile-panel-mobile mobile-bottom-sheet mobile-sheet-open' : '';
  /* Recommendation panel 60% larger than user panel (18rem → 28.8rem) */
  panel.className = 'user-profile-panel rec-floating-panel fixed w-[28.8rem] rounded-lg overflow-hidden bg-background-light/20 dark:bg-background-dark/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto flex flex-col max-h-[calc(100vh-24px)]' + mobileSheetClasses;
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('data-rec-id', recId);
  if (!isMobile) {
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  panel.style.zIndex = String(PANEL_BASE_Z + count);

  const mobileHandleHtml = isMobile ? '<div class="user-profile-mobile-handle mobile-bottom-sheet-handle flex md:hidden flex-shrink-0" data-swipe-close></div>' : '';
  panel.innerHTML = mobileHandleHtml + `
    <div class="user-profile-drag-handle flex-shrink-0 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none bg-card-light/50 dark:bg-card-dark/50 border-b border-slate-200/50 dark:border-white/5">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">${avatarHtml}</div>
        <div class="min-w-0">
          <h3 class="user-profile-name font-bold text-slate-800 dark:text-white truncate">${escapeHtml(rec.name || '—')}</h3>
          <div class="text-text-secondary text-xs truncate">${escapeHtml(rec.role || '')}</div>
          <div class="text-slate-500 dark:text-slate-400 text-xs italic truncate mt-0.5">${escapeHtml(rec.context || '')}</div>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <a href="https://www.linkedin.com/in/guillaume-l-2b431636/?isSelfProfile=true" target="_blank" rel="noopener noreferrer" class="rec-panel-linkedin-link w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-[#0a66c2] transition-colors" aria-label="Open LinkedIn profile"><span class="material-symbols-outlined text-[20px]">open_in_new</span></a>
        <button type="button" class="user-profile-panel-close w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors" aria-label="Close"><span class="material-symbols-outlined text-[20px]">close</span></button>
      </div>
    </div>
    <div class="rec-panel-body p-4 overflow-y-auto min-h-0 flex-1 max-h-[calc(100vh-180px)]">
      ${translatedTagHtml}
      <div class="rec-panel-text space-y-3">${bodyHtml}</div>
    </div>
  `;

  container.appendChild(panel);
  recProfilePanels.set(recId, { el: panel, rec });

  if (isMobile) {
    const swipeHandle = panel.querySelector('.user-profile-mobile-handle');
    if (swipeHandle) {
      let startY = 0;
      let startTime = 0;
      swipeHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });
      swipeHandle.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) {
          e.preventDefault();
          panel.style.transition = 'none';
          panel.style.transform = `translateY(${dy}px)`;
        }
      }, { passive: false });
      swipeHandle.addEventListener('touchend', (e) => {
        const endY = e.changedTouches?.[0]?.clientY ?? startY;
        const dy = endY - startY;
        const elapsed = Date.now() - startTime;
        const velocity = elapsed > 0 ? dy / elapsed : 0;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 80 || velocity > 0.5) closeUserProfilePanel(panel);
      }, { passive: true });
    }
  } else {
    const handle = panel.querySelector('.user-profile-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.user-profile-panel-close') || e.target.closest('.rec-panel-linkedin-link')) return;
        const pos = getPanelPosition(panel);
        window._userPanelDrag = { panel, startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top };
      });
      handle.addEventListener('touchstart', (e) => {
        if (e.target.closest('.user-profile-panel-close') || e.target.closest('.rec-panel-linkedin-link')) return;
        const pos = getPanelPosition(panel);
        window._userPanelDrag = { panel, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startLeft: pos.left, startTop: pos.top };
      }, { passive: true });
    }
  }
}

function closeTopRecommendationPanel() {
  const panels = Array.from(document.querySelectorAll('.user-profile-panel[data-rec-id]'));
  if (panels.length === 0) return false;
  const top = panels.sort((a, b) => (parseInt(b.style.zIndex || 0, 10) - parseInt(a.style.zIndex || 0, 10)))[0];
  closeUserProfilePanel(top);
  return true;
}

async function openWidgetFloatingPanel(w) {
  const container = document.getElementById('user-profile-panels-container');
  if (!container) return;
  const widgetId = w.id || (w.type === 'stock' ? 'w-' + (w.symbol || '') : 'w-' + (w.city || '') + '-' + (w.lat ?? '') + '-' + (w.lng ?? ''));
  if (widgetProfilePanels.has(widgetId)) {
    const { el } = widgetProfilePanels.get(widgetId);
    el.style.zIndex = String(PANEL_BASE_Z + widgetProfilePanels.size + recProfilePanels.size + userProfilePanels.size);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    return;
  }

  let bodyHtml = '';
  const isDark = document.documentElement.classList.contains('dark');
  const iconName = w.type === 'weather' ? 'cloud' : 'candlestick_chart';
  const title = w.type === 'weather' ? (w.city || 'Weather') : (w.symbol || w.name || 'Stock');

  if (w.type === 'weather') {
    let imgPath = w.image || w.imageClear || w.imageDark || '';
    if (!imgPath && w.lat != null && w.lng != null) {
      try {
        const url = typeof getCityImageUrl === 'function' ? getCityImageUrl() : 'city-image.php';
        const imgRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: w.city || 'Unknown',
            countryCode: ((w.countryCode || 'XX') + '').slice(0, 2).toUpperCase(),
            lat: w.lat,
            lng: w.lng,
            weatherCode: 0
          })
        });
        const imgData = await imgRes.json();
        imgPath = imgData.image || imgData.imageClear || imgData.imageDark || '';
      } catch (_) {}
    }
    let weather = {};
    try {
      const forecastUrl = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + w.lat + '&lng=' + w.lng;
      const res = await fetch(forecastUrl);
      weather = res.ok ? await res.json() : {};
    } catch (_) {}
    bodyHtml = buildWidgetCardHtml(w, weather, imgPath, isDark, false, 'floating');
  } else {
    let quote = {};
    try {
      const stockUrl = typeof getStockUrl === 'function' ? getStockUrl() : 'stock.php';
      const quoteRes = await fetch(stockUrl + '?action=quote&symbol=' + encodeURIComponent(w.symbol || ''));
      quote = quoteRes.ok ? await quoteRes.json() : {};
    } catch (_) {}
    bodyHtml = buildStockWidgetCardHtml(w, quote, [], isDark, false, 'floating');
  }

  const count = widgetProfilePanels.size + recProfilePanels.size + userProfilePanels.size;
  const isMobile = isMobileViewport();
  const topBarMargin = 24;
  const baseX = window.innerWidth * (0.5 + 0.07);
  const baseY = topBarMargin;
  const left = baseX + count * PANEL_CASCADE_OFFSET;
  const top = baseY + count * PANEL_CASCADE_OFFSET;

  const panel = document.createElement('div');
  const mobileSheetClasses = isMobile ? ' user-profile-panel-mobile mobile-bottom-sheet mobile-sheet-open' : '';
  panel.className = 'user-profile-panel widget-floating-panel fixed w-[28.8rem] rounded-lg overflow-hidden bg-background-light/20 dark:bg-background-dark/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto flex flex-col max-h-[calc(100vh-24px)]' + mobileSheetClasses;
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('data-widget-id', widgetId);
  if (!isMobile) {
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  panel.style.zIndex = String(PANEL_BASE_Z + count);

  const mobileHandleHtml = isMobile ? '<div class="user-profile-mobile-handle mobile-bottom-sheet-handle flex md:hidden flex-shrink-0" data-swipe-close></div>' : '';
  panel.innerHTML = mobileHandleHtml + `
    <div class="user-profile-drag-handle flex-shrink-0 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none bg-card-light/50 dark:bg-card-dark/50 border-b border-slate-200/50 dark:border-white/5">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <span class="material-symbols-outlined text-2xl text-primary flex-shrink-0">${iconName}</span>
        <h3 class="user-profile-name font-bold text-slate-800 dark:text-white truncate">${title}</h3>
      </div>
      <button type="button" class="user-profile-panel-close w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors flex-shrink-0" aria-label="Close"><span class="material-symbols-outlined text-[20px]">close</span></button>
    </div>
    <div class="widget-panel-body p-4 overflow-y-auto min-h-0 flex-1 max-h-[calc(100vh-180px)]">
      ${bodyHtml}
    </div>
  `;

  container.appendChild(panel);
  widgetProfilePanels.set(widgetId, { el: panel, widget: w });

  if (isMobile) {
    const swipeHandle = panel.querySelector('.user-profile-mobile-handle');
    if (swipeHandle) {
      let startY = 0;
      let startTime = 0;
      swipeHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });
      swipeHandle.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) {
          e.preventDefault();
          panel.style.transition = 'none';
          panel.style.transform = `translateY(${dy}px)`;
        }
      }, { passive: false });
      swipeHandle.addEventListener('touchend', (e) => {
        const endY = e.changedTouches?.[0]?.clientY ?? startY;
        const dy = endY - startY;
        const elapsed = Date.now() - startTime;
        const velocity = elapsed > 0 ? dy / elapsed : 0;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 80 || velocity > 0.5) closeUserProfilePanel(panel);
      }, { passive: true });
    }
  } else {
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
}

function closeTopWidgetPanel() {
  const panels = Array.from(document.querySelectorAll('.user-profile-panel[data-widget-id]'));
  if (panels.length === 0) return false;
  const top = panels.sort((a, b) => (parseInt(b.style.zIndex || 0, 10) - parseInt(a.style.zIndex || 0, 10)))[0];
  closeUserProfilePanel(top);
  return true;
}

function wireRecommendationsOverlay() {
  /* Recommendations now use floating panels (openRecommendationFloatingPanel) */
}

function getWidgetSkeletonHtml(count = 2, variant = 'tile') {
  const sizeClass = variant === 'panel' ? 'w-[260px] h-[260px] flex-shrink-0' : 'bottom-section-tile w-[12.5rem] min-w-[12.5rem] aspect-square flex-shrink-0';
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="widget-skeleton ${sizeClass} rounded overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col justify-end p-3" aria-hidden="true"><div class="h-4 w-16 rounded bg-slate-300/30 dark:bg-white/10 mb-2"></div><div class="h-3 w-12 rounded bg-slate-300/20 dark:bg-white/5"></div></div>`;
  }
  return html;
}

async function renderWidgetTilesInTab() {
  const container = document.getElementById('widget-tiles');
  const addWeatherBtn = document.getElementById('add-weather-widget');
  const addStockBtn = document.getElementById('add-stock-widget');
  if (!container) return;
  const addHtml = (addWeatherBtn ? addWeatherBtn.outerHTML : '') + (addStockBtn ? addStockBtn.outerHTML : '');
  container.innerHTML = addHtml + getWidgetSkeletonHtml(2, 'tile');
  container.querySelector('#add-weather-widget')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.openWeatherWidgetPanel === 'function') window.openWeatherWidgetPanel();
  });
  container.querySelector('#add-stock-widget')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.openStockWidgetPanel === 'function') window.openStockWidgetPanel();
  });
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
    let imgPath = w.image || w.imageClear || w.imageDark || '';
    if (!imgPath && w.lat != null && w.lng != null) {
      try {
        const url = typeof getCityImageUrl === 'function' ? getCityImageUrl() : 'city-image.php';
        const imgRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: w.city || 'Unknown',
            countryCode: (w.countryCode || 'XX').slice(0, 2).toUpperCase(),
            lat: w.lat,
            lng: w.lng,
            weatherCode: 0
          })
        });
        const imgData = await imgRes.json();
        imgPath = imgData.image || imgData.imageClear || imgData.imageDark || '';
      } catch (_) {}
    }
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
  container.innerHTML = addHtml + cardsHtml;
  container.querySelector('#add-weather-widget')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.openWeatherWidgetPanel === 'function') window.openWeatherWidgetPanel();
  });
  container.querySelector('#add-stock-widget')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof window.openStockWidgetPanel === 'function') window.openStockWidgetPanel();
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

  const allWidgets = [...weatherWidgets, ...stockWidgets];
  container.querySelectorAll('.widget-tile-card').forEach((el, idx) => {
    const w = allWidgets[idx];
    if (w) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-widget-id]')) return;
        e.stopPropagation();
        openWidgetFloatingPanel(w);
      });
    }
  });
}

function buildWidgetCardHtml(w, weather, imgPath, isDark, showDelete, variant) {
  const temp = weather.temperature != null ? Math.round(weather.temperature) + '°C' : '—';
  const humidity = weather.humidity != null ? weather.humidity + '% humidity' : '—';
  const overlayClass = isDark ? 'bg-black/50' : 'bg-black/10';
  const deleteId = w.id || ('w-' + (w.city || '') + '-' + (w.lat ?? '') + '-' + (w.lng ?? ''));
  const deleteBtnClass = variant === 'panel'
    ? 'absolute top-2 right-2 z-20 w-8 h-8 flex items-center justify-center rounded-lg bg-black/50 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer'
    : 'absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded-lg bg-black/40 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer';
  const deleteIconSize = variant === 'panel' ? 'text-[18px]' : 'text-[14px]';
  const deleteBtn = showDelete
    ? `<button type="button" data-delete-widget-id="${String(deleteId).replace(/"/g, '&quot;')}" class="${deleteBtnClass}" aria-label="Delete widget">
         <span class="material-symbols-outlined ${deleteIconSize}">delete</span>
       </button>`
    : '';
  const sizeClass = variant === 'panel' ? 'w-[260px] h-[260px] flex-shrink-0' : variant === 'floating' ? 'w-full aspect-square flex-shrink-0 rounded-lg overflow-hidden' : 'bottom-section-tile w-[12.5rem] min-w-[12.5rem] aspect-square flex-shrink-0';
  const layoutClass = variant === 'panel' ? 'flex items-start gap-3' : variant === 'floating' ? 'flex flex-col justify-end min-h-0 p-6' : 'flex flex-col justify-end min-h-0';
  const textClass = 'text-white';
  const textMutedClass = 'text-white/80';
  const innerLayout = variant === 'panel'
    ? `<img src="${getWeatherIcon(weather.weatherCode || 0)}" alt="" class="w-8 h-8 flex-shrink-0" style="filter:brightness(0) invert(1);"/>
       <div class="min-w-0 flex-1">
         <div class="text-xs ${textMutedClass} font-medium">Current local weather</div>
         <div class="${textClass} font-bold text-sm">${(w.city || '—').replace(/</g, '&lt;')}</div>
         <div class="${textClass} text-sm mt-0.5">${temp} · ${humidity}</div>
       </div>`
    : variant === 'floating'
    ? `<img src="${getWeatherIcon(weather.weatherCode || 0)}" alt="" class="absolute top-4 left-4 w-12 h-12" style="filter:brightness(0) invert(1);"/>
       <div class="mt-auto">
         <div class="text-sm ${textMutedClass} font-medium">Current local weather</div>
         <div class="${textClass} font-bold text-xl">${(w.city || '—').replace(/</g, '&lt;')}</div>
         <div class="${textClass} text-lg mt-1">${temp} · ${humidity}</div>
       </div>`
    : `<img src="${getWeatherIcon(weather.weatherCode || 0)}" alt="" class="absolute top-2 left-2 w-6 h-6" style="filter:brightness(0) invert(1);"/>
       <div class="mt-auto">
         <div class="text-[10px] ${textMutedClass} font-medium">Current local weather</div>
         <div class="${textClass} font-bold text-xs">${(w.city || '—').replace(/</g, '&lt;')}</div>
         <div class="${textClass} text-xs mt-0.5">${temp} · ${humidity}</div>
       </div>`;
  const bgSrc = imgPath
    ? (typeof resolveCityImageUrl === 'function' ? resolveCityImageUrl(imgPath) : imgPath)
    : '';
  const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27400%27%3E%3Crect fill=%27%2387CEEB%27 width=%27400%27 height=%27400%27/%3E%3C/svg%3E";
  const bgImg = bgSrc
    ? `<img src="${String(bgSrc).replace(/"/g, '&quot;')}" alt="" class="absolute inset-0 w-full h-full object-cover pointer-events-none" style="transform:scale(1.11)" onerror="this.onerror=null;this.src='${fallbackSvg}'" />`
    : '';
  const padClass = variant === 'panel' ? 'p-3' : variant === 'floating' ? 'p-6' : 'p-2';
  const tileClass = (variant !== 'panel' && variant !== 'floating') ? ' widget-tile-card cursor-pointer hover:border-primary/40 transition-colors' : '';
  const tileDataAttr = (variant !== 'panel' && variant !== 'floating') ? ` data-widget-id="${String(deleteId).replace(/"/g, '&quot;')}"` : '';
  return `
    <div class="group relative ${sizeClass} rounded overflow-hidden border border-slate-200 dark:border-white/10${tileClass}"${tileDataAttr}>
      ${bgImg}
      <div class="absolute inset-0 ${overlayClass} pointer-events-none"></div>
      ${deleteBtn}
      <div class="relative ${padClass} ${layoutClass} h-full z-[1]">
        ${innerLayout}
      </div>
    </div>
  `;
}

async function deleteWidget(widgetId) {
  const name = sessionStorage.getItem('osiris_user_name')?.trim();
  if (!name) {
    showToastError('Please log in to delete widgets');
    return false;
  }
  try {
    const url = (typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php') + '?name=' + encodeURIComponent(name);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      showToastError(`Failed to load widgets (HTTP ${res.status})`);
      return false;
    }
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
    if (patchRes.ok) {
      showToastSuccess('Widget deleted successfully');
      await refreshNearby();
      return true;
    }
    const errBody = await patchRes.json().catch(() => ({}));
    const msg = errBody.error || `Failed to delete widget (HTTP ${patchRes.status})`;
    showToastError(msg);
    return false;
  } catch (e) {
    showToastError(e?.message || 'Network error: could not delete widget');
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

const VOLUMETRIC_WEATHER_SOURCE_ID = 'volumetric-weather-source';
const VOLUMETRIC_WEATHER_LAYER_ID = 'volumetric-weather';
const VOLUMETRIC_WEATHER_TILESET = 'mapbox://rasterarrayexamples.gfs-winds';
const ALTITUDE_MAX_M = 9144;

function addVolumetricWeather(layerId, altitude) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  removeVolumetricWeather();
  try {
    const sourceOpts = {
      type: 'raster-array',
      url: VOLUMETRIC_WEATHER_TILESET,
      tileSize: 512
    };
    if (typeof appMap.addSource === 'function') {
      appMap.addSource(VOLUMETRIC_WEATHER_SOURCE_ID, sourceOpts);
    }
    const layerOpts = {
      id: layerId || VOLUMETRIC_WEATHER_LAYER_ID,
      type: 'raster-particle',
      source: VOLUMETRIC_WEATHER_SOURCE_ID,
      'source-layer': '10winds',
      paint: {
        'raster-particle-speed-factor': 0.26,
        'raster-particle-fade-opacity-factor': 0.99,
        'raster-particle-reset-rate-factor': 0.18,
        'raster-particle-count': 10000,
        'raster-particle-max-speed': 45,
        'raster-particle-elevation': Math.max(0, Math.min(altitude, ALTITUDE_MAX_M)),
        'raster-particle-color': [
          'interpolate', ['linear'], ['raster-particle-speed'],
          0.5, 'rgba(3, 88, 140, 55)',
          2, 'rgba(19, 164, 236, 75)',
          5, 'rgba(2, 56, 89, 95)',
          10, 'rgba(19, 164, 236, 110)',
          18, 'rgba(94, 165, 230, 125)',
          28, 'rgba(157, 176, 185, 115)',
          38, 'rgba(200, 230, 245, 100)',
          45, 'rgba(224, 242, 249, 85)'
        ]
      }
    };
    const beforeId = mapLayerInfo.buildingLayerIds?.[0] || undefined;
    appMap.addLayer(layerOpts, beforeId);
    mapLayerInfo.volumetricWeatherLayerId = layerId || VOLUMETRIC_WEATHER_LAYER_ID;
    mapLayerInfo.volumetricWeatherSourceId = VOLUMETRIC_WEATHER_SOURCE_ID;
  } catch (e) {
    console.warn('[VolumetricWeather] Failed to add layer:', e);
  }
}

function removeVolumetricWeather() {
  if (!appMap || !appMap.getLayer) return;
  const layerId = mapLayerInfo.volumetricWeatherLayerId;
  const sourceId = mapLayerInfo.volumetricWeatherSourceId;
  if (layerId && appMap.getLayer(layerId)) {
    try { appMap.removeLayer(layerId); } catch (_) {}
  }
  if (sourceId && appMap.getSource(sourceId)) {
    try { appMap.removeSource(sourceId); } catch (_) {}
  }
  mapLayerInfo.volumetricWeatherLayerId = null;
  mapLayerInfo.volumetricWeatherSourceId = null;
}

function applyVolumetricWeatherState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  if (state.volumetricWeather) {
    const alt = typeof mapLayerInfo.volumetricWeatherAltitude === 'number' ? mapLayerInfo.volumetricWeatherAltitude : 0;
    addVolumetricWeather(VOLUMETRIC_WEATHER_LAYER_ID, alt);
  } else {
    removeVolumetricWeather();
  }
}

const LIVE_CLOUD_SOURCE_ID = 'live-cloud-coverage-source';
const LIVE_CLOUD_LAYER_ID = 'live-cloud-coverage';
const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';

async function addLiveCloudCoverage() {
  if (!appMap || !appMap.isStyleLoaded()) return;
  removeLiveCloudCoverage();
  try {
    const res = await fetch(RAINVIEWER_API + '?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    const host = data?.host || 'https://tilecache.rainviewer.com';
    const radar = data?.radar?.past;
    const path = radar?.length ? radar[radar.length - 1]?.path : null;
    if (!path) {
      showToastError('Cloud coverage data temporarily unavailable');
      return;
    }
    const tileUrl = `${host}${path}/256/{z}/{x}/{y}/0/0_0.png`;
    appMap.addSource(LIVE_CLOUD_SOURCE_ID, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: 7
    });
    appMap.addLayer({
      id: LIVE_CLOUD_LAYER_ID,
      type: 'raster',
      source: LIVE_CLOUD_SOURCE_ID,
      paint: { 'raster-opacity': 0.65 }
    }, mapLayerInfo.buildingLayerIds?.[0]);
    mapLayerInfo.liveCloudCoverageLayerId = LIVE_CLOUD_LAYER_ID;
    mapLayerInfo.liveCloudCoverageSourceId = LIVE_CLOUD_SOURCE_ID;
  } catch (e) {
    console.warn('[LiveCloudCoverage] Failed to add layer:', e);
    showToastError('Failed to load cloud coverage');
  }
}

function removeLiveCloudCoverage() {
  if (!appMap || !appMap.getLayer) return;
  const layerId = mapLayerInfo.liveCloudCoverageLayerId;
  const sourceId = mapLayerInfo.liveCloudCoverageSourceId;
  if (layerId && appMap.getLayer(layerId)) {
    try { appMap.removeLayer(layerId); } catch (_) {}
  }
  if (sourceId && appMap.getSource(sourceId)) {
    try { appMap.removeSource(sourceId); } catch (_) {}
  }
  mapLayerInfo.liveCloudCoverageLayerId = null;
  mapLayerInfo.liveCloudCoverageSourceId = null;
}

function applyLiveCloudCoverageState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  if (state.liveCloudCoverage) {
    addLiveCloudCoverage();
  } else {
    removeLiveCloudCoverage();
  }
}

const AURORA_SOURCE_ID = 'aurora-source';
const AURORA_LAYER_ID = 'aurora-layer';
const NOAA_OVATION_AURORA_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

/** Fetch NOAA OVATION aurora JSON and convert to GeoJSON FeatureCollection. Filters out background noise (prob < 10%) and anomalous error codes. */
async function fetchAuroraGeoJSON() {
  const res = await fetch(NOAA_OVATION_AURORA_URL + '?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch aurora data');
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.coordinates)) throw new Error('Invalid aurora data');
  const featureCollection = {
    type: 'FeatureCollection',
    features: data.coordinates
      .filter((item) => item[2] >= 10 && item[2] <= 100)
      .map((item) => {
        let lon = item[0];
        const lat = item[1];
        const probability = item[2];
        if (lon > 180) lon -= 360;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { intensity: probability / 100 }
        };
      })
  };
  return featureCollection;
}

async function addAuroraNorthernLights() {
  if (!appMap || !appMap.isStyleLoaded()) return;
  removeAuroraNorthernLights();
  try {
    const geojson = await fetchAuroraGeoJSON();
    appMap.addSource(AURORA_SOURCE_ID, { type: 'geojson', data: geojson });
    appMap.addLayer({
      id: AURORA_LAYER_ID,
      type: 'heatmap',
      source: AURORA_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': [
          'interpolate', ['linear'], ['get', 'intensity'],
          0, 0,
          1, 1
        ],
        'heatmap-intensity': [
          'interpolate', ['linear'], ['zoom'],
          0, 1,
          9, 3
        ],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0, 255, 0, 0)',
          0.2, 'rgba(0, 255, 0, 0.2)',
          0.5, 'rgba(100, 255, 0, 0.6)',
          0.8, 'rgba(255, 255, 0, 0.8)',
          1, 'rgba(255, 0, 0, 1)'
        ],
        'heatmap-radius': [
          'interpolate', ['linear'], ['zoom'],
          0, 10,
          9, 30
        ],
        'heatmap-opacity': 0.7
      }
    }, mapLayerInfo.buildingLayerIds?.[0]);
    mapLayerInfo.auroraLayerId = AURORA_LAYER_ID;
    mapLayerInfo.auroraSourceId = AURORA_SOURCE_ID;
  } catch (e) {
    console.warn('[AuroraNorthernLights] Failed to add layer:', e);
    showToastError('Failed to load Northern Lights data');
  }
}

function removeAuroraNorthernLights() {
  if (!appMap || !appMap.getLayer) return;
  const layerId = mapLayerInfo.auroraLayerId;
  const sourceId = mapLayerInfo.auroraSourceId;
  if (layerId && appMap.getLayer(layerId)) {
    try { appMap.removeLayer(layerId); } catch (_) {}
  }
  if (sourceId && appMap.getSource(sourceId)) {
    try { appMap.removeSource(sourceId); } catch (_) {}
  }
  mapLayerInfo.auroraLayerId = null;
  mapLayerInfo.auroraSourceId = null;
}

function applyAuroraNorthernLightsState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  if (state.auroraNorthernLights) {
    addAuroraNorthernLights().then(() => {
      if (mapLayerInfo.auroraLayerId && appMap?.getLayer(mapLayerInfo.auroraLayerId)) {
        try { appMap.setLayoutProperty(AURORA_LAYER_ID, 'visibility', 'visible'); } catch (_) {}
      }
    });
  } else {
    removeAuroraNorthernLights();
  }
}

/* --- Airports Layer (floating OACI markers from CSV) --- */
const AIRPORTS_CSV_URL = 'data/airports.csv';
const AIRPORTS_ZOOM_MIN = 5;
let airportMarkers = [];
let airportsDataCache = null;

async function fetchAirportsData() {
  if (airportsDataCache) return airportsDataCache;
  const res = await fetch(AIRPORTS_CSV_URL + '?t=' + Date.now(), { cache: 'no-store' });
  const text = await res.text();
  const parsed = typeof Papa !== 'undefined' ? Papa.parse(text, { header: true, skipEmptyLines: true }) : { data: [] };
  const rows = parsed.data || [];
  const out = rows
    .filter((r) => r.ident && r.latitude_deg != null && r.longitude_deg != null)
    .map((r) => ({ ident: String(r.ident).trim(), lat: parseFloat(r.latitude_deg), lng: parseFloat(r.longitude_deg) }))
    .filter((a) => !isNaN(a.lat) && !isNaN(a.lng));
  airportsDataCache = out;
  return out;
}

function addAirportMarkers(airports) {
  removeAirportMarkers();
  if (!appMap || !airports?.length) return;
  airports.forEach((a) => {
    const el = document.createElement('span');
    el.className = 'airport-oaci-marker';
    el.innerHTML = '<span class="material-symbols-outlined airport-oaci-icon">flight</span><span class="airport-oaci-text">' + (a.ident || '') + '</span>';
    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([a.lng, a.lat]).addTo(appMap);
    airportMarkers.push(marker);
  });
}

function removeAirportMarkers() {
  airportMarkers.forEach((m) => { try { m.remove(); } catch (_) {} });
  airportMarkers = [];
}

function updateAirportsVisibility() {
  if (!appMap || !mapDataState.airports) return;
  if (appMap.getZoom() <= AIRPORTS_ZOOM_MIN) {
    removeAirportMarkers();
    return;
  }
  fetchAirportsData().then((airports) => {
    const bounds = appMap.getBounds();
    const inView = airports.filter((a) => a.lat >= bounds.getSouth() && a.lat <= bounds.getNorth() && a.lng >= bounds.getWest() && a.lng <= bounds.getEast());
    const toShow = inView.length > 0 ? inView.slice(0, 300) : airports.slice(0, 200);
    addAirportMarkers(toShow);
  }).catch(() => {});
}

function applyAirportsState(state) {
  if (!appMap || !appMap.isStyleLoaded()) return;
  if (state.airports) updateAirportsVisibility();
  else removeAirportMarkers();
}

function applyMapDataState(state) {
  applyBuildingsState(state);
  applyNamesState(state);
  applyPropertyBoundariesState(state);
  applyTopographyState(state);
  applyVolumetricWeatherState(state);
  applyLiveCloudCoverageState(state);
  applyAuroraNorthernLightsState(state);
  applyAirportsState(state);
}

function renderMapDataTiles(state) {
  const container = document.getElementById('map-data-tiles');
  if (!container) return;
  const thumbLight = {
    buildings: 'assets/map-data/3D-Building.png',
    topography: 'assets/map-data/Topography.png',
    names: 'assets/map-data/Local-Information.png',
    propertyBoundaries: 'assets/map-data/Road-Boundaries.png',
    volumetricWeather: 'assets/map-data/Live-wind-coverage.png',
    liveCloudCoverage: 'assets/map-data/Live-rain-coverage.png',
    auroraNorthernLights: 'assets/map-data/Aurora.png',
    airports: 'assets/map-data/Airport.png'
  };
  const thumbDark = {
    buildings: 'assets/map-data/3D-Building-Dark-Mode.png',
    topography: 'assets/map-data/Topography-Dark-Mode.png',
    names: 'assets/map-data/Local-Information-Dark-Mode.png',
    propertyBoundaries: 'assets/map-data/Road-Boundaries-Dark-Mode.png',
    volumetricWeather: 'assets/map-data/Live-wind-coverage-dark-mode.png',
    liveCloudCoverage: 'assets/map-data/Live-rain-coverage-dark-mode.png',
    auroraNorthernLights: 'assets/map-data/Aurora-Dark-Mode.png',
    airports: 'assets/map-data/Airport-Dark-Mode.png'
  };
  const icons = { buildings: 'apartment', topography: 'terrain', names: 'label', propertyBoundaries: 'route', volumetricWeather: 'cloud', liveCloudCoverage: 'cloud_queue', auroraNorthernLights: 'nights_stay', airports: 'flight' };
  const labels = { buildings: 'Buildings', topography: 'Topography', names: 'Local informations', propertyBoundaries: 'Road boundaries', volumetricWeather: 'Live wind coverage', liveCloudCoverage: 'Live rain coverage', auroraNorthernLights: 'Live Aurora', airports: 'Airports' };
  const tiles = mapDataTileOrder.map((key) => ({ key, label: labels[key], on: state[key] }));
  const noThumbKeys = [];
  const isDark = document.documentElement.classList.contains('dark');
  const altM = mapLayerInfo.volumetricWeatherAltitude ?? 0;
  let html = '';
  tiles.forEach((t, i) => {
    const thumbSrc = isDark ? thumbDark[t.key] : thumbLight[t.key];
    const thumbFallback = isDark ? thumbDark.buildings : thumbLight.buildings;
    const toggleId = `map-data-toggle-${t.key}-${i}`;
    const thumbBlock = noThumbKeys.includes(t.key)
      ? `<div class="h-20 overflow-hidden relative bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><span class="material-symbols-outlined text-3xl text-slate-500 dark:text-slate-600">${icons[t.key]}</span></div>`
      : `<img src="${thumbSrc}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none" onerror="this.src=this.dataset.fallback||''" data-fallback="${thumbFallback}"/>`;
    html += `
      <div data-toggle="${t.key}" data-tile-key="${t.key}" draggable="true" class="bottom-section-tile map-data-tile-draggable group flex flex-col w-60 min-w-[240px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 cursor-grab active:cursor-grabbing">
        <div class="h-20 overflow-hidden relative">
          ${thumbBlock}
        </div>
        <div class="p-4 flex flex-col flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-slate-400 text-base flex-shrink-0">${icons[t.key]}</span>
            <h3 class="text-base font-semibold text-slate-900 dark:text-white truncate text-left">${t.label}</h3>
          </div>
          <div class="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[8px] font-medium text-slate-400 uppercase tracking-widest">${t.on ? 'Enabled' : 'Disabled'}</span>
            <div class="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
              <input class="toggle-checkbox map-data-toggle absolute top-0 block w-5 h-5 rounded-lg bg-white dark:bg-slate-100 border-4 border-slate-300 dark:border-slate-600 appearance-none cursor-pointer focus:ring-0 outline-none" id="${toggleId}" type="checkbox" data-key="${t.key}" ${t.on ? 'checked' : ''}/>
              <label class="toggle-label block overflow-hidden h-5 rounded-lg bg-slate-300 dark:bg-slate-700 cursor-pointer" for="${toggleId}"></label>
            </div>
          </div>
        </div>
      </div>`;
  });
  if (state.volumetricWeather) {
    html += `
      <div id="volumetric-weather-slider-wrap" class="flex flex-col items-center justify-center gap-2 w-16 min-w-[64px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-4">
        <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">30,000 ft</span>
        <input type="range" id="volumetric-altitude-slider" data-altitude-slider min="0" max="9144" step="500" value="${altM}" orient="vertical" class="volumetric-altitude-range w-2 flex-1 min-h-16 accent-primary cursor-pointer" title="Altitude (meters)"/>
        <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sea level</span>
      </div>`;
  }
  container.innerHTML = html;
  if (state.volumetricWeather) {
    adaptVolumetricSliderHeight(container);
  }
}

function adaptVolumetricSliderHeight(container) {
  const sliderWrap = container?.querySelector('#volumetric-weather-slider-wrap');
  const tile = container?.querySelector('.map-data-tile-draggable');
  if (!sliderWrap || !tile) return;
  const tileHeight = tile.offsetHeight;
  if (tileHeight > 0) sliderWrap.style.height = tileHeight + 'px';
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
      case 'volumetricWeather':
        mapDataState.volumetricWeather = checked;
        mapLayerInfo.volumetricWeatherAltitude = mapLayerInfo.volumetricWeatherAltitude ?? 0;
        if (checked) {
          addVolumetricWeather(VOLUMETRIC_WEATHER_LAYER_ID, mapLayerInfo.volumetricWeatherAltitude ?? 0);
          flyToGlobeView();
        } else {
          removeVolumetricWeather();
        }
        break;
      case 'liveCloudCoverage':
        mapDataState.liveCloudCoverage = checked;
        if (checked) {
          addLiveCloudCoverage();
        } else {
          removeLiveCloudCoverage();
        }
        break;
      case 'auroraNorthernLights':
        mapDataState.auroraNorthernLights = checked;
        if (checked) {
          addAuroraNorthernLights().then(() => {
            if (mapLayerInfo.auroraLayerId && appMap?.getLayer(mapLayerInfo.auroraLayerId)) {
              try { appMap.setLayoutProperty(AURORA_LAYER_ID, 'visibility', 'visible'); } catch (_) {}
              flyToGlobeView();
            }
          });
        } else {
          removeAuroraNorthernLights();
        }
        break;
      case 'airports':
        mapDataState.airports = checked;
        if (checked) updateAirportsVisibility();
        else removeAirportMarkers();
        break;
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

  container.addEventListener('input', (e) => {
    const slider = e.target.closest('[data-altitude-slider]');
    if (slider && appMap) {
      const altM = Number(slider.value) || 0;
      mapLayerInfo.volumetricWeatherAltitude = altM;
      const layerId = mapLayerInfo.volumetricWeatherLayerId;
      if (layerId && appMap.getLayer(layerId)) {
        try { appMap.setPaintProperty(layerId, 'raster-particle-elevation', altM); } catch (_) {}
      }
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
    let nextSibling = newToIdx >= rects.length ? null : rects[newToIdx].el;
    if (nextSibling === null && newToIdx >= rects.length) {
      const sliderWrap = container.querySelector('#volumetric-weather-slider-wrap');
      if (sliderWrap) nextSibling = sliderWrap;
    }
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
      flyToPOI(poi);
    }
  });
}

function showToastError(message) {
  const toast = document.getElementById('toast-error');
  const msgEl = document.getElementById('toast-error-message');
  const successToast = document.getElementById('toast-success');
  if (successToast) successToast.classList.remove('visible');
  if (toast) {
    if (msgEl && message) msgEl.textContent = message;
    toast.classList.add('visible');
  }
}

function showToastSuccess(message) {
  const toast = document.getElementById('toast-success');
  const msgEl = document.getElementById('toast-success-message');
  const errorToast = document.getElementById('toast-error');
  if (errorToast) errorToast.classList.remove('visible');
  if (toast) {
    if (msgEl && message) msgEl.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3000);
  }
}

function initNotImplementedToast() {
  const errorToast = document.getElementById('toast-error');
  const successToast = document.getElementById('toast-success');
  document.getElementById('toast-error-close')?.addEventListener('click', () => errorToast?.classList.remove('visible'));
  document.getElementById('toast-success-close')?.addEventListener('click', () => successToast?.classList.remove('visible'));
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
  const recId = panelEl.getAttribute('data-rec-id');
  const widgetId = panelEl.getAttribute('data-widget-id');
  if (name) userProfilePanels.delete(name);
  if (recId) recProfilePanels.delete(recId);
  if (widgetId) widgetProfilePanels.delete(widgetId);
  panelEl.remove();
}

const PROFILE_PICKER_Z = 60;
let profilePickerPanel = null;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function wireConfigOverlaySwipeToClose(overlayEl, closeFn) {
  if (!overlayEl || !closeFn) return;
  const handle = overlayEl.querySelector('.config-overlay-handle');
  const inner = overlayEl.querySelector('.config-overlay-inner');
  if (!handle || !inner) return;
  let startY = 0;
  let startTime = 0;
  handle.addEventListener('touchstart', (e) => {
    if (overlayEl.classList.contains('hidden')) return;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (overlayEl.classList.contains('hidden')) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      e.preventDefault();
      inner.style.transition = 'none';
      inner.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: false });
  handle.addEventListener('touchend', (e) => {
    if (overlayEl.classList.contains('hidden')) return;
    const endY = e.changedTouches?.[0]?.clientY ?? startY;
    const dy = endY - startY;
    const elapsed = Date.now() - startTime;
    const velocity = elapsed > 0 ? dy / elapsed : 0;
    inner.style.transition = '';
    inner.style.transform = '';
    if (dy > 80 || velocity > 0.5) closeFn();
  }, { passive: true });
}

async function openProfilePicturePicker(tile, parentPanel) {
  const container = document.getElementById('user-profile-panels-container');
  if (!container) return;
  if (profilePickerPanel) {
    profilePickerPanel.remove();
    profilePickerPanel = null;
  }

  const currentAvatar = tile.avatar || getUserImage(tile.name);
  let selectedPath = currentAvatar.startsWith('uploads/profile-pictures/') ? currentAvatar : null;
  let selectedRandomIndex = currentAvatar.startsWith('uploads/') ? -1 : USER_PICT_IMAGES.indexOf(currentAvatar);
  if (selectedRandomIndex < 0 && !selectedPath) selectedRandomIndex = 0;

  const isMobile = isMobileViewport();
  const panel = document.createElement('div');
  const mobileClasses = isMobile ? ' profile-picker-mobile mobile-bottom-sheet mobile-sheet-open' : '';
  panel.className = 'profile-picture-picker fixed w-80 rounded-lg overflow-hidden bg-background-light dark:bg-background-dark border border-slate-200 dark:border-white/10 shadow-xl pointer-events-auto' + mobileClasses;
  if (!isMobile) {
    panel.style.left = (window.innerWidth / 2 - 160) + 'px';
    panel.style.top = (window.innerHeight / 2 - 220) + 'px';
  }
  panel.style.zIndex = String(PROFILE_PICKER_Z);

  const currentUserName = sessionStorage.getItem('osiris_user_name')?.trim() || '';
  const isOwnProfile = tile.name === currentUserName;
  const mobileHandleHtml = isMobile ? '<div class="profile-picker-mobile-handle mobile-bottom-sheet-handle flex md:hidden flex-shrink-0"></div>' : '';
  const nameEditHtml = isOwnProfile ? `
    <div class="px-4 pb-3 border-b border-slate-200 dark:border-white/10">
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display name</label>
      <input type="text" class="profile-pick-name w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Your name" maxlength="64"/>
    </div>
  ` : '';
  let html = mobileHandleHtml + `
    <div class="p-4 border-b border-slate-200 dark:border-white/10">
      <h3 class="font-bold text-slate-800 dark:text-white">Change profile picture</h3>
      <p class="text-sm text-text-secondary mt-0.5">Choose one or upload your own</p>
    </div>
    ${nameEditHtml}
    <div class="p-4 grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
      <div class="profile-pick-add col-span-3 flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary/50 cursor-pointer transition-colors min-h-[100px] overflow-hidden" data-pick="add" role="button">
        <div class="profile-pick-add-inner flex flex-col items-center justify-center">
          <span class="material-symbols-outlined text-3xl text-text-secondary mb-1">add_photo_alternate</span>
          <span class="text-sm text-text-secondary">Add your profile picture</span>
          <span class="text-xs text-slate-400 mt-0.5">Click or drag & drop</span>
        </div>
        <div class="profile-pick-add-preview hidden w-20 h-20 rounded-lg overflow-hidden">
          <img src="" alt="" class="w-full h-full object-cover"/>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden" id="profile-pick-file-input"/>
      </div>
      ${USER_PICT_IMAGES.map((src, i) => `
        <button type="button" class="profile-pick-option flex flex-col items-center p-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 transition-all hover:border-primary/50 ${selectedRandomIndex === i && !selectedPath ? 'ring-2 ring-primary ring-offset-2' : ''}" data-pick="random" data-index="${i}">
          <img src="${src}" alt="" class="w-14 h-14 rounded-lg object-cover"/>
        </button>
      `).join('')}
    </div>
    <div class="p-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
      <button type="button" class="profile-pick-cancel px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
      <button type="button" class="profile-pick-validate px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors">Validate</button>
    </div>
  `;

  panel.innerHTML = html;
  const nameInput = panel.querySelector('.profile-pick-name');
  if (nameInput && tile.name) nameInput.value = tile.name;

  const renderSelected = () => {
    panel.querySelectorAll('.profile-pick-option').forEach((btn, i) => {
      const sel = !selectedPath && selectedRandomIndex === i;
      btn.className = `profile-pick-option flex flex-col items-center p-2 rounded-lg border-2 transition-all hover:border-primary/50 border-slate-200 dark:border-slate-700 ${sel ? 'ring-2 ring-primary ring-offset-2' : ''}`;
    });
    const addEl = panel.querySelector('.profile-pick-add');
    const inner = addEl?.querySelector('.profile-pick-add-inner');
    const preview = addEl?.querySelector('.profile-pick-add-preview');
    if (selectedPath && preview) {
      preview.classList.remove('hidden');
      preview.querySelector('img').src = selectedPath;
      inner?.classList.add('hidden');
      addEl.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
    } else {
      preview?.classList.add('hidden');
      inner?.classList.remove('hidden');
      addEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
    }
  };

  const addEl = panel.querySelector('.profile-pick-add');
  const fileInput = panel.querySelector('#profile-pick-file-input');

  addEl.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  addEl.addEventListener('dragover', (e) => { e.preventDefault(); addEl.classList.add('border-primary'); });
  addEl.addEventListener('dragleave', () => addEl.classList.remove('border-primary'));
  addEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    addEl.classList.remove('border-primary');
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    await handleProfileUpload(file, tile.name, (path) => {
      selectedPath = path;
      selectedRandomIndex = -1;
      renderSelected();
    });
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await handleProfileUpload(file, tile.name, (path) => {
      selectedPath = path;
      selectedRandomIndex = -1;
      renderSelected();
    });
    fileInput.value = '';
  });

  panel.querySelectorAll('.profile-pick-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRandomIndex = parseInt(btn.dataset.index ?? '-1', 10);
      selectedPath = null;
      renderSelected();
    });
  });

  panel.querySelector('.profile-pick-cancel').addEventListener('click', () => {
    panel.remove();
    profilePickerPanel = null;
  });

  panel.querySelector('.profile-pick-validate').addEventListener('click', async () => {
    const path = selectedPath || (selectedRandomIndex >= 0 ? USER_PICT_IMAGES[selectedRandomIndex] : null);
    if (!path) return;
    const newName = (nameInput?.value ?? '').trim();
    const nameChanged = isOwnProfile && newName && newName !== tile.name;
    const payload = { name: tile.name, profilePicture: path };
    if (nameChanged) payload.newName = newName;
    const url = typeof getProfilePictureUpdateUrl === 'function' ? getProfilePictureUpdateUrl() : 'api/users-profile-picture.php';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = errBody.error || (res.status === 404 ? 'API not found. Create api/users-profile-picture.php' : `Failed to update profile (HTTP ${res.status})`);
        showToastError(msg);
        return;
      }
      const img = parentPanel?.querySelector('.user-profile-avatar');
      if (img) img.src = path;
      const oldName = tile.name;
      tile.avatar = path;
      const nt = currentTiles.find((t) => t.name === oldName);
      if (nt) nt.avatar = path;
      if (nameChanged && errBody.name) {
        tile.name = errBody.name;
        if (nt) nt.name = errBody.name;
        sessionStorage.setItem('osiris_user_name', errBody.name);
        if (parentPanel) {
          parentPanel.setAttribute('data-user-name', errBody.name);
          const nameEl = parentPanel.querySelector('.user-profile-name');
          if (nameEl) nameEl.textContent = errBody.name;
          if (userProfilePanels.has(oldName)) {
            const v = userProfilePanels.get(oldName);
            userProfilePanels.delete(oldName);
            userProfilePanels.set(errBody.name, v);
          }
        }
      }
      addUserTileMarkers(currentTiles);
      renderNearbyTiles(currentTiles);
      showToastSuccess(nameChanged ? 'Profile updated' : 'Profile picture updated');
      panel.remove();
      profilePickerPanel = null;
    } catch (e) {
      showToastError(e?.message || 'Failed to update profile');
    }
  });

  container.appendChild(panel);
  profilePickerPanel = panel;
  renderSelected();

  if (isMobile) {
    const closePicker = () => {
      panel.remove();
      profilePickerPanel = null;
    };
    const swipeHandle = panel.querySelector('.profile-picker-mobile-handle');
    if (swipeHandle) {
      let startY = 0;
      let startTime = 0;
      swipeHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });
      swipeHandle.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) {
          e.preventDefault();
          panel.style.transition = 'none';
          panel.style.transform = `translateY(${dy}px)`;
        }
      }, { passive: false });
      swipeHandle.addEventListener('touchend', (e) => {
        const endY = e.changedTouches?.[0]?.clientY ?? startY;
        const dy = endY - startY;
        const elapsed = Date.now() - startTime;
        const velocity = elapsed > 0 ? dy / elapsed : 0;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 80 || velocity > 0.5) closePicker();
      }, { passive: true });
    }
  }
}

async function handleProfileUpload(file, userName, onSuccess) {
  const url = typeof getProfilePictureUploadUrl === 'function' ? getProfilePictureUploadUrl() : 'api/profile-picture-upload.php';
  const form = new FormData();
  form.append('name', userName);
  form.append('file', file);
  try {
    const res = await fetch(url, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToastError(data.error || 'Upload failed');
      return;
    }
    if (data.path) onSuccess(data.path);
  } catch (e) {
    showToastError(e?.message || 'Upload failed');
  }
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
  const isMobile = isMobileViewport();
  const topBarMargin = 24;
  const baseX = window.innerWidth * (0.5 + 0.07);
  const baseY = topBarMargin;
  const left = baseX + count * PANEL_CASCADE_OFFSET;
  const top = baseY + count * PANEL_CASCADE_OFFSET;

  const panel = document.createElement('div');
  const mobileSheetClasses = isMobile ? ' user-profile-panel-mobile mobile-bottom-sheet mobile-sheet-open' : '';
  panel.className = 'user-profile-panel fixed w-72 rounded-lg overflow-hidden bg-background-light/20 dark:bg-background-dark/20 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto flex flex-col max-h-[calc(100vh-24px)]' + mobileSheetClasses;
  panel.setAttribute('aria-hidden', 'false');
  panel.setAttribute('data-user-name', name);
  panel.setAttribute('data-user-id', tile.id || '');
  if (!isMobile) {
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  panel.style.zIndex = String(PANEL_BASE_Z + count);

  const deleteBtnHtml = canDelete
    ? `<button type="button" class="user-profile-panel-delete w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-slate-600 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors" data-user-id="${String(tile.id || '').replace(/"/g, '&quot;')}" aria-label="Delete user"><span class="material-symbols-outlined text-[20px]">delete</span></button>`
    : '';
  const isOwnPanel = tile.name === currentUserName;
  const avatarEditBtn = isOwnPanel
    ? `<button type="button" class="user-profile-avatar-edit absolute inset-0 w-full h-full flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer pointer-events-auto" aria-label="Change profile picture"><span class="material-symbols-outlined text-white text-2xl">edit</span></button>`
    : '';

  const mobileHandleHtml = isMobile ? '<div class="user-profile-mobile-handle mobile-bottom-sheet-handle flex md:hidden flex-shrink-0" data-swipe-close></div>' : '';
  panel.innerHTML = mobileHandleHtml + `
    <div class="user-profile-drag-handle flex-shrink-0 flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none bg-card-light/50 dark:bg-card-dark/50 border-b border-slate-200/50 dark:border-white/5">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="relative flex-shrink-0 group/avatar rounded-lg transition-all hover:ring-2 hover:ring-primary/50">
          <img class="user-profile-avatar w-12 h-12 rounded-lg object-cover border-2 border-primary/30" src="${(tile.avatar || '').replace(/"/g, '&quot;')}" alt="${(tile.name || '').replace(/"/g, '&quot;')}"/>
          ${avatarEditBtn}
        </div>
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
        <button type="button" class="user-profile-panel-close w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors" aria-label="Close profile"><span class="material-symbols-outlined text-[20px]">close</span></button>
      </div>
    </div>
    <div class="user-profile-widgets p-3 space-y-2 hidden overflow-y-auto min-h-0 flex-1 max-h-[calc(100vh-180px)]"></div>
  `;

  if (isOwnPanel) {
    const editBtn = panel.querySelector('.user-profile-avatar-edit');
    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openProfilePicturePicker(tile, panel);
    });
  }

  const widgetsEl = panel.querySelector('.user-profile-widgets');
  const allWidgets = tile.widgets || [];
  const weatherWidgets = allWidgets.filter((w) => w.type === 'weather');
  const stockWidgets = allWidgets.filter((w) => w.type === 'stock');
  const showDelete = canDelete && allWidgets.length > 0;

  if (allWidgets.length > 0) {
    widgetsEl.classList.remove('hidden');
    widgetsEl.innerHTML = getWidgetSkeletonHtml(allWidgets.length, 'panel');
    const isDark = document.documentElement.classList.contains('dark');
    let html = '';
    for (const w of weatherWidgets) {
      let imgPath = w.image || w.imageDark || w.imageClear || '';
      if (!imgPath && w.lat != null && w.lng != null) {
        try {
          const url = typeof getCityImageUrl === 'function' ? getCityImageUrl() : 'city-image.php';
          const imgRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              city: w.city || 'Unknown',
              countryCode: ((w.countryCode || 'XX') + '').slice(0, 2).toUpperCase(),
              lat: w.lat,
              lng: w.lng,
              weatherCode: 0
            })
          });
          const imgData = await imgRes.json();
          imgPath = imgData.image || imgData.imageClear || imgData.imageDark || '';
        } catch (_) {}
      }
      try {
        const url = (typeof getWeatherUrl === 'function' ? getWeatherUrl() : 'weather.php') + '?action=forecast&lat=' + w.lat + '&lng=' + w.lng;
        const res = await fetch(url);
        const weather = res.ok ? await res.json() : {};
        html += buildWidgetCardHtml(w, weather, imgPath, isDark, showDelete, 'panel');
      } catch (_) {
        html += buildWidgetCardHtml(w, {}, imgPath, isDark, showDelete, 'panel');
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
          if (await deleteWidget(id)) {
            closeUserProfilePanel(panel);
          }
        });
      });
    }
  }

  container.appendChild(panel);
  userProfilePanels.set(name, { el: panel, tile });

  if (isMobile) {
    const swipeHandle = panel.querySelector('.user-profile-mobile-handle');
    if (swipeHandle) {
      let startY = 0;
      let startTime = 0;
      swipeHandle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });
      swipeHandle.addEventListener('touchmove', (e) => {
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) {
          e.preventDefault();
          panel.style.transition = 'none';
          panel.style.transform = `translateY(${dy}px)`;
        }
      }, { passive: false });
      swipeHandle.addEventListener('touchend', (e) => {
        const endY = e.changedTouches?.[0]?.clientY ?? startY;
        const dy = endY - startY;
        const elapsed = Date.now() - startTime;
        const velocity = elapsed > 0 ? dy / elapsed : 0;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 80 || velocity > 0.5) closeUserProfilePanel(panel);
      }, { passive: true });
    }
  } else {
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
    updateAdminMenuVisibility();
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
  appMap.on('zoomend', () => {
    if (mapDataState.airports) updateAirportsVisibility();
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
      await registerUser({ ...LocationService.currentLocation, ip: LocationService.currentIP ?? '' });
      await refreshNearby();
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
        await registerUser({ ...LocationService.currentLocation, ip: LocationService.currentIP ?? '' });
        await refreshNearby();
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
  const { pitch = 0, duration = 4000, padding } = opts;
  appMap.flyTo({
    center: [lng, lat],
    zoom,
    pitch,
    padding: padding || { top: 0, right: 0, bottom: 0, left: 0 },
    duration
  });
}

/** Fly to location with zoom so globe occupies ~80% of viewport height. Returns a Promise. */
function flyToEarthFractionAsync(lng, lat, fraction, opts = {}) {
  if (!appMap) return Promise.resolve();
  const container = document.getElementById('map-app-container');
  const h = Math.max(300, container?.clientHeight || window.innerHeight);
  const EARTH_CIRCUMFERENCE_M = 40075000;
  const M_PER_PX_AT_ZOOM0_EQ = 156543.03392;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const desiredMeters = fraction * EARTH_CIRCUMFERENCE_M;
  const metersPerPixel = desiredMeters / h;
  const zoom = Math.log2((M_PER_PX_AT_ZOOM0_EQ * cosLat) / metersPerPixel);
  const clampedZoom = Math.max(1, Math.min(22, Math.round(zoom * 10) / 10));
  return new Promise((resolve) => {
    const doFly = () => {
      if (!appMap) { resolve(); return; }
      appMap.resize();
      const onMoveEnd = () => {
        appMap.off('moveend', onMoveEnd);
        resolve();
      };
      appMap.once('moveend', onMoveEnd);
      appMap.flyTo({
        center: [lng, lat],
        zoom: clampedZoom,
        pitch: 0,
        bearing: 0,
        duration: opts.duration ?? 4000
      });
    };
    const runAfterLayout = () => { requestAnimationFrame(() => { requestAnimationFrame(doFly); }); };
    if (typeof appMap.isStyleLoaded === 'function' && appMap.isStyleLoaded()) {
      runAfterLayout();
    } else {
      appMap.once('load', runAfterLayout);
    }
  });
}

/** Returns a Promise that resolves when the fly animation completes. */
function flyToLocationAsync(lng, lat, zoom, opts = {}) {
  if (!appMap) return Promise.resolve();
  return new Promise((resolve) => {
    const onMoveEnd = () => {
      appMap.off('moveend', onMoveEnd);
      resolve();
    };
    appMap.once('moveend', onMoveEnd);
    flyToLocation(lng, lat, zoom, opts);
  });
}

function flyToGlobeView() {
  if (!appMap) return;
  const padH = 80;
  const padV = 100;
  appMap.flyTo({
    center: [0, 25],
    zoom: 1.5,
    pitch: 0,
    padding: { top: padV, right: padH, bottom: padV, left: padH },
    duration: 2000
  });
}

/** Custom camera options per POI (brand + location). Bearing: 0=N, 90=E, 180=S, 270=W. */
function getPOICameraOverrides(poi) {
  const key = (poi.brand || '') + '|' + (poi.location || '');
  const overrides = {
    'Autodesk|Autodesk University': { bearing: 210, zoom: 16, pitch: 68 },
    'Biosens Numerique|6 Rue de Nice, 75011 Paris': { bearing: 270, zoom: 16, pitch: 38 }
  };
  return overrides[key] || null;
}

function flyToPOI(poi, opts = {}) {
  if (!appMap || !poi || poi.lat == null || poi.lng == null) return;
  closeBottomPanel();
  openPOIContentPanel(poi);
  const isMobile = window.innerWidth < 768;
  const padding = isMobile
    ? { left: 0, right: 0, top: 0, bottom: Math.floor(window.innerHeight * (2 / 3)) }
    : { left: Math.floor(window.innerWidth * 0.5), right: 0, top: 0, bottom: 0 };
  const cam = getPOICameraOverrides(poi);
  appMap.flyTo({
    center: [poi.lng, poi.lat],
    zoom: opts.zoom ?? cam?.zoom ?? 17.5,
    pitch: opts.pitch ?? cam?.pitch ?? 50,
    bearing: opts.bearing ?? cam?.bearing ?? 0,
    padding,
    duration: opts.duration ?? 2500
  });
}

function getPOIAssets(poi) {
  const logo = poi.icon || 'brand/placeholder.png';
  const hashtags = [`#${(poi.type || 'ProductWork').replace(/\s+/g, '')}`, `#${(poi.brand || '').replace(/\s+/g, '')}`].filter(Boolean);
  return { logo, hashtags };
}

function getCurrentPOIIndex() {
  if (!currentOpenPOI || !currentPOIs.length) return -1;
  const id = currentOpenPOI.id;
  return currentPOIs.findIndex((p) => String(p.id) === String(id));
}

function updatePOINavButtons() {
  /* No disable - wrap around enabled */
}

function goToPrevPOI() {
  const idx = getCurrentPOIIndex();
  if (idx < 0 || !currentPOIs.length) return;
  const nextIdx = idx <= 0 ? currentPOIs.length - 1 : idx - 1;
  const poi = currentPOIs[nextIdx];
  if (poi) { currentOpenPOI = poi; flyToPOI(poi, { duration: 1200 }); }
}

function goToNextPOI() {
  const idx = getCurrentPOIIndex();
  if (idx < 0 || !currentPOIs.length) return;
  const nextIdx = idx >= currentPOIs.length - 1 ? 0 : idx + 1;
  const poi = currentPOIs[nextIdx];
  if (poi) { currentOpenPOI = poi; flyToPOI(poi, { duration: 1200 }); }
}

function closePOIContentPanel() {
  const panel = document.getElementById('poi-content-panel');
  if (!panel || !panel.classList.contains('poi-panel-open')) return;

  let done = false;
  const finishClose = () => {
    if (done) return;
    done = true;
    panel.classList.remove('poi-panel-closing', 'animate-fade-in-right', 'animate-fade-in-up');
    panel.setAttribute('aria-hidden', 'true');
    currentOpenPOI = null;
    document.getElementById('map-app-root')?.classList.remove('poi-panel-open');
    document.getElementById('bottom-panel-wrapper')?.classList.remove('poi-panel-blocking');
    if (appMap) {
      const center = appMap.getCenter();
      if (center) {
        appMap.flyTo({ center: [center.lng, center.lat], zoom: Math.max(2, appMap.getZoom() - 1.5), pitch: 0, duration: 800 });
      }
    }
    const videoOverlay = document.getElementById('poi-video-overlay');
    if (videoOverlay && !videoOverlay.classList.contains('hidden')) {
      const v = document.getElementById('poi-video-player');
      if (v) { v.pause(); v.src = ''; }
      videoOverlay.classList.add('hidden');
    }
    const imageOverlay = document.getElementById('poi-image-overlay');
    if (imageOverlay) imageOverlay.classList.add('hidden');
  };

  panel.classList.add('poi-panel-closing');
  panel.classList.remove('poi-panel-open');
  const handler = (e) => {
    if (e.target !== panel || e.propertyName !== 'transform') return;
    finishClose();
  };
  panel.addEventListener('transitionend', handler, { once: true });
  setTimeout(() => { if (panel.classList.contains('poi-panel-closing')) finishClose(); }, 400);
}

function openPOIImageViewer(src, caption, items, index) {
  const overlay = document.getElementById('poi-image-overlay');
  const img = document.getElementById('poi-image-viewer-img');
  const capEl = overlay?.querySelector('.poi-media-viewer-caption-text');
  if (!overlay || !img) return;
  poiViewerGallery = { items: items && items.length ? items : [{ url: src, caption: caption || 'Image' }], index: index >= 0 ? index : 0 };
  const cur = poiViewerGallery.items[poiViewerGallery.index];
  img.src = cur.url;
  if (capEl) capEl.textContent = cur.caption;
  overlay.classList.remove('hidden');
  updatePOIViewerNavVisibility();
}

function updatePOIViewerNavVisibility() {
  const prev = document.querySelector('.poi-viewer-prev');
  const next = document.querySelector('.poi-viewer-next');
  const n = poiViewerGallery.items.length;
  if (prev) prev.style.visibility = n > 1 && poiViewerGallery.index > 0 ? 'visible' : 'hidden';
  if (next) next.style.visibility = n > 1 && poiViewerGallery.index < n - 1 ? 'visible' : 'hidden';
}

function poiViewerGoPrev() {
  if (poiViewerGallery.items.length <= 1 || poiViewerGallery.index <= 0) return;
  poiViewerGallery.index--;
  const cur = poiViewerGallery.items[poiViewerGallery.index];
  const img = document.getElementById('poi-image-viewer-img');
  const capEl = document.querySelector('#poi-image-overlay .poi-media-viewer-caption-text');
  if (img) img.src = cur.url;
  if (capEl) capEl.textContent = cur.caption;
  updatePOIViewerNavVisibility();
}

function poiViewerGoNext() {
  const n = poiViewerGallery.items.length;
  if (n <= 1 || poiViewerGallery.index >= n - 1) return;
  poiViewerGallery.index++;
  const cur = poiViewerGallery.items[poiViewerGallery.index];
  const img = document.getElementById('poi-image-viewer-img');
  const capEl = document.querySelector('#poi-image-overlay .poi-media-viewer-caption-text');
  if (img) img.src = cur.url;
  if (capEl) capEl.textContent = cur.caption;
  updatePOIViewerNavVisibility();
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const INSPIRATIONAL_QUOTES = [
  { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
  { q: 'Design is not just what it looks like and feels like. Design is how it works.', a: 'Steve Jobs' },
  { q: 'Innovation distinguishes between a leader and a follower.', a: 'Steve Jobs' },
  { q: 'Simplicity is the ultimate sophistication.', a: 'Leonardo da Vinci' },
  { q: 'Creativity is intelligence having fun.', a: 'Albert Einstein' },
  { q: 'Design creates culture. Culture shapes values. Values determine the future.', a: 'Robert L. Peters' },
  { q: 'Be the change you wish to see in the world.', a: 'Mahatma Gandhi' },
  { q: 'The best way to predict the future is to create it.', a: 'Peter Drucker' },
  { q: 'Quality is not an act, it is a habit.', a: 'Aristotle' },
  { q: 'Strive for progress, not perfection.', a: 'Unknown' },
];

function getRandomInspirationalQuote() {
  return INSPIRATIONAL_QUOTES[Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length)];
}

const POI_CONTENT_CACHE = new Map();
const POI_CACHE_MAX = 20;

async function openPOIContentPanel(poi) {
  const panel = document.getElementById('poi-content-panel');
  if (!panel || !poi) return;
  currentOpenPOI = poi;
  const scrollEl = panel.querySelector('.editorial-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;
  const assets = getPOIAssets(poi);
  const cacheKey = (poi.brand || '') + '|' + (poi.location || '');
  const loadingEl = panel.querySelector('#poi-panel-loading');
  let content = POI_CONTENT_CACHE.get(cacheKey);
  if (!content) {
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (!panel.classList.contains('poi-panel-open')) {
      const isMob = window.innerWidth < 768;
      panel.classList.add('poi-panel-open', isMob ? 'animate-fade-in-up' : 'animate-fade-in-right');
      panel.setAttribute('aria-hidden', 'false');
      document.getElementById('map-app-root')?.classList.add('poi-panel-open');
      if (isMob) document.getElementById('bottom-panel-wrapper')?.classList.add('poi-panel-blocking');
    }
    const contentUrl = (typeof getProjectsContentUrl === 'function' ? getProjectsContentUrl() : 'projects-content.php') + '?brand=' + encodeURIComponent(poi.brand || '') + (poi.location ? '&location=' + encodeURIComponent(poi.location) : '') + '&_=' + Date.now();
    content = { hero: null, videos: [], images: [], heroStatement: null, quote: null, intro: null, facts: null, featuredLabel: null, tags: null, heroCaption: null, heroSubcaption: null, quoteAuthor: null, quoteRole: null, quoteAvatar: null, keyFigures: null, websiteUrl: null, mission: null, process: null, kpi: null };
    try {
      const res = await fetch(contentUrl, { cache: 'no-store' });
      if (res.ok) content = await res.json();
      if (currentOpenPOI !== poi) { if (loadingEl) loadingEl.classList.add('hidden'); return; }
      if (POI_CONTENT_CACHE.size >= POI_CACHE_MAX) {
        const first = POI_CONTENT_CACHE.keys().next().value;
        if (first !== undefined) POI_CONTENT_CACHE.delete(first);
      }
      POI_CONTENT_CACHE.set(cacheKey, content);
    } catch (_) {}
    if (loadingEl) loadingEl.classList.add('hidden');
  }
  const brand = poi.brand || 'Partner';
  const type = poi.type || 'Project work';
  const subtitle = content.heroStatement || type;

  const logoWrap = panel.querySelector('.poi-panel-logo-wrap');
  if (logoWrap) logoWrap.style.backgroundImage = assets.logo ? `url('${escapeHtml(assets.logo)}')` : 'none';
  const titleEl = panel.querySelector('header .poi-panel-title');
  if (titleEl) titleEl.textContent = brand;
  const subEl = panel.querySelector('header .poi-panel-subtitle');
  if (subEl) subEl.textContent = subtitle;

  const websiteEl = panel.querySelector('.poi-panel-website');
  if (websiteEl) {
    const showWebsite = content.websiteUrl && poi.brand !== 'Mazars';
    websiteEl.href = content.websiteUrl || '#';
    websiteEl.style.display = showWebsite ? '' : 'none';
  }

  const featuredEl = panel.querySelector('.poi-panel-featured-label');
  if (featuredEl) featuredEl.textContent = content.featuredLabel || 'Featured Project';

  const heroTitleEl = panel.querySelector('.poi-panel-hero-title-text');
  if (heroTitleEl) heroTitleEl.textContent = brand;

  const tagsEl = panel.querySelector('.poi-panel-tags');
  if (tagsEl) {
    const tags = content.tags && content.tags.length ? content.tags : [type, poi.location ? poi.location.split(',')[0] : null].filter(Boolean);
    tagsEl.innerHTML = tags.map((t) => `
      <div class="glass-card px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white/5 transition-colors cursor-pointer">
        <span class="material-symbols-outlined text-primary text-sm">tag</span>
        <span class="text-sm font-medium text-slate-300">${escapeHtml(t)}</span>
      </div>`).join('');
  }

  const heroMediaEl = panel.querySelector('.poi-panel-hero-media');
  const heroCaptionEl = panel.querySelector('.poi-panel-hero-caption');
  const heroSubcaptionEl = panel.querySelector('.poi-panel-hero-subcaption');
  const firstVideo = content.videos && content.videos[0];
  const heroMedia = content.hero || (content.images && content.images[0]);
  const useVideoHero = !!firstVideo;
  if (heroMediaEl) {
    if (useVideoHero) {
      heroMediaEl.style.backgroundImage = '';
      heroMediaEl.innerHTML = `<video src="${escapeHtml(firstVideo)}" autoplay muted loop playsinline class="w-full h-full object-cover"></video>`;
    } else if (heroMedia) {
      heroMediaEl.style.backgroundImage = `url('${escapeHtml(heroMedia)}')`;
      heroMediaEl.innerHTML = '';
    } else {
      heroMediaEl.style.backgroundImage = '';
      heroMediaEl.innerHTML = '';
    }
  }
  if (heroCaptionEl) heroCaptionEl.textContent = content.heroCaption || 'Headquarters View';
  if (heroSubcaptionEl) heroSubcaptionEl.textContent = content.heroSubcaption || (poi.location ? poi.location.split(',')[0] : '');

  const insp = getRandomInspirationalQuote();
  const quoteEl = panel.querySelector('.poi-panel-quote');
  if (quoteEl) quoteEl.textContent = insp.q;
  const quoteAuthorEl = panel.querySelector('.poi-panel-quote-author');
  if (quoteAuthorEl) quoteAuthorEl.textContent = 'Guillaume Lassiat';
  const quoteRoleEl = panel.querySelector('.poi-panel-quote-role');
  if (quoteRoleEl) quoteRoleEl.textContent = 'Inspirational';
  const quoteAvatarEl = panel.querySelector('.poi-panel-quote-avatar');
  if (quoteAvatarEl) quoteAvatarEl.style.backgroundImage = `url('Guillaume_Lassiat.png')`;

  const missionEl = panel.querySelector('.poi-panel-mission');
  if (missionEl) {
    const missionParas = content.mission && Array.isArray(content.mission) ? content.mission : (content.intro ? content.intro.split(/\n\n+/) : ['Discover the story behind this location and the collaborative work that shaped it.']);
    missionEl.innerHTML = missionParas.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  }

  const processEl = panel.querySelector('.poi-panel-process');
  if (processEl) {
    const processParas = content.process && Array.isArray(content.process) ? content.process : [];
    processEl.innerHTML = processParas.length ? processParas.map((p) => `<p>${escapeHtml(p)}</p>`).join('') : '';
    processEl.closest('.mb-16')?.classList.toggle('hidden', processParas.length === 0);
  }

  const kpiEl = panel.querySelector('.poi-panel-kpi');
  if (kpiEl) {
    const kpiParas = content.kpi && Array.isArray(content.kpi) ? content.kpi : [];
    kpiEl.innerHTML = kpiParas.length ? kpiParas.map((p) => `<p>${escapeHtml(p)}</p>`).join('') : '';
    kpiEl.closest('.mb-16')?.classList.toggle('hidden', kpiParas.length === 0);
  }

  const keyFiguresEl = panel.querySelector('.poi-panel-key-figures');
  if (keyFiguresEl) {
    const defaults = [
      { label: 'Countries & Territories', value: '90+', icon: 'public' },
      { label: 'Professionals', value: '47,000', icon: 'groups' },
      { label: 'Global Revenue', value: '€2.8bn', icon: 'trending_up' }
    ];
    const figures = content.keyFigures && content.keyFigures.length ? content.keyFigures : defaults;
    keyFiguresEl.innerHTML = figures.map((f) => `
      <div class="glass-card p-5 rounded-lg flex items-center justify-between group poi-key-figure hover:bg-white/5 transition-all">
        <div>
          <p class="text-slate-400 text-sm mb-1">${escapeHtml(f.label || '')}</p>
          <p class="text-3xl font-bold text-white">${escapeHtml(f.value || '')}</p>
        </div>
        <span class="material-symbols-outlined text-primary/50 text-4xl group-hover:text-primary transition-colors">${escapeHtml(f.icon || 'info')}</span>
      </div>`).join('');
  }

  const galleryEl = panel.querySelector('.poi-panel-gallery');
  galleryEl.innerHTML = '';
  const allImages = content.images || [];
  const allVideos = content.videos || [];
  const heroImg = useVideoHero ? null : heroMedia;
  const includeHeroInGallery = poi.brand === 'Renault';
  const galleryImages = includeHeroInGallery ? allImages : (heroImg ? allImages.filter((u) => u !== heroImg) : allImages);
  const getItemLabel = (url) => {
    const name = (url || '').split('/').pop().replace(/\.[^.]+$/, '').replace(/[-@]\d*x?$/i, '');
    return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Visual';
  };
  const galleryMetaMap = {};
  (content.galleryMetadata || []).forEach((m) => { if (m?.filename && m?.description) galleryMetaMap[m.filename] = m.description; });
  const getCaptionForUrl = (url) => {
    const filename = (url || '').split('/').pop();
    return galleryMetaMap[filename] || `${getItemLabel(url)} - ${type}`;
  };
  const viewerImageItems = [];
  if (content.quote && content.quote.trim()) {
    const q = content.quote.length > 120 ? content.quote.slice(0, 117) + '...' : content.quote;
    const div = document.createElement('div');
    div.className = 'poi-gallery-item poi-gallery-quote break-inside-avoid';
    div.innerHTML = `
      <div class="w-full bg-primary p-8 flex flex-col justify-between min-h-[12rem] rounded-lg">
        <span class="material-symbols-outlined text-white text-4xl">format_quote</span>
        <p class="text-white text-xl font-bold leading-tight">"${escapeHtml(q)}"</p>
        <div class="h-1 w-12 bg-white/30 rounded-lg"></div>
      </div>`;
    galleryEl.appendChild(div);
  }
  const galleryLimit = poi.brand === 'Renault' ? 12 : 6;
  galleryImages.slice(0, galleryLimit).forEach((url, idx) => {
    const caption = getCaptionForUrl(url);
    viewerImageItems.push({ url, caption });
    const div = document.createElement('div');
    div.className = 'poi-gallery-item';
    div.innerHTML = `
      <img src="${escapeHtml(url)}" alt="" loading="lazy"/>
      <div class="glass-card-overlay">
        <span class="text-primary text-xs font-bold uppercase mb-1">${escapeHtml(type)}</span>
        <p class="text-white font-bold text-lg">${escapeHtml(getItemLabel(url))}</p>
      </div>`;
    div.addEventListener('click', () => openPOIImageViewer(url, caption, viewerImageItems, idx));
    galleryEl.appendChild(div);
  });
  allVideos.slice(0, 2).forEach((url) => {
    const div = document.createElement('div');
    div.className = 'poi-gallery-item poi-gallery-video relative';
    div.innerHTML = `
      <video src="${escapeHtml(url)}" preload="metadata" muted playsinline class="w-full min-h-[12rem] object-cover" crossorigin="anonymous"></video>
      <span class="poi-play-icon material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style="font-variation-settings:'FILL' 1">play_circle</span>`;
    const vid = div.querySelector('video');
    vid.addEventListener('loadeddata', () => { vid.currentTime = 0.1; });
    div.addEventListener('click', () => openPOIVideoPlayer(url));
    galleryEl.appendChild(div);
  });

  const isMobile = window.innerWidth < 768;
  panel.classList.add('poi-panel-open', isMobile ? 'animate-fade-in-up' : 'animate-fade-in-right');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('map-app-root')?.classList.add('poi-panel-open');
  if (window.innerWidth < 768) document.getElementById('bottom-panel-wrapper')?.classList.add('poi-panel-blocking');
  panel.querySelector('.poi-panel-close')?.focus();
  updatePOINavButtons();
}

function openPOIVideoPlayer(src) {
  const overlay = document.getElementById('poi-video-overlay');
  const video = document.getElementById('poi-video-player');
  if (!overlay || !video) return;
  video.src = src;
  overlay.classList.remove('hidden');
  video.play().catch(() => {});
}

function initPOIContentPanel() {
  const panel = document.getElementById('poi-content-panel');
  const handle = panel?.querySelector('.poi-panel-drag-handle');
  const videoOverlay = document.getElementById('poi-video-overlay');
  const videoPlayer = document.getElementById('poi-video-player');
  const imageOverlay = document.getElementById('poi-image-overlay');
  const imageViewerImg = document.getElementById('poi-image-viewer-img');
  if (!panel) return;
  panel.querySelector('.poi-panel-close')?.addEventListener('click', closePOIContentPanel);
  panel.querySelector('.poi-panel-prev')?.addEventListener('click', goToPrevPOI);
  panel.querySelector('.poi-panel-next')?.addEventListener('click', goToNextPOI);
  panel.querySelector('.poi-panel-cta')?.addEventListener('click', goToNextPOI);
  document.querySelector('.poi-viewer-prev')?.addEventListener('click', (e) => { e.stopPropagation(); poiViewerGoPrev(); });
  document.querySelector('.poi-viewer-next')?.addEventListener('click', (e) => { e.stopPropagation(); poiViewerGoNext(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (closeTopWidgetPanel()) {
        /* handled */
      } else if (closeTopRecommendationPanel()) {
        /* handled */
      } else if (imageOverlay && !imageOverlay.classList.contains('hidden')) {
        imageOverlay.classList.add('hidden');
      } else if (videoOverlay && !videoOverlay.classList.contains('hidden')) {
        if (videoPlayer) { videoPlayer.pause(); videoPlayer.src = ''; }
        videoOverlay.classList.add('hidden');
      } else if (panel.classList.contains('poi-panel-open')) closePOIContentPanel();
    }
  });
  document.getElementById('map-container-wrap')?.addEventListener('click', (e) => {
    if (panel.classList.contains('poi-panel-open') && !panel.contains(e.target)) closePOIContentPanel();
  });
  const closeVideoOverlay = () => {
    if (videoPlayer) { videoPlayer.pause(); videoPlayer.src = ''; }
    videoOverlay?.classList.add('hidden');
  };
  const closeImageOverlay = () => imageOverlay?.classList.add('hidden');
  videoOverlay?.querySelector('.poi-video-overlay-close')?.addEventListener('click', closeVideoOverlay);
  videoOverlay?.addEventListener('click', (e) => { if (e.target === videoOverlay) closeVideoOverlay(); });
  imageOverlay?.querySelector('.poi-media-overlay-close')?.addEventListener('click', closeImageOverlay);
  imageOverlay?.addEventListener('click', (e) => { if (e.target === imageOverlay) closeImageOverlay(); });
  if (handle) {
    let startY = 0;
    let startTime = 0;
    handle.addEventListener('touchstart', (e) => {
      if (!panel.classList.contains('poi-panel-open')) return;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });
    handle.addEventListener('touchmove', (e) => {
      if (!panel.classList.contains('poi-panel-open')) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        panel.style.transition = 'none';
        panel.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: false });
    handle.addEventListener('touchend', (e) => {
      if (!panel.classList.contains('poi-panel-open')) return;
      const endY = e.changedTouches[0].clientY;
      const dy = endY - startY;
      const velocity = (Date.now() - startTime) > 0 ? dy / (Date.now() - startTime) : 0;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 80 || velocity > 0.5) closePOIContentPanel();
    }, { passive: true });
  }
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
    closePOIContentPanel();
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
      if (e.target.closest('.map-data-tile-draggable, .user-tile-delete, #nearby-clear-all, #nearby-show-others-tile, #add-weather-widget, #add-stock-widget, [data-delete-widget-id]')) return;
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

  /* Mobile: swipe-to-close on drag handle (handle is hidden on desktop via md:hidden) */
  const handle = document.getElementById('bottom-panel-drag-handle');
  if (handle) {
    let startY = 0;
    let startTime = 0;
    handle.addEventListener('touchstart', (e) => {
      if (!panel.classList.contains('visible')) return;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });
    handle.addEventListener('touchmove', (e) => {
      if (!panel.classList.contains('visible')) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        panel.style.transition = 'none';
        panel.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: false });
    handle.addEventListener('touchend', (e) => {
      if (!panel.classList.contains('visible')) return;
      const endY = e.changedTouches?.[0]?.clientY ?? e.touches?.[0]?.clientY ?? startY;
      const dy = endY - startY;
      const elapsed = Date.now() - startTime;
      const velocity = elapsed > 0 ? dy / elapsed : 0;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 80 || velocity > 0.5) closePanel();
    }, { passive: true });
  }
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
  if (!overlay) return;

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

  window.openWeatherWidgetPanel = openPanel;
  document.addEventListener('click', (e) => {
    if (e.target.closest('#add-weather-widget')) openPanel();
  });
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });
  wireConfigOverlaySwipeToClose(overlay, closePanel);

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
      const loc = LocationService?.currentLocation || {};
      await registerUser({ ...loc, ip: loc.ip ?? LocationService?.currentIP ?? '' });
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
      const baseUrl = typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php';
      const widgetsUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(name);
      let usersRes;
      try {
        usersRes = await fetch(widgetsUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      } catch (fetchErr) {
        const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';
        throw new Error(isFile ? 'Cannot save: open the app via http:// or https:// (not file://)' : (fetchErr?.message || 'Network error'));
      }
      let widgets = [];
      if (usersRes.ok) {
        const usersData = await usersRes.json().catch(() => ({}));
        widgets = usersData.widgets || [];
      } else if (!usersRes.ok && usersRes.status === 404) {
        throw new Error('API not found (404). Ensure users-widgets.php is served by your web server.');
      }
      const patchRes = await fetch(baseUrl.replace(/\?.*$/, ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, widgets: [...widgets, widget] })
      });
      if (!patchRes.ok) {
        const text = await patchRes.text();
        let errBody = {};
        try { errBody = JSON.parse(text); } catch (_) {}
        const msg = errBody.error || 'Failed to save widget';
        const detail = errBody.detail || (text && text.length < 100 ? text : `HTTP ${patchRes.status}`);
        showToastError(detail ? `${msg}: ${detail}` : msg);
        showLoading(false);
        return;
      }
      closePanel();
      await refreshNearby();
      const tabWidgets = document.getElementById('tab-widgets');
      const tilesWidgets = document.getElementById('widget-tiles');
      if (tabWidgets?.classList.contains('text-primary') && tilesWidgets) {
        await renderWidgetTilesInTab();
      }
    } catch (e) {
      const msg = e?.message || 'Failed to add weather widget';
      showToastError(msg);
    }
    showLoading(false);
  }

  validateLocation?.addEventListener('click', async () => {
    let loc = LocationService?.currentLocation || {};
    if (!loc.lat || !loc.lng) {
      try {
        loc = await LocationService.getIPLocation?.() || loc;
      } catch (_) {}
    }
    if (!loc?.lat || !loc?.lng) {
      showToastError('Location not available. Enable GPS or try by city.');
      return;
    }
    const city = loc.city || 'Unknown';
    const countryCode = ((loc.country || '') + '').slice(0, 2).toUpperCase() || 'XX';
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
  if (!overlay) return;

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

  window.openStockWidgetPanel = openPanel;
  document.addEventListener('click', (e) => {
    if (e.target.closest('#add-stock-widget')) openPanel();
  });
  closeBtn?.addEventListener('click', closePanel);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });
  wireConfigOverlaySwipeToClose(overlay, closePanel);

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
    const loc = LocationService?.currentLocation || {};
    await registerUser({ ...loc, ip: loc.ip ?? LocationService?.currentIP ?? '' });
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
    const baseUrl = typeof getUsersWidgetsUrl === 'function' ? getUsersWidgetsUrl() : 'users-widgets.php';
    const widgetsUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(name);
    let usersRes;
    try {
      usersRes = await fetch(widgetsUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
    } catch (fetchErr) {
      const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';
      throw new Error(isFile ? 'Cannot save: open the app via http:// or https:// (not file://)' : (fetchErr?.message || 'Network error'));
    }
    let widgets = [];
    if (usersRes.ok) {
      const usersData = await usersRes.json().catch(() => ({}));
      widgets = usersData.widgets || [];
    } else if (usersRes.status === 404) {
      throw new Error('API not found (404). Ensure users-widgets.php is served by your web server.');
    }
    const patchRes = await fetch(baseUrl.replace(/\?.*$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, widgets: [...widgets, widget] })
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      let errBody = {};
      try { errBody = JSON.parse(text); } catch (_) {}
      const msg = errBody.error || 'Failed to save widget';
      const detail = errBody.detail || (text && text.length < 100 ? text : `HTTP ${patchRes.status}`);
      showToastError(detail ? `${msg}: ${detail}` : msg);
      showLoading?.(false);
      return;
    }
    closePanel?.();
    await refreshNearby();
    const tabWidgets = document.getElementById('tab-widgets');
    if (tabWidgets?.classList.contains('text-primary')) {
      await renderWidgetTilesInTab();
    }
  } catch (e) {
    const msg = e?.message || 'Failed to add stock widget';
    showToastError(msg);
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
  const deleteBtnClass = variant === 'panel'
    ? 'absolute top-2 right-2 z-20 w-8 h-8 flex items-center justify-center rounded-lg bg-black/50 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer'
    : 'absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded-lg bg-black/30 hover:bg-red-500/80 text-white transition-opacity duration-200 opacity-0 group-hover:opacity-100 cursor-pointer';
  const deleteIconSize = variant === 'panel' ? 'text-[18px]' : 'text-[14px]';
  const deleteBtn = showDelete
    ? `<button type="button" data-delete-widget-id="${String(deleteId).replace(/"/g, '&quot;')}" class="${deleteBtnClass}" aria-label="Delete widget">
         <span class="material-symbols-outlined ${deleteIconSize}">delete</span>
       </button>`
    : '';
  const isPanel = variant === 'panel';
  const isFloating = variant === 'floating';
  const sizeClass = isPanel ? 'w-[260px] h-[95px] flex-shrink-0' : isFloating ? 'w-full min-h-[160px] flex-shrink-0 rounded-lg overflow-hidden' : 'bottom-section-tile w-[12.5rem] min-w-[12.5rem] aspect-square flex-shrink-0';
  const padClass = isFloating ? 'p-6' : 'p-2';
  const symbolClass = isPanel ? 'font-bold text-sm' : isFloating ? 'font-bold text-xl' : 'font-bold text-sm';
  const tileClass = !isPanel && !isFloating ? ' widget-tile-card cursor-pointer hover:border-primary/40 transition-colors' : '';
  const tileDataAttr = !isPanel && !isFloating ? ` data-widget-id="${String(deleteId).replace(/"/g, '&quot;')}"` : '';
  return `
    <div class="group relative ${sizeClass} rounded overflow-hidden border-2 ${colorClass}${tileClass}"${tileDataAttr}>
      <div class="absolute inset-0 bg-gradient-to-br from-white/60 to-white/30 dark:from-black/20 dark:to-black/40 pointer-events-none"></div>
      ${deleteBtn}
      <div class="relative ${padClass} flex flex-col justify-between h-full z-[1]">
        <div class="relative z-10">
          <div class="${isPanel ? 'text-xs' : isFloating ? 'text-sm' : 'text-[10px]'} text-slate-600 dark:text-slate-400 font-medium">Stock</div>
          <div class="${symbolClass} text-slate-800 dark:text-white">${(w.symbol || w.name || '—').toString().replace(/</g, '&lt;')}</div>
          <div class="${isPanel ? 'text-sm' : isFloating ? 'text-lg' : 'text-xs'} ${textColorClass} font-semibold mt-0.5">${priceStr} · ${changeStr}</div>
          <div class="${isFloating ? 'text-sm' : 'text-[10px]'} text-slate-500 dark:text-slate-400 mt-0.5">${durationLabel}</div>
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
  wireConfigOverlaySwipeToClose(overlay, closeResume);
}

const TOOLTIP_BOTTOM_DISMISSED_KEY = 'osiris_tooltip_bottom_dismissed';

function initTooltipBottom() {
  const tooltip = document.getElementById('tooltip-bottom');
  const closeBtn = document.getElementById('tooltip-bottom-close');
  const target = document.getElementById('bottom-panel-toggle');
  const video = document.getElementById('tooltip-bottom-video');
  if (!tooltip || !target) return;

  if (video) {
    const wrap = video.parentElement;
    const skeleton = wrap?.querySelector('.tooltip-video-skeleton');
    const fallback = wrap?.querySelector('.tooltip-video-fallback');
    const rawPath = video.getAttribute('data-src') || 'assets/Tooltip_content/Tooltip_content_bottom.mp4';
    const src = rawPath + (rawPath.includes('?') ? '&' : '?') + '_=' + Date.now();
    video.src = src;

    video.addEventListener('error', () => {
      skeleton?.classList.add('hidden');
      video.classList.add('hidden');
      fallback?.classList.remove('hidden');
    });

    video.addEventListener('loadedmetadata', () => {
      if (wrap && video.videoWidth > 0 && video.videoHeight > 0) {
        wrap.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight;
      }
    });

    video.addEventListener('canplay', () => {
      skeleton?.classList.add('hidden');
      video.classList.remove('hidden');
      fallback?.classList.add('hidden');
    });
  }

  function isDesktop() {
    return typeof window !== 'undefined' && window.innerWidth >= 768;
  }

  function positionTooltip() {
    if (!isDesktop()) return;
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const spacing = 16;
    const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    const top = rect.top - tooltipRect.height - spacing;
    tooltip.style.left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8)) + 'px';
    tooltip.style.top = top + 'px';
  }

  function showTooltip() {
    if (!isDesktop()) return;
    tooltip.classList.add('tooltip-bottom-visible');
    tooltip.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      positionTooltip();
      if (video) video.play().catch(() => {});
    });
  }

  function hideTooltip() {
    tooltip.classList.remove('tooltip-bottom-visible');
    tooltip.setAttribute('aria-hidden', 'true');
    if (video) video.pause();
  }

  closeBtn?.addEventListener('click', hideTooltip);

  target.addEventListener('click', () => {
    if (tooltip.classList.contains('tooltip-bottom-visible')) hideTooltip();
  });

  window.addEventListener('resize', () => {
    if (tooltip.classList.contains('tooltip-bottom-visible')) positionTooltip();
  });

  document.addEventListener('osiris-gate-zoom-complete', () => {
    if (isDesktop()) showTooltip();
  });
}

window.initMapApp = initMapApp;
window.initBottomPanel = initBottomPanel;
window.initTooltipBottom = initTooltipBottom;
window.initResumeEmbed = initResumeEmbed;
window.initWeatherWidgetConfig = initWeatherWidgetConfig;
