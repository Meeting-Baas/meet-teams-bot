#!/bin/bash

# Script de déploiement automatique pour NixOS
# Déploie la configuration avec dispositifs virtuels audio/vidéo

set -e

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

show_help() {
    echo "Script de déploiement NixOS pour Meet Teams Bot"
    echo
    echo "Usage:"
    echo "  $0 check                    - Vérifier la configuration sans l'appliquer"
    echo "  $0 build                    - Construire la configuration"
    echo "  $0 deploy                   - Déployer la configuration (nixos-rebuild switch)"
    echo "  $0 test                     - Tester la configuration (nixos-rebuild test)"
    echo "  $0 full                     - Déployer + configurer + tester les dispositifs"
    echo "  $0 rollback                 - Revenir à la génération précédente"
    echo "  $0 status                   - Afficher le statut des services"
    echo "  $0 help                     - Afficher cette aide"
    echo
    echo "Exemples:"
    echo "  $0 check      # Vérifier la syntaxe"
    echo "  $0 deploy     # Appliquer la configuration"
    echo "  $0 full       # Déploiement complet avec test"
}

check_nixos() {
    if [ ! -f /etc/nixos/configuration.nix ]; then
        print_error "Ce script nécessite NixOS"
        exit 1
    fi
    
    if [ ! -f ./configuration.nix ]; then
        print_error "configuration.nix non trouvé dans le répertoire actuel"
        exit 1
    fi
    
    print_success "Environnement NixOS détecté"
}

check_config() {
    print_info "Vérification de la configuration NixOS..."
    
    # Vérifier la syntaxe de la configuration
    if sudo nixos-rebuild dry-build --flake .#recording-bot 2>/dev/null; then
        print_success "Configuration valide"
    else
        print_warning "Tentative avec configuration locale..."
        if sudo nix-instantiate '<nixpkgs/nixos>' -A system --arg configuration "$(pwd)/configuration.nix" >/dev/null 2>&1; then
            print_success "Configuration locale valide"
        else
            print_error "Configuration invalide"
            return 1
        fi
    fi
}

build_config() {
    print_info "Construction de la configuration..."
    
    if sudo nixos-rebuild build --flake .#recording-bot; then
        print_success "Configuration construite avec succès"
    else
        print_warning "Échec de construction avec flake, tentative alternative..."
        if sudo nixos-rebuild build -I nixos-config="$(pwd)/configuration.nix"; then
            print_success "Configuration construite avec succès (méthode alternative)"
        else
            print_error "Échec de construction de la configuration"
            return 1
        fi
    fi
}

deploy_config() {
    print_info "Déploiement de la configuration NixOS..."
    print_warning "Cette opération va modifier la configuration système"
    
    read -p "Continuer avec le déploiement ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Déploiement annulé"
        return 0
    fi
    
    # Sauvegarder la configuration actuelle
    sudo cp /etc/nixos/configuration.nix /etc/nixos/configuration.nix.bak.$(date +%Y%m%d_%H%M%S) || true
    
    if sudo nixos-rebuild switch --flake .#recording-bot; then
        print_success "Configuration déployée avec succès"
    else
        print_warning "Échec avec flake, tentative alternative..."
        if sudo nixos-rebuild switch -I nixos-config="$(pwd)/configuration.nix"; then
            print_success "Configuration déployée avec succès (méthode alternative)"
        else
            print_error "Échec du déploiement"
            return 1
        fi
    fi
}

test_config() {
    print_info "Test de la configuration (temporaire)..."
    
    if sudo nixos-rebuild test --flake .#recording-bot; then
        print_success "Configuration testée avec succès"
        print_info "La configuration est temporaire et sera perdue au redémarrage"
    else
        print_warning "Échec avec flake, tentative alternative..."
        if sudo nixos-rebuild test -I nixos-config="$(pwd)/configuration.nix"; then
            print_success "Configuration testée avec succès (méthode alternative)"
        else
            print_error "Échec du test"
            return 1
        fi
    fi
}

