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
  const overlayRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [arMode, setArMode] = useState<ARMode>('checking');
  const arModeRef = useRef<ARMode>('checking');
  const modelLoadedRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);

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
      if (status === 'session-started') {
        setScreen('ar-active');
        setLocked(false);
        lockedRef.current = false;
        setScale(1);
        scaleRef.current = 1;
        setRotation(0);
        rotationRef.current = 0;
      }
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

  // Activate AR — use WebXR DOM Overlay API so our div renders over the camera
  const activateAR = useCallback(async () => {
    const mv = mvRef.current as any;
    const overlay = overlayRef.current;
    if (!mv || !overlay) return;

    const xr = (navigator as any).xr;

    // For WebXR (Android): request session with domOverlay so our UI shows
    if (arModeRef.current === 'webxr' && xr) {
      try {
        // Check if domOverlay is supported
        const supported = await xr.isSessionSupported('immersive-ar');
        if (supported) {
          // Tell model-viewer to start AR — it will use WebXR internally
          // We ALSO need to intercept and add domOverlay
          // The trick: override the session request before calling activateAR
          const origRequestSession = xr.requestSession.bind(xr);
          xr.requestSession = async (mode: string, options: any = {}) => {
            // Inject domOverlay into whatever options model-viewer passes
            const overlayOptions = {
              ...options,
              domOverlay: { root: overlay },
              optionalFeatures: [
                ...(options.optionalFeatures || []),
                'dom-overlay',
              ],
            };
            xr.requestSession = origRequestSession; // restore immediately
            return origRequestSession(mode, overlayOptions);
          };
        }
      } catch (e) {
        // domOverlay not supported, fall through to normal activateAR
      }
    }

    mv.activateAR?.();
  }, []);

  const toggleLock = useCallback(() => {
    const next = !lockedRef.current;
    lockedRef.current = next;
    setLocked(next);
    const mv = mvRef.current as any;
    if (!mv) return;
    if (next) {
      mv.removeAttribute('ar-placement');
    } else {
      mv.setAttribute('ar-placement', 'floor');
    }
  }, []);

  const changeScale = useCallback((delta: number) => {
    const next = Math.min(3, Math.max(0.2, scaleRef.current + delta));
    scaleRef.current = next;
    setScale(next);
    const mv = mvRef.current as any;
    if (mv) mv.setAttribute('scale', `${next} ${next} ${next}`);
  }, []);

  const changeRotation = useCallback((delta: number) => {
    const next = rotationRef.current + delta;
    rotationRef.current = next;
    setRotation(next);
    const mv = mvRef.current as any;
    if (mv) mv.setAttribute('orientation', `0deg ${next}deg 0deg`);
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
          '--poster-color': '#080808',
        }}
      >
        <div slot='ar-button' style={{ display: 'none' }} />
      </MV>

      {/*
        THIS is the DOM Overlay root — registered with WebXR before session starts.
        The browser compositor renders this div directly over the camera feed.
        It's always in the DOM but only visible during AR.
      */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          pointerEvents: screen === 'ar-active' ? 'none' : 'none',
          display: screen === 'ar-active' ? 'flex' : 'none',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top bar */}
        <div
          style={{
            padding: '52px 20px 16px',
            display: 'flex',
            justifyContent: 'center',
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 18px',
              borderRadius: 100,
              background: 'rgba(0,0,0,0.55)',
              border: `1px solid ${locked ? 'rgba(255,200,0,0.5)' : 'rgba(255,255,255,0.2)'}`,
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: locked ? '#ffc800' : '#00ff88',
                display: 'inline-block',
                animation: 'breathe 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              {locked
                ? 'Locked · move phone to orbit'
                : 'Tap surface · move phone to orbit'}
            </span>
          </div>
        </div>

        {/* Bottom controls */}
        <div
          style={{
            padding: '20px 24px 52px',
            background:
              'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 70%, transparent)',
            pointerEvents: 'all',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {/* Scale row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              maxWidth: 300,
            }}
          >
            <span
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 10,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                width: 36,
              }}
            >
              Size
            </span>
            <button
              onTouchEnd={() => changeScale(-0.15)}
              onClick={() => changeScale(-0.15)}
              style={smBtnStyle}
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='3'
              >
                <line x1='5' y1='12' x2='19' y2='12' />
              </svg>
            </button>
            <div
              style={{
                flex: 1,
                height: 4,
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${((scale - 0.2) / 2.8) * 100}%`,
                  background: 'linear-gradient(to right, #00ff88, #00aaff)',
                  borderRadius: 4,
                  transition: 'width 0.1s',
                }}
              />
            </div>
            <button
              onTouchEnd={() => changeScale(0.15)}
              onClick={() => changeScale(0.15)}
              style={smBtnStyle}
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='3'
              >
                <line x1='12' y1='5' x2='12' y2='19' />
                <line x1='5' y1='12' x2='19' y2='12' />
              </svg>
            </button>
          </div>

          {/* Main button row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: '100%',
              maxWidth: 300,
            }}
          >
            {/* Rotate CCW */}
            <button
              onTouchEnd={() => changeRotation(-45)}
              onClick={() => changeRotation(-45)}
              style={toolBtnStyle}
            >
              <svg
                width='22'
                height='22'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
              >
                <path d='M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38' />
              </svg>
              <span style={btnLabelStyle}>Rotate</span>
            </button>

            {/* Lock — big center button */}
            <button
              onTouchEnd={toggleLock}
              onClick={toggleLock}
              style={{
                width: 76,
                height: 76,
                borderRadius: 22,
                flexShrink: 0,
                border: `2px solid ${locked ? '#ffc800' : 'rgba(255,255,255,0.3)'}`,
                background: locked
                  ? 'rgba(255,200,0,0.25)'
                  : 'rgba(20,20,20,0.7)',
                backdropFilter: 'blur(20px)',
                color: locked ? '#ffc800' : '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: locked
                  ? '0 0 20px rgba(255,200,0,0.3)'
                  : '0 4px 20px rgba(0,0,0,0.4)',
                transition: 'all 0.2s',
              }}
            >
              {locked ? (
                <svg
                  width='24'
                  height='24'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                >
                  <rect x='3' y='11' width='18' height='11' rx='2' />
                  <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                </svg>
              ) : (
                <svg
                  width='24'
                  height='24'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                >
                  <rect x='3' y='11' width='18' height='11' rx='2' />
                  <path d='M7 11V7a5 5 0 0 1 9.9-1' />
                </svg>
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'system-ui',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {locked ? 'Unlock' : 'Lock'}
              </span>
            </button>

            {/* Rotate CW */}
            <button
              onTouchEnd={() => changeRotation(45)}
              onClick={() => changeRotation(45)}
              style={toolBtnStyle}
            >
              <svg
                width='22'
                height='22'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
              >
                <path d='M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38' />
              </svg>
              <span style={btnLabelStyle}>Rotate</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── LOADING ── */}
      {screen === 'loading' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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

      {/* ── READY ── */}
      {screen === 'ready' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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

      {/* ── AR ENDED ── */}
      {screen === 'ar-ended' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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

      {/* ── UNSUPPORTED ── */}
      {screen === 'unsupported' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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

      {/* ── ERROR ── */}
      {screen === 'error' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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

const smBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(12px)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

const toolBtnStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 80,
  padding: '12px 8px',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(16px)',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

const btnLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'system-ui',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

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
