# Use Node.js 20 with Debian bullseye for better compatibility
FROM node:20-bullseye

# Install system dependencies required for Playwright, Chrome extensions, Xvfb, FFmpeg and AWS CLI
RUN apt-get update \
    && apt-get install -y \
        wget \
        gnupg \
        libnss3 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libgbm1 \
        libxss1 \
        libasound2 \
        libxshmfence1 \
        xvfb \
        x11vnc \
        fluxbox \
        x11-utils \
        ffmpeg \
        curl \
        unzip \
        pulseaudio \
        pulseaudio-utils \
        pavucontrol \
        alsa-utils \
        imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm ci

# Install Playwright with dependencies
RUN npx playwright install --with-deps chromium

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Optimize FFmpeg performance settings
ENV FFMPEG_THREAD_COUNT=0
ENV FFMPEG_PRESET=ultrafast

# Set CPU optimization flags
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Configure PulseAudio for virtual audio
ENV PULSE_RUNTIME_PATH=/tmp/pulse
ENV XDG_RUNTIME_DIR=/tmp/pulse

# Create startup script with audio support
RUN echo '#!/bin/bash\n\
echo "🖥️ Starting virtual display and audio..."\n\
export DISPLAY=:99\n\
export PULSE_RUNTIME_PATH=/tmp/pulse\n\
export XDG_RUNTIME_DIR=/tmp/pulse\n\
\n\
# Create pulse runtime directory\n\
mkdir -p $PULSE_RUNTIME_PATH\n\
\n\
# Start Xvfb avec résolution augmentée pour compenser le crop plus important\n\
Xvfb :99 -screen 0 1280x880x24 -ac +extension GLX +render -noreset &\n\
XVFB_PID=$!\n\
echo "✅ Virtual display started (PID: $XVFB_PID)"\n\
\n\
# Start VNC server for remote debugging (simple password for macOS compatibility)\n\
x11vnc -display :99 -forever -passwd debug -listen 0.0.0.0 -rfbport 5900 -shared -noxdamage -noxfixes -noscr -fixscreen 3 -bg -o /tmp/x11vnc.log &\n\
VNC_PID=$!\n\
echo "✅ VNC server started on port 5900 (PID: $VNC_PID)"\n\
echo "🔑 VNC password: debug"\n\
\n\
# Start PulseAudio in USER mode (pas system)\n\
pulseaudio --start --log-target=stderr --log-level=notice &\n\
PULSE_PID=$!\n\
echo "✅ PulseAudio started (PID: $PULSE_PID)"\n\
\n\
# Wait for display and audio to be ready\n\
sleep 3\n\
\n\
# Create a null audio sink for recording\n\
pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description=Virtual_Speaker\n\
\n\
# Create a virtual microphone source\n\
pactl load-module module-virtual-source source_name=virtual_mic\n\
\n\
echo "✅ Virtual audio devices created"\n\
echo "🔍 VNC available at localhost:5900 for debugging"\n\
\n\
echo "🚀 Starting application..."\n\
cd /app/\n\
node build/src/main.js\n\
\n\
# Cleanup\n\
kill $PULSE_PID 2>/dev/null || true\n\
kill $VNC_PID 2>/dev/null || true\n\
kill $XVFB_PID 2>/dev/null || true\n\
' > /start.sh && chmod +x /start.sh

WORKDIR /app/

ENV SERVERLESS=true
ENV NODE_ENV=production
ENV DISPLAY=:99
ENV PULSE_RUNTIME_PATH=/tmp/pulse
ENV XDG_RUNTIME_DIR=/tmp/pulse

# Expose VNC port for debugging
EXPOSE 5900

ENTRYPOINT ["/start.sh"]