setup_devices() {
    print_info "Configuration des dispositifs virtuels..."
    
    if [ -x ./setup_virtual_devices_nix.sh ]; then
        ./setup_virtual_devices_nix.sh
    else
        print_warning "Script setup_virtual_devices_nix.sh non trouvé ou non exécutable"
        print_info "Configuration manuelle des dispositifs..."
        
        # Configuration manuelle basique
        sudo modprobe v4l2loopback video_nr=10 card_label="VirtualCam" exclusive_caps=1 || print_warning "Échec chargement v4l2loopback"
        sudo modprobe snd_aloop || print_warning "Échec chargement snd_aloop"
        
        if systemctl is-active --quiet pulseaudio; then
            print_success "PulseAudio actif"
        else
            sudo systemctl start pulseaudio || print_warning "Échec démarrage PulseAudio"
        fi
    fi
}

show_status() {
    print_info "=== Statut des services ==="
    
    # Services système
    echo
    print_info "Services systemd:"
    systemctl is-active --quiet pulseaudio && print_success "✓ pulseaudio" || print_warning "✗ pulseaudio"
    systemctl is-active --quiet setup-virtual-devices && print_success "✓ setup-virtual-devices" || print_warning "✗ setup-virtual-devices"
    
    # Services recording-bot
    for i in {1..2}; do
        systemctl is-active --quiet recording-bot-$i && print_success "✓ recording-bot-$i" || print_warning "✗ recording-bot-$i"
    done
    
    # Dispositifs
    echo
    print_info "Dispositifs:"
    [ -e /dev/video10 ] && print_success "✓ /dev/video10" || print_warning "✗ /dev/video10"
    
    if command -v pactl >/dev/null 2>&1; then
        if pactl list sources short | grep -q virtual_mic_source; then
            print_success "✓ virtual_mic_source"
        else
            print_warning "✗ virtual_mic_source"
        fi
    fi
    
    # Modules kernel
    echo
    print_info "Modules kernel:"
    lsmod | grep -q v4l2loopback && print_success "✓ v4l2loopback" || print_warning "✗ v4l2loopback"
    lsmod | grep -q snd_aloop && print_success "✓ snd_aloop" || print_warning "✗ snd_aloop"
    
    # Génération NixOS actuelle
    echo
    print_info "Génération NixOS actuelle:"
    nixos-version
    ls -l /nix/var/nix/profiles/system | head -1
}

rollback_config() {
    print_info "Rollback vers la génération précédente..."
    print_warning "Cette opération va revenir à la configuration précédente"
    
    read -p "Continuer avec le rollback ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Rollback annulé"
        return 0
    fi
    
    if sudo nixos-rebuild switch --rollback; then
        print_success "Rollback effectué avec succès"
    else
        print_error "Échec du rollback"
        return 1
    fi
}

full_deploy() {
    print_info "=== Déploiement complet ==="
    
    check_nixos
    check_config || exit 1
    build_config || exit 1
    deploy_config || exit 1
    
    print_info "Attente que les services se stabilisent..."
    sleep 5
    
    setup_devices
    show_status
    
    print_success "=== Déploiement complet terminé ==="
    print_info "Vous pouvez maintenant tester avec:"
    print_info "  ./run_bot_nix.sh setup"
    print_info "  ./run_bot_nix.sh run params.json"
}

main() {
    case "${1:-}" in
        "check")
            check_nixos
            check_config
            ;;
        "build")
            check_nixos
            check_config || exit 1
            build_config
            ;;
        "deploy")
            check_nixos
            check_config || exit 1
            deploy_config
            ;;
        "test")
            check_nixos
            check_config || exit 1
            test_config
            ;;
        "full")
            full_deploy
            ;;
        "rollback")
            check_nixos
            rollback_config
            ;;
        "status")
            show_status
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            print_error "Commande inconnue: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@" 