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

/**
 * Look up the user's role from the profiles table and redirect accordingly.
 * On failure, falls back to the field officer page (most restricted, safe).
 */
function redirectByRole(userId) {
  if (window.BioSupabase) {
    BioSupabase.ready()
      .then(function(client) {
        return client.from('profiles').select('role').eq('id', userId).maybeSingle();
      })
      .then(function(result) {
        if (result.error) throw result.error;
        var role = result.data && result.data.role;
        if (role === 'admin') {
          window.location.href = 'pages/admin/dashboard/dashboard.html';
        } else {
          window.location.href = 'pages/field-officer/field-officer.html';
        }
      })
      .catch(function() {
        // Role lookup failed (RLS/misc) — default to the field officer page
        // which is the most restricted and safest fallback.
        window.location.href = 'pages/field-officer/field-officer.html';
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
  } else {
    // Supabase not available — degrade to the field officer page.
    window.location.href = 'pages/field-officer/field-officer.html';
  }
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
  setRecoveryView(false);
  if (message) showLoginSuccess(message);
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
      // Invalidate the recovery session so only this device keeps the change.
      return BioSupabase.signOut().then(function() { return true; });
    })
    .then(function(ok) {
      btn.disabled = false;
      btn.textContent = 'Update Password';
      if (ok) {
        pw.value = '';
        confirm.value = '';
        exitRecoveryMode('Password updated successfully. Sign in with your new password.');
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