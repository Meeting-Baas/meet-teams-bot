#!/bin/bash

# Script to start OBS Virtual Camera automatically
echo "🎥 Starting OBS Virtual Camera..."

# Generate branding first
if [ ! -f "../branding.mp4" ]; then
    echo "📹 Generating branding..."
    if [ -n "$1" ]; then
        ./generate_custom_branding.sh "$1"
    else
        ./generate_branding.sh "Recording Bot"
    fi
fi

# Start OBS with bot profile
echo "🚀 Launching OBS..."
open -a OBS --args --profile MeetTeamsBot --scene "Bot Scene"

echo "⏳ Waiting for OBS to start..."
sleep 5

# Automate Virtual Camera startup via AppleScript
osascript << 'SCRIPT'
tell application "OBS"
    activate
end tell

delay 3

tell application "System Events"
    tell process "OBS"
        try
            click menu item "Start Virtual Camera" of menu "Tools" of menu bar 1
            display notification "Virtual Camera started" with title "OBS"
        on error
            display alert "Cannot start Virtual Camera automatically" message "Please manually click Tools > Start Virtual Camera"
        end try
    end tell
end tell
SCRIPT

echo "✅ OBS Virtual Camera configured!"
echo "👀 Select 'OBS Virtual Camera' in your meeting"
