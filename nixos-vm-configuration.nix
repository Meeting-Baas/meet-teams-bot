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
