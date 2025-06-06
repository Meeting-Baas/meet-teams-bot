{
  description = "Recording Bot NixOS Image";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
    in
    flake-utils.lib.eachSystem supportedSystems (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = {
          recording-bot = pkgs.stdenv.mkDerivation {
            name = "recording-bot";
            version = "1.0.0";
            
            src = ./.;
            
            buildInputs = with pkgs; [
              nodejs_20
              ffmpeg
              playwright-driver
            ];
            
            buildPhase = ''
              mkdir -p $out/opt/recording-bot
              cp -r . $out/opt/recording-bot/
            '';
          };
          
          default = self.packages.${system}.recording-bot;
        };
        
        # NixOS configuration seulement disponible pour Linux
        nixosConfigurations = if (builtins.match ".*-linux" system) != null
          then {
            recording-bot = nixpkgs.lib.nixosSystem {
              inherit system;
              modules = [
                ./configuration.nix
                ./modules/recording-bot.nix
              ];
            };
          }
          else {};
      });
} 