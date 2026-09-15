/* ZitBio login page (Supabase Auth): sign-in, password recovery and self-signup. */

/* PASSWORD TOGGLE */
function bindPasswordToggle(inputId, iconId, btnId) {
  var pwd = document.getElementById(inputId);
  var icon = document.getElementById(iconId);
  var btn = document.getElementById(btnId);
  if (!pwd || !icon || !btn) return;

  btn.addEventListener('click', function() {
    if (pwd.type === 'password') {
      pwd.type = 'text';
      icon.querySelector('use').setAttribute('href', '#i-visibility_off');
    } else {
      pwd.type = 'password';
      icon.querySelector('use').setAttribute('href', '#i-visibility');
    }
  });
}

/* UI HELPERS */
function showMessage(message, isError) {
  var resetView = document.getElementById('resetView');
  var form = (resetView && !resetView.hidden)
    ? document.getElementById('resetPasswordForm')
    : document.getElementById('loginForm');
  var loginBtn = document.getElementById('loginBtn') || document.querySelector('.login-btn');
  var existing = document.getElementById('loginError');
  var existingOk = document.getElementById('loginSuccess');
  if (existing) existing.remove();
  if (existingOk) existingOk.remove();

  var el = document.createElement('div');
  el.id = isError ? 'loginError' : 'loginSuccess';
  el.className = isError ? 'login-error' : 'login-success';
  if (isError) el.setAttribute('role', 'alert');
  el.textContent = message;

  if (form) {
    form.insertBefore(el, form.firstChild);
  } else if (loginBtn && loginBtn.parentNode) {
    loginBtn.parentNode.insertBefore(el, loginBtn);
  }
}

function showLoginError(message) { showMessage(message, true); }
function showLoginSuccess(message) { showMessage(message, false); }

