'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

export default function ARViewerPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [arActive, setArActive] = useState(false);

  const startAR = async () => {
    setArActive(true);
    // Dynamically import the studio
    const { createArStudio } = await import('3d-ar-studio');
    
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    
    const studioInstance = createArStudio(containerRef.current, {
      generate: { enabled: false },
      rooms: { enabled: false },
      allowUrlOverride: false,
      persist: false,
      branding: { title: 'Product AR', backHref: '/' },
    });

    studioInstance.clear();
    await studioInstance.addModel({ src: '/model-ar.glb', title: 'Product in 3D' });
    
    // Attempt to enter AR using the best path
    try {
      await studioInstance.enterAR();
    } catch (err) {
      console.warn('AR launch failed', err);
    }

    // Listen for AR exit to return to orbit view
    const onXr = (e: any) => { if (!e.active) exitAR(studioInstance); };
    const onCamera = (e: any) => { if (!e.active) exitAR(studioInstance); };
    
    // Wait slightly to bind these so we don't instantly catch the start events incorrectly
    setTimeout(() => {
      studioInstance.on('xr', onXr);
      studioInstance.on('camera', onCamera);
    }, 1000);
  };

  const exitAR = (studioInstance: any) => {
    if (studioInstance && typeof studioInstance.destroy === 'function') {
      studioInstance.destroy();
    }
    setArActive(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000000', position: 'relative' }}>
      <Script src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" type="module" strategy="afterInteractive" />
      
      {!arActive && (
        <>
          {/* @ts-ignore */}
          <model-viewer
            src="/model-ar.glb"
            camera-controls
            auto-rotate
            shadow-intensity="1"
            environment-image="neutral"
            style={{ width: '100%', height: '100%', background: '#000000', '--poster-color': '#000000' }}
          />
          <button 
            onClick={startAR}
            style={{
              position: 'absolute',
              bottom: '40px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px 24px',
              background: '#00ff88',
              color: '#000',
              border: 'none',
              borderRadius: '24px',
              fontWeight: 'bold',
              cursor: 'pointer',
              zIndex: 10,
              boxShadow: '0 4px 12px rgba(0, 255, 136, 0.4)'
            }}
          >
            View in AR Camera
          </button>
        </>
      )}

      {/* AR Studio Container */}
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: arActive ? 'block' : 'none' 
        }} 
      />

      <style dangerouslySetInnerHTML={{__html: `
        /* Hide studio UI elements when it is active */
        .ars-dock { display: none !important; }
        .ars-empty { display: none !important; }
        .ars-selbar { display: none !important; }
        .ars-grid { display: none !important; }
      `}} />
    </div>
  );
}
