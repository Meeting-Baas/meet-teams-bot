#!/bin/bash

# Universal branding generation script
# Works on macOS, Linux, NixOS

set -e

export BOTNAME=$1
export TEXTFILE=botname.txt
export IMAGE=branding_template.png
export TEMP_VIDEO=temp_branding.mp4
export FINAL_VIDEO=branding.mp4

# Platform detection
PLATFORM=$(uname -s)
IS_MACOS=false
IS_LINUX=false

case $PLATFORM in
    "Darwin")
        IS_MACOS=true
        echo "🍎 macOS detected - Native branding mode"
        ;;
    "Linux")
        IS_LINUX=true
        echo "🐧 Linux detected - v4l2 branding mode"
        ;;
    *)
        echo "⚠️  Platform $PLATFORM not tested, trying Linux mode"
        IS_LINUX=true
        ;;
esac

cd ..

# Check if template image exists
if [ ! -f "$IMAGE" ]; then
    echo "⚠️  $IMAGE not found, creating default image..."
    
    # Create default image with ffmpeg
    if command -v ffmpeg &> /dev/null; then
        ffmpeg -f lavfi -i "color=c=blue:size=640x360:d=1" -frames:v 1 "$IMAGE" -y
        echo "✅ Default image created: $IMAGE"
    else
        echo "❌ FFmpeg not available, cannot create default image"
        exit 1
    fi
fi

# Write botname to file
echo "$BOTNAME" > "$TEXTFILE"
echo "📝 Bot name: $BOTNAME"

# Generate video
echo "🎬 Generating branding video..."
if command -v ffmpeg &> /dev/null; then
    # Generate temporary video
    ffmpeg -loop 1 -i "$IMAGE" -c:v libx264 -r 1 -t 3 -pix_fmt yuv420p "$TEMP_VIDEO" -y
    
    # Add text overlay
    ffmpeg -i "$TEMP_VIDEO" \
        -vf "drawtext=textfile=./${TEXTFILE}:x=(w-text_w)/2:y=(h-text_h)/2:fontsize=30:fontcolor=white" \
        -c:a copy "$FINAL_VIDEO" -y
    
    echo "✅ Branding video generated: $FINAL_VIDEO"
else
    echo "❌ FFmpeg not available"
    exit 1
fi

# Platform-specific configuration
if [ "$IS_LINUX" = true ]; then
    echo "🐧 Configuring Linux virtual devices..."
    
    # Check if on NixOS (devices already configured)
    if [ -e /dev/video10 ]; then
        echo "✅ /dev/video10 already available (NixOS)"
    else
        # Try to load v4l2loopback on standard Linux
        if command -v modprobe &> /dev/null; then
            echo "🔧 Loading v4l2loopback..."
            if sudo -n modprobe -v v4l2loopback devices=1 video_nr=10 max_buffers=2 exclusive_caps=1 card_label="Default WebCam" 2>/dev/null; then
                echo "✅ v4l2loopback loaded successfully"
            else
                echo "⚠️  v4l2loopback not available, continuing without virtual device"
            fi
        fi
    fi
elif [ "$IS_MACOS" = true ]; then
    echo "🍎 macOS configuration..."
    echo "ℹ️  On macOS, branding will be read from generated file"
    echo "ℹ️  For direct injection, install OBS Virtual Camera"
fi

# Cleanup
rm -f "$TEXTFILE" "$TEMP_VIDEO"

echo "🎉 Branding generated successfully!"
echo "📁 Final file: $FINAL_VIDEO" 