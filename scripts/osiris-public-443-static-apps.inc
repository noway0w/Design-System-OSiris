# Snippet for osiris.guillaumelassiat.com (no PHP-FPM on 443).
# Paste inside server { } in /etc/nginx/conf.d/osiris-osirisws-443.conf BEFORE `location /`.
# Top bar: platform-shell-topbar.js in iris/index.html and carscan/index.html.

location = /iris {
    return 301 /iris/;
}

location = /iris/index.php {
    return 301 /iris/;
}

location ^~ /iris/ {
    index index.html;
    try_files $uri $uri/ /iris/index.html;
}

location = /carscan {
    return 301 /carscan/;
}

location = /carscan/index.php {
    return 301 /carscan/;
}

location ^~ /carscan/ {
    index index.html;
    try_files $uri $uri/ /carscan/index.html;
}

location ~* ^/carscan/.*\.(py|pth|pt|pkl|onnx|sh|log)$ {
    deny all;
    return 404;
}
