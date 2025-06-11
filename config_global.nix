# Edit this configuration file to define what should be installed on
# your system.  Help is available in the configuration.nix(5) man page
# and in the NixOS manual (accessible by running 'nixos-help').

{ config, pkgs, ... }:

{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix
    ];

  # Bootloader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  
  # Auto-boot configurations
  boot.loader.timeout = 1; # Fast boot, only 1 second timeout
  boot.initrd.systemd.enable = true; # Faster boot with systemd in initrd
  boot.plymouth.enable = true; # Smooth boot screen
  
  # Kernel parameters for faster boot AND sleep prevention
  boot.kernelParams = [
    "quiet"
    "splash"
    "rd.systemd.show_status=false"
    "rd.udev.log_level=3"
    "udev.log_priority=3"
    "cpufreq.default_governor=performance"
    "mem_sleep_default=none"  # Disable suspend-to-RAM
    "acpi.sleep=none"         # Disable ACPI sleep
    "acpi=noirq"              
  ];

  networking.hostName = "nixos"; # Define your hostname.
  # networking.wireless.enable = true;  # Enables wireless support via wpa_supplicant.

  # Configure network proxy if necessary
  # networking.proxy.default = "http://user:password@proxy:port/";
  # networking.proxy.noProxy = "127.0.0.1,localhost,internal.domain";

  # Enable networking
  networking.networkmanager.enable = true;

  # Set your time zone.
  time.timeZone = "Europe/Paris";

  # Select internationalisation properties.
  i18n.defaultLocale = "en_US.UTF-8";

  i18n.extraLocaleSettings = {
    LC_ADDRESS = "fr_FR.UTF-8";
    LC_IDENTIFICATION = "fr_FR.UTF-8";
    LC_MEASUREMENT = "fr_FR.UTF-8";
    LC_MONETARY = "fr_FR.UTF-8";
    LC_NAME = "fr_FR.UTF-8";
    LC_NUMERIC = "fr_FR.UTF-8";
    LC_PAPER = "fr_FR.UTF-8";
    LC_TELEPHONE = "fr_FR.UTF-8";
    LC_TIME = "fr_FR.UTF-8";
  };

  # Enable the X11 windowing system.
  services.xserver.enable = true;

  # Enable the GNOME Desktop Environment.
  services.xserver.displayManager.gdm.enable = true;
  services.xserver.desktopManager.gnome.enable = true;

  # Disable automatic power management
  services.power-profiles-daemon.enable = false;
  services.upower.enable = pkgs.lib.mkForce false;  # Force disable upower
  
  # System-wide power management settings
  powerManagement = {
    enable = true;
    cpuFreqGovernor = "performance";
    powertop.enable = false;
  };



  # NUCLEAR OPTION - More aggressive systemd sleep prevention
  systemd.services = {
    # Completely mask sleep services
    "systemd-suspend" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
      serviceConfig.ExecStart = "/bin/true";
    };
    "systemd-hibernate" = {
      enable = false; 
      wantedBy = pkgs.lib.mkForce [];
      serviceConfig.ExecStart = "/bin/true";
    };
    "systemd-hybrid-sleep" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
      serviceConfig.ExecStart = "/bin/true";
    };
    "systemd-suspend-then-hibernate" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
      serviceConfig.ExecStart = "/bin/true";
    };
  };

  # Mask sleep targets - this is critical
  systemd.targets = {
    "sleep.target" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
    };
    "suspend.target" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
    };
    "hibernate.target" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
    };
    "hybrid-sleep.target" = {
      enable = false;
      wantedBy = pkgs.lib.mkForce [];
    };
  };

  # FIXED - Completely disable systemd-logind power management
  services.logind = {
    lidSwitch = "ignore";
    lidSwitchExternalPower = "ignore";
    powerKey = "ignore";
    suspendKey = "ignore";
    hibernateKey = "ignore";
    extraConfig = ''
      HandleSuspendKey=ignore
      HandleHibernateKey=ignore
      HandleLidSwitch=ignore
      HandleLidSwitchExternalPower=ignore
      HandlePowerKey=ignore
      IdleAction=ignore
      IdleActionSec=0
      UserStopDelaySec=0
      KillUserProcesses=no
      HandlePowerKeyLongPress=ignore
      HoldoffTimeoutSec=0
    '';
  };

  # Auto-login configuration (fixed deprecated option)
  services.displayManager.autoLogin.enable = true;
  services.displayManager.autoLogin.user = "lazrossi";
  
  # Workaround for GNOME auto-login issues
  systemd.services."getty@tty1".enable = false;
  systemd.services."autovt@tty1".enable = false;

  # Configure keymap in X11
  services.xserver.xkb = {
    layout = "us";
    variant = "";
  };

  # Enable CUPS to print documents.
  services.printing.enable = true;

  # Enable sound with pipewire.
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    # If you want to use JACK applications, uncomment this
    #jack.enable = true;

    # use the example session manager (no others are packaged yet so this is enabled by default,
    # no need to redefine it in your config for now)
    #media-session.enable = true;
  };

  # Enable touchpad support (enabled default in most desktopManager).
  # services.xserver.libinput.enable = true;

  # Define a user account. Don't forget to set a password with 'passwd'.
  users.users.lazrossi = {
    isNormalUser = true;
    description = "Lazare Rossillon";
    extraGroups = [ "networkmanager" "wheel" "docker" ];
    packages = with pkgs; [
    #  thunderbird
    ];
    openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID6ZeJ8awHRlsweaShyEJUFoG2g0IQsKksE4WGt0D6Cm lazare@meetingbaas.com"  
  ];
  };

  # Set Zsh as the default shell for all users
  users.defaultUserShell = pkgs.zsh;

  # Enable Zsh and configure its features/plugins
  programs.zsh = {
    enable = true; # Keep this to ensure Zsh integration
    ohMyZsh = {
      enable = true; # Enable the Oh My Zsh framework
      theme = "robbyrussell"; # Default Oh My Zsh theme, or choose another like "agnoster"
      plugins = [
        "git"          # A very common and useful plugin
        "zsh-autosuggestions" # Use the name for the plugin as recognized by Oh My Zsh
        "zsh-syntax-highlighting" # Use the name for the plugin
        # You can add other plugins as strings if they are standard Oh My Zsh plugins
        # e.g., "python", "docker", "fzf" (if installed)
      ];
    };
 };

  # Install firefox.
  programs.firefox.enable = true;

  # Allow unfree packages
  nixpkgs.config.allowUnfree = true;

  # List packages installed in system profile. To search, run:
  # $ nix search wget
  environment.systemPackages = with pkgs; [
	vim # Do not forget to add an editor to edit configuration.nix! The Nano editor is also installed by default.
	git	
	nodejs_20
	rustc
	tmux
	code-cursor
	zsh
	docker
	docker-compose
	

    #Add development tools
    nodePackages.typescript
    nodePackages.webpack
    nodePackages.webpack-cli
    
    # Other development tools
    yarn
    
    # X11 and display
    xorg.xorgserver
    xorg.xinit
    xorg.xauth
    
    # Media tools
    ffmpeg
    
    # Browser
    chromium
	playwright-driver.browsers  # Use this instead of nodePackages.playwright
    btop

    
    # Utils
    xdg-utils
    procps
    jq
  #  wget
  ];

  # Some programs need SUID wrappers, can be configured further or are
  # started in user sessions.
  # programs.mtr.enable = true;
  # programs.gnupg.agent = {
  #   enable = true;
  #   enableSSHSupport = true;
  # };

  # List services that you want to enable:

  services.openssh = {
    enable = true;
    # You can specify ports directly here, outside of settings.
    # If you change it from 22, remember to specify -p when connecting.
    ports = [ 2227 ]; 
  
    # All the "sshd_config" equivalent options go inside the 'settings' attribute.
    settings = {
      PasswordAuthentication = true; # Keep this true initially for local login or if you plan to use passwords. Set to false later for key-only SSH.
      # This is where 'AllowUsers' goes, as a list of strings:
      AllowUsers = [ "lazrossi" ]; # Crucial for restricting access to your user
      UseDns = true; # Generally good to keep
      X11Forwarding = false; # Set to true if you need graphical applications over SSH
      PermitRootLogin = "prohibit-password"; # Recommended for security
    };
  };

  # Enable Docker
  virtualisation.docker.enable = true;
  
  # Add your user to the docker group (optional, for convenience)

  # Meet Teams Bot Service - Auto-start bots on boot
  systemd.user.services."meet-teams-bot" = {
    description = "Meet Teams Bot - Auto-start multiple bots";
    wantedBy = [ "default.target" ];
    after = [ "graphical-session.target" ];
    wants = [ "graphical-session.target" ];
    environment = {
      PATH = pkgs.lib.mkForce "/run/current-system/sw/bin:/home/lazrossi/.nix-profile/bin";
      HOME = "/home/lazrossi";
      DISPLAY = ":0";
      # Bot configuration
      LOCAL_NETWORK = "192.168.1.43";
      API_SERVER_BASEURL = "http://192.168.1.43:3001";
      SERVERLESS = "false";
      AMQP_ADDRESS = "amqp://192.168.1.43:5672";
      NODE_NAME = "nixos-bot-1";
      REDIS_ADDRESS = "192.168.1.43";
      REDIS_PORT = "6379";
      REDIS_URL = "redis://192.168.1.43:6379";
      AWS_ACCESS_KEY_ID = "minioadmin";
      AWS_SECRET_ACCESS_KEY = "minioadmin";
      AWS_DEFAULT_REGION = "eu-west-3";
      AWS_ENDPOINT_URL = "http://192.168.1.43:9000";
      AWS_S3_VIDEO_BUCKET = "bots-video";
      AWS_S3_TEMPORARY_AUDIO_BUCKET = "local-meeting-baas-audio";
      AWS_S3_LOGS_BUCKET = "meeting-baas-logs";
      S3_BASEURL = "http://192.168.1.43:9000";
      S3_ARGS = "--endpoint-url http://192.168.1.43:9000";
      POD_IP = "127.0.0.1";
      ENVIRON = "local";
      PROFILE = "local";
    };
    serviceConfig = {
      Type = "simple";
      WorkingDirectory = "/home/lazrossi/code/meet-teams-bot";
      ExecStart = "${pkgs.bash}/bin/bash -c 'cd /home/lazrossi/code/meet-teams-bot && ${pkgs.tmux}/bin/tmux new-session -d -s meet-bots'";
      ExecStartPost = "${pkgs.bash}/bin/bash -c 'sleep 5 && ${pkgs.tmux}/bin/tmux send-keys -t meet-bots \"source .env && nix develop --extra-experimental-features nix-command --extra-experimental-features flakes\" Enter && sleep 10 && ${pkgs.tmux}/bin/tmux send-keys -t meet-bots \"multi-api-consumer 3\" Enter'";
      ExecStop = "${pkgs.tmux}/bin/tmux kill-session -t meet-bots";
      Restart = "always";
      RestartSec = "10s";
      RemainAfterExit = true;
      # Start after a brief delay to ensure system is fully ready
      ExecStartPre = "${pkgs.coreutils}/bin/sleep 5";
    };
  };

  # Btop Monitoring Service - Auto-start btop with bot monitoring
  systemd.user.services."btop-monitor" = {
    description = "Btop Monitor - System monitoring";
    wantedBy = [ "default.target" ];
    after = [ "graphical-session.target" ];
    wants = [ "graphical-session.target" ];
    environment = {
      PATH = pkgs.lib.mkForce "/run/current-system/sw/bin:/home/lazrossi/.nix-profile/bin";
      HOME = "/home/lazrossi";
      DISPLAY = ":0";
      TERM = "screen-256color";
    };
    serviceConfig = {
      Type = "simple";
      WorkingDirectory = "/home/lazrossi/code/meet-teams-bot";
      ExecStart = "${pkgs.bash}/bin/bash -c 'cd /home/lazrossi/code/meet-teams-bot && ${pkgs.tmux}/bin/tmux new-session -d -s btop \"${pkgs.btop}/bin/btop\"'";
      ExecStop = "${pkgs.tmux}/bin/tmux kill-session -t btop";
      Restart = "always";
      RestartSec = "10s";
      RemainAfterExit = true;
      ExecStartPre = "${pkgs.coreutils}/bin/sleep 8";
    };
  };

  # Enable the user systemd service
  systemd.user.targets."meet-teams-bot" = {
    description = "Meet Teams Bot target";
    wants = [ "meet-teams-bot.service" ];
  };

  # Enable the btop monitoring service target
  systemd.user.targets."btop-monitor" = {
    description = "Btop Monitor target";
    wants = [ "btop-monitor.service" ];
  };

  # Open ports in the firewall.
  # networking.firewall.allowedTCPPorts = [ ... ];
  # networking.firewall.allowedUDPPorts = [ ... ];
  # Or disable the firewall altogether.
  # networking.firewall.enable = false;

  # This value determines the NixOS release from which the default
  # settings for stateful data, like file locations and database versions
  # on your system were taken. It's perfectly fine and recommended to leave
  # this value at the release version of the first install of this system.
  # Before changing this value read the documentation for this option
  # (e.g. man configuration.nix or on https://nixos.org/nixos/options.html).
  system.stateVersion = "25.05"; # Did you read the comment?

}
