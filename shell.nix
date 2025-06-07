{ pkgs ? import <nixpkgs> {} }:

let
  # Packages disponibles sur toutes les plateformes
  commonPackages = [
    pkgs.nodejs_20
    pkgs.ffmpeg
    pkgs.curl
    pkgs.unzip
    pkgs.awscli2
    pkgs.playwright-driver
    pkgs.gnupg
    pkgs.wget
  ];

  # Packages spécifiques à Linux (pour les serveurs headless)
  linuxPackages = [
    pkgs.xorg.xvfb
    pkgs.x11vnc
    pkgs.fluxbox
    pkgs.xorg.xwininfo
    pkgs.nss
    pkgs.atk
    pkgs.libdrm
    pkgs.libxkbcommon
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXrandr
    pkgs.mesa
    pkgs.xorg.libXScrnSaver
    pkgs.alsa-lib
    pkgs.xorg.libXext
  ];

  # Packages selon la plateforme
  platformPackages = if pkgs.stdenv.isDarwin 
    then commonPackages 
    else commonPackages ++ linuxPackages;

in pkgs.mkShell {
  buildInputs = platformPackages;

  shellHook = if pkgs.stdenv.isDarwin then ''
    export DISPLAY=:0
    echo "🚀 Environnement Nix prêt pour meet-teams-bot (macOS)"
    echo ""
    echo "Pour démarrer:"
    echo "1. Installe les dépendances: npm install --prefix recording_server && npm install --prefix recording_server/chrome_extension"
    echo "2. Build le projet: npm run build --prefix recording_server && npm run build --prefix recording_server/chrome_extension"
    echo "3. Lance l'app: cd recording_server && node build/src/main.js"
    echo ""
    echo "Note: Sur macOS, pas besoin de Xvfb - Playwright peut utiliser le système de fenêtrage natif"
    echo "Note: Extension Chrome mise à jour vers Webpack 5 + TypeScript 5 pour Node.js 20"
    echo ""
  '' else ''
    export DISPLAY=:99
    echo "🚀 Environnement Nix prêt pour meet-teams-bot (Linux)"
    echo ""
    echo "Pour démarrer:"
    echo "1. Installe les dépendances: npm install --prefix recording_server && npm install --prefix recording_server/chrome_extension"
    echo "2. Build le projet: npm run build --prefix recording_server && npm run build --prefix recording_server/chrome_extension"
    echo "3. Démarre Xvfb: Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &"
    echo "4. Lance l'app: cd recording_server && node build/src/main.js"
    echo ""
  '';
}
