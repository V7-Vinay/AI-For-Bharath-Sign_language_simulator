# User Guide - Accessibility AI System

## Overview

The Accessibility AI System provides real-time speech-to-text transcription and sign language translation for deaf and hard-of-hearing users. Available as a Chrome browser extension and Android mobile app.

## Features

- **Real-time Speech Transcription**: Convert spoken words to text instantly
- **Sign Language Translation**: Translate text to ASL/BSL with animated avatars
- **Multi-language Support**: English, Spanish, French, German, Mandarin
- **Offline Mode**: Queue requests when network is unavailable
- **Customizable Avatars**: Adjust skin tone, clothing, and size
- **Privacy-First**: Audio data is never stored

## Getting Started

### Browser Extension (Chrome)

#### Installation

1. Visit the Chrome Web Store
2. Search for "Accessibility AI"
3. Click "Add to Chrome"
4. Grant microphone permissions when prompted

#### Usage

1. Click the extension icon in your browser toolbar
2. Click "Start Transcription"
3. Speak into your microphone
4. View real-time transcription in the overlay window
5. Watch sign language avatar for visual translation
6. Click "Stop" when finished

#### Settings

- **Language**: Select your preferred spoken language
- **Sign Language**: Choose ASL (American) or BSL (British)
- **Avatar Customization**: Adjust skin tone, clothing, and size
- **Display Settings**: Modify font size and contrast

### Mobile App (Android)

#### Installation

1. Open Google Play Store
2. Search for "Accessibility AI"
3. Tap "Install"
4. Grant microphone permissions when prompted

#### Usage

1. Open the app
2. Tap "Start" button
3. Speak into your device microphone
4. View transcription in scrollable text view
5. Watch sign language avatar at the top
6. Tap "Stop" when finished

#### Settings

Access settings via the menu icon:
- Language preferences
- Sign language selection
- Avatar customization
- Offline mode toggle
- Display preferences

## Features in Detail

### Real-time Transcription

- **Latency**: Less than 2 seconds
- **Accuracy**: Optimized for clear speech
- **Languages**: 5 supported languages
- **Audio Quality**: Works best in quiet environments

### Sign Language Translation

- **Animation Speed**: 60 FPS for smooth playback
- **Supported Languages**: ASL and BSL
- **Customization**: Personalize avatar appearance
- **Fallback**: Text display if animation unavailable

### Offline Mode

- **Queue Requests**: Automatically queues when offline
- **Auto-Sync**: Processes queue when connection restored
- **Cache**: Stores avatar assets locally (up to 50MB on mobile)
- **Preferences**: Saves settings locally

### Privacy & Security

- **No Audio Storage**: Audio is processed and immediately discarded
- **No Text Logging**: Transcriptions are not logged
- **Encrypted Preferences**: User settings encrypted at rest
- **Secure Connections**: HTTPS/WSS only

## Troubleshooting

### Microphone Not Working

1. Check browser/app permissions
2. Ensure microphone is not used by another app
3. Test microphone in system settings
4. Restart browser/app

### Poor Transcription Quality

1. Reduce background noise
2. Speak clearly and at moderate pace
3. Check audio quality indicator
4. Adjust microphone position

### Avatar Not Displaying

1. Check internet connection
2. Clear cache and reload
3. Update to latest version
4. Check browser/app compatibility

### High Latency

1. Check network connection speed
2. Close unnecessary apps/tabs
3. Disable VPN if active
4. Move closer to WiFi router

### Offline Mode Issues

1. Enable offline mode in settings
2. Check available storage space
3. Ensure queue is not full
4. Manually sync when online

## Usage Limits

### Free Tier

- **Daily Limit**: 8 hours of transcription per day
- **Rate Limit**: 100 requests per hour
- **Concurrent Users**: Up to 500 active users
- **Cache Storage**: 50MB on mobile, unlimited on browser

### Budget Enforcement

The system operates within a $100/month budget:
- **80% threshold**: Warning notification
- **95% threshold**: Non-essential features disabled
- **100% threshold**: New requests rejected until next billing cycle

## Best Practices

### For Best Results

1. **Environment**: Use in quiet spaces
2. **Microphone**: Position 6-12 inches from mouth
3. **Speech**: Speak clearly at normal pace
4. **Connection**: Use stable WiFi when possible
5. **Updates**: Keep app/extension updated

### Privacy Tips

1. **Permissions**: Only grant necessary permissions
2. **Public WiFi**: Avoid on unsecured networks
3. **Sensitive Content**: Be aware audio is processed in cloud
4. **Account Deletion**: Request data deletion if needed

## Keyboard Shortcuts (Browser Extension)

- `Ctrl+Shift+S`: Start/Stop transcription
- `Ctrl+Shift+A`: Toggle avatar window
- `Ctrl+Shift+P`: Open settings
- `Ctrl+Shift+C`: Clear transcription

## Accessibility Features

- **High Contrast Mode**: For visual impairments
- **Adjustable Font Size**: 12px to 24px
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader Compatible**: ARIA labels included

## Support & Feedback

### Getting Help

- **Documentation**: Check README.md and DEPLOYMENT.md
- **FAQ**: Visit project wiki
- **Issues**: Report bugs on GitHub
- **Email**: support@accessibility-ai.com

### Providing Feedback

We welcome your feedback:
- Feature requests
- Bug reports
- Usability suggestions
- Translation improvements

## Updates

### Auto-Update

- **Browser Extension**: Auto-updates via Chrome Web Store
- **Mobile App**: Check for updates on app launch
- **Notifications**: Prompted when new version available

### Release Notes

Check CHANGELOG.md for:
- New features
- Bug fixes
- Performance improvements
- Breaking changes

## Privacy Policy

- Audio data is processed but never stored
- Transcriptions are not logged
- User preferences are encrypted
- Data deletion available upon request
- GDPR and CCPA compliant

## Terms of Service

- Free for personal use
- Commercial use requires license
- No warranty provided
- Subject to usage limits
- Budget constraints apply

## Credits

Built with:
- AWS Transcribe for speech recognition
- WebGL/OpenGL ES for avatar rendering
- AWS serverless services for infrastructure
- Open source libraries (see package.json)

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**License**: MIT
