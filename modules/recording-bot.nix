# Module NixOS pour le Recording Bot
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
        description = "Nombre d'instances du recording bot à exécuter";
      };

      rabbitmq = {
        host = mkOption {
          type = types.str;
          default = "localhost";
          description = "Hôte RabbitMQ";
        };

        port = mkOption {
          type = types.port;
          default = 5672;
          description = "Port RabbitMQ";
        };
      };

      workingDirectory = mkOption {
        type = types.path;
        default = "/opt/recording-bot";
        description = "Répertoire de travail du bot";
      };
    };
  };

  config = mkIf cfg.enable {
    # Création du répertoire de travail
    system.activationScripts.recording-bot-dirs = ''
      mkdir -p ${cfg.workingDirectory}
      chown -R recording-bot:users ${cfg.workingDirectory}
    '';

    # Services systemd pour chaque instance
    systemd.services = builtins.listToAttrs (map (n: {
      name = "recording-bot-${toString n}";
      value = {
        description = "Recording Bot Instance ${toString n}";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" "rabbitmq.service" ];
        
        environment = {
          NODE_NAME = "bot-${toString n}";
          DISPLAY = ":${toString (99 + n)}";
          AMQP_ADDRESS = "amqp://${cfg.rabbitmq.host}:${toString cfg.rabbitmq.port}";
          HOME = "${cfg.workingDirectory}";
        };

        serviceConfig = {
          Type = "simple";
          User = "recording-bot";
          Group = "users";
          WorkingDirectory = cfg.workingDirectory;
          
          # Démarrage de Xvfb et du bot
          ExecStartPre = [
            "${pkgs.xorg.xorgserver}/bin/Xvfb :${toString (99 + n)} -screen 0 1280x720x24 -ac +extension GLX +render -noreset &"
          ];
          
          ExecStart = ''
            ${pkgs.nodejs}/bin/node ${cfg.workingDirectory}/recording_server/build/src/main.js
          '';

          Restart = "always";
          RestartSec = "10s";
        };
      };
    }) (range 0 (cfg.instances - 1)));
  };
} 