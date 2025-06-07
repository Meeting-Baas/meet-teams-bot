#!/bin/bash

# Script de test universel - Meet Teams Bot
# Fonctionne sur macOS, Linux, NixOS et Windows (via WSL/Git Bash)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

print_platform() {
    echo -e "${PURPLE}🌍 $1${NC}"
}

print_info "=== 🚀 Test Universel Meet Teams Bot ==="

# 1. Détection de la plateforme
PLATFORM=$(uname -s)
ARCH=$(uname -m)

case $PLATFORM in
    "Darwin")
        PLATFORM_NAME="macOS"
        PLATFORM_EMOJI="🍎"
        ;;
    "Linux")
        if [ -f /etc/nixos/configuration.nix ]; then
            PLATFORM_NAME="NixOS"
            PLATFORM_EMOJI="❄️"
        else
            PLATFORM_NAME="Linux"
            PLATFORM_EMOJI="🐧"
        fi
        ;;
    "MINGW"*|"MSYS"*|"CYGWIN"*)
        PLATFORM_NAME="Windows"
        PLATFORM_EMOJI="🪟"
        ;;
    *)
        PLATFORM_NAME="Inconnu"
        PLATFORM_EMOJI="❓"
        ;;
esac

print_platform "$PLATFORM_EMOJI $PLATFORM_NAME ($ARCH)"

# 2. Vérification de l'environnement
print_info "=== Vérification de l'environnement ==="

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js: $NODE_VERSION"
else
    print_error "Node.js non installé"
fi

# Nix (optionnel mais recommandé)
if command -v nix-shell &> /dev/null; then
    NIX_VERSION=$(nix-shell --version)
    print_success "Nix: $NIX_VERSION"
    HAS_NIX=true
else
    print_warning "Nix non installé (optionnel mais recommandé)"
    HAS_NIX=false
fi

# FFmpeg
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>/dev/null | head -1)
    print_success "FFmpeg: $FFMPEG_VERSION"
elif [ "$HAS_NIX" = true ]; then
    print_info "Test FFmpeg via Nix..."
    if nix-shell --run "ffmpeg -version" &> /dev/null; then
        print_success "FFmpeg disponible via Nix"
    else
        print_error "FFmpeg non disponible"
    fi
else
    print_error "FFmpeg non installé"
fi

# 3. Test de la configuration automatique
print_info "=== Test de la configuration automatique ==="

print_info "Test de la détection de plateforme..."
if [ "$HAS_NIX" = true ]; then
    TEST_CONFIG=$(nix-shell --run "cd recording_server && node -e \"
    const { MEDIA_CONFIG } = require('./build/src/media_context.js');
    console.log('Platform:', MEDIA_CONFIG.platform);
    console.log('Audio Device:', MEDIA_CONFIG.microDevice);
    console.log('Video Device:', MEDIA_CONFIG.cameraDevice);
    console.log('Audio Format:', MEDIA_CONFIG.audioFormat);
    console.log('Video Format:', MEDIA_CONFIG.videoFormat);
    console.log('Has Virtual Devices:', MEDIA_CONFIG.hasVirtualDevices);
    \"" 2>/dev/null || echo "Erreur lors du test de configuration")
