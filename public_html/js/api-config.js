// OSiris Users API base URL (no trailing slash)
// '' = same origin → api/users.php, api/users-register.php, api/users-clear.php
window.OSIRIS_API_URL = (typeof window.OSIRIS_API_URL !== 'undefined' ? window.OSIRIS_API_URL : null) ?? '';

// Points of Interest API URL
window.getPointsOfInterestUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  return base ? `${base}/points-of-interest.php` : 'points-of-interest.php';
};

// Weather API URL
window.getWeatherUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  return base ? `${base}/weather.php` : 'weather.php';
};

// City image API URL
window.getCityImageUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  return base ? `${base}/city-image.php` : 'city-image.php';
};

// Resolve city image path to absolute URL (for background-image in CSS)
window.resolveCityImageUrl = function (path) {
  if (!path || typeof path !== 'string') return '';
  const base = window.OSIRIS_API_URL || '';
  if (base) {
    const clean = path.replace(/^\//, '');
    return (base.replace(/\/$/, '') + '/' + clean);
  }
  try {
    return new URL(path, window.location.href).href;
  } catch (_) {
    return path;
  }
};

// Users widgets API URL
window.getUsersWidgetsUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  if (base) return `${base.replace(/\/$/, '')}/users-widgets.php`;
  try {
    return new URL('users-widgets.php', window.location.href).href;
  } catch (_) {
    return 'users-widgets.php';
  }
};

// Stock API URL
window.getStockUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  return base ? `${base}/stock.php` : 'stock.php';
};

// Profile picture upload API URL
window.getProfilePictureUploadUrl = function () {
  const base = typeof window.OSIRIS_API_URL === 'string' ? window.OSIRIS_API_URL : '';
  return base ? `${base.replace(/\/$/, '')}/api/profile-picture-upload.php` : 'api/profile-picture-upload.php';
};

// Profile picture update API URL
window.getProfilePictureUpdateUrl = function () {
  const base = typeof window.OSIRIS_API_URL === 'string' ? window.OSIRIS_API_URL : '';
  return base ? `${base.replace(/\/$/, '')}/api/users-profile-picture.php` : 'api/users-profile-picture.php';
};
