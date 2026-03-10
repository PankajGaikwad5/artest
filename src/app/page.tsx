'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Type augmentation for model-viewer web component ─────────────────────
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          alt?: string
          ar?: boolean | ''
          'ar-modes'?: string
          'camera-controls'?: boolean | ''
          'auto-rotate'?: boolean | ''
          'shadow-intensity'?: string
          'shadow-softness'?: string
          exposure?: string
          'environment-image'?: string
          'ar-scale'?: string
          'ar-placement'?: string
          loading?: string
          reveal?: string
          poster?: string
          'interaction-prompt'?: string
          'rotation-per-second'?: string
          style?: React.CSSProperties
          onLoad?: () => void
          onError?: () => void
        },
        HTMLElement
      >
    }
  }

  interface Navigator {
    xr?: {
      isSessionSupported: (mode: string) => Promise<boolean>
    }
  }
}

// ─── AR capability detection ───────────────────────────────────────────────
type ARMode = 'webxr' | 'scene-viewer' | 'quick-look' | 'none' | 'checking'

async function detectARMode(): Promise<ARMode> {
  const ua = navigator.userAgent

  // iOS — uses AR Quick Look via Safari
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  if (isIOS) {
    // Quick Look AR is supported on iOS 12+ in Safari
    const anchor = document.createElement('a')
    if (anchor.relList?.supports?.('ar')) {
      return 'quick-look'
    }
    // Fallback: assume supported on modern iOS
    const match = ua.match(/OS (\d+)_/)
    if (match && parseInt(match[1]) >= 12) return 'quick-look'
    return 'none'
  }

  // Android — try WebXR first, then Scene Viewer
  const isAndroid = /Android/.test(ua)
  if (isAndroid) {
    if (navigator.xr) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar')
        if (supported) return 'webxr'
      } catch {}
    }
    // Scene Viewer is available on any Android with Google Play
    return 'scene-viewer'
  }

  // Desktop — WebXR check (rare but possible with headsets)
  if (navigator.xr) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar')
      if (supported) return 'webxr'
    } catch {}
  }

  return 'none'
}

// ─── Screen states ─────────────────────────────────────────────────────────
type Screen = 'loading' | 'ready' | 'ar-active' | 'ar-ended' | 'unsupported' | 'error'

