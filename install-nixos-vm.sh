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
