/**
 * BioMonitor - Analytics Page Tab Switching
 * Enables in-page tab navigation for the Observations/Map/Graphs/Report tabs.
 */

document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.querySelectorAll('.analytics-tab');
    var panels = document.querySelectorAll('.analytics-tab-content');

    function activateTab(tab) {
        if (!tab) return;

        // Deactivate all tabs
        tabs.forEach(function(t) {
            t.classList.remove('active');
        });

        // Hide all panels
        panels.forEach(function(p) {
            p.classList.remove('active');
        });

        // Activate clicked tab
        tab.classList.add('active');

        // Show corresponding panel (from href, e.g. "#tab-observations")
        var targetId = tab.getAttribute('href');
        if (targetId) {
            var targetPanel = document.querySelector(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            activateTab(this);
        });
    });

    // Activate the tab that matches the current hash on page load
    // (also handles browser back/forward if hash changes)
    function handleHashChange() {
        var hash = window.location.hash;
        if (hash) {
            var matchingTab = document.querySelector('.analytics-tab[href="' + hash + '"]');
            if (matchingTab) {
                activateTab(matchingTab);
            }
        }
    }

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
});