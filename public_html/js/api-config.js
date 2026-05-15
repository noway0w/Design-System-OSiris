// OSiris Users API base URL (no trailing slash)
// '' = same origin → root-absolute paths (/api/..., /points-of-interest.php) so SPAs work under /map-app/ etc.
window.OSIRIS_API_URL = (typeof window.OSIRIS_API_URL !== 'undefined' ? window.OSIRIS_API_URL : null) ?? '';

(function () {
  function originPath(rel) {
    const r = rel.replace(/^\//, '');
    const base = typeof window.OSIRIS_API_URL === 'string' ? window.OSIRIS_API_URL.trim() : '';
    if (base) {
      return base.replace(/\/$/, '') + '/' + r;
    }
    return '/' + r;
  }

  window.getPointsOfInterestUrl = function () {
    return originPath('points-of-interest.php');
  };

  window.getProjectsContentUrl = function () {
    return originPath('projects-content.php');
  };

  window.getWeatherUrl = function () {
    return originPath('weather.php');
  };

  window.getCityImageUrl = function () {
    return originPath('city-image.php');
  };

  window.resolveCityImageUrl = function (path) {
    if (!path || typeof path !== 'string') return '';
    const base = window.OSIRIS_API_URL || '';
    if (base) {
      const clean = path.replace(/^\//, '');
      return base.replace(/\/$/, '') + '/' + clean;
    }
    if (/^https?:\/\//i.test(path)) return path;
    try {
      return new URL(path.replace(/^\//, ''), window.location.origin + '/').href;
    } catch (_) {
      return path.startsWith('/') ? path : '/' + path.replace(/^\//, '');
    }
  };

  /** Root-absolute URL for static assets (pict/, projects/, uploads/, brand/, …) under /map-app/ etc. */
  window.resolvePublicAssetUrl = window.resolveCityImageUrl;

  window.getUsersWidgetsUrl = function () {
    return originPath('users-widgets.php');
  };

  window.getStockUrl = function () {
    return originPath('stock.php');
  };

  window.getProfilePictureUploadUrl = function () {
    return originPath('api/profile-picture-upload.php');
  };

  window.getProfilePictureUpdateUrl = function () {
    return originPath('api/users-profile-picture.php');
  };

  window.getCityImageBatchUrl = function () {
    return originPath('city-image-batch.php');
  };

  window.getUsersMeUrl = function () {
    return originPath('api/users-me.php');
  };

  window.getCadFilesUrl = function () {
    return originPath('api/cad-files.php');
  };

  window.getCfdControlUrl = function () {
    if (typeof window.CFD_CONTROL_API === 'string' && window.CFD_CONTROL_API) {
      return window.CFD_CONTROL_API.replace(/\/$/, '') + '/api/cfd-control.php';
    }
    return originPath('api/cfd-control.php');
  };

  window.getCfdProxyUrl = function () {
    if (typeof window.CFD_PROXY_URL === 'string' && window.CFD_PROXY_URL) {
      return window.CFD_PROXY_URL.replace(/\/$/, '');
    }
    return originPath('api/cfd-proxy.php');
  };

  window.getRecommendationsUrl = function () {
    return originPath('recommendations.json');
  };
})();