function setLoginLoading(isLoading) {
  var loginBtn = document.getElementById('loginBtn') || document.querySelector('.login-btn');
  if (!loginBtn) return;
  if (isLoading) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';
  } else {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

/* One retry, 400 ms apart. The network case is ALREADY retried inside
   supabase-js (a failed fetch keeps retrying with backoff for ~20s, measured),
   so a hand-rolled loop adds little and mostly delays the honest failure. One
   retry still covers the fast transient: an HTTP error response, which
   supabase-js does not retry at all. */
var ROLE_LOOKUP_ATTEMPTS = 2;

/* Upper bound on the whole routing decision. supabase-js's internal retry can
   hold this promise for ~20s, and for all of that time the button sits on
   "Signing in…" with nothing telling the user anything is wrong. */
var ROLE_LOOKUP_TIMEOUT_MS = 12000;

/**
 * One retry, because a single failed read used to decide the user's whole
 * destination: every failure sent the user to the field-officer page, so an
 * admin whose lookup hiccuped right after sign-in landed there with no
 * explanation. Reading one row is idempotent, so retrying is free.
 */
function fetchProfileForRouting(client, userId, attempt) {
  return client.from('profiles').select('role, password_changed_at').eq('id', userId).maybeSingle()
    .then(function(result) {
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No profile row for user');
      return result.data;
    })
    .catch(function(error) {
      if (attempt >= ROLE_LOOKUP_ATTEMPTS) throw error;
      return new Promise(function(resolve) { setTimeout(resolve, 400); })
        .then(function() { return fetchProfileForRouting(client, userId, attempt + 1); });
    });
}

/**
 * The token issued by signIn carries `user_role` and `password_changed_at`, so
 * routing from it removes the last profiles round trip from sign-in. Resolves
 * null whenever the claims cannot carry the decision, so the caller falls back
 * to the /profiles read and an outdated token cannot skip the gate.
 */
function routeFromVerifiedClaims(userId) {
  if (!window.BioSupabase || typeof BioSupabase.getVerifiedClaims !== 'function') {
    return Promise.resolve(null);
  }
  return BioSupabase.getVerifiedClaims().then(function(claims) {
    if (!claims || String(claims.sub) !== String(userId)) return null;
    if (claims.user_role !== 'admin' && claims.user_role !== 'field_officer') return null;
    if (!('password_changed_at' in claims)) return null;
    return { role: claims.user_role, password_changed_at: claims.password_changed_at };
  }).catch(function() {
    return null;
  });
}

/**
 * On a failed lookup the user is NOT navigated anywhere: see the catch below.
 */
function redirectByRole(userId) {
  if (!window.BioSupabase) {
    // Unreachable via handleLogin, which gates on isConfigured, but kept honest:
    // guessing a destination is the bug this function was fixed for.
    showLoginError('Supabase is not configured. Please check config.js.');
    setLoginLoading(false);
    return;
  }

  // Exactly one outcome wins. Without this, the timeout could report a failure
  // and a late-arriving success would then navigate on top of it.
  var settled = false;
  var timer = null;
  function settle(action) {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    action();
  }

  timer = setTimeout(function() {
    settle(function() {
      console.warn('Role lookup did not resolve within ' + ROLE_LOOKUP_TIMEOUT_MS + ' ms.');
      showLoginError('Signed in, but your account details could not be loaded. Please try again.');
      setLoginLoading(false);
    });
  }, ROLE_LOOKUP_TIMEOUT_MS);

  // Token claims first (zero extra network); the /profiles read is the
  // fallback for a token that predates the password_changed_at claim.
  routeFromVerifiedClaims(userId)
    .then(function(fromToken) {
      if (fromToken) return fromToken;
      return BioSupabase.ready()
        .then(function(client) { return fetchProfileForRouting(client, userId, 1); });
    })
    .then(function(profile) {
      settle(function() {
        // Forced first-login change: an admin sets a temporary password by hand
        // and passes it on out of band; without this gate it stays valid forever.
        if (!profile.password_changed_at) {
          enterForcedPasswordChange(userId);
          return;
        }
        window.location.href = profile.role === 'admin'
          ? 'pages/admin/dashboard/dashboard.html'
          : 'pages/field-officer/field-officer.html';
      });
    })
    .catch(function(error) {
      // Stay on the login page and say so. This deliberately does NOT fall back
      // to a guessed destination: signIn() already succeeded, so the network was
      // up and a failure here is transient or a permissions problem. Navigating
      // anyway put an admin silently on the officer page, which reads as a broken
      // app rather than a failed lookup; staying put keeps the retry one click away.
      settle(function() {
        console.warn('Role lookup failed:', error && error.message);
        showLoginError('Signed in, but your account details could not be loaded. Please try again.');
        setLoginLoading(false);
      });
    });

  // Record the login timestamp in the profile (fires in parallel; the
  // RLS "Users update own profile" policy permits updating own row).
  BioSupabase.ready()
    .then(function(client) {
      return client.from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId);
    })
    .catch(function(err) {
      console.warn('Failed to record last_login:', err && err.message);
    });
}

/* LOGIN HANDLER */
function handleLogin(e) {
  e.preventDefault();

  var email = document.getElementById('email');
  var password = document.getElementById('password');
  if (!email || !password) return;

  var emailValue = email.value.trim();
  var passwordValue = password.value;

  if (!emailValue) {
    email.focus();
    return;
  }
  if (!passwordValue) {
    password.focus();
    return;
  }

  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    setLoginLoading(true);
    BioSupabase.signIn(emailValue, passwordValue)
      .then(function(result) {
        if (result.error) {
          var msg = result.error.message || 'Invalid login credentials';
          if (msg.toLowerCase().indexOf('invalid login credentials') !== -1) {
            msg = 'Incorrect email or password. Please try again.';
          } else if (msg.toLowerCase().indexOf('email not confirmed') !== -1) {
            msg = 'Please confirm your email address before logging in.';
          } else if (msg.toLowerCase().indexOf('database error querying schema') !== -1) {
            msg = 'Supabase Auth is unavailable because its database schema needs attention. Apply the project migrations in Supabase, then try again.';
          }
          showLoginError(msg);
          setLoginLoading(false);
          return;
        }

        var user = result.data && result.data.user;
        if (!user) {
          showLoginError('Login succeeded but no user was returned. Please try again.');
          setLoginLoading(false);
          return;
        }

        redirectByRole(user.id);
      })
      .catch(function(err) {
        showLoginError(err && err.message ? err.message : 'Unable to sign in. Please try again.');
        setLoginLoading(false);
      });
  } else {
    showLoginError('Supabase is not configured. Please check config.js.');
  }
}

