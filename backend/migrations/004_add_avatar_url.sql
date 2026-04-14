-- Migration: Add avatar_url column to users table
-- Date: 2024

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NULL;

-- Add comment
COMMENT ON COLUMN users.avatar_url IS 'URL to avatar image stored in MinIO';

