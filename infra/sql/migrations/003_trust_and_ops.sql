CREATE TYPE payout_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
CREATE TYPE moderation_action_type AS ENUM ('warn', 'shadow_ban', 'ban', 'terminate_session');

CREATE TABLE IF NOT EXISTS liveness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES chat_sessions(id),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('blink', 'head_turn', 'random_prompt')),
  score NUMERIC(5, 4) NOT NULL CHECK (score >= 0 AND score <= 1),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'review')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES chat_sessions(id),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('static_image', 'replay_video', 'multiple_accounts', 'device_abuse', 'velocity_abuse')),
  severity SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  confidence NUMERIC(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_signals_user_created_idx
ON fraud_signals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES chat_sessions(id),
  action moderation_action_type NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  fingerprint_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS user_device_fingerprints_hash_idx
ON user_device_fingerprints (fingerprint_hash);

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  status payout_status NOT NULL DEFAULT 'pending',
  idempotency_key TEXT,
  reviewed_by UUID REFERENCES users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_idempotency_key_uniq
ON payout_requests (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uniq
ON payments (provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_id_uniq
ON payments (provider, provider_order_id)
WHERE provider_order_id IS NOT NULL;
