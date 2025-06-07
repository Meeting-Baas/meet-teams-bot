#!/bin/bash
# Script d'installation NixOS simple à taper dans la VM

echo "🛠️ Installation NixOS pour Meet Teams Bot"

# Partitionnement simple
parted /dev/vda -- mklabel gpt
parted /dev/vda -- mkpart primary 512MiB -8GiB
parted /dev/vda -- mkpart primary linux-swap -8GiB 100%
parted /dev/vda -- mkpart ESP fat32 1MiB 512MiB
parted /dev/vda -- set 3 esp on

# Formatage
mkfs.ext4 -L nixos /dev/vda1
mkswap -L swap /dev/vda2
mkfs.fat -F 32 -n boot /dev/vda3

# Montage
mount /dev/disk/by-label/nixos /mnt
mkdir -p /mnt/boot
mount /dev/disk/by-label/boot /mnt/boot
swapon /dev/vda2

# Configuration rapide
nixos-generate-config --root /mnt

# Configuration basique
cat > /mnt/etc/nixos/configuration.nix << 'EOF'
{ config, pkgs, ... }:
{
  imports = [ ./hardware-configuration.nix ];
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  networking.hostName = "nixos-meetbot";
  networking.networkmanager.enable = true;
  users.users.meetbot = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" "video" "audio" ];
    initialPassword = "meetbot";
  };
  environment.systemPackages = with pkgs; [ git nodejs_20 ffmpeg-full curl wget ];
  services.openssh.enable = true;
  boot.kernelModules = [ "v4l2loopback" ];
  boot.extraModulePackages = with config.boot.kernelPackages; [ v4l2loopback ];
  services.pulseaudio.enable = true;
  services.pulseaudio.systemWide = true;
  system.stateVersion = "23.11";
}
EOF

# Installation
nixos-install --no-root-passwd

echo "✅ Installation terminée ! Tapez 'reboot'" 