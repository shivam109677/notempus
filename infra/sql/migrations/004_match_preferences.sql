-- Migration 004: match preferences (interests, mood, intent, affinity scoring)
-- Adds columns to match_requests for rich matchmaking and stores the computed affinity score.

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS interest_tags    TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mood             VARCHAR(32) NOT NULL DEFAULT 'chill',
  ADD COLUMN IF NOT EXISTS intent           VARCHAR(32) NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS affinity_score   SMALLINT    NOT NULL DEFAULT 0;

COMMENT ON COLUMN match_requests.interest_tags  IS 'Array of lowercase interest tag strings sent at match join';
COMMENT ON COLUMN match_requests.mood           IS 'Mood hint: chill | curious | playful | serious';
COMMENT ON COLUMN match_requests.intent         IS 'Session intent: chat | learn | entertain';
COMMENT ON COLUMN match_requests.affinity_score IS 'Computed compatibility score (0-100); higher is better match';