// ─── Component ─────────────────────────────────────────────────────────────
export default function ARPage() {
  const mvRef = useRef<HTMLElement>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [arMode, setArMode] = useState<ARMode>('checking')
  const [modelLoaded, setModelLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Detect AR capability on mount
  useEffect(() => {
    detectARMode().then(mode => {
      setArMode(mode)
      if (mode === 'none') {
        setScreen('unsupported')
      }
    })
  }, [])

  // Once model is loaded AND AR mode known, show ready screen
  useEffect(() => {
    if (modelLoaded && arMode !== 'checking' && arMode !== 'none') {
      setScreen('ready')
    }
  }, [modelLoaded, arMode])

  // ── Activate AR ──────────────────────────────────────────────────────────
  const activateAR = useCallback(() => {
    const mv = mvRef.current as (HTMLElement & {
      activateAR?: () => void
    }) | null
    if (!mv) return

    // model-viewer handles everything:
    // - WebXR: requests camera+XR permissions, starts immersive-ar session
    // - Scene Viewer: opens Android's native AR app (no permission needed, leaves browser)
    // - Quick Look: opens iOS native AR Quick Look viewer
    if (mv.activateAR) {
      mv.activateAR()
      setScreen('ar-active')
    }
  }, [])

  // Listen for AR session events from model-viewer
  useEffect(() => {
    const mv = mvRef.current
    if (!mv) return

    const onARStatus = (e: Event) => {
      const evt = e as CustomEvent<{ status: string }>
      const status = evt.detail?.status
      if (status === 'session-started') setScreen('ar-active')
      if (status === 'not-presenting') setScreen('ar-ended')
      if (status === 'failed') setScreen('ready') // fallback gracefully
    }

    mv.addEventListener('ar-status', onARStatus)
    return () => mv.removeEventListener('ar-status', onARStatus)
  }, [])

  // ── UI helpers ───────────────────────────────────────────────────────────
  const arModeLabel: Record<ARMode, string> = {
    'webxr': 'WebXR · ARCore',
    'scene-viewer': 'Android Scene Viewer',
    'quick-look': 'iOS AR Quick Look',
    'none': 'Not supported',
    'checking': 'Detecting…',
  }

  const arModeIcon: Record<ARMode, string> = {
    'webxr': '⬡',
    'scene-viewer': '◉',
    'quick-look': '⬡',
    'none': '✕',
    'checking': '○',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#0a0a0a' }}>

      {/* ── model-viewer: always mounted, powers the AR session ── */}
      {/*
        ar-modes priority:
          1. webxr  — Chrome on Android with ARCore: real WebXR immersive-ar
                      camera feed + surface detection + model placed on floor/wall
          2. scene-viewer — Android fallback: opens Google's native AR viewer
          3. quick-look   — iOS Safari: opens Apple's native AR Quick Look
                           (camera feed + model placed on surface, native quality)
      */}
      <model-viewer
        ref={mvRef as React.RefObject<HTMLElement>}
        src="/model.glb"
        alt="AR Model"
        ar=""
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="auto"
        ar-placement="floor"
        camera-controls=""
        auto-rotate=""
        rotation-per-second="20deg"
        shadow-intensity="1"
        shadow-softness="0.8"
        exposure="1.1"
        environment-image="neutral"
        interaction-prompt="none"
        loading="eager"
        reveal="auto"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Hide 3D viewer when AR is active (AR takes over screen natively)
          opacity: screen === 'ar-active' ? 0 : 1,
          transition: 'opacity 0.3s',
          pointerEvents: screen === 'ready' || screen === 'ar-ended' ? 'auto' : 'none',
        }}
        onLoad={() => setModelLoaded(true)}
        onError={() => { setLoadError(true); setScreen('error') }}
      />

      {/* ── SCREEN: LOADING ── */}
      {screen === 'loading' && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0a', zIndex: 20,
            gap: 24,
          }}>
          {/* Animated loader rings */}
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <div style={{
              position: 'absolute', inset: 0,
              border: '2px solid rgba(0,255,136,0.15)',
              borderTopColor: '#00ff88',
              borderRadius: '50%',
              animation: 'spin-slow 1s linear infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 12,
              border: '1.5px solid rgba(0,170,255,0.15)',
              borderTopColor: '#00aaff',
              borderRadius: '50%',
              animation: 'spin-slow 0.7s linear infinite reverse',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              ⬡
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              Loading model…
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace' }}>
              {arMode === 'checking' ? 'Detecting AR support' : arModeLabel[arMode]}
            </p>
          </div>
        </div>
      )}

      {/* ── SCREEN: READY — the launch screen ── */}
      {screen === 'ready' && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            zIndex: 10, pointerEvents: 'none',
          }}>
          {/* Top pill: AR mode badge */}
          <div style={{
            position: 'absolute', top: 'env(safe-area-inset-top, 20px)',
            left: 0, right: 0, display: 'flex', justifyContent: 'center',
            paddingTop: 16, zIndex: 11,
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(0,255,136,0.3)',
              borderRadius: 100,
              backdropFilter: 'blur(12px)',
              pointerEvents: 'none',
            }}>
              <span style={{ color: '#00ff88', fontSize: 11 }}>●</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
                {arModeIcon[arMode]} {arModeLabel[arMode]}
              </span>
            </div>
          </div>

          {/* Bottom panel: the big CTA */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            padding: '24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)',
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)',
            pointerEvents: 'all',
          }}>

            {/* Instruction hint */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, marginBottom: 20,
            }}>
              <div style={{
                width: 32, height: 1,
                background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.3))',
              }} />
              <p style={{
                color: 'rgba(255,255,255,0.5)', fontSize: 12,
                fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {arMode === 'quick-look'
                  ? 'Opens in AR Quick Look'
                  : arMode === 'scene-viewer'
                  ? 'Opens in Scene Viewer'
                  : 'Camera required'}
              </p>
              <div style={{
                width: 32, height: 1,
                background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.3))',
              }} />
            </div>

            {/* BIG AR BUTTON */}
            <button
              onClick={activateAR}
              style={{
                width: '100%',
                padding: '20px 24px',
                borderRadius: 20,
                border: '1.5px solid rgba(0,255,136,0.4)',
                background: 'linear-gradient(135deg, rgba(0,255,136,0.15) 0%, rgba(0,170,255,0.1) 100%)',
                backdropFilter: 'blur(20px)',
                color: '#fff',
                fontSize: 20,
                fontWeight: 700,
                fontFamily: 'DM Sans, sans-serif',
                letterSpacing: '-0.02em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                position: 'relative',
                overflow: 'hidden',
                WebkitTapHighlightColor: 'transparent',
                transition: 'transform 0.1s, box-shadow 0.2s',
                boxShadow: '0 0 40px rgba(0,255,136,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
              onTouchStart={e => {
                const el = e.currentTarget
                el.style.transform = 'scale(0.97)'
                el.style.boxShadow = '0 0 60px rgba(0,255,136,0.3)'
              }}
              onTouchEnd={e => {
                const el = e.currentTarget
                el.style.transform = 'scale(1)'
                el.style.boxShadow = '0 0 40px rgba(0,255,136,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            >
              {/* Camera icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
              </svg>
              View in Augmented Reality
            </button>

            {/* Sub-caption */}
            <p style={{
              textAlign: 'center', marginTop: 12,
              color: 'rgba(255,255,255,0.3)', fontSize: 11,
              fontFamily: 'DM Mono, monospace',
            }}>
              Point your camera at a flat surface to place the object
            </p>
          </div>
        </div>
      )}

      {/* ── SCREEN: AR ACTIVE (WebXR session running) ── */}
      {screen === 'ar-active' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          background: 'transparent',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 24px)',
          pointerEvents: 'none',
        }}>
          {/* AR active indicator - floats over camera feed */}
          <div style={{
            padding: '8px 16px',
            borderRadius: 100,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0,255,136,0.4)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', display: 'inline-block', animation: 'breathe 1.5s ease-in-out infinite' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>
              AR active · scan a surface
            </span>
          </div>
        </div>
      )}

      {/* ── SCREEN: AR ENDED (returned from AR) ── */}
      {screen === 'ar-ended' && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 24px)',
            paddingLeft: 24, paddingRight: 24,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 50%)',
          }}>
          <div style={{ width: '100%', maxWidth: 400 }}>
            <p style={{
              textAlign: 'center', marginBottom: 20,
              color: 'rgba(255,255,255,0.6)', fontSize: 13,
              fontFamily: 'DM Mono, monospace',
            }}>
              AR session ended
            </p>
            <button
              onClick={activateAR}
              style={{
                width: '100%', padding: '18px 24px',
                borderRadius: 18,
                border: '1.5px solid rgba(0,255,136,0.4)',
                background: 'rgba(0,255,136,0.1)',
                color: '#fff', fontSize: 18, fontWeight: 700,
                fontFamily: 'DM Sans, sans-serif',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
              </svg>
              Launch AR Again
            </button>
          </div>
        </div>
      )}

      {/* ── SCREEN: UNSUPPORTED ── */}
      {screen === 'unsupported' && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0a', padding: 32, textAlign: 'center',
            gap: 16,
          }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(255,68,68,0.1)',
            border: '1px solid rgba(255,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, marginBottom: 8,
          }}>
            📷
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
            AR Not Supported
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>
            Your device or browser doesn&apos;t support Augmented Reality.
          </p>
          <div style={{
            marginTop: 8,
            padding: '16px 24px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'left',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              To use AR, try:
            </p>
            {[
              ['🤖', 'Android', 'Chrome + ARCore installed'],
              ['🍎', 'iPhone/iPad', 'Safari on iOS 12+'],
            ].map(([icon, platform, detail]) => (
              <div key={platform} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <div>
                  <p style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{platform}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>{detail}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Still show the 3D model for preview */}
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8, fontFamily: 'DM Mono, monospace' }}>
            ↑ You can still view the 3D model above
          </p>
        </div>
      )}

      {/* ── SCREEN: ERROR ── */}
      {screen === 'error' && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0a', padding: 32, textAlign: 'center',
            gap: 12,
          }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Model failed to load</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'DM Mono, monospace' }}>
            Make sure <code style={{ color: '#00ff88' }}>model.glb</code> is in the{' '}
            <code style={{ color: '#00aaff' }}>/public</code> folder
          </p>
        </div>
      )}

    </div>
  )
}
