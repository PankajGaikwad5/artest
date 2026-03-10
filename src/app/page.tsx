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

const DEFAULT_MODEL_SCALE = 1;
const MIN_MODEL_SCALE = 0.2;
const MAX_MODEL_SCALE = 3;
const SCALE_STEP = 0.1;
const AR_MODEL_SRC = '/model-ar.glb';

async function detectARMode(): Promise<ARMode> {
  const ua = navigator.userAgent;
  // Native Scene Viewer gives the same anchored AR behavior users expect from Amazon.
  if (/Android/.test(ua)) return 'scene-viewer';

  if (/iPhone|iPad|iPod/.test(ua)) {
    const a = document.createElement('a');
    if (a.relList?.supports?.('ar')) return 'quick-look';
    const m = ua.match(/OS (\d+)_/);
    return m && parseInt(m[1]) >= 12 ? 'quick-look' : 'none';
  }
  if ((navigator as any).xr) {
    try {
      if (await (navigator as any).xr.isSessionSupported('immersive-ar'))
        return 'webxr';
    } catch {}
  }
  return 'none';
}

function buildSceneViewerUrl(fileUrl: string, title: string, linkUrl: string) {
  const params = new URLSearchParams({
    file: fileUrl,
    mode: 'ar_only',
    title,
    resizable: 'false',
    'disable_occlusion': 'true',
    link: linkUrl,
  });
  return `https://arvr.google.com/scene-viewer/1.0?${params.toString()}`;
}

