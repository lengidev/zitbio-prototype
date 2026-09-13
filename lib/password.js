/**
 * ZitBio — Password strength policy (issue #54)
 *
 * One rule for every place a password is set: the first-login change, the reset
 * flow, the Request Access signup, and Admin → Add User. Before this, each site
 * had its own check — the login reset flow accepted 6 characters while the
 * admin forms required 8 — and `12345678` was accepted by all of them.
 *
 * Deliberately a floor, not a policy engine: length, no single repeated
 * character, not all digits, and not one of the handful of passwords that appear
 * first in every credential-stuffing list. Anything stronger belongs server-side.
 *
 * Usage:
 *   var result = BioPassword.check('hunter2');
 *   if (!result.ok) showError(result.message);
 */
(function () {
  'use strict';

  var MIN_LENGTH = 8;

  // Substring match, case-insensitive. Small on purpose — this is a speed bump
  // for the obvious choices, not a breach check.
  var COMMON = [
    'password', 'passw0rd', '12345678', '123456789', 'qwertyui',
    'letmein1', 'iloveyou', 'admin123', 'zitbio123', 'welcome1'
  ];

  /**
   * @param {string} password
   * @returns {{ ok: boolean, message: string }}
   */
  function check(password) {
    var pw = String(password == null ? '' : password);

    if (pw.length < MIN_LENGTH) {
      return { ok: false, message: 'Use at least ' + MIN_LENGTH + ' characters.' };
    }
    if (/^(.)\1*$/.test(pw)) {
      return { ok: false, message: 'Do not use the same character repeated.' };
    }
    if (/^\d+$/.test(pw)) {
      return { ok: false, message: 'Include at least one letter, not just numbers.' };
    }

    var lower = pw.toLowerCase();
    for (var i = 0; i < COMMON.length; i++) {
      if (lower.indexOf(COMMON[i]) !== -1) {
        return { ok: false, message: 'That password is too easy to guess.' };
      }
    }

    return { ok: true, message: '' };
  }

  window.BioPassword = {
    MIN_LENGTH: MIN_LENGTH,
    check: check
  };
}());
