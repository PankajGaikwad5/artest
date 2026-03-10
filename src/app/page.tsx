'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type ARMode = 'webxr' | 'scene-viewer' | 'quick-look' | 'none' | 'checking';
type Screen =
  | 'loading'
  | 'ready'
  | 'ar-active'
  | 'ar-ended'
  | 'unsupported'
  | 'error';

async function detectARMode(): Promise<ARMode> {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    const a = document.createElement('a');
    if (a.relList?.supports?.('ar')) return 'quick-look';
    const m = ua.match(/OS (\d+)_/);
    return m && parseInt(m[1]) >= 12 ? 'quick-look' : 'none';
  }
  if (/Android/.test(ua)) {
    if ((navigator as any).xr) {
      try {
        if (await (navigator as any).xr.isSessionSupported('immersive-ar'))
          return 'webxr';
      } catch {}
    }
    return 'scene-viewer';
  }
  if ((navigator as any).xr) {
    try {
      if (await (navigator as any).xr.isSessionSupported('immersive-ar'))
        return 'webxr';
    } catch {}
  }
  return 'none';
}

export default function ARPage() {
  const mvRef = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [arMode, setArMode] = useState<ARMode>('checking');
  const arModeRef = useRef<ARMode>('checking');
  const modelLoadedRef = useRef(false);

  useEffect(() => {
    detectARMode().then((mode) => {
      arModeRef.current = mode;
      setArMode(mode);
      if (mode === 'none') {
        setScreen('unsupported');
        return;
      }
      if (modelLoadedRef.current) setScreen('ready');
    });
  }, []);

  useEffect(() => {
    const mv = mvRef.current;
    if (!mv) return;

    const timeout = setTimeout(() => {
      setScreen((prev) =>
        prev !== 'loading'
          ? prev
          : arModeRef.current === 'none'
            ? 'unsupported'
            : 'ready',
      );
    }, 12_000);

    function onLoad() {
      clearTimeout(timeout);
      modelLoadedRef.current = true;
      if (arModeRef.current !== 'checking' && arModeRef.current !== 'none')
        setScreen('ready');
    }
    function onError() {
      clearTimeout(timeout);
      setScreen('error');
    }
    function onARStatus(e: Event) {
      const status = (e as CustomEvent<{ status: string }>).detail?.status;
      if (status === 'session-started') setScreen('ar-active');
      if (status === 'not-presenting') setScreen('ar-ended');
      if (status === 'failed') setScreen('ready');
    }

    mv.addEventListener('load', onLoad);
    mv.addEventListener('error', onError);
    mv.addEventListener('ar-status', onARStatus);
    return () => {
      clearTimeout(timeout);
      mv.removeEventListener('load', onLoad);
      mv.removeEventListener('error', onError);
      mv.removeEventListener('ar-status', onARStatus);
    };
  }, []);

  const activateAR = useCallback(() => {
    const mv = mvRef.current as any;
    mv?.activateAR?.();
  }, []);

  const modeLabel: Record<ARMode, string> = {
    webxr: 'WebXR · ARCore',
    'scene-viewer': 'Scene Viewer',
    'quick-look': 'AR Quick Look',
    none: 'Not supported',
    checking: 'Detecting…',
  };

  const MV = 'model-viewer' as any;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#080808',
      }}
    >
      <MV
        ref={mvRef}
        src='/model.glb'
        alt='AR Model'
        ar
        ar-modes='webxr scene-viewer quick-look'
        ar-scale='auto'
        ar-placement='floor'
        camera-controls
        auto-rotate
        rotation-per-second='20deg'
        shadow-intensity='1'
        shadow-softness='0.8'
        exposure='1.1'
        environment-image='neutral'
        interaction-prompt='none'
        loading='eager'
        reveal='auto'
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: screen === 'ar-active' ? 0 : 1,
          transition: 'opacity 0.3s',
          pointerEvents:
            screen === 'ready' || screen === 'ar-ended' ? 'auto' : 'none',
          '--poster-color': '#080808',
        }}
      />

      {screen === 'loading' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: '#080808',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          <Spinner />
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                marginBottom: 4,
              }}
            >
              Loading model…
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              {modeLabel[arMode]}
            </p>
          </div>
        </div>
      )}

      {screen === 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'rgba(0,0,0,0.65)',
                border: '1px solid rgba(0,255,136,0.35)',
                borderRadius: 100,
                backdropFilter: 'blur(12px)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#00ff88',
                  display: 'inline-block',
                  animation: 'breathe 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
              >
                {modeLabel[arMode]}
              </span>
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '32px 20px 40px',
              background:
                'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.65) 55%, transparent)',
              pointerEvents: 'all',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.35)',
                fontSize: 11,
                fontFamily: 'monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {arMode === 'quick-look'
                ? 'Opens Apple AR Quick Look'
                : arMode === 'scene-viewer'
                  ? 'Opens native Android AR'
                  : 'Camera permission required'}
            </p>
            <ARButton onClick={activateAR} />
            <p
              style={{
                color: 'rgba(255,255,255,0.18)',
                fontSize: 11,
                fontFamily: 'monospace',
                marginTop: 10,
              }}
            >
              Point your camera at a flat surface to place the object
            </p>
          </div>
        </div>
      )}

      {screen === 'ar-active' && (
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '8px 18px',
              borderRadius: 100,
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(0,255,136,0.4)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#00ff88',
                display: 'inline-block',
                animation: 'breathe 1.5s ease-in-out infinite',
              }}
            />
            <span
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              AR active · scan a flat surface
            </span>
          </div>
        </div>
      )}

      {screen === 'ar-ended' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 40,
            paddingLeft: 20,
            paddingRight: 20,
            background:
              'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 50%)',
          }}
        >
          <p
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12,
              fontFamily: 'monospace',
              marginBottom: 16,
            }}
          >
            AR session ended
          </p>
          <ARButton onClick={activateAR} label='Launch AR Again' />
        </div>
      )}

      {screen === 'unsupported' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#080808',
            padding: 32,
            textAlign: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: 'rgba(255,60,60,0.1)',
              border: '1px solid rgba(255,60,60,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            📷
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
            AR Not Available
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 14,
              lineHeight: 1.6,
              maxWidth: 280,
            }}
          >
            Open this link on your phone:
          </p>
          <div
            style={{
              padding: '14px 20px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'left',
              width: '100%',
              maxWidth: 280,
            }}
          >
            {[
              ['🤖', 'Android', 'Chrome + ARCore'],
              ['🍎', 'iPhone / iPad', 'Safari on iOS 12+'],
            ].map(([icon, name, detail]) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 10,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                <div>
                  <p style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {name}
                  </p>
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.35)',
                      fontSize: 11,
                      fontFamily: 'monospace',
                    }}
                  >
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#080808',
            padding: 32,
            textAlign: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 48 }}>⚠️</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
            Model failed to load
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 13,
              fontFamily: 'monospace',
              lineHeight: 1.7,
            }}
          >
            Ensure <code style={{ color: '#00ff88' }}>model.glb</code> is in{' '}
            <code style={{ color: '#60aaff' }}>public/</code> and site is on{' '}
            <strong>HTTPS</strong>
          </p>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ position: 'relative', width: 68, height: 68 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '2px solid rgba(0,255,136,0.1)',
          borderTopColor: '#00ff88',
          borderRadius: '50%',
          animation: 'spin-slow 0.85s linear infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 14,
          border: '1.5px solid rgba(0,150,255,0.1)',
          borderTopColor: '#0af',
          borderRadius: '50%',
          animation: 'spin-slow 0.6s linear infinite reverse',
        }}
      />
    </div>
  );
}

function ARButton({
  onClick,
  label = 'View in Augmented Reality',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        maxWidth: 440,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '18px 24px',
        borderRadius: 18,
        border: '1.5px solid rgba(0,255,136,0.4)',
        background:
          'linear-gradient(135deg, rgba(0,255,136,0.14), rgba(0,160,255,0.08))',
        backdropFilter: 'blur(20px)',
        color: '#fff',
        fontSize: 18,
        fontWeight: 700,
        fontFamily: 'system-ui, sans-serif',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        boxShadow:
          '0 0 32px rgba(0,255,136,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
        transition: 'transform 0.12s, box-shadow 0.2s',
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = 'scale(0.97)';
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = '';
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.01)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
      }}
    >
      <svg
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
      >
        <path d='M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' />
        <circle cx='12' cy='13' r='3' />
      </svg>
      {label}
    </button>
  );
}
