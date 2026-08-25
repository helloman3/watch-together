import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to determine platform capabilities and optimal UI layout
 * (Desktop Studio vs Mobile Cinema).
 */
export function useDeviceMode() {
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  const [uiModeOverride, setUiModeOverrideState] = useState(() => {
    try {
      return localStorage.getItem('wt_ui_mode') || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [orientation, setOrientation] = useState(() => {
    if (typeof window === 'undefined') return 'landscape';
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowSize({ width, height });
      setOrientation(width > height ? 'landscape' : 'portrait');
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const setUiModeOverride = useCallback((mode) => {
    try {
      if (mode === 'auto') {
        localStorage.removeItem('wt_ui_mode');
      } else {
        localStorage.setItem('wt_ui_mode', mode);
      }
    } catch (e) {
      console.warn('Could not persist UI mode override:', e);
    }
    setUiModeOverrideState(mode);
  }, []);

  const isTouch = typeof window !== 'undefined' && 
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

  const isElectron = typeof window !== 'undefined' && 
    (navigator.userAgent.toLowerCase().includes('electron') || !!window.electron);

  const isCapacitor = typeof window !== 'undefined' && 
    (!!window.Capacitor?.isNativePlatform?.() || !!window.Capacitor);

  // Platform detection:
  // - Real native Android/iOS app (Capacitor) -> Mobile
  // - Small screens (< 768px) -> Mobile
  // - Any PC monitor / Laptop window (>= 768px) -> Desktop Studio
  const isScreenMobile = windowSize.width < 768;

  let activeMode = 'desktop';
  if (uiModeOverride === 'desktop') {
    activeMode = 'desktop';
  } else if (uiModeOverride === 'mobile') {
    activeMode = 'mobile';
  } else {
    // Auto mode
    activeMode = isCapacitor || isScreenMobile ? 'mobile' : 'desktop';
  }

  const isMobile = activeMode === 'mobile';
  const isDesktop = activeMode === 'desktop';
  const isLandscape = orientation === 'landscape';
  const isPortrait = orientation === 'portrait';

  // Haptic feedback trigger for mobile
  const triggerHaptic = useCallback((pattern = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }, []);

  return {
    isMobile,
    isDesktop,
    isLandscape,
    isPortrait,
    isTouch,
    isElectron,
    isCapacitor,
    windowWidth: windowSize.width,
    windowHeight: windowSize.height,
    uiModeOverride,
    setUiModeOverride,
    triggerHaptic,
  };
}
