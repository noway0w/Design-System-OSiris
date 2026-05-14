# OSiris platform: nginx auth_request + PHP session (auth-verify.php).
# Include inside `server { ... }` after `root` / `index` (see app-guillaumelassiat-nginx.conf).
# Does NOT modify /osiris-ws, /osiris-manage-ws, or /api/carscan/ws.
#
# Deploy: ensure this path is readable by nginx, then `nginx -t && reload`.

location = /_internal_platform_auth {
    internal;
    include fastcgi_params;
    # So PHP sees TLS (Secure session cookies) and forwards the browser Cookie on auth_request.
    fastcgi_param HTTPS $https;
    fastcgi_param HTTP_X_FORWARDED_PROTO $scheme;
    fastcgi_param HTTP_COOKIE $http_cookie;
    fastcgi_param SCRIPT_FILENAME /home/OSiris/public_html/api/auth-verify.php;
    fastcgi_param REQUEST_URI /api/auth-verify.php;
    fastcgi_param DOCUMENT_URI /api/auth-verify.php;
    fastcgi_param HTTP_X_ORIGINAL_URI $request_uri;
    fastcgi_pass unix:/run/php-fpm/www.sock;
}

location ^~ /map-app/ {
    auth_request /_internal_platform_auth;
    error_page 401 =302 /login/?next=$request_uri;
    try_files $uri $uri/ /map-app/index.html;
}

location ^~ /iris/ {
    auth_request /_internal_platform_auth;
    error_page 401 =302 /login/?next=$request_uri;
    try_files $uri $uri/ /iris/index.html;
}

location ^~ /carscan/ {
    auth_request /_internal_platform_auth;
    error_page 401 =302 /login/?next=$request_uri;
    try_files $uri $uri/ /carscan/index.html;
}

location ^~ /disable/ {
    auth_request /_internal_platform_auth;
    error_page 401 =302 /login/?next=$request_uri;
    try_files $uri $uri/ /disable/index.html;
}

location = /3Dobjscan {
    return 301 /3Dobjscan/;
}

location ^~ /3Dobjscan/ {
    auth_request /_internal_platform_auth;
    error_page 401 =302 /login/?next=$request_uri;
    try_files $uri $uri/ /3Dobjscan/index.html;
}

# Dashboard HTML is a static shell; user/session checks run in /api/get_user_dashboard.php.
# Skipping auth_request here avoids nginx→php-fpm auth subrequests that can miss the session
# cookie right after OAuth (race with session_regenerate_id / SameSite).
location ^~ /dashboard/ {
    try_files $uri $uri/ /dashboard/index.html;
}
