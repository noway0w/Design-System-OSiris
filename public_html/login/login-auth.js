(function () {
  var ERR = {
    sso_not_configured: 'SSO is not configured on this server (missing OAuth client env vars).',
    sso_denied: 'Sign-in was cancelled at the identity provider.',
    sso_state: 'Session expired or invalid. Please try SSO again.',
    sso_token: 'Could not complete sign-in with the identity provider.',
    sso_userinfo: 'Could not read your profile from the identity provider.',
    sso_email: 'Your account did not return an email address (required for OSiris).',
    sso_server: 'Sign-in hit a server error. Please try again or use email and password.',
    verify_missing: 'Verification link is missing.',
    verify_invalid: 'This verification link is invalid or has expired.'
  };

  var params = new URLSearchParams(window.location.search);
  var next = params.get('next') || '/dashboard/';
  var errEl = document.getElementById('login-error');
  var okEl = document.getElementById('login-success');
  var ssoButtons = document.getElementById('sso-buttons');
  var ssoHint = document.getElementById('sso-hint');
  var panels = document.querySelectorAll('[data-login-panel]');
  var footerSignin = document.getElementById('footer-signin');
  var footerRegister = document.getElementById('footer-register');

  function showErr(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    if (okEl) okEl.classList.add('hidden');
  }

  function showOk(msg) {
    if (!okEl) return;
    okEl.textContent = msg;
    okEl.classList.remove('hidden');
    if (errEl) errEl.classList.add('hidden');
  }

  function clearMessages() {
    if (errEl) errEl.classList.add('hidden');
    if (okEl) okEl.classList.add('hidden');
    clearVerifyLink();
  }

  var verifyLinkBox = document.getElementById('login-verify-link-box');

  function showVerifyLink(url) {
    if (!verifyLinkBox) return;
    verifyLinkBox.innerHTML = '';
    var a = document.createElement('a');
    a.href = url;
    a.className = 'login-verify-link';
    a.textContent = 'Verify my account';
    a.rel = 'noopener';
    verifyLinkBox.appendChild(a);
    verifyLinkBox.classList.remove('hidden');
  }

  function clearVerifyLink() {
    if (!verifyLinkBox) return;
    verifyLinkBox.innerHTML = '';
    verifyLinkBox.classList.add('hidden');
  }

  function showPanel(name) {
    clearMessages();
    panels.forEach(function (p) {
      var on = p.getAttribute('data-login-panel') === name;
      p.hidden = !on;
    });
    if (footerSignin) footerSignin.hidden = name !== 'signin';
    if (footerRegister) footerRegister.hidden = name === 'register';
    var card = document.querySelector('.login-card');
    if (card) {
      card.classList.toggle('login-card--alt', name !== 'signin');
    }
  }

  document.querySelectorAll('[data-show-panel]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var panel = el.getAttribute('data-show-panel');
      if (!panel) return;
      if (el.tagName === 'A' && el.getAttribute('href') === '#') {
        e.preventDefault();
      }
      showPanel(panel);
    });
  });

  var qErr = params.get('error');
  if (qErr && ERR[qErr]) {
    showErr(ERR[qErr]);
  }
  if (params.get('verified') === '1') {
    showOk('Your email is verified. You can sign in now.');
  }
  if (params.get('reset') === 'ok') {
    showOk('Your password was updated. You can sign in now.');
  }

  async function loadSso() {
    if (!ssoButtons) return;
    try {
      var res = await fetch('/api/auth-sso-meta.php?next=' + encodeURIComponent(next), { credentials: 'same-origin' });
      var data = await res.json().catch(function () { return null; });
      if (!data || !data.sso) return;
      ssoButtons.innerHTML = '';
      if (data.sso.providers && data.sso.providers.length) {
        data.sso.providers.forEach(function (p) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'login-sso-btn glass-panel';
          if (p.id === 'google') {
            btn.innerHTML = '<img src="/login/assets/google-g.png" alt="" width="20" height="20" />' +
              '<span>Continue with Google</span>';
          } else {
            btn.textContent = 'Continue with ' + (p.label || p.id);
          }
          btn.addEventListener('click', function () {
            var url = p.startUrl || '';
            if (!url || url[0] !== '/') return;
            window.top.location.assign(url);
          });
          ssoButtons.appendChild(btn);
        });
        if (ssoHint) ssoHint.classList.add('hidden');
      } else if (ssoHint) {
        ssoHint.textContent = (data.sso.hint || '') + (data.sso.redirectUriExample ? ' ' + data.sso.redirectUriExample : '');
        ssoHint.classList.remove('hidden');
      }
    } catch (e) {
      if (ssoHint) {
        ssoHint.textContent = 'Could not load SSO options. You can still sign in with email and password.';
        ssoHint.classList.remove('hidden');
      }
    }
  }

  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearMessages();
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      try {
        var res = await fetch('/api/auth-login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: email, password: password })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) {
          showErr(data.error || 'Login failed');
          return;
        }
        window.location.href = next.startsWith('/') ? next : '/dashboard/';
      } catch (x) {
        showErr(x && x.message ? x.message : 'Network error');
      }
    });
  }

  var registerForm = document.getElementById('register-form');
  if (registerForm) {
    var regPassword = document.getElementById('reg-password');
    var strengthBars = document.querySelectorAll('[data-strength-bar]');
    if (regPassword && strengthBars.length) {
      regPassword.addEventListener('input', function () {
        var v = regPassword.value;
        var score = 0;
        if (v.length >= 8) score++;
        if (/\d/.test(v)) score++;
        if (/[^a-zA-Z0-9]/.test(v)) score++;
        strengthBars.forEach(function (bar, i) {
          bar.classList.toggle('login-strength-bar--on', i < score);
        });
      });
    }
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearMessages();
      var payload = {
        name: document.getElementById('reg-first-name').value.trim(),
        surname: document.getElementById('reg-last-name').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        phone: document.getElementById('reg-phone').value.trim(),
        password: document.getElementById('reg-password').value,
        confirmPassword: document.getElementById('reg-confirm-password').value,
        termsAccepted: document.getElementById('reg-terms').checked
      };
      try {
        var res = await fetch('/api/auth-register.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) {
          showErr(data.error || 'Registration failed');
          return;
        }
        registerForm.reset();
        if (strengthBars.length) {
          strengthBars.forEach(function (bar) { bar.classList.remove('login-strength-bar--on'); });
        }
        var msg = data.message || 'Check your email to activate your account.';
        if (data.verifyUrl) {
          msg += ' Use the button below to verify your account.';
          showOk(msg);
          showVerifyLink(data.verifyUrl);
        } else if (data.emailSent === false) {
          msg += ' Configure SMTP in .platform-sso.env on the server, or ask an administrator for the link in api/.mail-outbox/ on the server.';
          showOk(msg);
        } else {
          showOk(msg);
        }
      } catch (x) {
        showErr(x && x.message ? x.message : 'Network error');
      }
    });
  }

  var forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearMessages();
      var email = document.getElementById('forgot-email').value.trim();
      try {
        var res = await fetch('/api/auth-forgot-password.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: email })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.ok) {
          showErr(data.error || 'Request failed');
          return;
        }
        showOk(data.message || 'If an account exists for this email, we sent a password reset link.');
        forgotForm.reset();
      } catch (x) {
        showErr(x && x.message ? x.message : 'Network error');
      }
    });
  }

  showPanel('signin');
  loadSso();
})();
