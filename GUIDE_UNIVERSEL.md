# 🌍 Guide Universel - Meet Teams Bot

> **Fonctionne partout** : macOS, Linux, NixOS, Windows

## 🚀 Démarrage Ultra-Rapide

```bash
# 1. Tester la compatibilité
./test_universal.sh

# 2. Installer et compiler
./run_bot_nix.sh setup

# 3. Lancer le bot
./run_bot_nix.sh run params.json
```

**C'est tout !** Le projet s'adapte automatiquement à votre plateforme 🎯

---

## 🎭 Comment ça marche ?

### 🔄 Détection Automatique

Le projet détecte automatiquement votre plateforme et utilise les bons dispositifs :

| Plateforme | Audio | Vidéo | Mode |
|------------|-------|-------|------|
| 🍎 **macOS** | AVFoundation | AVFoundation | Dispositifs natifs |
| ❄️ **NixOS** | PulseAudio virtuel | v4l2loopback | Dispositifs virtuels |
| 🐧 **Linux** | ALSA/PulseAudio | v4l2 | Dispositifs natifs |
| 🪟 **Windows** | DirectShow | DirectShow | Dispositifs natifs |

### 🎯 Configuration Zero

Plus besoin de modifier `media_context.ts` ! Il s'adapte automatiquement :

```typescript
// Avant (manuel)
const MICRO_DEVICE = 'pulse:virtual_mic_source' // ❌ Fixe

// Maintenant (automatique)
const CONFIG = getPlatformConfig() // ✅ S'adapte !
```

---

## 📱 Utilisation par Plateforme

<details>
<summary>🍎 <strong>macOS</strong> (Prêt immédiatement)</summary>

### Statut : ✅ **PRÊT À UTILISER**

```bash
# Test rapide
./test_universal.sh

# Démarrage
./run_bot_nix.sh setup
./run_bot_nix.sh run params.json
```

**Ce qui fonctionne :**
- ✅ Détection automatique des dispositifs natifs
- ✅ Extension Chrome + Playwright
- ✅ Enregistrement audio/vidéo
- ✅ Nix environment isolé

**Limitations :**
- 📁 Enregistre dans `/tmp/` au lieu d'injecter directement
- 🎥 Pour injection directe : installer OBS Virtual Camera

</details>

<details>
<summary>❄️ <strong>NixOS</strong> (Configuration avancée)</summary>

### Statut : ✅ **CONFIGURATION AVANCÉE**

```bash
# Configuration système
sudo ./deploy_nixos.sh full

# Test des dispositifs virtuels
./setup_virtual_devices_nix.sh

# Utilisation
./run_bot_nix.sh run params.json
```

**Ce qui fonctionne :**
- ✅ Dispositifs virtuels automatiques (`/dev/video10`, `virtual_mic_source`)
- ✅ Injection directe dans les meetings
- ✅ Services systemd intégrés
- ✅ Configuration déclarative

**Avantages :**
- 🎯 **Idéal pour la production**
- 🤖 Automation complète
- 🔒 Isolation système

</details>

<details>
<summary>🐧 <strong>Linux</strong> (Compatible)</summary>

### Statut : ✅ **FONCTIONNEL**

```bash
# Test rapide
./test_universal.sh

# Avec Nix (recommandé)
./run_bot_nix.sh setup
./run_bot_nix.sh run params.json

# Ou classique
npm install --prefix recording_server
cd recording_server && node build/src/main.js
```

**Ce qui fonctionne :**
- ✅ Dispositifs natifs (`/dev/video0`, ALSA)
- ✅ Compatibilité la plupart des distributions
- ✅ Peut upgrader vers NixOS facilement

**Optionnel (pour injection directe) :**
```bash
# Installer v4l2loopback
sudo apt install v4l2loopback-dkms

# Configurer PulseAudio virtuel
# (voir NIXOS_SETUP.md pour les détails)
```

</details>

<details>
<summary>🪟 <strong>Windows</strong> (Expérimental)</summary>

### Statut : ⚠️ **EXPÉRIMENTAL**

