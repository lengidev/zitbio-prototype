// lib/date.js
// Timestamps are STORED in UTC and DISPLAYED in the viewer's local time. Every
// function here reads the Date through local getters or toLocaleDateString;
// none slices the ISO string. Slicing showed a 00:06 local record as the
// previous day, and the same moment rendered correctly elsewhere in the app.
// Never pass a bare "YYYY-MM-DD" to new Date(): it parses as UTC midnight and
// shifts the day for anyone west of Greenwich.

(function (global) {
    'use strict';

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /** Parse to a Date, or null. Accepts a Date or anything Date can read. */
    function parse(value) {
        if (!value) return null;
        var d = (value instanceof Date) ? value : new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /** "YYYY-MM-DD" in LOCAL time — for `<input type="date">`. */
    function localDateInput(value) {
        var d = parse(value);
        if (!d) return '';
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /** "HH:MM" in LOCAL time, 24-hour — for `<input type="time">`. */
    function localTimeInput(value) {
        var d = parse(value);
        if (!d) return '';
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    /** "Sep 13, 2026" in LOCAL time. */
    function mediumDate(value) {
        var d = parse(value);
        if (!d) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** "9/13/2026" in LOCAL time. */
    function numericDate(value) {
        var d = parse(value);
        if (!d) return '—';
        return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    }

    /** "00:06" in LOCAL time, 24-hour, zero-padded. */
    function shortTime(value) {
        var d = parse(value);
        if (!d) return '—';
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    /** "Sep 13, 2026 · 00:06" in LOCAL time — date and time together. */
    function dateTime(value) {
        var d = parse(value);
        if (!d) return '—';
        return mediumDate(d) + ' · ' + shortTime(d);
    }

    /**
     * Build a UTC ISO timestamp from LOCAL `<input type="date">` and
     * `<input type="time">` values.
     *
     * The Date constructor is given local date and time components, so the
     * instant it resolves is the correct UTC moment for the viewer's zone. The
     * previous code appended 'Z' to the typed wall-clock instead, which stored
     * the local reading as if it were already UTC.
     */
    function toUtcIso(dateStr, timeStr) {
        var dp = String(dateStr || '').split('-');
        if (dp.length !== 3) return null;
        var tp = String(timeStr || '00:00').split(':');
        var d = new Date(
            parseInt(dp[0], 10),
            parseInt(dp[1], 10) - 1,
            parseInt(dp[2], 10),
            parseInt(tp[0], 10) || 0,
            parseInt(tp[1], 10) || 0,
            0, 0
        );
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    /** The viewer's IANA time zone, for diagnostics and for explaining output. */
    function timeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }

    global.BioDate = {
        parse: parse,
        localDateInput: localDateInput,
        localTimeInput: localTimeInput,
        mediumDate: mediumDate,
        numericDate: numericDate,
        shortTime: shortTime,
        dateTime: dateTime,
        toUtcIso: toUtcIso,
        timeZone: timeZone
    };
})(window);
