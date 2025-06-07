#!/bin/bash

# Script pour servir les fichiers d'installation via HTTP
# La VM pourra télécharger les scripts avec curl/wget

print_info() {
    echo -e "\033[0;34mℹ️  $1\033[0m"
}

print_success() {
    echo -e "\033[0;32m✅ $1\033[0m"
}

print_info "🌐 Démarrage du serveur web local pour la VM..."

# Créer un répertoire temporaire pour les fichiers
mkdir -p ./vm-files

# Copier les scripts d'installation
cp nixos-install-simple.sh ./vm-files/
cp install-nixos-vm.sh ./vm-files/ 2>/dev/null || true
cp configuration.nix ./vm-files/ 2>/dev/null || true
cp deploy_nixos.sh ./vm-files/ 2>/dev/null || true

# Créer une page d'index
cat > ./vm-files/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Scripts NixOS VM</title></head>
<body>
<h1>Scripts d'installation NixOS</h1>
<ul>
<li><a href="nixos-install-simple.sh">nixos-install-simple.sh</a> - Script d'installation</li>
<li><a href="configuration.nix">configuration.nix</a> - Configuration NixOS</li>
<li><a href="deploy_nixos.sh">deploy_nixos.sh</a> - Script de déploiement</li>
</ul>
<h2>Dans la VM NixOS :</h2>
<pre>
# Télécharger et exécuter l'installation
curl -O http://IP_MAC:8000/nixos-install-simple.sh
chmod +x nixos-install-simple.sh
sudo ./nixos-install-simple.sh
</pre>
</body>
</html>
EOF

# Obtenir l'IP locale
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

print_success "Serveur web prêt !"
print_info "IP du Mac : $LOCAL_IP"
echo ""
echo "📋 Dans la VM NixOS, tapez :"
echo "curl -O http://$LOCAL_IP:8000/nixos-install-simple.sh"
echo "chmod +x nixos-install-simple.sh"  
echo "sudo ./nixos-install-simple.sh"
echo ""
print_info "🌐 Interface web : http://$LOCAL_IP:8000"
echo ""
print_info "Appuyez sur Ctrl+C pour arrêter le serveur"

# Démarrer le serveur web Python
cd vm-files
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8000
else
    print_info "Démarrage avec Node.js..."
    npx http-server -p 8000
fi 