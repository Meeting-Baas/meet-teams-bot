#!/bin/bash

# Universal custom branding generation script
# Downloads image from URL and creates branding video
# Works on macOS, Linux, NixOS

set -e

export CUSTOM_IMAGE_URL=$1
export DOWNLOADED_IMAGE=custom_branding_image.jpg
export TEMP_VIDEO=temp_custom_branding.mp4
export FINAL_VIDEO=branding.mp4

# Platform detection
PLATFORM=$(uname -s)
IS_MACOS=false
IS_LINUX=false

case $PLATFORM in
    "Darwin")
        IS_MACOS=true
        echo "🍎 macOS detected - Custom branding mode"
        ;;
    "Linux")
        IS_LINUX=true
        echo "🐧 Linux detected - Custom branding mode"
        ;;
    *)
        echo "⚠️  Platform $PLATFORM not tested, trying Linux mode"
        IS_LINUX=true
        ;;
esac

cd ..

echo "🌐 Downloading custom image from: $CUSTOM_IMAGE_URL"

# Download image
if command -v curl &> /dev/null; then
    if curl -L -o "$DOWNLOADED_IMAGE" "$CUSTOM_IMAGE_URL"; then
        echo "✅ Image downloaded with curl: $DOWNLOADED_IMAGE"
    else
        echo "❌ Download failed with curl"
        exit 1
    fi
elif command -v wget &> /dev/null; then
    if wget -O "$DOWNLOADED_IMAGE" "$CUSTOM_IMAGE_URL"; then
        echo "✅ Image downloaded with wget: $DOWNLOADED_IMAGE"
    else
        echo "❌ Download failed with wget"
        exit 1
    fi
else
    echo "❌ Neither curl nor wget available to download image"
    exit 1
fi

# Check if image was downloaded
if [ ! -f "$DOWNLOADED_IMAGE" ]; then
    echo "❌ Image was not downloaded correctly"
    exit 1
fi

# Check file size
FILE_SIZE=$(du -h "$DOWNLOADED_IMAGE" | cut -f1)
echo "📏 Image size: $FILE_SIZE"

# Generate video from custom image
echo "🎬 Generating custom branding video..."
if command -v ffmpeg &> /dev/null; then
    # Resize and convert image, then create video
    # Create 3-second video with custom image
    ffmpeg -loop 1 -i "$DOWNLOADED_IMAGE" \
        -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black" \
        -c:v libx264 -r 30 -t 3 -pix_fmt yuv420p \
        "$FINAL_VIDEO" -y
    
    echo "✅ Custom branding video generated: $FINAL_VIDEO"
else
    echo "❌ FFmpeg not available"
    exit 1
fi

# Platform-specific configuration (same logic as generate_branding.sh)
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

# Display info about final file
if [ -f "$FINAL_VIDEO" ]; then
    FINAL_SIZE=$(du -h "$FINAL_VIDEO" | cut -f1)
    echo "📊 Final video size: $FINAL_SIZE"
    
    # Display video info
    if command -v ffprobe &> /dev/null; then
        echo "📹 Video information:"
        ffprobe -v quiet -print_format json -show_format -show_streams "$FINAL_VIDEO" | \
            grep -E '"width"|"height"|"duration"|"codec_name"' | head -6
    fi
fi

# Cleanup (keep downloaded image for debugging, only remove temporary files)
rm -f "$TEMP_VIDEO"

echo "🎉 Custom branding generated successfully!"
echo "📁 Final file: $FINAL_VIDEO"
echo "🖼️  Source image kept: $DOWNLOADED_IMAGE" 