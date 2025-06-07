{
  description = "Recording Bot NixOS Image";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = self.nixosConfigurations.recording-bot.config.system.build.virtualBoxOVA;

        nixosConfigurations.recording-bot = nixpkgs.lib.nixosSystem {
          inherit system;
          modules = [
            ./configuration.nix
            ./modules/recording-bot.nix
          ];
        };
      }
    );
} 