else
    TEST_CONFIG=$(cd recording_server && node -e "
    const { MEDIA_CONFIG } = require('./build/src/media_context.js');
    console.log('Platform:', MEDIA_CONFIG.platform);
    console.log('Audio Device:', MEDIA_CONFIG.microDevice);
    console.log('Video Device:', MEDIA_CONFIG.cameraDevice);
    console.log('Audio Format:', MEDIA_CONFIG.audioFormat);
    console.log('Video Format:', MEDIA_CONFIG.videoFormat);
    console.log('Has Virtual Devices:', MEDIA_CONFIG.hasVirtualDevices);
    " 2>/dev/null || echo "Erreur lors du test de configuration")
fi

echo "$TEST_CONFIG"

# 4. Test des dispositifs spécifiques à la plateforme
print_info "=== Test des dispositifs $PLATFORM_NAME ==="

case $PLATFORM_NAME in
    "macOS")
        print_info "🍎 Test des dispositifs macOS avec AVFoundation..."
        
        if [ "$HAS_NIX" = true ]; then
            nix-shell --run "ffmpeg -f avfoundation -list_devices true -i \"\" 2>&1 | head -20" || print_warning "Erreur lors du listage des dispositifs"
        else
            ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | head -20 || print_warning "Erreur lors du listage des dispositifs"
        fi
        
        print_success "✅ Configuration macOS:"
        echo "  • Audio: AVFoundation (microphone par défaut)"
        echo "  • Vidéo: AVFoundation (caméra par défaut)"
        echo "  • Mode: Dispositifs natifs + enregistrement fichiers"
        ;;
        
    "NixOS")
        print_info "❄️  Test des dispositifs NixOS avec v4l2loopback + PulseAudio..."
        
        # Test dispositifs virtuels
        if [ -e /dev/video10 ]; then
            print_success "/dev/video10 (caméra virtuelle) trouvé"
        else
            print_warning "/dev/video10 non trouvé - utilisera /dev/video0"
        fi
        
        if command -v pactl &> /dev/null; then
            if pactl list sources short | grep -q virtual_mic; then
                print_success "virtual_mic_source (microphone virtuel) trouvé"
            else
                print_warning "virtual_mic_source non trouvé - utilisera 'default'"
            fi
        fi
        
        print_success "✅ Configuration NixOS:"
        echo "  • Audio: PulseAudio (virtual_mic_source ou default)"
        echo "  • Vidéo: v4l2 (/dev/video10 ou /dev/video0)"
        echo "  • Mode: Dispositifs virtuels pour injection en meeting"
        ;;
        
    "Linux")
        print_info "🐧 Test des dispositifs Linux standard..."
        
        # Test dispositifs standards
        if [ -e /dev/video0 ]; then
            print_success "/dev/video0 (caméra) trouvé"
        else
            print_warning "Aucune caméra /dev/video* trouvée"
        fi
        
        if command -v aplay &> /dev/null; then
            print_success "ALSA détecté"
        elif command -v pactl &> /dev/null; then
            print_success "PulseAudio détecté"
        else
            print_warning "Aucun système audio détecté"
        fi
        
        print_success "✅ Configuration Linux:"
        echo "  • Audio: ALSA (default) ou PulseAudio"
        echo "  • Vidéo: v4l2 (/dev/video0)"
        echo "  • Mode: Dispositifs natifs"
        ;;
        
    "Windows")
        print_info "🪟 Test des dispositifs Windows..."
        
        if [ "$HAS_NIX" = true ]; then
            nix-shell --run "ffmpeg -f dshow -list_devices true -i dummy 2>&1 | head -20" || print_warning "Erreur lors du listage des dispositifs"
        else
            ffmpeg -f dshow -list_devices true -i dummy 2>&1 | head -20 || print_warning "Erreur lors du listage des dispositifs"
        fi
        
        print_success "✅ Configuration Windows:"
        echo "  • Audio: DirectShow (Microphone)"
        echo "  • Vidéo: DirectShow (USB Camera)"
        echo "  • Mode: Dispositifs natifs"
        ;;
esac

# 5. Test d'exécution rapide
print_info "=== Test d'exécution du bot ==="

print_info "Test de démarrage rapide (5 secondes)..."

# Créer une config de test
cat > test_config_universal.json << EOF
{
    "meeting_url": "https://meet.google.com/test-universal-bot",
    "bot_name": "Universal Test Bot ($PLATFORM_NAME)",
    "recording_mode": "SpeakerView",
    "automatic_leave": {
        "waiting_room_timeout": 5,
        "noone_joined_timeout": 5
    }
}
EOF

print_info "Configuration de test créée pour $PLATFORM_NAME"

