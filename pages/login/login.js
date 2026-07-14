/**
 * BioMonitor - Login Page Logic
 * Handles authentication, password toggle, and forgot password flow.
 * Reads from unified BioData layer for credential validation.
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
    icon.textContent = 'visibility_off';
  } else {
    pwd.type = 'password';
    icon.textContent = 'visibility';
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

  // Use BioData for real login with redirect + lastLogin tracking
  if (window.BioData) {
    var result = window.BioData.login(emailValue, passwordValue);
    if (result.success) {
      // Redirect to role-appropriate page
      window.location.href = result.redirect;
      return;
    } else {
      alert(result.error);
      return;
    }
  }

  // Fallback if BioData not loaded
  alert('Login successful!\n\nEmail: ' + emailValue + '\nRole: ' + (emailValue.includes('sarah') ? 'Admin' : 'Officer'));
}

/* ============================================
   FORGOT PASSWORD
   ============================================ */
function handleForgot(e) {
  e.preventDefault();
  alert('Password reset link has been sent to your email.');
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
}

document.addEventListener('DOMContentLoaded', function() {
  initLogin();
});