/**
 * Shared dashboard top bar for platform apps: loads session via get_user_dashboard.php,
 * redirects on 401, injects fixed bar or hydrates #platform-topbar-mount (dashboard).
 * Exposes window.OSirisPlatformReady (Promise) and window.__OSirisPlatformUser.
 */
(function () {
  var TOPBAR_HEIGHT = '5rem';

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

  function fillTopbar(root, u, opts) {
    opts = opts || {};
    var welcomeTitle = root.querySelector('#welcome-title');
    var userEmail = root.querySelector('#user-email');
    var userAvatar = root.querySelector('#user-avatar');
    if (welcomeTitle) {
      welcomeTitle.textContent = 'Welcome back, ' + firstName(u);
    }
    if (userEmail) {
      userEmail.textContent = (u.email || '').trim();
    }
    if (userAvatar) {
      userAvatar.setAttribute('aria-hidden', 'true');
      setAvatar(userAvatar, u);
    }
    var dashLink = root.querySelector('#platform-topbar-dashboard-link');
    if (dashLink) {
      dashLink.classList.toggle('hidden', !!opts.hideDashboardLink);
    }
  }

  function topbarInnerHTML(includeDashboardLink, headerExtraClass) {
    headerExtraClass = headerExtraClass || '';
    var dashBtn =
      '<a id="platform-topbar-dashboard-link" href="/dashboard/" class="dash-topbar-dashboard-link hidden sm:inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors">' +
      '<span class="material-symbols-outlined text-lg mr-1" aria-hidden="true">dashboard</span>Dashboard</a>';
    if (!includeDashboardLink) {
      dashBtn = '<span id="platform-topbar-dashboard-link" class="hidden"></span>';
    }
    return (
      '<header class="dash-topbar ' + headerExtraClass + '">' +
      '<div>' +
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
      '</div></header>'
    );
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

  var mount = document.getElementById('platform-topbar-mount');
  var hydrate = !!(mount && mount.getAttribute('data-mode') === 'hydrate');

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
        if (hydrate && mount) {
          mount.innerHTML = topbarInnerHTML(false, '');
          var wt0 = mount.querySelector('#welcome-title');
          var em0 = mount.querySelector('#user-email');
          if (wt0) {
            wt0.textContent = 'Could not load dashboard';
          }
          if (em0) {
            em0.textContent = 'Try refreshing the page.';
          }
        }
        return { user: null, services: [], error: true };
      }

      var user = data.user;
      window.__OSirisPlatformUser = user;
      seedMapAppSession(user);

      if (hydrate && mount) {
        mount.innerHTML = topbarInnerHTML(false, '');
        fillTopbar(mount, user, { hideDashboardLink: true });
      } else {
        var wrap = document.createElement('div');
        wrap.id = 'platform-fixed-topbar-wrap';
        wrap.className = 'platform-app-topbar-wrap';
        wrap.innerHTML =
          '<div class="platform-app-topbar-glass">' + topbarInnerHTML(true, 'platform-app-topbar-inner') + '</div>';
        // Append to <html> so SPAs that replace body contents (e.g. Modly) cannot remove the bar.
        if (!document.getElementById('platform-fixed-topbar-wrap')) {
          document.documentElement.appendChild(wrap);
        }
        fillTopbar(wrap, user, { hideDashboardLink: false });
        document.body.classList.add('platform-shell--with-topbar');
        document.documentElement.style.setProperty('--platform-topbar-height', TOPBAR_HEIGHT);
      }

      try {
        window.dispatchEvent(
          new CustomEvent('osiris-platform-user', { detail: { user: user, services: data.services || [] } })
        );
      } catch (e) {
        /* ignore */
      }

      return { user: user, services: data.services || [] };
    })
    .catch(function (err) {
      if (err && err.message === 'unauthorized') {
        return Promise.reject(err);
      }
      window.__OSirisPlatformUser = null;
      return { user: null, services: [], error: true };
    });
})();
