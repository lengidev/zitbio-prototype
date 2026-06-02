/**
 * BioMonitor - Analytics Page Tab Switching
 * Enables in-page tab navigation for the Observations/Map/Graphs/Report tabs.
 * Also toggles the right-side controls (search/filter vs export) in the tab bar.
 */

document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.querySelectorAll('.analytics-tab');
    var panels = document.querySelectorAll('.analytics-tab-content');
    var searchWrapper = document.getElementById('tabSearchWrapper');
    var exportBtn = document.getElementById('tabExportBtn');

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

        // Show corresponding panel using data-tab attribute
        var tabName = tab.getAttribute('data-tab');
        if (tabName) {
            var targetPanel = document.getElementById('tab-' + tabName);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            // Toggle right-side controls based on which tab is active
            if (tabName === 'observations') {
                if (searchWrapper) searchWrapper.style.display = 'inline-flex';
                if (exportBtn) exportBtn.style.display = 'none';
            } else if (tabName === 'report') {
                if (searchWrapper) searchWrapper.style.display = 'none';
                if (exportBtn) exportBtn.style.display = 'inline-flex';
            } else {
                if (searchWrapper) searchWrapper.style.display = 'none';
                if (exportBtn) exportBtn.style.display = 'none';
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            activateTab(this);
        });
    });

    // Activate the tab that matches the current hash on page load
    function handleHashChange() {
        var hash = window.location.hash;
        if (hash) {
            var tabName = hash.replace('#tab-', '');
            var matchingTab = document.querySelector('.analytics-tab[data-tab="' + tabName + '"]');
            if (matchingTab) {
                activateTab(matchingTab);
            }
        }
    }

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
});