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
    verify_invalid: 'This verification link is invalid or has expired.',
    invite_invalid: 'This project invitation link is invalid or has expired.',
    invite_email_mismatch: 'Use the Google account that matches the email address you were invited with.'
  };

  var params = new URLSearchParams(window.location.search);
  var next = params.get('next') || '/dashboard/';
  var inviteToken = (params.get('invite') || '').trim();
  var errEl = document.getElementById('login-error');
  var okEl = document.getElementById('login-success');
  var ssoButtons = document.getElementById('sso-buttons');
  var ssoHint = document.getElementById('sso-hint');
  var registerSsoButtons = document.getElementById('register-sso-buttons');
  var registerSsoHint = document.getElementById('register-sso-hint');
  var registerInviteBanner = document.getElementById('register-invite-banner');
  var panels = document.querySelectorAll('[data-login-panel]');
  var footerSignin = document.getElementById('footer-signin');
  var footerRegister = document.getElementById('footer-register');
  var pendingVerifyEmail = '';
  var verifyEmailDisplay = document.getElementById('verify-email-display');
  var verifyResendBtn = document.getElementById('verify-resend-btn');

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

  function showVerifyEmailPanel(email) {
    if (verifyEmailDisplay) {
      verifyEmailDisplay.textContent = email || '';
    }
    showPanel('verify-email');
  }

  async function resendVerificationEmail() {
    if (!pendingVerifyEmail) {
      showErr('No email address to resend to.');
      return;
    }
    if (verifyResendBtn) verifyResendBtn.disabled = true;
    try {
      var res = await fetch('/api/auth-resend-verify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: pendingVerifyEmail })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) {
        showErr(data.error || 'Could not resend verification email.');
        return;
      }
      if (data.verifyUrl) {
        showVerifyLink(data.verifyUrl);
      }
      if (data.emailSent) {
        showOk(data.message || 'Verification email sent.');
      } else {
        showErr(data.message || 'Could not send verification email.');
      }
    } catch (x) {
      showErr(x && x.message ? x.message : 'Network error');
    } finally {
      if (verifyResendBtn) verifyResendBtn.disabled = false;
    }
  }

  if (verifyResendBtn) {
    verifyResendBtn.addEventListener('click', resendVerificationEmail);
  }

  var linkPendingVerify = document.getElementById('link-pending-verify');
  if (linkPendingVerify) {
    linkPendingVerify.addEventListener('click', function (e) {
      e.preventDefault();
      var emailInput = document.getElementById('email');
      pendingVerifyEmail = emailInput ? emailInput.value.trim() : '';
      if (!pendingVerifyEmail) {
        showErr('Enter your email on the sign-in form first.');
        return;
      }
      showVerifyEmailPanel(pendingVerifyEmail);
    });
  }

  function showPanel(name) {
    clearMessages();
    panels.forEach(function (p) {
      var on = p.getAttribute('data-login-panel') === name;
      p.hidden = !on;
    });
    if (footerSignin) footerSignin.hidden = name !== 'signin';
    if (footerRegister) footerRegister.hidden = name !== 'register';
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
    var joinProject = params.get('project_id');
    if (joinProject) {
      sessionStorage.setItem('osiris_open_project_id', joinProject);
      showOk('Your email is verified. Sign in to open your project workspace.');
    } else {
      showOk('Your email is verified. You can sign in now.');
    }
  }
  if (params.get('reset') === 'ok') {
    showOk('Your password was updated. You can sign in now.');
  }

  function renderSsoButtons(container, hintEl, providers) {
    if (!container) return;
    container.innerHTML = '';
    if (providers && providers.length) {
      providers.forEach(function (p) {
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
        container.appendChild(btn);
      });
      if (hintEl) hintEl.classList.add('hidden');
    } else if (hintEl) {
      hintEl.classList.remove('hidden');
    }
  }

  async function loadSsoTargets(buttonContainer, hintEl, invite) {
    if (!buttonContainer) return;
    try {
      var metaUrl = '/api/auth-sso-meta.php?next=' + encodeURIComponent(next);
      if (invite) metaUrl += '&invite=' + encodeURIComponent(invite);
      var res = await fetch(metaUrl, { credentials: 'same-origin' });
      var data = await res.json().catch(function () { return null; });
      if (!data || !data.sso) return;
      if (data.sso.providers && data.sso.providers.length) {
        renderSsoButtons(buttonContainer, hintEl, data.sso.providers);
      } else if (hintEl) {
        hintEl.textContent = (data.sso.hint || '') + (data.sso.redirectUriExample ? ' ' + data.sso.redirectUriExample : '');
        hintEl.classList.remove('hidden');
      }
    } catch (e) {
      if (hintEl) {
        hintEl.textContent = 'Could not load SSO options. You can still use email and password.';
        hintEl.classList.remove('hidden');
      }
    }
  }

  async function loadSso() {
    await loadSsoTargets(ssoButtons, ssoHint, '');
    await loadSsoTargets(registerSsoButtons, registerSsoHint, inviteToken);
  }

  async function openInviteSignup() {
    if (!inviteToken) return;
    try {
      var res = await fetch('/api/auth-invite-meta.php?token=' + encodeURIComponent(inviteToken), {
        credentials: 'same-origin'
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) {
        showErr(data.error || ERR.invite_invalid);
        showPanel('signin');
        return;
      }
      var regEmail = document.getElementById('reg-email');
      var regFirst = document.getElementById('reg-first-name');
      var regLast = document.getElementById('reg-last-name');
      if (regEmail) {
        regEmail.value = data.email || '';
        regEmail.readOnly = true;
        regEmail.classList.add('bg-slate-50');
      }
      if (regFirst && data.name) regFirst.value = data.name;
      if (regLast && data.surname) regLast.value = data.surname;
      if (registerInviteBanner) {
        registerInviteBanner.innerHTML =
          '<strong>' + escapeHtml(data.inviter_name || 'A teammate') + '</strong> invited you to join ' +
          '<strong>' + escapeHtml(data.project_name || 'a project') + '</strong>. ' +
          'Create your account below (Google or email), then confirm your email to access the project.';
        registerInviteBanner.classList.remove('hidden');
      }
      showPanel('register');
      await loadSsoTargets(registerSsoButtons, registerSsoHint, inviteToken);
    } catch (e) {
      showErr(ERR.invite_invalid);
      showPanel('signin');
    }
  }

  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
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
          if (data.code === 'pending_verify' && data.email) {
            pendingVerifyEmail = data.email;
            showVerifyEmailPanel(data.email);
            return;
          }
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
      var endpoint = inviteToken ? '/api/auth-complete-invite.php' : '/api/auth-register.php';
      var body = inviteToken
        ? {
            token: inviteToken,
            name: payload.name,
            surname: payload.surname,
            password: payload.password,
            confirmPassword: payload.confirmPassword,
            termsAccepted: payload.termsAccepted
          }
        : payload;
      try {
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body)
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
        pendingVerifyEmail = data.email || payload.email;
        if (inviteToken) {
          inviteToken = '';
          var regEmailEl = document.getElementById('reg-email');
          if (regEmailEl) {
            regEmailEl.readOnly = false;
            regEmailEl.classList.remove('bg-slate-50');
          }
          if (window.history && window.history.replaceState) {
            var cleanParams = new URLSearchParams(window.location.search);
            cleanParams.delete('invite');
            var q = cleanParams.toString();
            window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''));
          }
        }
        if (data.verifyUrl) {
          showVerifyEmailPanel(pendingVerifyEmail);
          showVerifyLink(data.verifyUrl);
          return;
        }
        showVerifyEmailPanel(pendingVerifyEmail);
        if (data.emailSent === false) {
          showErr(data.message || 'We could not send the verification email. Tap "Resend verification email" below.');
        } else if (data.message) {
          showOk(data.message);
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

  if (inviteToken) {
    openInviteSignup();
  } else {
    showPanel('signin');
    loadSso();
  }
})();
