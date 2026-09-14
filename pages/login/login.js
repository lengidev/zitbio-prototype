/**
 * ZitBio - Login Page Logic (Supabase Auth)
 * Handles real authentication via Supabase, password toggle, and forgot password flow.
 *
 * Changes from mock version:
 *   - Login now calls BioSupabase.signIn(email, password) — real password verification
 *   - Redirect is determined by the user's ROLE from the profiles table
 *   - Demo "any password works" behavior removed entirely
 */

/* ============================================
   PASSWORD TOGGLE
   ============================================ */
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

/* ============================================
   UI HELPERS
   ============================================ */
// Insert a message (error or success) into whichever view is currently active
// (login form or reset-password form) so it's always visible to the user.
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
   supabase-js — a failed fetch there keeps retrying with backoff for ~20s
   (measured) — so a hand-rolled loop adds little and mostly delays the honest
   failure. One retry still covers the fast transient: an HTTP error response,
   which supabase-js does not retry at all. */
var ROLE_LOOKUP_ATTEMPTS = 2;

/* Upper bound on the whole routing decision. supabase-js's internal retry can
   hold this promise for ~20s, and for all of that time the button sits on
   "Signing in…" with nothing telling the user anything is wrong. */
var ROLE_LOOKUP_TIMEOUT_MS = 12000;

/**
 * Read the role for a user, with one retry.
 *
 * This exists because a single failed read used to decide the user's whole
 * destination: the old catch sent EVERYONE to the field-officer page as the
 * "most restricted and safest fallback". So an admin whose lookup hiccuped
 * right after sign-in — the moment the access token is least settled — was
 * deposited on the officer page with no explanation. Reported as "logging in as
 * an admin sometimes takes you to the field officer page". Reading one row is
 * idempotent, so retrying is free.
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
 * Look up the user's role from the profiles table and redirect accordingly.
 *
 * On a failed lookup the user is NOT navigated anywhere — see the catch below
 * for why that matters.
 */
function redirectByRole(userId) {
  if (!window.BioSupabase) {
    // Unreachable via handleLogin, which gates on isConfigured — but kept
    // honest rather than kept convenient: guessing a destination is the bug
    // this function was fixed for.
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

  BioSupabase.ready()
    .then(function(client) { return fetchProfileForRouting(client, userId, 1); })
    .then(function(profile) {
      settle(function() {
        // Forced first-login change (#54). An admin creating an account sets a
        // password by hand and passes it on out of band; without this gate that
        // temporary password stays valid forever.
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
      // up and a failure here is transient or a permissions problem — not "the
      // user is offline". Navigating anyway turned a recoverable error into an
      // admin silently landing on the officer page, which reads as a broken app
      // rather than a failed lookup. Staying put keeps it visible and makes the
      // retry one click away.
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

/* ============================================
   LOGIN HANDLER
   ============================================ */
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

  // Real Supabase authentication — passwords are now actually enforced.
  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    setLoginLoading(true);
    BioSupabase.signIn(emailValue, passwordValue)
      .then(function(result) {
        if (result.error) {
          // Map Supabase error messages to user-friendly text.
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

        // Record last_login and route by role.
        redirectByRole(user.id);
      })
      .catch(function(err) {
        showLoginError(err && err.message ? err.message : 'Unable to sign in. Please try again.');
        setLoginLoading(false);
      });
  } else {
    // No Supabase configuration — inform the user clearly.
    showLoginError('Supabase is not configured. Please check config.js.');
  }
}

/* ============================================
   FORGOT PASSWORD
   ============================================ */

// Site base path, GitHub-Pages-subpath aware. Served at /Zitbio/ the pathname
// is '/Zitbio/index.html' → base '/Zitbio/'; locally '/index.html' → '/'. Used
// so the reset email link always points back to the REAL login page (the
// dashboard Site URL alone pointed the link at localhost — the bug).
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

/* ============================================
   PASSWORD RECOVERY (reset link clicked)
   ============================================ */
var recoveryActive = false;

// The reset email link lands on index.html with a recovery token (implicit
// flow: #access_token=...&type=recovery). Swap the login form for the
// "set a new password" form.
/* ───── REQUEST ACCESS (self-signup) ───── */

/**
 * Swap between the sign-in form and the Request Access form, mirroring
 * setRecoveryView so each view's DOM toggling lives in one place.
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

/** Endpoint for the public signup function. */
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
    // Success: return to sign-in with the email filled in, so the next step is
    // obvious rather than making them retype what they just entered.
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

// Bound independently of initLogin: nothing is shared with the sign-in wiring,
// and this keeps the feature working if that wiring changes.
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

// Swap between the login form and the "set a new password" form. Shared by
// enterRecoveryMode / exitRecoveryMode so the DOM toggling lives in one place.
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

/* ───── FORCED FIRST-LOGIN CHANGE (#54) ───── */

var forcedPasswordChange = false;
var forcedChangeUserId = null;

/**
 * Sent here instead of into the app when the profile has no
 * `password_changed_at` — i.e. the password in use is still the temporary one an
 * admin set by hand.
 *
 * Reuses the reset view: same two fields, different framing. A third password
 * form would be more surface for no benefit.
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
 * Record that the password is no longer the temporary one.
 *
 * Without this the gate would fire again on the next sign-in and the person
 * would be stuck in it. Non-fatal on failure, but logged loudly: a silent failure
 * here is a repeated prompt nobody can explain.
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
      // Forced first-login change (#54): stamp the profile BEFORE signing out,
      // or the gate fires again on the next sign-in.
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

/* ============================================
   PAGE INITIALIZATION
   ============================================ */
function initLogin() {
  var loginPage = document.querySelector('.page-login');
  if (!loginPage) return; // Not on login page

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

  // Password recovery: the reset link lands here with a recovery token. Swap
  // to the "set a new password" form when the client processes it — or if the
  // token was already processed before we subscribed (fallback hash check).
  if (window.BioSupabase && window.BioSupabase.isConfigured() && window.BioSupabase.onAuthStateChange) {
    window.BioSupabase.onAuthStateChange(function(event) {
      if (event === 'PASSWORD_RECOVERY') enterRecoveryMode();
    });
  }
  if (isRecoveryLink()) enterRecoveryMode();

  // Hide the demo helper text — real auth no longer accepts any password.
  var helperTexts = document.querySelectorAll('.helper-text');
  helperTexts.forEach(function(el) { el.style.display = 'none'; });
}

document.addEventListener('DOMContentLoaded', function() {
  initLogin();
});