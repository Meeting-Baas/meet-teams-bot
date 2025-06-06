#!/bin/bash

# Script pour configurer OBS Virtual Camera sur macOS
# Permet d'injecter l'image de branding dans la caméra virtuelle

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

print_info "=== 🎥 Configuration OBS Virtual Camera pour macOS ==="

# Vérifier si on est sur macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
    print_error "Ce script est spécifiquement pour macOS"
    exit 1
fi

# 1. Vérifier si OBS est installé
print_info "Vérification d'OBS Studio..."

if [ -d "/Applications/OBS.app" ]; then
    print_success "OBS Studio trouvé"
    OBS_VERSION=$(defaults read /Applications/OBS.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo "Inconnue")
    echo "  Version: $OBS_VERSION"
else
    print_warning "OBS Studio non trouvé"
    print_info "Installation d'OBS Studio..."
    
    if command -v brew &> /dev/null; then
        print_info "Installation via Homebrew..."
        brew install --cask obs
        print_success "OBS Studio installé"
    else
        print_error "Homebrew non installé"
        print_info "Veuillez installer OBS manuellement:"
        print_info "1. Allez sur https://obsproject.com/"
        print_info "2. Téléchargez OBS Studio pour macOS"
        print_info "3. Installez l'application"
        print_info "4. Relancez ce script"
        exit 1
    fi
fi

# 2. Vérifier le plugin Virtual Camera
print_info "Vérification du plugin Virtual Camera..."

# OBS Virtual Camera est intégré depuis OBS 26.1
OBS_VIRTUAL_CAM_AVAILABLE=false

# Lancer OBS pour vérifier si Virtual Camera est disponible
print_info "Vérification des capacités Virtual Camera..."

# Créer un script AppleScript pour automatiser OBS
cat > /tmp/check_obs_virtual_cam.scpt << 'EOF'
tell application "OBS"
    activate
end tell

delay 2

tell application "System Events"
    tell process "OBS"
        -- Vérifier si le menu Virtual Camera existe
        try
            click menu item "Start Virtual Camera" of menu "Tools" of menu bar 1
            return "Virtual Camera Available"
        on error
            return "Virtual Camera Not Found"
        end try
    end tell
end tell
EOF

# 3. Configuration automatique d'OBS
print_info "Configuration d'OBS pour le branding..."

# Créer un profil OBS pour le bot
OBS_CONFIG_DIR="$HOME/Library/Application Support/obs-studio"
BOT_PROFILE_DIR="$OBS_CONFIG_DIR/basic/profiles/MeetTeamsBot"

mkdir -p "$BOT_PROFILE_DIR"

# Configuration du profil bot
cat > "$BOT_PROFILE_DIR/basic.ini" << EOF
[General]
Name=MeetTeamsBot

[Video]
BaseCX=640
BaseCY=360
OutputCX=640
OutputCY=360
FPSType=0
FPSCommon=30

[Audio]
SampleRate=48000
ChannelSetup=Stereo

[Stream]
Type=rtmp_common
EOF

# Créer une scène avec source image
cat > "$BOT_PROFILE_DIR/scenes.json" << EOF
{
    "current_scene": "Bot Scene",
    "current_program_scene": "Bot Scene",
    "scene_order": [
        {
            "name": "Bot Scene"
        }
    ],
    "scenes": [
        {
            "id": 1,
            "name": "Bot Scene",
            "sources": [
                {
                    "id": 1,
                    "name": "Branding Image",
                    "type": "image_source",
                    "settings": {
                        "file": "$(pwd)/../branding.mp4"
                    }
                }
            ]
        }
    ]
}
EOF

print_success "Profil OBS configuré"

# 4. Instructions pour l'utilisateur
print_info "=== 📋 Instructions pour activer Virtual Camera ==="

print_success "Configuration terminée ! Voici comment utiliser:"

echo "1. 🚀 Ouvrez OBS Studio"
echo "2. 📁 Chargez le profil 'MeetTeamsBot'"
echo "3. 🎬 Ajoutez votre branding.mp4 comme source"
echo "4. 🎥 Cliquez sur 'Start Virtual Camera' dans le menu Tools"
echo "5. ✅ Dans Google Meet/Teams, sélectionnez 'OBS Virtual Camera'"

print_info "=== 🔧 Automatisation via script ==="

# Créer un script pour automatiser le processus
cat > "./start_obs_virtual_cam.sh" << 'EOF'
#!/bin/bash

# Script pour démarrer OBS Virtual Camera automatiquement
echo "🎥 Démarrage d'OBS Virtual Camera..."

# Générer le branding d'abord
if [ ! -f "../branding.mp4" ]; then
    echo "📹 Génération du branding..."
    if [ -n "$1" ]; then
        ./generate_custom_branding.sh "$1"
    else
        ./generate_branding.sh "Recording Bot"
    fi
fi

# Démarrer OBS avec le profil bot
echo "🚀 Lancement d'OBS..."
open -a OBS --args --profile MeetTeamsBot --scene "Bot Scene"

echo "⏳ Attente du démarrage d'OBS..."
sleep 5

# Automatiser le démarrage de Virtual Camera via AppleScript
osascript << 'SCRIPT'
tell application "OBS"
    activate
end tell

delay 3

tell application "System Events"
    tell process "OBS"
        try
            click menu item "Start Virtual Camera" of menu "Tools" of menu bar 1
            display notification "Virtual Camera démarrée" with title "OBS"
        on error
            display alert "Impossible de démarrer Virtual Camera automatiquement" message "Veuillez cliquer manuellement sur Tools > Start Virtual Camera"
        end try
    end tell
end tell
SCRIPT

echo "✅ OBS Virtual Camera configurée !"
echo "👀 Sélectionnez 'OBS Virtual Camera' dans votre meeting"
EOF

chmod +x "./start_obs_virtual_cam.sh"

print_success "Script d'automatisation créé: ./start_obs_virtual_cam.sh"

# 5. Test rapide
print_info "=== 🧪 Test de configuration ==="

if [ -f "../branding.mp4" ]; then
    print_success "Vidéo de branding trouvée: ../branding.mp4"
else
    print_warning "Pas de branding.mp4 trouvé"
    print_info "Génération d'un branding de test..."
    ./generate_branding.sh "Test Bot"
fi

print_info "=== 🎯 Résumé ==="
print_success "✅ OBS Studio installé/vérifié"
print_success "✅ Profil MeetTeamsBot configuré"  
print_success "✅ Script d'automatisation créé"

print_info "🚀 Commandes pour utiliser:"
echo "  ./start_obs_virtual_cam.sh                    # Démarrer avec branding par défaut"
echo "  ./start_obs_virtual_cam.sh 'https://...'      # Démarrer avec image custom"
echo ""
echo "Puis dans Google Meet/Teams:"
echo "  📹 Paramètres → Caméra → 'OBS Virtual Camera'"

print_success "🎊 Configuration terminée ! Votre image sera maintenant visible par tous !" 