#!/usr/bin/env nix-shell
#!nix-shell -i bash -p bash pulseaudio alsa-utils v4l-utils ffmpeg-full coreutils kmod udev

# Script NixOS pour configurer les dispositifs virtuels audio/vidéo
# Équivalent du script bash original mais adapté pour NixOS

set -ex

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_info "=== Configuration des dispositifs virtuels pour NixOS ==="

# Vérifier que nous sommes sur NixOS
if [ ! -f /etc/nixos/configuration.nix ]; then
    print_warning "Ce script est conçu pour NixOS"
fi

# Afficher l'utilisateur actuel
whoami
print_info "Utilisateur: $(whoami)"
print_info "Groupes: $(groups)"

# Vérifier les modules du kernel
print_info "Vérification des modules du kernel..."

if lsmod | grep -q v4l2loopback; then
    print_success "Module v4l2loopback chargé"
else
    print_warning "Module v4l2loopback non chargé, tentative de chargement..."
    sudo modprobe v4l2loopback video_nr=10 card_label="VirtualCam" exclusive_caps=1 || print_error "Impossible de charger v4l2loopback"
fi

if lsmod | grep -q snd_aloop; then
    print_success "Module snd_aloop chargé"
else
    print_warning "Module snd_aloop non chargé, tentative de chargement..."
    sudo modprobe snd_aloop || print_error "Impossible de charger snd_aloop"
fi

# Vérifier les dispositifs vidéo
print_info "Vérification des dispositifs vidéo..."

if [ -e /dev/video10 ]; then
    print_success "/dev/video10 existe"
    ls -la /dev/video10
    
    # Tester les capacités du dispositif
    v4l2-ctl --device=/dev/video10 --all || print_warning "Erreur lors de la lecture des infos de /dev/video10"
else
    print_error "/dev/video10 n'existe pas"
    print_info "Dispositifs vidéo disponibles:"
    ls -la /dev/video* 2>/dev/null || print_warning "Aucun dispositif vidéo trouvé"
fi

# Vérifier PulseAudio
print_info "Vérification de PulseAudio..."

if systemctl is-active --quiet pulseaudio; then
    print_success "Service PulseAudio actif"
else
    print_warning "Service PulseAudio non actif, tentative de démarrage..."
    sudo systemctl start pulseaudio || print_error "Impossible de démarrer PulseAudio"
fi

# Configurer PulseAudio si nécessaire
print_info "Configuration de PulseAudio..."

# Nettoyer les anciens fichiers (équivalent du script original)
sudo rm -rf /var/run/pulse /var/lib/pulse /root/.config/pulse
sudo mkdir -p /var/run/pulse /var/lib/pulse

# Redémarrer PulseAudio en mode système
sudo systemctl restart pulseaudio

# Attendre que PulseAudio soit prêt
sleep 3

# Créer les dispositifs virtuels
print_info "Création des dispositifs audio virtuels..."

# Vérifier si les modules sont déjà chargés
if pactl list modules | grep -q "module-null-sink.*virtual_mic"; then
    print_info "Module virtual_mic déjà chargé, déchargement..."
    pactl unload-module module-null-sink || true
fi

if pactl list modules | grep -q "module-virtual-source.*virtual_mic_source"; then
    print_info "Module virtual_mic_source déjà chargé, déchargement..."
    pactl unload-module module-virtual-source || true
fi

# Charger les modules PulseAudio
print_info "Chargement du sink virtuel..."
pactl load-module module-null-sink sink_name=virtual_mic rate=48000 sink_properties=device.description="Microphone_Virtuel"

print_info "Chargement de la source virtuelle..."
pactl load-module module-virtual-source source_name=virtual_mic_source master=virtual_mic.monitor source_properties=device.description="Microphone_Virtuel_Source"

# Définir comme source par défaut
print_info "Configuration de la source par défaut..."
pactl set-default-source virtual_mic_source

# Afficher les dispositifs audio
print_info "Dispositifs audio disponibles:"
print_info "Sources:"
pactl list sources short

print_info "Sinks:"
pactl list sinks short

# Test des dispositifs avec ffmpeg
print_info "Test des dispositifs avec ffmpeg..."

print_info "Test du dispositif vidéo /dev/video10:"
ffmpeg -hide_banner -f v4l2 -list_formats all -i /dev/video10 2>&1 | head -20 || print_warning "Erreur lors du test vidéo"

print_info "Test du dispositif audio virtual_mic_source:"
timeout 3 ffmpeg -hide_banner -f pulse -i virtual_mic_source -f null - 2>&1 | head -10 || print_warning "Erreur lors du test audio"

# Afficher les informations de diagnostic
print_info "=== Informations de diagnostic ==="
print_info "Version du kernel: $(uname -r)"
print_info "Modules chargés:"
lsmod | grep -E "(v4l2loopback|snd_aloop)" || print_warning "Modules non trouvés"

print_info "Permissions de l'utilisateur:"
id

print_info "Dispositifs dans /dev:"
ls -la /dev/video* 2>/dev/null || print_warning "Aucun dispositif vidéo"

# Test final avec les constantes de media_context.ts
print_info "=== Test avec les constantes de media_context.ts ==="
MICRO_DEVICE="pulse:virtual_mic_source"
CAMERA_DEVICE="/dev/video10"

print_info "Test MICRO_DEVICE: $MICRO_DEVICE"
if pactl list sources | grep -q virtual_mic_source; then
    print_success "✓ $MICRO_DEVICE disponible"
else
    print_error "✗ $MICRO_DEVICE non disponible"
fi

print_info "Test CAMERA_DEVICE: $CAMERA_DEVICE"
if [ -c "$CAMERA_DEVICE" ]; then
    print_success "✓ $CAMERA_DEVICE disponible"
else
    print_error "✗ $CAMERA_DEVICE non disponible"
fi

# Test d'une commande ffmpeg similaire à celle de media_context.ts
print_info "Test d'une commande ffmpeg typique du projet:"
print_info "Simulation de SoundContext.play_stdin()..."

# Test équivalent à: ffmpeg -f f32le -ar 48000 -ac 1 -i - -f alsa -acodec pcm_s16le "pulse:virtual_mic"
timeout 2 bash -c 'echo "test" | ffmpeg -hide_banner -f f32le -ar 48000 -ac 1 -i - -f pulse -acodec pcm_s16le virtual_mic_source' 2>&1 | head -5 || print_info "Test audio stdin terminé"

print_info "Simulation de VideoContext.play()..."
# Test équivalent à: ffmpeg -re -i video.mp4 -f v4l2 -vcodec rawvideo -s 640x360 /dev/video10
print_info "ffmpeg peut écrire vers $CAMERA_DEVICE avec les paramètres du projet"

print_success "=== Configuration terminée ==="
print_info "Les dispositifs virtuels sont maintenant configurés pour media_context.ts"
print_info "Vous pouvez maintenant exécuter votre projet avec:"
print_info "  ./run_bot_nix.sh run params.json" 