/**
 * OSiris Language Switcher - Reusable EN/FR toggle with localStorage persistence
 * Requires: i18n-service.js (and i18next stack) to be loaded
 */
(function (global) {
  function render(container) {
    if (!container) return;
    var lng = 'en';
    if (typeof global.I18nService !== 'undefined' && global.I18nService.getStoredLanguage) {
      lng = global.I18nService.getStoredLanguage() || 'en';
    } else if (typeof global.i18next !== 'undefined') {
      lng = global.i18next.language || 'en';
    }
    container.innerHTML = '<div class="language-switcher-btns" style="display:flex;align-items:center;gap:var(--spacing-xs,4px);">' +
      '<button type="button" class="lang-btn" data-lang="en" aria-label="English">EN</button>' +
      '<span style="color:var(--text-secondary);font-size:0.75rem;">|</span>' +
      '<button type="button" class="lang-btn" data-lang="fr" aria-label="Français">FR</button>' +
      '</div>';

    container.querySelectorAll('.lang-btn').forEach(function (btn) {
      var btnLng = btn.getAttribute('data-lang');
      btn.style.fontWeight = lng === btnLng ? 'var(--font-weight-semibold,600)' : 'inherit';
      btn.style.cursor = 'pointer';
      btn.style.background = 'none';
      btn.style.border = 'none';
      btn.style.padding = '2px 6px';
      btn.style.fontSize = '0.875rem';
      btn.style.color = 'var(--text-color,inherit)';
      btn.addEventListener('click', function () {
        if (typeof global.I18nService !== 'undefined' && global.I18nService.changeLanguage) {
          global.I18nService.changeLanguage(btnLng);
        } else if (typeof global.i18next !== 'undefined') {
          global.i18next.changeLanguage(btnLng);
        }
        container.querySelectorAll('.lang-btn').forEach(function (b) {
          b.style.fontWeight = b.getAttribute('data-lang') === btnLng ? 'var(--font-weight-semibold,600)' : 'inherit';
        });
      });
    });
  }

  function init() {
    document.querySelectorAll('[data-component="language-switcher"]').forEach(render);
    if (typeof global.i18next !== 'undefined') {
      global.i18next.on('languageChanged', function () {
        document.querySelectorAll('[data-component="language-switcher"]').forEach(render);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init, render };
  } else {
    global.LanguageSwitcher = { init, render };
  }
})(typeof window !== 'undefined' ? window : this);
