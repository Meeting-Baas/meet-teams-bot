# Configuration principale du système NixOS
{ config, pkgs, ... }:

{
  imports = [ ];

  # Configuration de base du système
  system.stateVersion = "23.11";

  # Configuration du boot
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  
  # Modules du kernel nécessaires pour les dispositifs virtuels
  boot.kernelModules = [ "v4l2loopback" "snd-aloop" ];
  boot.extraModulePackages = with config.boot.kernelPackages; [ 
    v4l2loopback.out 
  ];
  
  # Configuration des modules v4l2loopback
  boot.kernelParams = [
    "v4l2loopback.devices=1"
    "v4l2loopback.video_nr=10"
    "v4l2loopback.card_label=VirtualCam"
    "v4l2loopback.exclusive_caps=1"
  ];

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
    
    # PulseAudio system-wide (nécessaire pour les dispositifs virtuels)
    pulseaudio = {
      enable = true;
      systemWide = true;
      support32Bit = true;
      extraConfig = ''
        # Configuration pour dispositifs virtuels
        load-module module-udev-detect tsched=0
        load-module module-null-sink sink_name=virtual_mic rate=48000 sink_properties=device.description="Microphone_Virtuel"
        load-module module-virtual-source source_name=virtual_mic_source master=virtual_mic.monitor source_properties=device.description="Microphone_Virtuel_Source"
        
        # Définir le micro virtuel comme source par défaut
        set-default-source virtual_mic_source
      '';
      tcp = {
        enable = true;
        anonymousClients.allowAll = true;
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
        4713  # PulseAudio TCP
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
    ffmpeg-full
    unzip
    awscli2
    playwright-driver
    gnupg

    # Outils X11
    xvfb-run
    x11vnc
    fluxbox
    xorg.xwininfo
    
    # Outils audio/vidéo
    pulseaudio
    pavucontrol
    alsa-utils
    v4l-utils
    
    # Outils de debug
    lsof
    pciutils
    usbutils
  ];

  # Configuration des utilisateurs
  users.users.recording-bot = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" "pulse" "pulse-access" ];
    initialPassword = "recording-bot";
  };
  
  # Configuration des groupes pour PulseAudio
  users.groups.pulse-access = {};

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
  
  # Permissions pour les dispositifs
  security.sudo.wheelNeedsPassword = false;
  
  # Configuration des règles udev pour les dispositifs vidéo
  services.udev.extraRules = ''
    # Règles pour v4l2loopback
    KERNEL=="video[0-9]*", GROUP="video", MODE="0664"
    SUBSYSTEM=="video4linux", GROUP="video", MODE="0664"
    
    # Permissions spéciales pour /dev/video10
    KERNEL=="video10", GROUP="video", MODE="0666"
  '';
  
  # Scripts de démarrage pour initialiser les dispositifs
  systemd.services.setup-virtual-devices = {
    description = "Setup virtual audio/video devices";
    wantedBy = [ "multi-user.target" ];
    after = [ "sound.target" ];
    
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      User = "root";
    };
    
    script = ''
      # Attendre que les dispositifs soient prêts
      sleep 2
      
      # Vérifier que le dispositif vidéo existe
      if [ ! -e /dev/video10 ]; then
        echo "Erreur: /dev/video10 n'existe pas"
        ${pkgs.kmod}/bin/modprobe v4l2loopback video_nr=10 card_label="VirtualCam" exclusive_caps=1
      fi
      
      # Donner les bonnes permissions
      ${pkgs.coreutils}/bin/chmod 666 /dev/video10
      ${pkgs.coreutils}/bin/chgrp video /dev/video10
      
              echo "Virtual devices configured successfully"
    '';
  };
} 