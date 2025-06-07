#!/bin/bash

# Script pour installer NixOS dans une VM sur macOS
# Utilise UTM (meilleur pour Mac Silicon) ou Parallels

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info "=== ❄️ Installation NixOS VM sur macOS ==="

# Détecter l'architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    print_info "🔥 Mac Apple Silicon (M1/M2/M3) détecté"
    IS_APPLE_SILICON=true
else
    print_info "💻 Mac Intel détecté"
    IS_APPLE_SILICON=false
fi

# 1. Choisir la solution de virtualisation
print_info "=== 🖥️ Options de Virtualisation ==="

echo "Choisissez votre solution de virtualisation:"
echo "1. UTM (Gratuit, recommandé pour Apple Silicon)"
echo "2. Parallels Desktop (Payant, excellent)"
echo "3. VirtualBox (Gratuit, mieux pour Intel)"
echo "4. Docker avec NixOS (Léger, mais limité)"

read -p "Votre choix (1-4): " VM_CHOICE

case $VM_CHOICE in
    1)
        print_info "🚀 Installation avec UTM"
        VM_TYPE="utm"
        ;;
    2)
        print_info "💼 Installation avec Parallels"
        VM_TYPE="parallels"
        ;;
    3)
        print_info "📦 Installation avec VirtualBox"
        VM_TYPE="virtualbox"
        ;;
    4)
        print_info "🐳 Installation avec Docker"
        VM_TYPE="docker"
        ;;
    *)
        print_error "Choix invalide"
        exit 1
        ;;
esac

# 2. Installation de l'hyperviseur
install_utm() {
    print_info "Installation d'UTM..."
    
    if [ -d "/Applications/UTM.app" ]; then
        print_success "UTM déjà installé"
    else
        if command -v brew &> /dev/null; then
            brew install --cask utm
            print_success "UTM installé via Homebrew"
        else
            print_info "Téléchargez UTM depuis: https://mac.getutm.app/"
            print_info "Ou depuis l'App Store (version payante mais identique)"
            read -p "Appuyez sur Entrée quand UTM est installé..."
        fi
    fi
}

install_parallels() {
    print_info "Vérification de Parallels Desktop..."
    
    if [ -d "/Applications/Parallels Desktop.app" ]; then
        print_success "Parallels Desktop trouvé"
    else
        print_warning "Parallels Desktop non trouvé"
        print_info "Téléchargez depuis: https://www.parallels.com/"
        print_info "Version d'essai disponible"
        read -p "Appuyez sur Entrée quand Parallels est installé..."
    fi
}

install_virtualbox() {
    print_info "Installation de VirtualBox..."
    
    if command -v VBoxManage &> /dev/null; then
        print_success "VirtualBox déjà installé"
    else
        if command -v brew &> /dev/null; then
            brew install --cask virtualbox
            print_success "VirtualBox installé"
        else
            print_info "Téléchargez VirtualBox depuis: https://www.virtualbox.org/"
            read -p "Appuyez sur Entrée quand VirtualBox est installé..."
        fi
    fi
}

setup_docker_nixos() {
    print_info "Configuration Docker avec NixOS..."
    
    # Créer un Dockerfile NixOS
    cat > ./Dockerfile.nixos << 'EOF'
FROM nixos/nix:latest

# Installer les packages nécessaires
RUN nix-env -iA nixpkgs.git nixpkgs.nodejs_20 nixpkgs.ffmpeg-full \
    nixpkgs.v4l-utils nixpkgs.pulseaudio nixpkgs.curl

# Copier la configuration
COPY . /app
WORKDIR /app

# Script d'entrée
CMD ["bash", "-c", "echo 'NixOS Docker prêt' && /bin/bash"]
EOF

    # Créer docker-compose pour NixOS
    cat > ./docker-compose.nixos.yml << 'EOF'
version: '3.8'
services:
  nixos-bot:
    build:
      context: .
      dockerfile: Dockerfile.nixos
    volumes:
      - .:/app
      - /tmp/.X11-unix:/tmp/.X11-unix:rw
    environment:
      - DISPLAY=${DISPLAY}
    devices:
      - /dev/snd:/dev/snd
    network_mode: host
    stdin_open: true
    tty: true
EOF

    print_success "Configuration Docker NixOS créée"
    print_info "Démarrage avec: docker-compose -f docker-compose.nixos.yml up"
    return
}

# Installation selon le choix
case $VM_TYPE in
    "utm")
        install_utm
        ;;
    "parallels")
        install_parallels
        ;;
    "virtualbox")
        install_virtualbox
        ;;
    "docker")
        setup_docker_nixos
        return
        ;;
esac

# 3. Télécharger l'ISO NixOS
print_info "=== 💾 Téléchargement NixOS ISO ==="

NIXOS_VERSION="23.11"
if [[ "$IS_APPLE_SILICON" == true ]]; then
    NIXOS_ISO="nixos-minimal-${NIXOS_VERSION}.aarch64-linux.iso"
    NIXOS_URL="https://channels.nixos.org/nixos-${NIXOS_VERSION}/latest-nixos-minimal-aarch64-linux.iso"
else
    NIXOS_ISO="nixos-minimal-${NIXOS_VERSION}.x86_64-linux.iso"
    NIXOS_URL="https://channels.nixos.org/nixos-${NIXOS_VERSION}/latest-nixos-minimal-x86_64-linux.iso"
fi

if [ ! -f "$NIXOS_ISO" ]; then
    print_info "Téléchargement de $NIXOS_ISO..."
    curl -L -o "$NIXOS_ISO" "$NIXOS_URL"
    print_success "ISO téléchargé: $NIXOS_ISO"
else
    print_success "ISO déjà téléchargé: $NIXOS_ISO"
fi

