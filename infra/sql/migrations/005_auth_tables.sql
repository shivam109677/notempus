-- Migration 005: auth tables (OTP, addresses, verification tiers for signup flow)

-- ── 1. Extend users table ────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_tier SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gmail_sub         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_hash     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.verification_tier IS '0=anonymous, 1=email/Google, 2=+phone, 3=+address';
COMMENT ON COLUMN users.gmail_sub         IS 'Google OAuth subject (sub) for Google sign-in';
COMMENT ON COLUMN users.password_hash     IS 'Argon2id hash; NULL for OAuth-only accounts';
COMMENT ON COLUMN users.email_verified_at IS 'Set when email OTP or Google OAuth confirms the address';

-- ── 2. OTP tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms')),
  code_hash       VARCHAR(128) NOT NULL,       -- SHA-256 of the 6-digit code
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_user_channel
  ON otp_tokens (user_id, channel) WHERE used_at IS NULL;

COMMENT ON TABLE otp_tokens IS 'One-time verification codes for email and SMS channels';

-- ── 3. User addresses (for T3 credit-purchase gate) ─────────────────────────
CREATE TABLE IF NOT EXISTS user_addresses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1       TEXT        NOT NULL,
  line2       TEXT,
  city        VARCHAR(120) NOT NULL,
  state       VARCHAR(120),
  country     CHAR(2)     NOT NULL,   -- ISO 3166-1 alpha-2
  postal_code VARCHAR(20),
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_addresses_unique_user
  ON user_addresses (user_id);

COMMENT ON TABLE user_addresses IS 'Postal address required for Tier-3 (credit topup) access';
