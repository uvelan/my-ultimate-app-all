#!/bin/bash

# Mobile Software Factory - Production Build Helper

echo "🚀 Starting Production Build Process..."

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Check for EAS CLI
if ! command -v eas &> /dev/null
then
    echo "⚠️ EAS CLI not found. Please install it with: npm install -g eas-cli"
    exit
fi

# 3. Build Preview (APK)
echo "📱 To build an Android APK for testing, run:"
echo "eas build --platform android --profile preview"

# 4. Build Production (AAB)
echo "📦 To build for Google Play Store, run:"
echo "eas build --platform android --profile production"

# 5. Local Build (Native)
echo "🛠️ To trigger a local native build (requires Android Studio/SDK):"
echo "npx expo run:android"
