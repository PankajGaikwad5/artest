# AR Viewer

A pure AR viewer. Scan QR → tap button → camera opens → model appears in real world.

## Setup

```bash
npm install
npm run dev
```

## Add Your Model

Place your file in: `public/model.glb`

That's it. The app always loads `/model.glb`.

## Deploy

```bash
# Vercel (recommended — free HTTPS required for WebXR)
npx vercel

# Or any Node host — must serve over HTTPS
```

> ⚠️ **HTTPS is mandatory.** WebXR camera permissions only work on HTTPS. `localhost` works for dev.

## How it works by platform

| Platform | Tech | What happens when user taps |
|----------|------|----------------------------|
| Android (Chrome + ARCore) | WebXR `immersive-ar` | Camera opens, surface scanning, tap to place model |
| Android (no ARCore) | Google Scene Viewer | Opens native Android AR app |
| iPhone/iPad (Safari) | AR Quick Look | Opens native iOS AR viewer with camera |
| Desktop/unsupported | — | Shows message with instructions |

## QR Code Flow

1. Deploy to Vercel → get URL like `https://your-app.vercel.app`
2. Generate QR from that URL (any QR generator)
3. Print/display QR
4. User scans → taps "View in Augmented Reality" → **real AR with camera**
