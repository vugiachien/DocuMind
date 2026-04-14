-- Migration 006: Add htmlpreview and templateUrl columns to contract_types table
-- The Alembic migration a76644c11c32 was supposed to add this but only altered sectionPairsJson.

ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS "templateUrl" VARCHAR NULL;
ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS htmlpreview TEXT NULL;
