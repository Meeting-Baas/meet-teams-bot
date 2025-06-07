# NixOS module for Recording Bot
{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.recording-bot;
in {
  options = {
    services.recording-bot = {
      enable = mkEnableOption "Recording Bot Service";
      
      instances = mkOption {
        type = types.int;
        default = 1;
        description = "Number of recording bot instances to run";
      };

      rabbitmq = {
        host = mkOption {
          type = types.str;
          default = "localhost";
          description = "RabbitMQ host";
        };

        port = mkOption {
          type = types.port;
          default = 5672;
          description = "RabbitMQ port";
        };
      };

      workingDirectory = mkOption {
        type = types.path;
        default = "/opt/recording-bot";
        description = "Bot working directory";
      };
    };
  };

  config = mkIf cfg.enable {
            # Create working directory
    system.activationScripts.recording-bot-dirs = ''
      mkdir -p ${cfg.workingDirectory}
      mkdir -p ${cfg.workingDirectory}/recordings
      mkdir -p /var/run/pulse
      mkdir -p /var/lib/pulse
      chown -R recording-bot:users ${cfg.workingDirectory}
      chown -R pulse:pulse-access /var/run/pulse
      chown -R pulse:pulse-access /var/lib/pulse
    '';

    # Systemd services for each instance
    systemd.services = builtins.listToAttrs (map (n: {
      name = "recording-bot-${toString n}";
      value = {
        description = "Recording Bot Instance ${toString n}";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" "rabbitmq.service" "pulseaudio.service" "setup-virtual-devices.service" ];
        requires = [ "setup-virtual-devices.service" ];
        
        environment = {
          NODE_NAME = "bot-${toString n}";
          DISPLAY = ":${toString (99 + n)}";
          AMQP_ADDRESS = "amqp://${cfg.rabbitmq.host}:${toString cfg.rabbitmq.port}";
          HOME = "${cfg.workingDirectory}";
          
          # Variables for audio/video devices
          PULSE_SERVER = "unix:/var/run/pulse/native";
          PULSE_RUNTIME_PATH = "/var/run/pulse";
          
          # To force use of virtual devices
          V4L2_DEVICE = "/dev/video10";
          PULSE_SOURCE = "virtual_mic_source";
          PULSE_SINK = "virtual_mic";
        };

        serviceConfig = {
          Type = "simple";
          User = "recording-bot";
          Group = "users";
          WorkingDirectory = cfg.workingDirectory;
          
          # Additional permissions for devices
          SupplementaryGroups = [ "video" "audio" "pulse" "pulse-access" ];
          
          # Start Xvfb and bot
          ExecStartPre = [
            # Ensure devices are ready
            "${pkgs.coreutils}/bin/sleep 3"
            # Start Xvfb for this instance
            "${pkgs.bash}/bin/bash -c '${pkgs.xorg.xorgserver}/bin/Xvfb :${toString (99 + n)} -screen 0 1280x720x24 -ac +extension GLX +render -noreset > /dev/null 2>&1 &'"
            # Wait for Xvfb to be ready
            "${pkgs.coreutils}/bin/sleep 2"
          ];
          
          ExecStart = ''
            ${pkgs.nodejs_20}/bin/node ${cfg.workingDirectory}/recording_server/build/src/main.js
          '';

          # Configuration pour les permissions et la sécurité
          Restart = "always";
          RestartSec = "10s";
          
          # Permettre l'accès aux dispositifs
          DeviceAllow = [
            "/dev/video10 rw"
            "char-alsa rw"
            "char-input rw"
          ];
          
          # Variables d'environnement pour le processus
          Environment = [
            "NODE_ENV=production"
            "DISPLAY=:${toString (99 + n)}"
            "PULSE_SERVER=unix:/var/run/pulse/native"
          ];
        };
        
        # Script de nettoyage à l'arrêt
        preStop = ''
          # Tuer les processus Xvfb de cette instance
          ${pkgs.procps}/bin/pkill -f "Xvfb :${toString (99 + n)}" || true
          
          # Nettoyer les fichiers temporaires
          ${pkgs.coreutils}/bin/rm -f /tmp/.X${toString (99 + n)}-lock || true
        '';
      };
    }) (range 0 (cfg.instances - 1)));
    
    # Service de diagnostic pour vérifier les dispositifs
    systemd.services.recording-bot-diagnostics = {
      description = "Recording Bot Diagnostics";
      wantedBy = [ "multi-user.target" ];
      after = [ "setup-virtual-devices.service" "pulseaudio.service" ];
      
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = false;
        User = "recording-bot";
        Group = "users";
      };
      
      script = ''
        echo "=== Recording Bot Diagnostics ==="
        
        # Vérifier les dispositifs vidéo
        echo "Available video devices:"
        ${pkgs.v4l-utils}/bin/v4l2-ctl --list-devices || true
        
        if [ -e /dev/video10 ]; then
          echo "✓ /dev/video10 existe"
          ${pkgs.coreutils}/bin/ls -la /dev/video10
        else
          echo "✗ /dev/video10 n'existe pas"
        fi
        
        # Vérifier PulseAudio
        echo "Sources audio PulseAudio:"
        export PULSE_SERVER=unix:/var/run/pulse/native
        ${pkgs.pulseaudio}/bin/pactl list sources short || true
        
        echo "Sinks audio PulseAudio:"
        ${pkgs.pulseaudio}/bin/pactl list sinks short || true
        
        # Vérifier ffmpeg
        echo "Test ffmpeg avec dispositifs virtuels:"
        ${pkgs.ffmpeg-full}/bin/ffmpeg -hide_banner -f v4l2 -list_formats all -i /dev/video10 2>&1 | head -10 || true
        
        echo "=== Fin des diagnostics ==="
      '';
    };
  };
} 