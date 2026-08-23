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
function togglePassword() {
  var pwd = document.getElementById('password');
  var icon = document.getElementById('eyeIcon');
  if (!pwd || !icon) return;

  if (pwd.type === 'password') {
    pwd.type = 'text';
    icon.querySelector('use').setAttribute('href', '#i-visibility_off');
  } else {
    pwd.type = 'password';
    icon.querySelector('use').setAttribute('href', '#i-visibility');
  }
}

/* ============================================
   UI HELPERS
   ============================================ */
function showLoginError(message) {
  var loginBtn = document.getElementById('loginBtn') || document.querySelector('.login-btn');
  var existing = document.getElementById('loginError');
  if (existing) existing.remove();

  var error = document.createElement('div');
  error.id = 'loginError';
  error.className = 'login-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;

  var form = document.getElementById('loginForm');
  if (form) {
    form.insertBefore(error, form.firstChild);
  } else if (loginBtn && loginBtn.parentNode) {
    loginBtn.parentNode.insertBefore(error, loginBtn);
  }
}

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
        return client.auth.resetPasswordForEmail(emailValue);
      })
      .then(function(result) {
        if (result.error) {
          showLoginError(result.error.message || 'Unable to send reset email. Try again.');
          return;
        }
        showLoginError('Password reset link sent to ' + emailValue + '. Check your inbox.');
      })
      .catch(function() {
        showLoginError('Unable to send reset email. Please try again.');
      });
  } else {
    showLoginError('Supabase is not configured. Password reset is unavailable.');
  }
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

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (passwordToggleBtn) {
    passwordToggleBtn.addEventListener('click', togglePassword);
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', handleForgot);
  }

  // Hide the demo helper text — real auth no longer accepts any password.
  var helperTexts = document.querySelectorAll('.helper-text');
  helperTexts.forEach(function(el) { el.style.display = 'none'; });
}

document.addEventListener('DOMContentLoaded', function() {
  initLogin();
});