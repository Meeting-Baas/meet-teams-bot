# Configuration principale du système NixOS
{ config, pkgs, ... }:

{
  imports = [ ];

  # Configuration de base du système
  system.stateVersion = "23.11";

  # Configuration du boot
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Activation des services nécessaires
  services = {
    # RabbitMQ
    rabbitmq = {
      enable = true;
      plugins = [ "rabbitmq_management" ];
      listenAddress = "0.0.0.0";
    };

    # X Server pour le navigateur headless
    xserver = {
      enable = true;
      displayManager = {
        startx.enable = true;
      };
    };
  };

  # Configuration réseau
  networking = {
    hostName = "recording-bot";
    firewall = {
      enable = true;
      allowedTCPPorts = [ 
        5672  # RabbitMQ
        15672 # RabbitMQ Management
        4444  # VNC (si nécessaire)
      ];
    };
  };

  # Paquets système nécessaires
  environment.systemPackages = with pkgs; [
    # Outils de base
    git
    vim
    wget
    curl

    # Dépendances du bot
    nodejs_20
    ffmpeg
    unzip
    awscli2
    playwright-driver
    gnupg

    # Outils X11
    xvfb-run
    x11vnc
    fluxbox
    xorg.xwininfo
  ];

  # Configuration des utilisateurs
  users.users.recording-bot = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" ];
    initialPassword = "recording-bot";
  };

  # Activation du service recording-bot
  services.recording-bot = {
    enable = true;
    instances = 2;  # Nombre d'instances par défaut
    rabbitmq = {
      host = "localhost";
      port = 5672;
    };
  };

  # Configuration de la virtualisation
  virtualisation.virtualbox.guest.enable = true;
} 