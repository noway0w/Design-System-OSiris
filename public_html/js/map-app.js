/* OSiris Map App - Live Tracking Map Dashboard with IP + GPS */

let appMap = null;
let currentLocationMarker = null;
let userTileMarkers = [];
let globeRotationEnabled = false;
let globeRotationState = 'off'; // 'off' | 'easing-in' | 'running' | 'easing-out'

const HEARTBEAT_MS = 5000;
const AVATARS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBG5IuiIYOXTdp9w8Vqvy75n_LNueDKuBEFzWHEYR4vSNtKmFljOZOYwulNtCGOug88kKgckeXLAbn9bEYo_BCTkxRd4FW-veTWSJmknwOCDw-aoUeYmVDY6fBmmw9TgbldUHC9sqgC58vI_jDVHNCM2ExvKeip3bD-Ff54JwgPjI0927i2MvXNNoijP9MAADijzTJH3SDAKttVxNt-k303UIeUbdqqOlPV432j-VzHpWa_pd9BO4PSBzhc_ySy1EqEsqmV6ByptYw',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAPy7qTrwvb0VVlIC4AUXxu9oKHw1tTdcEK0xLkt_rafxpY8Q5vToM_97fe11fu3YdtVcgOSaHDhvHENwLIUWdcYa1z6fN_7yDLNallyS8GQpbCVKvRhq2TeqH5giXjNxNtxi55QRNrh2opNAEO5jMw1G_Hlo84OPSE_QiTZrrEGU53N6DB-bHImedXVE6qD4A5DErmaCsw3JiPJUTA8qxImYIK2t0mc0eeHwEK_sVwuecL0CKE--Pq2JQhk1us0B4hdPoQI61dye4',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDaldXINzAN1Fx_a7e4Iy4567-I05RjeUkU8oVLpQMAbITvEaxY7zeyfpDOTvrsnSx5o55osuO_dXUOxBz_iF_GPJz7nfoxQi2cIS9fVp8Mpm5gCVS4dluRnAVk-Cp3fP3gNu-RelI-8m0A2aA_pvkXyosiDDuRw8dgo1BVIfGMuzkLjv8eejWl-KN5hUwL-QXrJagvHaqNcYChw-jgp209aYCH4HPaP9QSwLp0LdZuwobK2ZJslE2-yJ3h2P6jViZ8doL-7uN3ANo',
  'https://i.pravatar.cc/150?u=marie',
  'https://i.pravatar.cc/150?u=james',
  'https://i.pravatar.cc/150?u=kenji'
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
    const borderClass = isActive ? 'border-primary/30' : 'border-white/5';
    const imgBorder = isActive ? 'border-primary' : 'border-transparent';
    const imgClass = isActive ? '' : 'grayscale group-hover:grayscale-0 transition-all';
    const cardClass = hasLocation ? 'cursor-pointer hover:border-primary/50 transition-colors' : '';
    const dataAttr = hasLocation ? `data-user-tile="${tile.name}"` : '';
    const fadeClass = previousUserNames.has(tile.name) ? '' : ' tile-fade-in';
    html += `
      <div ${dataAttr} class="w-48 bg-card-dark p-3 rounded-2xl border ${borderClass} flex flex-col gap-3 relative overflow-hidden group ${cardClass}${fadeClass}">
        <div class="absolute top-0 right-0 p-3">
          <div class="w-2.5 h-2.5 ${dotClass}"></div>
        </div>
        <div class="w-14 h-14 rounded-full border-2 ${imgBorder} p-0.5 ${imgClass}">
          <img alt="${tile.name}" class="w-full h-full object-cover rounded-full" src="${tile.avatar}"/>
        </div>
        <div>
          <h3 class="text-white font-bold text-base leading-tight">${tile.name}</h3>
          <div class="flex items-center gap-1 mt-1 ${iconClass} text-sm ${isActive ? 'font-medium' : ''}">
            <span class="material-symbols-outlined text-[16px]">${isActive ? 'near_me' : 'location_on'}</span>
            <span>${subtext}</span>
          </div>
        </div>
      </div>`;
  });

  html += `
    <button id="nearby-clear-all" type="button" class="w-48 bg-card-dark/50 hover:bg-card-dark/80 p-3 rounded-2xl border border-white/5 flex flex-col gap-3 items-center justify-center transition-colors cursor-pointer" title="Clear all visitor tiles">
      <span class="material-symbols-outlined text-3xl text-text-secondary">delete</span>
      <span class="text-text-secondary text-sm font-medium">Clear all</span>
    </button>`;

  previousUserNames = newNames;
  container.innerHTML = html;
  if (countEl) {
    countEl.textContent = apiMisconfigured && total === 0
      ? 'Nearby Friends needs PHP enabled on server'
      : total === 0 ? 'No users yet' : `${total} user${total === 1 ? '' : 's'} worldwide`;
  }

  document.getElementById('nearby-clear-all')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await clearAllUsers();
    const users = await fetchUsers();
    const tiles = toTiles(users);
    addUserTileMarkers(tiles);
    renderNearbyTiles(tiles);
    if (countEl) countEl.textContent = 'No users yet';
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
    setMapPadding(true);
    LocationService.getIPLocation().then(async (loc) => {
      if (loc) {
        flyToLocation(loc.lng, loc.lat, 10);
        addCurrentLocationMarker(loc.lng, loc.lat);
      }
      await registerUser(loc || {});
      await refreshNearby();
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
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>${tile.name}</strong><br>${tile.city || ''}`))
      .addTo(appMap);
    userTileMarkers.push(marker);
  });
}

const ZOOM_ANIMATION_MS = 1200;

function wireUserTileCards() {
  const container = document.getElementById('nearby-friends-tiles');
  container?.addEventListener('click', (e) => {
    const el = e.target.closest('[data-user-tile]');
    if (!el || !appMap) return;
    const name = el.getAttribute('data-user-tile');
    const tile = currentTiles.find((t) => t.name === name);
    if (tile && tile.lat != null && tile.lng != null) {
      flyToLocation(tile.lng, tile.lat, 14);
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
  document.getElementById('map-gps')?.addEventListener('click', () => {
    LocationService.getGPSLocation()
      .then((loc) => {
        flyToLocation(loc.lng, loc.lat, 14);
        addCurrentLocationMarker(loc.lng, loc.lat);
        document.getElementById('gps-status-btn')?.querySelector('span:last-child')?.setAttribute('class', 'text-xs font-semibold tracking-wide text-white');
      })
      .catch(() => alert('Could not get GPS location. Check permissions.'));
  });
}

const BOTTOM_SHEET_EXPANDED_PX = 400;
const BOTTOM_SHEET_COLLAPSED_PX = 40;
const TRANSITION_MS = 300;

function setMapPadding(expanded) {
  /* No bottom padding when expanded: avoids globe/atmosphere dissociation artifact */
  const bottom = expanded ? 0 : BOTTOM_SHEET_COLLAPSED_PX;
  if (appMap) appMap.setPadding({ top: 0, right: 0, bottom, left: 0 });
  document.getElementById('map-gradient-overlay')?.classList.toggle('opacity-0', expanded);
}

function flyToLocation(lng, lat, zoom) {
  if (!appMap) return;
  const expanded = document.getElementById('bottom-sheet-toggle')?.getAttribute('aria-expanded') === 'true';
  const bottom = expanded ? 0 : BOTTOM_SHEET_COLLAPSED_PX;
  appMap.flyTo({
    center: [lng, lat],
    zoom,
    padding: { top: 0, right: 0, bottom, left: 0 },
    duration: 4000
  });
}

const PEEK_HEIGHT = '80px';

function initBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  const toggle = document.getElementById('bottom-sheet-toggle');
  const content = document.getElementById('bottom-sheet-content');
  if (!sheet || !toggle || !content) return;

  const EXPANDED_HEIGHT = '380px';

  function isExpanded() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function setContentHeight(height) {
    content.style.maxHeight = height;
  }

  sheet.addEventListener('click', (e) => {
    const expanded = isExpanded();
    if (!expanded) {
      toggle.setAttribute('aria-expanded', 'true');
      setContentHeight(EXPANDED_HEIGHT);
      setMapPadding(false);
      appMap?.resize();
      setTimeout(() => appMap?.resize(), TRANSITION_MS);
    } else if (toggle.contains(e.target)) {
      toggle.setAttribute('aria-expanded', 'false');
      setContentHeight('0');
      setMapPadding(true);
      appMap?.resize();
      setTimeout(() => appMap?.resize(), TRANSITION_MS);
    }
  });

  sheet.addEventListener('mouseenter', () => {
    if (!isExpanded()) setContentHeight(PEEK_HEIGHT);
  });

  sheet.addEventListener('mouseleave', () => {
    if (!isExpanded()) setContentHeight('0');
  });

  content.style.maxHeight = EXPANDED_HEIGHT;
  setMapPadding(true);
}

window.initMapApp = initMapApp;
window.initBottomSheet = initBottomSheet;