/* FORGOT PASSWORD */

// GitHub-Pages-subpath aware, so the reset email link points back at the REAL
// login page: the dashboard Site URL alone pointed it at localhost.
function getSiteBase() {
  var parts = window.location.pathname.split('/');
  parts.pop(); // drop 'index.html' / trailing ''
  return parts.join('/') + '/';
}

function getLoginRedirectUrl() {
  return window.location.origin + getSiteBase() + 'index.html';
}

function handleForgot(e) {
  e.preventDefault();
  var email = document.getElementById('email');
  var emailValue = email ? email.value.trim() : '';
  if (!emailValue) {
    showLoginError('Enter your email address first to request a password reset.');
    return;
  }

  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    BioSupabase.ready()
      .then(function(client) {
        return client.auth.resetPasswordForEmail(emailValue, {
          redirectTo: getLoginRedirectUrl()
        });
      })
      .then(function(result) {
        if (result.error) {
          showLoginError(result.error.message || 'Unable to send reset email. Try again.');
          return;
        }
        showLoginSuccess('Password reset link sent to ' + emailValue + '. Check your inbox.');
      })
      .catch(function() {
        showLoginError('Unable to send reset email. Please try again.');
      });
  } else {
    showLoginError('Supabase is not configured. Password reset is unavailable.');
  }
}

/* PASSWORD RECOVERY (reset link clicked) */
var recoveryActive = false;

// The reset email link lands on index.html with a recovery token in the hash.
/* Request access (self-signup) */

/**
 * Mirrors setRecoveryView, so each view's DOM toggling lives in one place.
 */
function setAccessView(active) {
  var loginForm = document.getElementById('loginForm');
  var forgotLink = document.getElementById('forgotPasswordLink');
  var resetView = document.getElementById('resetView');
  var accessView = document.getElementById('requestAccessView');
  var subtitle = document.getElementById('cardSubtitle');

  if (loginForm) loginForm.hidden = active;
  if (forgotLink) forgotLink.hidden = active;
  if (resetView) resetView.hidden = true;
  if (accessView) accessView.hidden = !active;
  if (subtitle) subtitle.textContent = active ? 'Create your account' : 'Sign in to your account';

  if (active) {
    var name = document.getElementById('raName');
    if (name) name.focus();
  }
}

var ACCESS_FIELDS = ['raName', 'raEmail', 'raPassword', 'raConfirm'];

