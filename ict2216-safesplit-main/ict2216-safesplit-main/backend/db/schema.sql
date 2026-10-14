-- ============================================================================
-- SafeSplit — Database Schema
-- Single source of truth for all tables (see README.md, Section 8).
--
-- Dev:  auto-applied by the official postgres:16-alpine image's
--       /docker-entrypoint-initdb.d mechanism on a FRESH db volume
--       (see compose.yaml — db service volume mount). Re-running
--       `docker compose up` against an existing volume will NOT re-run
--       this file; use `docker compose down -v` first.
-- Prod: the AWS RDS deployment described in the report has no
--       docker-entrypoint-initdb.d mechanism, so backend/src/config/db.js
--       also applies this same file on every backend startup. Every
--       statement below is idempotent (IF NOT EXISTS / OR REPLACE), so
--       running it repeatedly, in either environment, is always safe.
--
-- NOTE: CREATE TABLE IF NOT EXISTS will NOT retroactively add new columns
--       to a table that already exists on disk. Anyone with an existing
--       local volume from before this revision needs `docker compose
--       down -v` (or a manual ALTER TABLE) to pick up the new columns.
--       email_verified_at below is exactly this case, so it ships with
--       its own ALTER TABLE ... ADD COLUMN IF NOT EXISTS immediately
--       after the CREATE TABLE, instead of relying on a fresh volume.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- email_verification_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- pending_registrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_registrations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(30) NOT NULL,
  email        VARCHAR(254) NOT NULL,
  password_hash TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_reg_email_uniq ON pending_registrations(email);
CREATE UNIQUE INDEX IF NOT EXISTS pending_reg_username_uniq ON pending_registrations(username);
CREATE INDEX IF NOT EXISTS idx_pending_reg_token ON pending_registrations(token_hash);

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
  settle_currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- group_members
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  paid_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
  converted_amount NUMERIC(12, 2),
  split_method VARCHAR(20) NOT NULL DEFAULT 'equal'
    CHECK (split_method IN ('equal', 'percentage', 'custom')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- expense_splits 
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_owed NUMERIC(12, 2) NOT NULL CHECK (amount_owed >= 0),
  is_settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, user_id)
);

-- ----------------------------------------------------------------------------
-- exchange_rates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (from_currency, to_currency)
);

-- ----------------------------------------------------------------------------
-- settlements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  payer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'SGD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'disputed')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  CHECK (payer_id <> payee_id)
);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  ip_hash TEXT,
  action_type VARCHAR(80) NOT NULL,
  affected_resource VARCHAR(80),
  resource_id UUID,
  outcome VARCHAR(20) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_payer ON settlements(payer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_payee ON settlements(payee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);

-- Allow re-registration with previously used emails/usernames after account
-- deletion. The inline UNIQUE constraints from CREATE TABLE apply to all rows
-- including soft-deleted ones, so we drop them and replace with partial
-- indexes that only cover active (non-deleted) accounts.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_uniq
  ON users(email) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_uniq
  ON users(username) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ----------------------------------------------------------------------------
-- group_invites
-- Pending/accepted/declined invitations. One row per (group, invitee) pair —
-- the UNIQUE constraint prevents someone being spammed with duplicate invites
-- to the same group.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  inviter_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  UNIQUE (group_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_invitee ON group_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_group   ON group_invites(group_id);