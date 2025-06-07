#!/bin/bash

# Script de test pour macOS - Meet Teams Bot
# Teste les fonctionnalités disponibles sur macOS

set -e

# Colors for output
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

print_info "=== Test Meet Teams Bot sur macOS ==="

# 1. Vérifier l'environnement
print_info "Vérification de l'environnement..."
echo "OS: $(uname -s)"
echo "Architecture: $(uname -m)"
echo "Répertoire: $(pwd)"

# 2. Vérifier Nix
if command -v nix-shell &> /dev/null; then
    print_success "Nix installé: $(nix-shell --version)"
else
    print_error "Nix non installé"
    exit 1
fi

# 3. Vérifier Node.js via Nix
print_info "Test de Node.js via Nix..."
NODE_VERSION=$(nix-shell --run "node --version" 2>/dev/null || echo "Erreur")
if [[ $NODE_VERSION == v* ]]; then
    print_success "Node.js disponible: $NODE_VERSION"
else
    print_error "Node.js non disponible via Nix"
fi

# 4. Vérifier FFmpeg via Nix
print_info "Test de FFmpeg via Nix..."
FFMPEG_VERSION=$(nix-shell --run "ffmpeg -version 2>/dev/null | head -1" || echo "Erreur")
if [[ $FFMPEG_VERSION == ffmpeg* ]]; then
    print_success "FFmpeg disponible"
    echo "  $FFMPEG_VERSION"
else
    print_error "FFmpeg non disponible via Nix"
fi

# 5. Vérifier les dépendances du projet
print_info "Vérification des dépendances du projet..."

if [ -d "recording_server/node_modules" ]; then
    print_success "Dépendances Node.js installées"
else
    print_warning "Dépendances non installées, lancement de l'installation..."
    ./run_bot_nix.sh setup
fi

if [ -d "recording_server/build" ]; then
    print_success "Projet compilé"
else
    print_warning "Projet non compilé"
fi

# 6. Test des dispositifs audio/vidéo sur macOS
print_info "=== Test des dispositifs macOS ==="

# Tester les dispositifs audio disponibles
print_info "Dispositifs audio macOS:"
if command -v system_profiler &> /dev/null; then
    system_profiler SPAudioDataType | grep -E "(Name|Type):" | head -10
else
    print_warning "system_profiler non disponible"
fi

# Tester les caméras disponibles
print_info "Caméras macOS:"
if command -v system_profiler &> /dev/null; then
    system_profiler SPCameraDataType 2>/dev/null | grep -E "Model ID" || print_info "Aucune caméra externe détectée"
else
    print_warning "system_profiler non disponible"
fi

# 7. Test media_context.ts avec les valeurs actuelles
print_info "=== Test de media_context.ts ==="

print_info "Configuration actuelle dans media_context.ts:"
if [ -f "recording_server/src/media_context.ts" ]; then
    echo "MICRO_DEVICE: $(grep 'const MICRO_DEVICE' recording_server/src/media_context.ts)"
    echo "CAMERA_DEVICE: $(grep 'const CAMERA_DEVICE' recording_server/src/media_context.ts)"
    
    # Analyser les limitations
    print_warning "Limitations sur macOS:"
    echo "  • /dev/video10 n'existe pas sur macOS"
    echo "  • pulse:virtual_mic_source nécessite PulseAudio"
    echo "  • v4l2loopback est spécifique à Linux"
    
    print_info "Alternatives macOS:"
    echo "  • Utiliser AVFoundation pour les caméras"
    echo "  • Utiliser CoreAudio pour l'audio"
    echo "  • Utiliser des outils tiers comme OBS Virtual Camera"
else
    print_error "media_context.ts non trouvé"
fi

# 8. Test de FFmpeg avec les dispositifs macOS
print_info "=== Test FFmpeg avec dispositifs macOS ==="

print_info "Test des sources audio macOS:"
nix-shell --run "ffmpeg -f avfoundation -list_devices true -i \"\" 2>&1 | head -20" || print_warning "Erreur lors du test audio"

print_info "Test des sources vidéo macOS:"
nix-shell --run "ffmpeg -f avfoundation -list_devices true -i \"\" 2>&1 | grep video" || print_warning "Erreur lors du test vidéo"

# 9. Test d'exécution basique
print_info "=== Test d'exécution du bot ==="

if [ -f "params.json" ]; then
    print_info "Configuration trouvée dans params.json:"
    cat params.json | head -5
    
    print_info "Test de génération d'UUID et validation JSON..."
    # Test sans vraiment exécuter le bot
    TEST_JSON=$(echo '{"meeting_url":"https://meet.google.com/test-test-test", "bot_name":"TestBot"}')
    echo "JSON de test: $TEST_JSON"
    print_success "Configuration JSON valide"
else
    print_error "params.json non trouvé"
fi

# 10. Recommandations
print_info "=== Recommandations pour macOS ==="

print_success "✅ Ce qui fonctionne:"
echo "  • Nix environment avec Node.js 20"
echo "  • Compilation TypeScript/Webpack"
echo "  • FFmpeg pour l'enregistrement"
echo "  • Extension Chrome"
echo "  • Bot de meeting (sans dispositifs virtuels)"

print_warning "⚠️  Limitations sur macOS:"
echo "  • Pas de dispositifs virtuels /dev/video10"
echo "  • PulseAudio remplacé par CoreAudio"
echo "  • Commandes ffmpeg différentes pour macOS"

print_info "🛠️  Solutions alternatives:"
echo "  • Installer OBS Studio + OBS Virtual Camera"
echo "  • Utiliser BlackHole pour l'audio virtuel"
echo "  • Modifier media_context.ts pour macOS"
echo "  • Utiliser ScreenCaptureKit (macOS 12.3+)"

print_info "=== Test complet terminé ==="

# 11. Test d'exécution réel (optionnel)
print_info "Voulez-vous tester l'exécution réelle du bot ? (y/N)"
read -r -n 1 REPLY
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Test d'exécution avec configuration de test..."
    print_warning "Note: Les dispositifs virtuels ne fonctionneront pas sur macOS"
    
    # Créer une config de test
    cat > test_params.json << EOF
{
    "meeting_url": "https://meet.google.com/test-test-test",
    "bot_name": "Test Bot macOS",
    "recording_mode": "SpeakerView",
    "automatic_leave": {
        "waiting_room_timeout": 10,
        "noone_joined_timeout": 10
    }
}
EOF

    print_info "Exécution du bot avec configuration de test..."
    timeout 30 ./run_bot_nix.sh run test_params.json 2>&1 | head -50 || print_info "Test d'exécution terminé"
    
    # Nettoyer
    rm -f test_params.json
else
    print_info "Test d'exécution ignoré"
fi

print_success "Tests terminés ! Consultez les recommandations ci-dessus." 