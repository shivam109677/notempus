CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('male', 'female', 'admin');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE session_status AS ENUM ('created', 'connected', 'ended', 'terminated');
CREATE TYPE transaction_type AS ENUM ('debit', 'credit');
CREATE TYPE transaction_reason AS ENUM (
  'chat_usage',
  'topup',
  'reward',
  'female_earning',
  'platform_revenue',
  'reward_pool_funding',
  'refund',
  'adjustment'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role user_role NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_shadow_banned BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  hold_paise BIGINT NOT NULL DEFAULT 0 CHECK (hold_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID,
  type transaction_type NOT NULL,
  reason transaction_reason NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  balance_after_paise BIGINT NOT NULL CHECK (balance_after_paise >= 0),
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX wallet_ledger_idempotency_key_uniq
ON wallet_ledger (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE TABLE reward_pool (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_pool_singleton CHECK (id = 1)
);

CREATE TABLE reward_pool_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  type transaction_type NOT NULL,
  reason transaction_reason NOT NULL,
  related_user_id UUID REFERENCES users(id),
  related_session_id UUID,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX reward_pool_ledger_idempotency_key_uniq
ON reward_pool_ledger (idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE TABLE match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  male_user_id UUID NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL CHECK (mode IN ('free', 'paid_verified')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'offered', 'matched', 'cancelled', 'expired')),
  offered_female_user_id UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  male_user_id UUID NOT NULL REFERENCES users(id),
  female_user_id UUID NOT NULL REFERENCES users(id),
  status session_status NOT NULL DEFAULT 'created',
  mode TEXT NOT NULL CHECK (mode IN ('free', 'paid_verified')),
  rate_per_minute_paise INT NOT NULL CHECK (rate_per_minute_paise > 0),
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  billed_seconds INT NOT NULL DEFAULT 0,
  total_male_debited_paise BIGINT NOT NULL DEFAULT 0,
  total_female_credited_paise BIGINT NOT NULL DEFAULT 0,
  total_platform_revenue_paise BIGINT NOT NULL DEFAULT 0,
  total_reward_pool_paise BIGINT NOT NULL DEFAULT 0,
  carry_millipaise INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uniq_active_paid_session_per_male
ON chat_sessions (male_user_id)
WHERE status IN ('created', 'connected') AND mode = 'paid_verified';

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  status TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX payments_idempotency_key_uniq
ON payments (user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE TABLE payment_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES chat_sessions(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID NOT NULL REFERENCES users(id),
  blocked_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE TABLE verification_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  selfie_url TEXT,
  live_capture_url TEXT,
  face_match_score NUMERIC(5, 4),
  liveness_score NUMERIC(5, 4),
  status verification_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  referred_user_id UUID NOT NULL REFERENCES users(id),
  reward_paise BIGINT NOT NULL CHECK (reward_paise > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'credited', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referrer_user_id, referred_user_id)
);

CREATE INDEX chat_sessions_status_idx ON chat_sessions (status);
CREATE INDEX match_requests_status_idx ON match_requests (status);
CREATE INDEX wallet_ledger_user_created_idx ON wallet_ledger (user_id, created_at DESC);
