# Configuration NixOS pour Meet Teams Bot

Ce guide explique comment configurer et utiliser le Meet Teams Bot avec NixOS, incluant la configuration des dispositifs audio/vidéo virtuels nécessaires pour `media_context.ts`.

## 🎯 Objectif

Faire fonctionner les dispositifs virtuels suivants sur NixOS :
- **Webcam virtuelle** : `/dev/video10` (via v4l2loopback)
- **Microphone virtuel** : `pulse:virtual_mic_source` (via PulseAudio)

## 📋 Prérequis

- NixOS avec privilèges sudo
- Nix Flakes activé
- Configuration système avec les bonnes permissions

## 🚀 Installation et Configuration

### 1. Configuration système NixOS

La configuration dans `configuration.nix` inclut maintenant :

```nix
# Modules kernel pour dispositifs virtuels
boot.kernelModules = [ "v4l2loopback" "snd-aloop" ];
boot.extraModulePackages = with config.boot.kernelPackages; [ 
  v4l2loopback.out 
];

# Configuration PulseAudio avec dispositifs virtuels
services.pulseaudio = {
  enable = true;
  systemWide = true;
  extraConfig = ''
    load-module module-null-sink sink_name=virtual_mic rate=48000
    load-module module-virtual-source source_name=virtual_mic_source master=virtual_mic.monitor
    set-default-source virtual_mic_source
  '';
};
```

### 2. Reconstruction du système

Après avoir modifié `configuration.nix` :

```bash
# Reconstruire la configuration NixOS
sudo nixos-rebuild switch

# Redémarrer pour charger les modules kernel
sudo reboot
```

### 3. Vérification et test

Utilisez le script de diagnostic :

```bash
# Configurer et tester les dispositifs virtuels
./setup_virtual_devices_nix.sh
```

Ce script va :
- ✅ Vérifier les modules kernel (v4l2loopback, snd_aloop)
- ✅ Configurer PulseAudio avec les dispositifs virtuels
- ✅ Tester les dispositifs avec ffmpeg
- ✅ Valider la compatibilité avec `media_context.ts`

## 🔧 Utilisation

### Démarrage rapide

```bash
# 1. Configuration initiale (une seule fois)
./setup_virtual_devices_nix.sh

# 2. Installation des dépendances
./run_bot_nix.sh setup

# 3. Exécution du bot
./run_bot_nix.sh run params.json
```

### Modes disponibles

```bash
# Mode serverless (par défaut)
./run_bot_nix.sh run params.json

# Mode API
./run_bot_nix.sh run-api params.json

# Avec URL de meeting personnalisée
./run_bot_nix.sh run params.json "https://meet.google.com/abc-def-ghi"

# Avec configuration JSON directe
./run_bot_nix.sh run-json '{"meeting_url":"https://meet.google.com/test", "bot_name":"TestBot"}'
```

## 🛠️ Diagnostic et Debugging

### Vérification des dispositifs

```bash
# Dispositifs vidéo
ls -la /dev/video*
v4l2-ctl --list-devices

# Dispositifs audio PulseAudio
pactl list sources short
pactl list sinks short

# Modules kernel
lsmod | grep -E "(v4l2loopback|snd_aloop)"
```

### Service de diagnostic automatique

Un service systemd `recording-bot-diagnostics` est disponible :

```bash
# Exécuter les diagnostics
sudo systemctl start recording-bot-diagnostics

# Voir les résultats
sudo journalctl -u recording-bot-diagnostics
```

### Tests manuels avec ffmpeg

```bash
# Test webcam virtuelle (équivalent VideoContext.play())
ffmpeg -f v4l2 -list_formats all -i /dev/video10

# Test microphone virtuel (équivalent SoundContext.play_stdin())
echo "test" | ffmpeg -f f32le -ar 48000 -ac 1 -i - -f pulse virtual_mic_source
```

## 📁 Structure des fichiers

```
.
├── configuration.nix              # Configuration système NixOS
├── flake.nix                     # Configuration Nix Flakes
├── modules/recording-bot.nix     # Module service recording-bot
├── setup_virtual_devices_nix.sh  # Script de configuration/test
├── run_bot_nix.sh               # Script principal d'exécution
└── recording_server/
    └── src/media_context.ts     # Code utilisant les dispositifs virtuels
```