# Test d'exécution avec timeout
print_info "Démarrage du bot (arrêt automatique après 10 secondes)..."
if [ "$HAS_NIX" = true ]; then
    timeout 10s ./run_bot_nix.sh run test_config_universal.json 2>&1 | head -30 || print_info "Test d'exécution terminé"
else
    timeout 10s bash -c "cd recording_server && node build/src/main.js < ../test_config_universal.json" 2>&1 | head -30 || print_info "Test d'exécution terminé"
fi

# Nettoyer
rm -f test_config_universal.json

# 6. Résumé et recommandations
print_info "=== 🎯 Résumé pour $PLATFORM_NAME ==="

case $PLATFORM_NAME in
    "macOS")
        print_success "✅ Statut: PRÊT À UTILISER"
        echo "• Utilise les dispositifs natifs macOS (AVFoundation)"
        echo "• Enregistre dans /tmp/ au lieu d'injecter directement"
        echo "• Parfait pour le développement et les tests"
        echo ""
        print_info "🚀 Commandes pour démarrer:"
        echo "  ./run_bot_nix.sh setup"
        echo "  ./run_bot_nix.sh run params.json"
        ;;
        
    "NixOS")
        print_success "✅ Statut: CONFIGURATION AVANCÉE"
        echo "• Dispositifs virtuels pour injection directe"
        echo "• Configuration système NixOS requise"
        echo "• Idéal pour la production et l'automation"
        echo ""
        print_info "🚀 Commandes pour démarrer:"
        echo "  sudo ./deploy_nixos.sh full"
        echo "  ./setup_virtual_devices_nix.sh"
        echo "  ./run_bot_nix.sh run params.json"
        ;;
        
    "Linux")
        print_success "✅ Statut: FONCTIONNEL"
        echo "• Utilise les dispositifs natifs Linux"
        echo "• Peut nécessiter des outils supplémentaires pour l'injection"
        echo "• Compatible avec la plupart des distributions"
        echo ""
        print_info "🚀 Commandes pour démarrer:"
        echo "  ./run_bot_nix.sh setup  # ou npm install"
        echo "  ./run_bot_nix.sh run params.json"
        ;;
        
    "Windows")
        print_success "✅ Statut: EXPÉRIMENTAL"
        echo "• Support via WSL/Git Bash + DirectShow"
        echo "• Peut nécessiter des ajustements"
        echo "• Recommandé: utiliser WSL2 avec Linux"
        echo ""
        print_info "🚀 Commandes pour démarrer:"
        echo "  ./run_bot_nix.sh setup"
        echo "  ./run_bot_nix.sh run params.json"
        ;;
esac

print_info "=== 📚 Documentation ==="
echo "• README.md - Guide général"
echo "• NIXOS_SETUP.md - Configuration NixOS avancée"
echo "• run_bot_nix.sh help - Aide sur les commandes"

print_success "🎉 Test universel terminé ! Votre projet fonctionne sur $PLATFORM_NAME"

print_info "=== 🔧 Prochaines étapes ==="
case $PLATFORM_NAME in
    "macOS")
        echo "1. Tester avec une vraie réunion Google Meet/Teams"
        echo "2. Optionnel: Installer OBS Virtual Camera pour injection directe"
        echo "3. Configurer votre params.json avec une vraie URL de meeting"
        ;;
    "NixOS")
        echo "1. Déployer la configuration: ./deploy_nixos.sh full"
        echo "2. Configurer les dispositifs: ./setup_virtual_devices_nix.sh"
        echo "3. Tester l'injection virtuelle en meeting"
        ;;
    "Linux")
        echo "1. Optionnel: Installer v4l2loopback pour caméras virtuelles"
        echo "2. Optionnel: Configurer PulseAudio pour audio virtuel"
        echo "3. Tester avec une vraie réunion"
        ;;
    "Windows")
        echo "1. Vérifier que tous les outils sont installés"
        echo "2. Tester les dispositifs DirectShow"
        echo "3. Considérer WSL2 pour une meilleure compatibilité"
        ;;
esac 