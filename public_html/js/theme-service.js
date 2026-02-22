/**
 * OSiris Theme Service - Light/Dark/System theme with localStorage persistence
 */
(function (global) {
  const STORAGE_KEY = 'osiris_theme';
  const VALID_MODES = ['light', 'dark', 'system'];

  function getSystemPreference() {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (VALID_MODES.includes(stored)) return stored;
    } catch (_) {}
    return 'system';
  }

  function resolveEffectiveTheme(mode) {
    if (mode === 'system') return getSystemPreference();
    return mode;
  }

  function applyTheme(mode) {
    const effective = resolveEffectiveTheme(mode);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effective);
    root.setAttribute('data-theme', effective);
    try {
      document.dispatchEvent(new CustomEvent('osiris-theme-change', { detail: { theme: effective } }));
    } catch (_) {}
  }

  function setTheme(mode) {
    if (!VALID_MODES.includes(mode)) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
    applyTheme(mode);
  }

  function init() {
    const mode = getTheme();
    applyTheme(mode);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getTheme() === 'system') applyTheme('system');
      });
    }
  }

  const ThemeService = {
    getTheme,
    setTheme,
    applyTheme,
    init,
    resolveEffectiveTheme,
    VALID_MODES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeService;
  } else {
    global.ThemeService = ThemeService;
  }
})(typeof window !== 'undefined' ? window : this);