export default function ARPage() {
  const mvRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [arMode, setArMode] = useState<ARMode>('checking');
  const arModeRef = useRef<ARMode>('checking');
  const modelLoadedRef = useRef(false);
  const [isPlaced, setIsPlaced] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const [scale, setScale] = useState(DEFAULT_MODEL_SCALE);
  const [rotation, setRotation] = useState(0);
  const scaleRef = useRef(DEFAULT_MODEL_SCALE);
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
    const overlay = overlayRef.current;
    if (!overlay) return;
    const onBeforeXRSelect = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const touchedControl = Boolean(target?.closest('[data-ar-control]'));
      if (lockedRef.current || touchedControl) e.preventDefault();
    };
    overlay.addEventListener('beforexrselect', onBeforeXRSelect);
    return () => {
      overlay.removeEventListener('beforexrselect', onBeforeXRSelect);
    };
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
        setIsPlaced(false);
        setLocked(false);
        lockedRef.current = false;
        setRotation(0);
        rotationRef.current = 0;
        const activeScale = scaleRef.current;
        setScale(activeScale);
        (mv as any).setAttribute(
          'scale',
          `${activeScale} ${activeScale} ${activeScale}`,
        );
        (mv as any).removeAttribute('disable-tap');
      }
      if (status === 'object-placed') {
        setIsPlaced(true);
      }
      if (status === 'not-presenting') {
        setScreen('ar-ended');
        (mv as any).removeAttribute('disable-tap');
      }
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

  const activateAR = useCallback(async () => {
    const mv = mvRef.current as any;
    const overlay = overlayRef.current;
    if (!mv || !overlay) return;
    if (arModeRef.current === 'scene-viewer') {
      const modelUrl = new URL(AR_MODEL_SRC, window.location.href).toString();
      const sceneViewerUrl = buildSceneViewerUrl(
        modelUrl,
        'Bracelet',
        window.location.href,
      );
      window.location.assign(sceneViewerUrl);
      return;
    }
    const xr = (navigator as any).xr;
    if (arModeRef.current === 'webxr' && xr) {
      try {
        const origRequestSession = xr.requestSession.bind(xr);
        xr.requestSession = async (mode: string, options: any = {}) => {
          xr.requestSession = origRequestSession;
          return origRequestSession(mode, {
            ...options,
            domOverlay: { root: overlay },
            optionalFeatures: [
              ...(options.optionalFeatures || []),
              'dom-overlay',
            ],
          });
        };
      } catch {}
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
      mv.setAttribute('disable-tap', '');
    } else {
      mv.removeAttribute('disable-tap');
    }
  }, []);

  const changeScale = useCallback((delta: number) => {
    const next = Math.min(
      MAX_MODEL_SCALE,
      Math.max(MIN_MODEL_SCALE, scaleRef.current + delta),
    );
    const rounded = Number(next.toFixed(3));
    scaleRef.current = rounded;
    setScale(rounded);
    const mv = mvRef.current as any;
    if (mv) mv.setAttribute('scale', `${rounded} ${rounded} ${rounded}`);
  }, []);

  const changeRotation = useCallback((delta: number) => {
    const next = rotationRef.current + delta;
    rotationRef.current = next;
    setRotation(next);
    const mv = mvRef.current as any;
    if (mv) mv.setAttribute('orientation', `0deg ${next}deg 0deg`);
  }, []);

  const modeLabel: Record<ARMode, string> = {
    webxr: 'WebXR Browser AR',
    'scene-viewer': 'Google Scene Viewer AR',
    'quick-look': 'Apple Quick Look AR',
    none: 'Not supported',
    checking: 'Detecting AR Support…',
  };
  const arModesAttr =
    arMode === 'scene-viewer'
      ? 'scene-viewer'
      : arMode === 'quick-look'
        ? 'quick-look'
        : arMode === 'webxr'
          ? 'webxr'
          : 'scene-viewer webxr quick-look';

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
      src={AR_MODEL_SRC}
        alt='AR Model'
        ar
        ar-modes={arModesAttr}
        ar-scale='fixed'
        ar-placement='floor'
        scale={`${DEFAULT_MODEL_SCALE} ${DEFAULT_MODEL_SCALE} ${DEFAULT_MODEL_SCALE}`}
        camera-controls
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

      {/* DOM Overlay */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: screen === 'ar-active' ? 'flex' : 'none',
          flexDirection: 'column',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        {/* Blocker for pan/zoom/rotate */}
        {locked && (
          <div
            data-ar-control='true'
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'all',
              zIndex: 0,
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {/* Top status */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '50px 20px 16px',
            display: 'flex',
            justifyContent: 'center',
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 16px',
              borderRadius: 100,
              background: locked ? 'rgba(60,45,0,0.9)' : 'rgba(0,0,0,0.8)',
              border: `1px solid ${locked ? 'rgba(255,200,0,0.6)' : 'rgba(255,255,255,0.2)'}`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: locked ? '#ffc800' : '#00ff88',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              {locked
                ? 'Locked - move phone to view from any side'
                : isPlaced
                  ? 'Placed - use controls below if needed'
                  : 'Tap once to place the bracelet'}
            </span>
          </div>
        </div>

        {/* Bottom toolbar */}
        <div
          data-ar-control='true'
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '20px 24px 50px',
            background:
              'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 65%, transparent)',
            pointerEvents: 'all',
            display: isPlaced ? 'flex' : 'none',
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
                color: 'rgba(255,255,255,0.45)',
                fontSize: 10,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                width: 34,
              }}
            >
              Size
            </span>
            <button
              onTouchEnd={(e) => {
                e.stopPropagation();
                changeScale(-SCALE_STEP);
              }}
              onClick={() => changeScale(-SCALE_STEP)}
              style={smBtn}
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
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((scale - MIN_MODEL_SCALE) /
                        (MAX_MODEL_SCALE - MIN_MODEL_SCALE)) *
                        100,
                    ),
                  )}%`,
                  background: '#00ff88',
                  borderRadius: 4,
                  transition: 'width 0.1s',
                }}
              />
            </div>
            <button
              onTouchEnd={(e) => {
                e.stopPropagation();
                changeScale(SCALE_STEP);
              }}
              onClick={() => changeScale(SCALE_STEP)}
              style={smBtn}
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

          {/* Rotate + Lock */}
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
            <button
              onTouchEnd={(e) => {
                e.stopPropagation();
                changeRotation(-45);
              }}
              onClick={() => changeRotation(-45)}
              style={toolBtn}
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
              <span style={lblStyle}>↺ Left</span>
            </button>

            <button
              onTouchEnd={(e) => {
                e.stopPropagation();
                toggleLock();
              }}
              onClick={() => toggleLock()}
              style={{
                width: 74,
                height: 74,
                borderRadius: 20,
                flexShrink: 0,
                border: `2px solid ${locked ? '#ffc800' : 'rgba(255,255,255,0.3)'}`,
                background: locked
                  ? 'rgba(80,55,0,0.95)'
                  : 'rgba(15,15,15,0.95)',
                color: locked ? '#ffc800' : '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: locked
                  ? '0 0 16px rgba(255,200,0,0.4)'
                  : '0 2px 12px rgba(0,0,0,0.5)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              {locked ? (
                <svg
                  width='26'
                  height='26'
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
                  width='26'
                  height='26'
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
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {locked ? 'Unlock' : 'Lock'}
              </span>
            </button>

            <button
              onTouchEnd={(e) => {
                e.stopPropagation();
                changeRotation(45);
              }}
              onClick={() => changeRotation(45)}
              style={toolBtn}
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
              <span style={lblStyle}>Right ↻</span>
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
                fontSize: 12,
                fontFamily: 'system-ui, sans-serif',
                marginBottom: 14,
                textAlign: 'center',
                maxWidth: 360,
              }}
            >
              {arMode === 'webxr'
                ? 'Tap View in Your Space, then tap once to place.'
                : arMode === 'scene-viewer'
                  ? 'Tap View in Your Space to open camera AR directly.'
                  : arMode === 'quick-look'
                    ? 'Tap View in Your Space to open Apple AR directly.'
                    : 'AR is not available on this device.'}
            </p>
            <ARButton onClick={activateAR} />
            <p
              style={{
                color: 'rgba(255,255,255,0.18)',
                fontSize: 11,
                fontFamily: 'monospace',
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              If it is not visible instantly, move the phone a little and tap
              once.
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

const smBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(10,10,10,0.9)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

const toolBtn: React.CSSProperties = {
  flex: 1,
  maxWidth: 80,
  padding: '12px 8px',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(10,10,10,0.9)',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

const lblStyle: React.CSSProperties = {
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
  label = 'View in Your Space',
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
        color: '#fff',
        fontSize: 18,
        fontWeight: 700,
        fontFamily: 'system-ui, sans-serif',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: '0 0 32px rgba(0,255,136,0.12)',
        transition: 'transform 0.12s',
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
