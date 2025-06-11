{ pkgs ? import <nixpkgs> {} }:

let
  # Packages disponibles sur toutes les plateformes
  commonPackages = [
    pkgs.nodejs_20
    pkgs.ffmpeg
    pkgs.curl
    pkgs.unzip
    pkgs.awscli2
    # playwright-driver retiré - géré par npm pour version 1.50.1 (Manifest V2)
    pkgs.gnupg
    pkgs.wget
  ];

  # Packages pour les binaires précompilés sur NixOS
  nixosCompatPackages = [
    pkgs.nix-ld  # Pour faire fonctionner les binaires dynamiques sur NixOS
    pkgs.patchelf  # Pour patcher les binaires si nécessaire
  ];

  # Packages spécifiques à Linux (pour les serveurs headless)
  linuxPackages = [
    pkgs.xvfb-run
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
    # Dépendances pour Chromium Playwright
    pkgs.glib
    pkgs.glibc
    pkgs.fontconfig
    pkgs.freetype
    pkgs.dbus
    pkgs.gtk3
    pkgs.libGL
    pkgs.libudev-zero
    pkgs.xorg.libX11
    pkgs.xorg.libXi
    pkgs.cups
    pkgs.expat
    pkgs.xorg.libXfixes
    pkgs.xorg.libxcb
    pkgs.pango
    pkgs.cairo
    pkgs.nspr
  ];

  # Packages selon la plateforme
  platformPackages = if pkgs.stdenv.isDarwin 
    then commonPackages 
    else commonPackages ++ linuxPackages ++ nixosCompatPackages;

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
    echo "🚀 Environnement Nix prêt pour meet-teams-bot (Linux/NixOS)"
    echo ""
    echo "🔧 Configuration Playwright pour Manifest V2..."
    # Variables pour Playwright Chromium (supporte Manifest V2)
    export PLAYWRIGHT_BROWSERS_PATH=/home/meetbot/.cache/ms-playwright
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath linuxPackages}:$LD_LIBRARY_PATH"
    export FONTCONFIG_PATH="${pkgs.fontconfig.out}/etc/fonts"
    
    if [ -d "recording_server" ]; then
      echo "📦 Installation des dépendances npm et Playwright 1.50.1..."
      cd recording_server 
      if [ ! -d "node_modules" ]; then
        echo "Installation npm..."
        npm install
      fi
      echo "Installation Playwright 1.50.1 (Manifest V2)..."
      npx playwright@1.50.1 install chromium
      
      # Configuration nix-ld pour les binaires dynamiques
      export NIX_LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath linuxPackages}"
      export NIX_LD=$(cat ${pkgs.stdenv.cc}/nix-support/dynamic-linker)
      
      # Créer un wrapper pour Chromium avec nix-ld
      CHROME_PATH="/home/meetbot/.cache/ms-playwright/chromium-1155/chrome-linux/chrome"
      if [ -f "$CHROME_PATH" ] && [ ! -f "$CHROME_PATH.original" ]; then
        echo "Création du wrapper NixOS pour Chromium..."
        mv "$CHROME_PATH" "$CHROME_PATH.original"
        cat > "$CHROME_PATH" << EOF
#!/usr/bin/env bash
export NIX_LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath linuxPackages}"
export NIX_LD=\$(cat ${pkgs.stdenv.cc}/nix-support/dynamic-linker)
exec "\$NIX_LD" /home/meetbot/.cache/ms-playwright/chromium-1155/chrome-linux/chrome.original "\$@"
EOF
        chmod +x "$CHROME_PATH"
        echo "✅ Wrapper Chromium créé avec nix-ld"
      fi
      
      cd .. || echo "⚠️  Erreur installation"
    fi
    echo ""
    echo "Pour démarrer:"
    echo "1. Installe les dépendances: npm install --prefix recording_server && npm install --prefix recording_server/chrome_extension"
    echo "2. Build le projet: npm run build --prefix recording_server && npm run build --prefix recording_server/chrome_extension"
    echo "3. Démarre Xvfb: xvfb-run -a -s '-screen 0 1280x720x24' command"
    echo "   OU manuel: Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &"
    echo "4. Lance l'app: cd recording_server && SERVERLESS=true node build/src/main.js"
    echo ""
    echo "🎯 Mode NixOS: xvfb-run et Playwright Chromium (Manifest V2) configurés automatiquement"
    echo ""
  '';
}
