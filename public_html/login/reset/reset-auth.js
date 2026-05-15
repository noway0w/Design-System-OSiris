(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token') || '';
  var errEl = document.getElementById('reset-error');
  var okEl = document.getElementById('reset-success');
  var form = document.getElementById('reset-form');
  var submitBtn = document.getElementById('reset-submit');

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

  if (!token) {
    showErr('This reset link is invalid or has expired.');
    if (form) form.classList.add('hidden');
    return;
  }

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (errEl) errEl.classList.add('hidden');
    if (okEl) okEl.classList.add('hidden');
    var password = document.getElementById('reset-password').value;
    var confirm = document.getElementById('reset-confirm-password').value;
    if (submitBtn) submitBtn.disabled = true;
    try {
      var res = await fetch('/api/auth-reset-password.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: token, password: password, confirmPassword: confirm })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) {
        showErr(data.error || 'Could not reset password.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      window.location.href = '/login/?reset=ok';
    } catch (x) {
      showErr(x && x.message ? x.message : 'Network error');
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