```bash
# Via WSL2 (recommandé)
./test_universal.sh
./run_bot_nix.sh setup
./run_bot_nix.sh run params.json

# Ou Git Bash/MSYS2
# (peut nécessiter des ajustements)
```

**Recommandations :**
- 🔄 Utiliser WSL2 avec Ubuntu
- 🔧 Installer FFmpeg pour Windows
- 🎯 Tester les dispositifs DirectShow

</details>

---

## 🔧 Commandes Principales

### 🧪 Test et Diagnostic

```bash
./test_universal.sh           # Test complet de votre plateforme
./run_bot_nix.sh help         # Aide et options disponibles
```

### 🚀 Utilisation

```bash
# Setup (une fois)
./run_bot_nix.sh setup

# Modes d'exécution
./run_bot_nix.sh run params.json                          # Mode serverless
./run_bot_nix.sh run params.json "https://meet.google.com/abc" # Avec URL custom
./run_bot_nix.sh run-json '{"meeting_url":"...", ...}'    # Avec JSON direct

# API mode (nécessite .env)
./run_bot_nix.sh run-api params.json
```

### 🧹 Maintenance

```bash
./run_bot_nix.sh clean        # Nettoyer les enregistrements
```

---

## ⚙️ Configuration

### 📄 Fichier `params.json`

```json
{
    "meeting_url": "https://meet.google.com/votre-meeting",
    "bot_name": "Mon Bot Universel",
    "recording_mode": "SpeakerView",
    "automatic_leave": {
        "waiting_room_timeout": 60,
        "noone_joined_timeout": 60
    }
}
```

### 🔐 Mode API (optionnel)

Créer `.env` :
```bash
BOT_TOKEN=votre_token_ici
API_SERVER_BASEURL=https://api.meeting-baas.com
```

---

## 🎯 Cas d'Usage

### 🧪 **Développement** (macOS/Linux)
```bash
./run_bot_nix.sh run params.json
# → Enregistrement local, parfait pour tester
```

### 🏭 **Production** (NixOS)
```bash
sudo ./deploy_nixos.sh full
# → Injection directe, automation complète
```

### ☁️ **Cloud/CI** (Linux Docker)
```bash
# Utiliser la configuration Linux native
./run_bot_nix.sh run params.json
```

---

## 🐛 Résolution de Problèmes

### ❌ "FFmpeg non trouvé"
```bash
# Installer Nix (recommandé)
curl -L https://nixos.org/nix/install | sh

# Ou installer FFmpeg directement
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

### ❌ "Dispositifs non trouvés"
```bash
# Lancer le diagnostic
./test_universal.sh

# Voir la section spécifique à votre plateforme
```

### ❌ "Permission denied"
```bash
# Linux: ajouter votre utilisateur aux groupes
sudo usermod -a -G video,audio $USER

# Redémarrer la session
```

---

## 📚 Documentation Avancée

| Fichier | Description |
|---------|-------------|
| `NIXOS_SETUP.md` | Configuration NixOS avancée |
| `test_universal.sh` | Diagnostic complet |
| `run_bot_nix.sh help` | Toutes les options |

---

## ✨ Points Forts

- 🌍 **Universel** : Fonctionne sur toutes les plateformes
- 🔄 **Automatique** : Détection et configuration auto
- 🎯 **Flexible** : Mode développement ou production
- 🚀 **Simple** : 3 commandes pour démarrer
- 🔧 **Maintenu** : Scripts de diagnostic intégrés
- 📦 **Isolé** : Environnement Nix reproductible

---

## 🎉 Conclusion

Votre **Meet Teams Bot** fonctionne maintenant **partout** ! 

- **Sur macOS** : Parfait pour le développement ✅
- **Sur NixOS** : Parfait pour la production ✅  
- **Sur Linux** : Compatible et extensible ✅
- **Sur Windows** : Support expérimental ⚠️

### 🚀 Prochaines étapes

1. **Testez** : `./test_universal.sh`
2. **Configurez** : Éditez `params.json` avec votre meeting
3. **Lancez** : `./run_bot_nix.sh run params.json`
4. **Profitez** ! 🎊

---

> 💡 **Astuce** : Le projet s'améliore automatiquement selon votre plateforme. Plus besoin de configuration manuelle ! 