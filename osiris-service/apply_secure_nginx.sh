#!/bin/bash
# Script pour appliquer la configuration nginx sécurisée

echo "🔒 Application de la configuration nginx sécurisée..."

# Copier la configuration sécurisée
sudo cp /home/OSiris/update_nginx_config_secure.txt /etc/nginx/conf.d/osiris-osirisws-443.conf

# Vérifier la configuration
echo "🔍 Vérification de la configuration nginx..."
if sudo nginx -t; then
    echo "✅ Configuration valide"
    echo "🔄 Rechargement de nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx rechargé avec succès"
    echo ""
    echo "🔒 Sécurité améliorée :"
    echo "   - Répertoire web root: /home/OSiris/public_html"
    echo "   - Fichiers sensibles bloqués (.git, .py, .log, etc.)"
    echo "   - Seul index.html est accessible publiquement"
else
    echo "❌ ERREUR dans la configuration nginx"
    exit 1
fi
