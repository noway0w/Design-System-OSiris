# VPS PHP Setup (82.165.170.76)

The PHP API runs **on the VPS**; users’ browsers only consume the data (GET list, GET register). If PHP is not executing, you’ll see raw `<?php` source instead of JSON.

## Quick check

From any machine:
```bash
curl -s http://82.165.170.76/api/debug-users.php
```

- **Good**: JSON like `{"dbPath":"...","dbExists":false,"count":0,...}`
- **Bad**: Raw PHP source

---

## Nginx is on port 80 (not Apache)

Your VPS uses **nginx**. Configure it to run PHP:

```bash
sudo bash /home/OSiris/scripts/setup-nginx-php.sh
```

Or manually:
1. `sudo cp /home/OSiris/scripts/osiris-nginx.conf /etc/nginx/conf.d/osiris.conf`
2. Adjust `root` in the config if your project path differs
3. `sudo nginx -t && sudo systemctl reload nginx`
4. `sudo systemctl enable --now php-fpm`
5. Test: `curl -s http://127.0.0.1/api/debug-users.php`

---

## Still seeing raw PHP? (RHEL 9 - Apache)

RHEL 9 uses **php-fpm**; Apache must proxy `.php` requests to it.

**Option A – Use project config**
```bash
sudo cp /home/OSiris/scripts/osiris-httpd.conf /etc/httpd/conf.d/osiris.conf
# Check socket: grep '^listen =' /etc/php-fpm.d/www.conf
sudo systemctl enable --now php-fpm
sudo systemctl restart httpd
curl -s http://127.0.0.1/api/debug-users.php
```

**Option B – Copy to default docroot** (avoids SELinux/symlink issues)
```bash
sudo bash /home/OSiris/scripts/fix-httpd-vps.sh
# Or manually:
# sudo rm -rf /var/www/html && sudo mkdir -p /var/www/html
# sudo cp -a /home/OSiris/public_html/. /var/www/html/
# sudo chown -R apache:apache /var/www/html
# sudo chmod 775 /var/www/html/api
# sudo chcon -R -t httpd_sys_content_t /var/www/html
# sudo systemctl restart httpd
```

---

## On the VPS (SSH in)

**1. Check PHP**
```bash
php -v
# If missing:
#   RHEL/Rocky/AlmaLinux (dnf): sudo dnf install php php-fpm php-pdo php-sqlite3
#   Debian/Ubuntu (apt):        sudo apt install php php-fpm php-sqlite3
```

**2. Find document root** (where `public_html` is served from)
```bash
# Common locations:
ls -la /var/www/html/
# or
ls -la /home/*/public_html/
```

**3. Ensure your site’s document root includes** `public_html/api/*.php`

**4. Configure the web server**

### Apache
```bash
# RHEL/Rocky/AlmaLinux:
sudo dnf install httpd php php-fpm php-pdo php-sqlite3 -y
sudo systemctl enable --now httpd

# Debian/Ubuntu:
sudo a2enmod php* rewrite
sudo systemctl restart apache2
```

Site config must have `AllowOverride All` for the directory containing `public_html`.

### Nginx + PHP-FPM
Add to your server block (`/etc/nginx/sites-available/default` or your site):

```nginx
server {
    listen 80;
    server_name 82.165.170.76;
    root /var/www/html/public_html;   # adjust to your path
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
# RHEL/Rocky: sudo systemctl start php-fpm
# Debian:     sudo systemctl start php*-fpm
```

**5. Test from VPS**
```bash
curl -s http://127.0.0.1/api/debug-users.php
```

Should return JSON. Then test from outside: `curl -s http://82.165.170.76/api/debug-users.php`

---

## Optional: run the project check script on the VPS

```bash
# Copy check-php-vps.sh to the VPS, then:
bash check-php-vps.sh /var/www/html
```