## 🎮 Fonctionnement avec media_context.ts

### Constantes utilisées

Le fichier `media_context.ts` utilise :

```typescript
const MICRO_DEVICE: string = 'pulse:virtual_mic_source'  // ✅ Configuré
const CAMERA_DEVICE: string = '/dev/video10'            // ✅ Configuré
```

### Classes principales

- **SoundContext** : Gère l'audio vers `pulse:virtual_mic_source`
- **VideoContext** : Gère la vidéo vers `/dev/video10`

### Commandes ffmpeg générées

```bash
# Audio (SoundContext.play_stdin())
ffmpeg -f f32le -ar 48000 -ac 1 -i - -f alsa -acodec pcm_s16le "pulse:virtual_mic_source"

# Vidéo (VideoContext.play())
ffmpeg -re -i video.mp4 -f v4l2 -vcodec rawvideo -s 640x360 /dev/video10
```

## ⚡ Services systemd

### Service principal

```bash
# Démarrer le service recording-bot
sudo systemctl start recording-bot-1

# Voir les logs
sudo journalctl -u recording-bot-1 -f

# Statut des services
sudo systemctl status recording-bot-*
```

### Service de configuration

```bash
# Service setup-virtual-devices (auto-démarrage)
sudo systemctl status setup-virtual-devices

# Redémarrer la configuration des dispositifs
sudo systemctl restart setup-virtual-devices
```

## 🔒 Permissions et sécurité

### Groupes utilisateur

L'utilisateur `recording-bot` est membre de :
- `video` : Accès aux dispositifs vidéo
- `audio` : Accès aux dispositifs audio
- `pulse` : Accès à PulseAudio
- `pulse-access` : Permissions PulseAudio étendues

### Permissions des dispositifs

```bash
# /dev/video10 doit être accessible en lecture/écriture
ls -la /dev/video10
# Résultat attendu: crw-rw-rw- 1 root video ... /dev/video10
```

## 🐛 Problèmes courants

### Erreur : "/dev/video10 n'existe pas"

```bash
# Vérifier le module
sudo modprobe v4l2loopback video_nr=10 card_label="VirtualCam" exclusive_caps=1

# Ou redémarrer le service
sudo systemctl restart setup-virtual-devices
```

### Erreur : "virtual_mic_source non trouvé"

```bash
# Redémarrer PulseAudio
sudo systemctl restart pulseaudio

# Recréer les dispositifs virtuels
./setup_virtual_devices_nix.sh
```

### Erreur : "Permission denied" sur /dev/video10

```bash
# Vérifier les groupes
groups recording-bot

# Ajouter aux groupes si nécessaire
sudo usermod -a -G video,audio recording-bot
```

## 📊 Monitoring

### Logs en temps réel

```bash
# Logs du bot
sudo journalctl -u recording-bot-1 -f

# Logs des dispositifs virtuels
sudo journalctl -u setup-virtual-devices -f

# Logs système PulseAudio
sudo journalctl -u pulseaudio -f
```

### Ressources système

```bash
# Utilisation CPU/mémoire
htop

# Processus ffmpeg actifs
ps aux | grep ffmpeg

# Dispositifs utilisés
lsof /dev/video10
```

## 🔄 Mise à jour

Pour mettre à jour la configuration :

1. Modifier `configuration.nix` ou `modules/recording-bot.nix`
2. Reconstruire : `sudo nixos-rebuild switch`
3. Redémarrer les services : `sudo systemctl restart recording-bot-*`
4. Tester : `./setup_virtual_devices_nix.sh`

## 📚 Ressources

- [NixOS Manual](https://nixos.org/manual/nixos/stable/)
- [v4l2loopback Documentation](https://github.com/umlaeute/v4l2loopback)
- [PulseAudio Documentation](https://www.freedesktop.org/wiki/Software/PulseAudio/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

---

✅ **Configuration terminée !** Votre projet devrait maintenant fonctionner avec les dispositifs virtuels sur NixOS. 