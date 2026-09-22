(function () {
  'use strict';
  function init() {
    var input = document.getElementById('scenarioCount');
    var result = document.getElementById('scenarioResult');
    if (!input || !result) return;
    input.addEventListener('input', function () {
      var count = Math.max(0, parseInt(input.value, 10) || 0);
      result.textContent = 'Scenario count: ' + count + '. No ecological conclusion is calculated because the required park inputs are not yet validated.';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
