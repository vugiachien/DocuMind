-- Migration 005: Add password_changed_at column to users table
-- Used to invalidate old JWT tokens when a user changes their password.
-- Any token with an iat (issued-at) before this timestamp will be rejected.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL;
