-- Migration 021: Account lockout columns on users table
-- Adds failed_login_attempts counter and locked_until timestamp for brute-force protection.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
