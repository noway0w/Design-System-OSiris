/**
 * CFD sidecar server URL. Default 8090.
 * When page is HTTPS or not localhost, use CFD_PROXY_URL instead (proxy avoids mixed content / Private Network Access).
 */
window.CFD_SERVER = window.CFD_SERVER || 'http://localhost:8090';

/**
 * CFD proxy URL. When set, all CFD requests (health, run-cfd, streamlines) go through this proxy.
 * Auto-used when page is HTTPS or host is not localhost.
 */
window.CFD_PROXY_URL = window.CFD_PROXY_URL || '';

/**
 * CFD control API base URL. Empty = same-origin (../api/cfd-control.php).
 * Used for Start/Stop sidecar from the browser (local dev only).
 */
window.CFD_CONTROL_API = window.CFD_CONTROL_API || '';
