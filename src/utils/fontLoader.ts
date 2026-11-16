// ============================================================
// Font Loader — Ensure Google Fonts are ready for Canvas use
// ============================================================

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Roboto+Condensed:wght@400;500;700&family=Inter:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Oswald:wght@400;500;600;700&display=swap';

let fontsLoaded = false;
let fontsPromise: Promise<void> | null = null;

export function loadFonts(): Promise<void> {
  if (fontsLoaded) return Promise.resolve();
  if (fontsPromise) return fontsPromise;

  fontsPromise = new Promise<void>((resolve) => {
    // Inject Google Fonts stylesheet if not already present
    if (!document.querySelector('link[data-timemark-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_URL;
      link.setAttribute('data-timemark-fonts', 'true');
      document.head.appendChild(link);
    }

    // Wait for fonts to be fully loaded
    if (typeof document !== 'undefined' && document.fonts) {
      // Actively request the critical fonts so Canvas won't fall back to standard fonts
      Promise.allSettled([
        document.fonts.load('400 96px "Barlow Condensed"'),
        document.fonts.load('500 96px "Barlow Condensed"'),
        document.fonts.load('400 24px "Inter"'),
        document.fonts.load('700 24px "Inter"'),
        document.fonts.load('400 24px "Roboto"'),
        document.fonts.load('400 96px "Roboto Condensed"'),
        document.fonts.ready,
      ]).then(() => {
        fontsLoaded = true;
        resolve();
      });
    } else {
      setTimeout(() => {
        fontsLoaded = true;
        resolve();
      }, 1000);
    }
  });

  return fontsPromise;
}

// Force re-check fonts
export function areFontsReady(): boolean {
  return fontsLoaded;
}
