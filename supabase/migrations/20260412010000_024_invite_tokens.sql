-- Migration 022: Invite tokens for invite-only registration
-- Admins create tokens; new users must present a valid token to register.

CREATE TABLE IF NOT EXISTS invite_tokens (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  token text NOT NULL UNIQUE,
  email text,
  role text NOT NULL DEFAULT 'agent',
  created_by integer NOT NULL REFERENCES users(id),
  used_by integer REFERENCES users(id),
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_tokens_token_idx ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS invite_tokens_created_by_idx ON invite_tokens(created_by);

-- RLS
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_tokens_allow_all ON invite_tokens FOR ALL USING (true);
