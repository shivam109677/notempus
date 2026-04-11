-- Add double-billing protection with idempotency keys
CREATE TABLE IF NOT EXISTS billing_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 day')
);

-- Create index for fast lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_billing_idempotency_key ON billing_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_billing_idempotency_expires ON billing_idempotency(expires_at);

-- Add logging for audit trail (optional but recommended)
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id),
  male_user_id UUID NOT NULL,
  female_user_id UUID NOT NULL,
  debit_paise INTEGER NOT NULL,
  credit_paise INTEGER NOT NULL,
  reason VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_session ON billing_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_user ON billing_audit_log(male_user_id, female_user_id);
