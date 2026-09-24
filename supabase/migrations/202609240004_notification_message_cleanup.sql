-- ============================================================================
-- ZitBIO — the notifications already in the inbox quoted the internal key
-- ============================================================================
-- 202609240002 stops NEW notifications from carrying the observation_id, but the
-- rows already delivered still do, and a user reading their bell sees the old
-- copies until the retention sweep clears them (30 days). All 23 rows present at
-- the time of writing contained one.
--
-- This rewrites the prose only. `related_id` and `link` still hold the key, so
-- nothing that joins or navigates on it changes, and the title, type, read flag
-- and timestamps are untouched.
--
-- The old phrasing ("approved by X at <site>") is left as it was: this migration
-- removes leaked internals, it does not rewrite what somebody was told. New
-- notifications get the corrected sentence from 202609240002.
--
-- ---------------------------------------------------------------------------
-- INVERSE — not possible, and not wanted: the removed text is the defect. The
-- observation each row refers to is still named by related_id.
-- ---------------------------------------------------------------------------

update public.notifications
set message = btrim(regexp_replace(message, '\s*\(obs_[^)]*\)', '', 'g'))
where message ~ '\(obs_[^)]*\)';