# 4. Instructions de configuration VM
print_info "=== 🛠️ Configuration de la VM ==="

case $VM_TYPE in
    "utm")
        print_info "Configuration UTM:"
        echo "1. 🚀 Ouvrez UTM"
        echo "2. ➕ Cliquez sur '+' pour créer une nouvelle VM"
        echo "3. 🐧 Choisissez 'Virtualize' puis 'Linux'"
        echo "4. 📀 Sélectionnez l'ISO: $NIXOS_ISO"
        echo "5. 💾 RAM: 4GB minimum (8GB recommandé)"
        echo "6. 💿 Stockage: 20GB minimum"
        echo "7. ✅ Créez et démarrez la VM"
        ;;
    "parallels")
        print_info "Configuration Parallels:"
        echo "1. 🚀 Ouvrez Parallels Desktop"
        echo "2. ➕ Créez une nouvelle VM"
        echo "3. 📀 Installez depuis l'ISO: $NIXOS_ISO"
        echo "4. 💾 RAM: 4GB minimum (8GB recommandé)"
        echo "5. 💿 Stockage: 20GB minimum"
        echo "6. ✅ Lancez l'installation"
        ;;
    "virtualbox")
        print_info "Configuration VirtualBox:"
        echo "1. 🚀 Ouvrez VirtualBox"
        echo "2. ➕ Nouvelle machine virtuelle"
        echo "3. 🐧 Type: Linux, Version: Other Linux (64-bit)"
        echo "4. 💾 RAM: 4GB minimum"
        echo "5. 💿 Disque dur: 20GB"
        echo "6. 📀 Montez l'ISO: $NIXOS_ISO"
        echo "7. ✅ Démarrez l'installation"
        ;;
esac

# 5. Configuration NixOS automatique
print_info "=== ⚙️ Configuration NixOS dans la VM ==="

# Créer un script de configuration NixOS à copier dans la VM
cat > ./nixos-vm-configuration.nix << 'EOF'
# Configuration NixOS optimisée pour VM macOS
{ config, pkgs, ... }:

{
  imports = [ ./hardware-configuration.nix ];

  # Boot
  boot.loader.grub.enable = true;
  boot.loader.grub.device = "/dev/sda";

  # Réseau
  networking.hostName = "nixos-meetbot";
  networking.networkmanager.enable = true;

  # Utilisateur
  users.users.meetbot = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" "video" "audio" ];
    initialPassword = "meetbot";
  };

  # Packages système
  environment.systemPackages = with pkgs; [
    git vim curl wget nodejs_20 ffmpeg-full
    v4l-utils pulseaudio alsa-utils
  ];

  # SSH pour accès depuis macOS
  services.openssh.enable = true;
  services.openssh.settings.PasswordAuthentication = true;

  # Audio/Vidéo virtuels
  boot.kernelModules = [ "v4l2loopback" "snd-aloop" ];
  boot.extraModulePackages = with config.boot.kernelPackages; [ v4l2loopback ];

  # Services
  services.pulseaudio.enable = true;
  services.pulseaudio.systemWide = true;

  system.stateVersion = "23.11";
}
EOF

# Script d'installation automatique
cat > ./install-nixos-vm.sh << 'EOF'
#!/bin/bash
# Script à exécuter DANS la VM NixOS

set -e

echo "🛠️ Installation automatique NixOS pour Meet Teams Bot"

# Partitionnement automatique
echo "💾 Partitionnement du disque..."
parted /dev/sda -- mklabel msdos
parted /dev/sda -- mkpart primary 1MiB -8GiB
parted /dev/sda -- mkpart primary linux-swap -8GiB 100%

# Formatage
mkfs.ext4 -L nixos /dev/sda1
mkswap -L swap /dev/sda2
swapon /dev/sda2

# Montage
mount /dev/disk/by-label/nixos /mnt

# Génération de la configuration
nixos-generate-config --root /mnt

# Copie de notre configuration
curl -o /mnt/etc/nixos/configuration.nix https://raw.githubusercontent.com/votre-repo/nixos-vm-configuration.nix

# Installation
nixos-install

echo "✅ Installation terminée !"
echo "Redémarrez avec: reboot"
EOF

chmod +x ./install-nixos-vm.sh

print_success "Scripts de configuration créés"

# 6. Instructions finales
print_info "=== 🎯 Instructions finales ==="

print_success "Configuration VM prête !"

echo ""
echo "📋 Étapes suivantes:"
echo "1. 🚀 Créez la VM avec l'ISO: $NIXOS_ISO"
echo "2. 💿 Démarrez depuis l'ISO"
echo "3. 📝 Dans la VM, copiez et exécutez: ./install-nixos-vm.sh"
echo "4. 🔄 Redémarrez la VM"
echo "5. 🔑 Connectez-vous: utilisateur 'meetbot', mot de passe 'meetbot'"

echo ""
print_info "🌐 Accès SSH depuis macOS:"
echo "  ssh meetbot@<IP_DE_LA_VM>"

echo ""
print_info "📂 Partage de fichiers:"
echo "  Copiez votre projet meet-teams-bot dans la VM"
echo "  Puis exécutez: ./deploy_nixos.sh full"

echo ""
print_success "🎊 Résultat: NixOS avec dispositifs virtuels automatiques !"
print_info "Votre image Ducobu sera injectée directement dans la caméra virtuelle"

# 7. Estimation des ressources
print_info "=== 📊 Ressources recommandées ==="
echo "💾 RAM: 8GB (4GB minimum)"
echo "💿 Stockage: 30GB (20GB minimum)"  
echo "🖥️ CPU: 2 cores (4 cores recommandé)"
echo "⏱️ Installation: ~30 minutes"

print_warning "Note: Performance réduite par rapport à NixOS natif, mais fonctionnel" 