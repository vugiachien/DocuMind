-- Migration: Add soft delete columns
-- Date: 2026-02-02
-- Description: Add deleted_at and deleted_by columns to support soft delete

-- =============================================================================
-- CONTRACT TABLE - Soft Delete Support
-- =============================================================================

-- Add soft delete columns to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Index for filtering out deleted records efficiently
CREATE INDEX IF NOT EXISTS ix_contracts_not_deleted ON contracts (deleted_at);

-- =============================================================================
-- Note: To query only non-deleted contracts, use:
-- SELECT * FROM contracts WHERE deleted_at IS NULL
--
-- To include deleted contracts (admin only):
-- SELECT * FROM contracts
--
-- To see only deleted contracts (for recovery):
-- SELECT * FROM contracts WHERE deleted_at IS NOT NULL
-- =============================================================================
