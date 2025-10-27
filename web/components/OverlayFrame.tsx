'use client';

import React, { PropsWithChildren, useEffect, useMemo } from 'react';

export type OverlayFrameProps = PropsWithChildren<{
  safeArea?: number; // pixels to inset from all edges
  chroma?: boolean; // transparent background for chroma key
  className?: string;
}>;

// Light-only overlay frame per design samples
export default function OverlayFrame({ safeArea = 24, chroma = false, className, children }: OverlayFrameProps) {
  useEffect(() => {
    // Inject fonts and material icons once
    const head = document.head;
    const ensure = (id: string, create: () => HTMLElement) => {
      if (!document.getElementById(id)) {
        const el = create();
        el.id = id;
        head.appendChild(el);
      }
    };
    ensure('overlay-preconnect', () => {
      const l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = 'https://fonts.gstatic.com';
      l.crossOrigin = '';
      return l;
    });
    ensure('overlay-fonts', () => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?display=swap&family=Poppins:wght@400;500;600;700;800;900&family=Roboto:wght@400;500;700';
      return l;
    });
    ensure('overlay-material-icons', () => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
      return l;
    });
    // Force transparent backgrounds for html/body for OBS overlaying
    const styleId = 'overlay-transparent-bg';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.innerHTML = 'html, body { background: transparent !important; }';
      head.appendChild(s);
    }
  }, []);
  const containerClasses = 'text-gray-900 ' + (chroma ? '' : '');
  const containerStyle: React.CSSProperties = useMemo(() => ({
    paddingLeft: safeArea,
    paddingRight: safeArea,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: 'transparent',
    fontFamily: 'Poppins, Roboto, sans-serif',
  }), [safeArea, chroma]);

  return (
    <div className={containerClasses} style={containerStyle}>
      <div className={className}>
        {children}
      </div>
    </div>
  );
}


