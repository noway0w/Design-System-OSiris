/**
 * Shared dashboard top bar for platform apps: loads session via get_user_dashboard.php,
 * redirects on 401, injects fixed bar or hydrates #platform-topbar-mount (dashboard).
 * Exposes window.OSirisPlatformReady (Promise), window.__OSirisPlatformUser,
 * and window.OSirisPlatformTopbar (mountLeading, appendLeading, clearLeading).
 */
(function () {
  var TOPBAR_HEIGHT = '3rem';

  function loginRedirect() {
    var p = window.location.pathname + (window.location.search || '');
    if (!p || p[0] !== '/') {
      p = '/dashboard/';
    }
    window.location.href = '/login/?next=' + encodeURIComponent(p);
  }

  function firstName(u) {
    var n = u && u.name ? String(u.name).trim() : '';
    if (n) return n.split(/\s+/)[0];
    var em = u && u.email ? String(u.email) : '';
    var at = em.indexOf('@');
    if (at > 0) return em.slice(0, at);
    return 'there';
  }

  function initials(u) {
    var a = u && u.name ? String(u.name).trim().charAt(0) : '';
    var b = u && u.surname ? String(u.surname).trim().charAt(0) : '';
    var s = (a + b).toUpperCase();
    if (s) return s;
    var em = u && u.email ? String(u.email) : '';
    return em ? em.charAt(0).toUpperCase() : '?';
  }

  function setAvatar(container, u) {
    container.innerHTML = '';
    var url = u && u.avatar_url ? String(u.avatar_url).trim() : '';
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.width = 40;
      img.height = 40;
      img.addEventListener('error', function () {
        container.innerHTML = '';
        var span = document.createElement('span');
        span.className = 'dash-avatar-initials';
        span.textContent = initials(u);
        container.appendChild(span);
      });
      container.appendChild(img);
      return;
    }
    var span = document.createElement('span');
    span.className = 'dash-avatar-initials';
    span.textContent = initials(u);
    container.appendChild(span);
  }

  function syncLeadingSlotState() {
    var leading = document.getElementById('platform-topbar-leading');
    if (!leading) return;
    var hasChildren = leading.childElementCount > 0;
    leading.classList.toggle('dash-topbar-leading--empty', !hasChildren);
    if (hasChildren) {
      leading.removeAttribute('aria-hidden');
    } else {
      leading.setAttribute('aria-hidden', 'true');
    }
  }

  function fillTopbar(u, opts) {
    opts = opts || {};
    var welcomeTitle = document.getElementById('welcome-title');
    var userEmail = document.getElementById('user-email');
    var userAvatar = document.getElementById('user-avatar');
    if (welcomeTitle) {
      welcomeTitle.textContent = u
        ? 'Welcome back, ' + firstName(u)
        : opts.errorTitle || 'Welcome back, there';
    }
    if (userEmail) {
      userEmail.textContent = u ? (u.email || '').trim() : opts.errorEmail || '';
    }
    if (userAvatar && u) {
      userAvatar.setAttribute('aria-hidden', 'true');
      setAvatar(userAvatar, u);
    }
    syncLeadingSlotState();
    var dashLink = document.getElementById('platform-topbar-dashboard-link');
    if (dashLink) {
      dashLink.classList.toggle('hidden', !!opts.hideDashboardLink);
    }
  }

  function topbarInnerHTML(includeDashboardLink, headerExtraClass) {
    headerExtraClass = headerExtraClass || '';
    var dashBtn =
      '<a id="platform-topbar-dashboard-link" href="/dashboard/" class="dash-topbar-dashboard-link hidden sm:inline-flex rounded-full px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors">' +
      '<span class="material-symbols-outlined" aria-hidden="true">dashboard</span>' +
      '<span class="dash-topbar-dashboard-label">Dashboard</span></a>';
    if (!includeDashboardLink) {
      dashBtn = '<span id="platform-topbar-dashboard-link" class="hidden"></span>';
    }
    return (
      '<header class="dash-topbar ' + headerExtraClass + '">' +
      '<div class="dash-topbar-row">' +
      '<div id="platform-topbar-leading" class="dash-topbar-leading dash-topbar-leading--empty" aria-hidden="true"></div>' +
      '<div class="dash-topbar-identity">' +
      '<h2 class="dash-welcome-title" id="welcome-title">Loading…</h2>' +
      '<p class="dash-welcome-email" id="user-email"></p>' +
      '</div>' +
      '<div class="dash-topbar-actions">' +
      dashBtn +
      '<div class="glass-panel rounded-full flex items-center px-3 py-2 shadow-sm max-w-xs hidden sm:flex">' +
      '<span class="material-symbols-outlined text-slate-500 mr-2 shrink-0" aria-hidden="true">search</span>' +
      '<input type="search" class="bg-transparent border-0 focus:ring-0 text-sm text-slate-800 w-40 lg:w-48 placeholder-slate-400" placeholder="Search…" disabled aria-disabled="true"/>' +
      '</div>' +
      '<button type="button" class="dash-icon-btn glass-panel hidden sm:flex" aria-label="Notifications" disabled>' +
      '<span class="material-symbols-outlined">notifications</span></button>' +
      '<button type="button" class="dash-icon-btn glass-panel hidden sm:flex" aria-label="Help" disabled>' +
      '<span class="material-symbols-outlined">help_outline</span></button>' +
      '<div class="dash-avatar" id="user-avatar" aria-hidden="true"></div>' +
      '</div></div></header>'
    );
  }

  function getFixedWrap() {
    return document.getElementById('platform-fixed-topbar-wrap');
  }

  function syncPlatformTheme() {
    if (typeof ThemeService !== 'undefined') {
      ThemeService.applyTheme(ThemeService.getTheme());
      return;
    }
    try {
      var stored = localStorage.getItem('osiris_theme');
      var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      var dark =
        mode === 'dark' ||
        (mode === 'system' &&
          typeof window.matchMedia !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      var root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(dark ? 'dark' : 'light');
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  }

  function applyShellClass() {
    syncPlatformTheme();
    if (document.body) {
      document.body.classList.add('platform-shell--with-topbar');
      var path = window.location.pathname;
      if (/\/iris(\/|$)/.test(path)) {
        document.body.classList.add('platform-shell--iris');
      }
      if (/\/carscan(\/|$)/.test(path)) {
        document.body.classList.add('platform-shell--carscan');
      }
    }
    document.documentElement.style.setProperty('--platform-topbar-height', TOPBAR_HEIGHT);
  }

  function injectFixedSkeleton() {
    var existing = document.getElementById('platform-fixed-topbar-wrap');
    if (existing) {
      applyShellClass();
      return existing;
    }
    var wrap = document.createElement('div');
    wrap.id = 'platform-fixed-topbar-wrap';
    wrap.className = 'platform-app-topbar-wrap';
    wrap.innerHTML =
      '<div class="platform-app-topbar-glass">' + topbarInnerHTML(true, 'platform-app-topbar-inner') + '</div>';
    if (document.body) {
      document.body.insertBefore(wrap, document.body.firstChild);
    } else {
      document.documentElement.appendChild(wrap);
    }
    applyShellClass();
    return wrap;
  }

  function seedMapAppSession(user) {
    if (!/\/map-app(\/|$)/.test(window.location.pathname)) {
      return;
    }
    var fn = firstName(user);
    if (fn && fn !== 'there') {
      window.sessionStorage.setItem('osiris_user_name', fn);
    }
    window.sessionStorage.setItem('osiris_authenticated', '1');
  }

  window.OSirisPlatformTopbar = {
    clearLeading: function () {
      var slot = document.getElementById('platform-topbar-leading');
      if (!slot) return;
      slot.innerHTML = '';
      syncLeadingSlotState();
    },
    appendLeading: function (node) {
      if (!node) return;
      var slot = document.getElementById('platform-topbar-leading');
      if (!slot) return;
      slot.appendChild(node);
      syncLeadingSlotState();
    },
    mountLeading: function (node) {
      if (!node) return;
      var slot = document.getElementById('platform-topbar-leading');
      if (!slot) return;
      slot.innerHTML = '';
      slot.appendChild(node);
      syncLeadingSlotState();
    },
    getLeadingSlot: function () {
      return document.getElementById('platform-topbar-leading');
    },
  };

  var mount = document.getElementById('platform-topbar-mount');
  var hydrate = !!(mount && mount.getAttribute('data-mode') === 'hydrate');

  function ensureSkeleton() {
    if (hydrate && mount) {
      mount.innerHTML = topbarInnerHTML(false, '');
      return mount;
    }
    return injectFixedSkeleton();
  }

  function bootSkeleton() {
    if (!hydrate) {
      ensureSkeleton();
    }
  }

  bootSkeleton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSkeleton);
  }
  window.addEventListener('load', bootSkeleton);
  document.addEventListener('osiris-theme-change', function () {
    syncPlatformTheme();
  });

  window.OSirisPlatformReady = fetch('/api/get_user_dashboard.php', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then(function (res) {
      if (res.status === 401) {
        loginRedirect();
        return Promise.reject(new Error('unauthorized'));
      }
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.ok) {
        window.__OSirisPlatformUser = null;
        ensureSkeleton();
        fillTopbar(null, hydrate
          ? { hideDashboardLink: true, errorTitle: 'Could not load dashboard', errorEmail: 'Try refreshing the page.' }
          : { errorTitle: 'Could not load profile', errorEmail: 'Try refreshing the page.' });
        return { user: null, services: [], error: true };
      }

      var user = data.user;
      window.__OSirisPlatformUser = user;
      seedMapAppSession(user);

      ensureSkeleton();
      fillTopbar(user, { hideDashboardLink: !!hydrate });

      try {
        window.dispatchEvent(
          new CustomEvent('osiris-platform-user', {
            detail: {
              user: user,
              services: data.services || [],
              capabilities: data.capabilities || {},
              nav_tabs: data.nav_tabs || ['home'],
            },
          })
        );
      } catch (e) {
        /* ignore */
      }

      return {
        user: user,
        services: data.services || [],
        capabilities: data.capabilities || {},
        nav_tabs: data.nav_tabs || ['home'],
      };
    })
    .catch(function (err) {
      if (err && err.message === 'unauthorized') {
        return Promise.reject(err);
      }
      window.__OSirisPlatformUser = null;
      ensureSkeleton();
      fillTopbar(null, {
        errorTitle: 'Could not load profile',
        errorEmail: 'Check your connection and refresh.',
      });
      return { user: null, services: [], error: true };
    });
})();
