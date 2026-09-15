// lib/password.js
// One rule for every place a password is set. The sites used to disagree: the
// reset flow accepted 6 characters, the admin forms required 8, and `12345678`
// passed all of them.
// A floor, not a policy engine. Anything stronger belongs server-side.

(function () {
  'use strict';

  var MIN_LENGTH = 8;

  // Substring match. A speed bump for the obvious choices, not a breach check.
  var COMMON = [
    'password', 'passw0rd', '12345678', '123456789', 'qwertyui',
    'letmein1', 'iloveyou', 'admin123', 'zitbio123', 'welcome1'
  ];

  /** @returns {{ ok: boolean, message: string }} */
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
