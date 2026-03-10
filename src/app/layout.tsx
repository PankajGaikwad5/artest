import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AR Viewer',
  description: 'View this 3D object in your real world through augmented reality',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          model-viewer by Google — handles WebXR (Android/ARCore),
          Scene Viewer (Android), and AR Quick Look (iOS/ARKit)
          This is the gold standard for browser-based AR, used by Google Shopping,
          Amazon, IKEA, and others.
        */}
        <script
          type="module"
          src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"
        />
        {/* iOS Safari specific: allow camera in WebView */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  )
}
