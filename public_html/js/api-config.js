// OSiris Users API base URL (no trailing slash)
// '' = same origin → api/users.php, api/users-register.php, api/users-clear.php
window.OSIRIS_API_URL = (typeof window.OSIRIS_API_URL !== 'undefined' ? window.OSIRIS_API_URL : null) ?? '';

// Points of Interest API URL
window.getPointsOfInterestUrl = function () {
  const base = window.OSIRIS_API_URL || '';
  return base ? `${base}/points-of-interest.php` : 'points-of-interest.php';
};