function clearAccessErrors() {
  for (var i = 0; i < ACCESS_FIELDS.length; i++) {
    var id = ACCESS_FIELDS[i];
    var input = document.getElementById(id);
    var error = document.getElementById(id + 'Error');
    if (input) {
      input.classList.remove('input-error');
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
  }
}

function setAccessError(id, message) {
  var input = document.getElementById(id);
  var error = document.getElementById(id + 'Error');
  if (error) {
    error.textContent = message;
    error.hidden = false;
    error.setAttribute('role', 'alert');
  }
  if (input) {
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', id + 'Error');
  }
}

function getAccessRequestUrl() {
  var cfg = window.SUPABASE_CONFIG || {};
  if (cfg.accessRequestUrl) return cfg.accessRequestUrl;
  if (!cfg.url) return '';
  return cfg.url.replace(/\/$/, '') + '/functions/v1/access-request';
}

function handleRequestAccess(e) {
  e.preventDefault();
  clearAccessErrors();

  var name = (document.getElementById('raName').value || '').trim();
  var email = (document.getElementById('raEmail').value || '').trim().toLowerCase();
  var institution = (document.getElementById('raInstitution').value || '').trim();
  var password = document.getElementById('raPassword').value || '';
  var confirm = document.getElementById('raConfirm').value || '';

  // Validate here so the answer is immediate. The function validates again,
  // because it is reachable without this form.
  var firstInvalid = null;
  function fail(id, message) {
    setAccessError(id, message);
    if (!firstInvalid) firstInvalid = id;
  }

  if (!name) fail('raName', 'Enter your full name.');

  if (!email) {
    fail('raEmail', 'Enter your email address.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    fail('raEmail', 'Enter a valid email address.');
  }

  if (!password || !password.length) {
    fail('raPassword', 'Choose a password.');
  } else if (window.BioPassword && !window.BioPassword.check(password).ok) {
    fail('raPassword', window.BioPassword.check(password).message);
  } else if (password !== confirm) {
    fail('raConfirm', 'Both passwords must match.');
  }

  if (firstInvalid) {
    var el = document.getElementById(firstInvalid);
    if (el) el.focus();
    return;
  }

  var url = getAccessRequestUrl();
  var anonKey = (window.SUPABASE_CONFIG || {}).anonKey;
  if (!url || !anonKey) {
    showLoginError('Account creation is unavailable: Supabase is not configured.');
    return;
  }

  var btn = document.getElementById('requestAccessBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating account…';
  }

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': 'Bearer ' + anonKey
    },
    body: JSON.stringify({
      email: email,
      full_name: name,
      password: password,
      institution: institution
    })
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      return { ok: res.ok, status: res.status, data: data };
    });
  }).then(function (result) {
    if (!result.ok) {
      var message = (result.data && result.data.error) || 'Could not create your account.';
      // Server-side problems that belong to a field are shown against it.
      if (result.status === 409) setAccessError('raEmail', message);
      else showLoginError(message);
      return;
    }
    // Return to sign-in with the email filled in, so the next step is obvious.
    setAccessView(false);
    var loginEmail = document.getElementById('email');
    if (loginEmail) loginEmail.value = email;
    var pw = document.getElementById('password');
    if (pw) {
      pw.value = '';
      pw.focus();
    }
    showLoginSuccess('Account created. Sign in with the password you just chose.');
  }).catch(function (err) {
    showLoginError('Could not reach the server. ' + ((err && err.message) || 'Check your connection.'));
  }).then(function () {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}

// Bound independently of initLogin: nothing is shared with the sign-in wiring.
document.addEventListener('DOMContentLoaded', function () {
  var accessLink = document.getElementById('requestAccessLink');
  if (accessLink) {
    accessLink.addEventListener('click', function (e) {
      e.preventDefault();
      clearAccessErrors();
      setAccessView(true);
    });
  }

  var backLink = document.getElementById('backFromAccessLink');
  if (backLink) {
    backLink.addEventListener('click', function (e) {
      e.preventDefault();
      setAccessView(false);
    });
  }

  var accessForm = document.getElementById('requestAccessForm');
  if (accessForm) accessForm.addEventListener('submit', handleRequestAccess);

  bindPasswordToggle('raPassword', 'raEyeIcon', 'raPasswordToggleBtn');
});

function isRecoveryLink() {
  return window.location.hash.indexOf('type=recovery') !== -1;
}

// Shared by enter/exitRecoveryMode so the DOM toggling lives in one place.
function setRecoveryView(active) {
  var loginForm = document.getElementById('loginForm');
  var forgotLink = document.getElementById('forgotPasswordLink');
  var resetView = document.getElementById('resetView');
  var subtitle = document.getElementById('cardSubtitle');
  if (loginForm) loginForm.hidden = active;
  if (forgotLink) forgotLink.hidden = active;
  if (resetView) resetView.hidden = !active;
  if (subtitle) subtitle.textContent = active ? 'Set a new password' : 'Sign in to your account';
}

function enterRecoveryMode() {
  if (recoveryActive) return;
  recoveryActive = true;
  setRecoveryView(true);
  var pw = document.getElementById('newPassword');
  if (pw) pw.focus();
}

function exitRecoveryMode(message) {
  recoveryActive = false;
  forcedPasswordChange = false;
  forcedChangeUserId = null;
  setRecoveryView(false);
  if (message) showLoginSuccess(message);
}

/* Forced first-login change */

var forcedPasswordChange = false;
var forcedChangeUserId = null;

/**
 * Sent here instead of into the app when the profile has no
 * `password_changed_at`. Reuses the reset view, since a third password form
 * would be more surface for no benefit.
 */
function enterForcedPasswordChange(userId) {
  forcedPasswordChange = true;
  forcedChangeUserId = userId;
  enterRecoveryMode();
  var note = document.querySelector('#resetView .recovery-note');
  if (note) {
    note.textContent = 'Your account was created with a temporary password. ' +
      'Choose your own password to continue.';
  }
}

/**
 * Without this the gate would fire again on the next sign-in. Failure is
 * non-fatal but logged loudly: a silent failure is a repeated prompt nobody can
 * explain.
 */
function stampPasswordChanged(userId) {
  return BioSupabase.ready().then(function(client) {
    return client.from('profiles')
      .update({ password_changed_at: new Date().toISOString() })
      .eq('id', userId)
      .then(function(res) {
        if (res && res.error) {
          console.warn('Could not record password_changed_at:', res.error.message);
          return false;
        }
        return true;
      });
  }).catch(function(err) {
    console.warn('Could not record password_changed_at:', err && err.message);
    return false;
  });
}

function handleUpdatePassword(e) {
  e.preventDefault();
  var pw = document.getElementById('newPassword');
  var confirm = document.getElementById('confirmPassword');
  var btn = document.getElementById('updatePasswordBtn');
  if (!pw || !confirm) return;

  var newPassword = pw.value;
  if (!newPassword || newPassword.length < 6) {
    showLoginError('Password must be at least 6 characters long.');
    return;
  }  var strength = window.BioPassword
    ? window.BioPassword.check(newPassword)
    : { ok: newPassword.length >= 8, message: 'Use at least 8 characters.' };
  if (!strength.ok) {
    showLoginError(strength.message);
    return;
  }
  if (newPassword !== confirm.value) {
    showLoginError('Passwords do not match. Please try again.');
    return;
  }
  if (!window.BioSupabase || !window.BioSupabase.isConfigured()) {
    showLoginError('Supabase is not configured. Password reset is unavailable.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating…';
  BioSupabase.updatePassword(newPassword)
    .then(function(result) {
      if (result && result.error) {
        showLoginError(result.error.message || 'Unable to update password. Try again.');
        return false;
      }
      // Stamp the profile BEFORE signing out, or the gate fires again next time.
      if (forcedPasswordChange && forcedChangeUserId) {
        return stampPasswordChanged(forcedChangeUserId).then(function() {
          return BioSupabase.signOut().then(function() { return true; });
        });
      }
      // Invalidate the recovery session so only this device keeps the change.
      return BioSupabase.signOut().then(function() { return true; });
    })
    .then(function(ok) {
      btn.disabled = false;
      btn.textContent = 'Update Password';
      if (ok) {
        var wasForced = forcedPasswordChange;
        pw.value = '';
        confirm.value = '';
        exitRecoveryMode(wasForced
          ? 'Password set. Sign in with your new password.'
          : 'Password updated successfully. Sign in with your new password.');
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = 'Update Password';
      showLoginError('Unable to update password. Please try again.');
    });
}

/* PAGE INITIALIZATION */
function initLogin() {
  var loginPage = document.querySelector('.page-login');
  if (!loginPage) return;

  var loginForm = document.getElementById('loginForm');
  var passwordToggleBtn = document.getElementById('passwordToggleBtn');
  var forgotPasswordLink = document.getElementById('forgotPasswordLink');
  var resetForm = document.getElementById('resetPasswordForm');
  var backToLoginLink = document.getElementById('backToLoginLink');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  bindPasswordToggle('password', 'eyeIcon', 'passwordToggleBtn');
  bindPasswordToggle('newPassword', 'newEyeIcon', 'newPasswordToggleBtn');

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', handleForgot);
  }

  if (resetForm) {
    resetForm.addEventListener('submit', handleUpdatePassword);
  }
  if (backToLoginLink) {
    backToLoginLink.addEventListener('click', function(e) {
      e.preventDefault();
      exitRecoveryMode();
    });
  }

  // Swap to the reset form when the client processes the recovery token, or when
  // it was already processed before we subscribed (the isRecoveryLink fallback).
  if (window.BioSupabase && window.BioSupabase.isConfigured() && window.BioSupabase.onAuthStateChange) {
    window.BioSupabase.onAuthStateChange(function(event) {
      if (event === 'PASSWORD_RECOVERY') enterRecoveryMode();
    });
  }
  if (isRecoveryLink()) enterRecoveryMode();

  // The demo hint is wrong now that real auth rejects wrong passwords.
  var helperTexts = document.querySelectorAll('.helper-text');
  helperTexts.forEach(function(el) { el.style.display = 'none'; });
}

document.addEventListener('DOMContentLoaded', function() {
  initLogin();
});