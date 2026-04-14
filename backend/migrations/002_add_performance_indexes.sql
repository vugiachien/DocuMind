-- Migration: Add performance indexes
-- Date: 2026-02-02
-- Description: Add indexes for frequently queried columns to improve query performance

-- =============================================================================
-- CONTRACT TABLE INDEXES
-- =============================================================================

-- Single column indexes
CREATE INDEX IF NOT EXISTS ix_contracts_status ON contracts (status);
CREATE INDEX IF NOT EXISTS ix_contracts_partner_id ON contracts ("partnerId");
CREATE INDEX IF NOT EXISTS ix_contracts_contract_type_id ON contracts ("contractTypeId");
CREATE INDEX IF NOT EXISTS ix_contracts_playbook_id ON contracts ("playbookId");
CREATE INDEX IF NOT EXISTS ix_contracts_owner_id ON contracts ("ownerId");
CREATE INDEX IF NOT EXISTS ix_contracts_created_at ON contracts ("createdAt");
CREATE INDEX IF NOT EXISTS ix_contracts_updated_at ON contracts ("updatedAt");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS ix_contracts_owner_status ON contracts ("ownerId", status);
CREATE INDEX IF NOT EXISTS ix_contracts_status_updated ON contracts (status, "updatedAt");


-- =============================================================================
-- CONTRACT_SHARES TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_contract_shares_contract ON contract_shares ("contractId");
CREATE INDEX IF NOT EXISTS ix_contract_shares_target ON contract_shares ("sharedType", "targetId");


-- =============================================================================
-- RISKS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_risks_contract_id ON risks ("contractId");
CREATE INDEX IF NOT EXISTS ix_risks_severity ON risks (severity);
CREATE INDEX IF NOT EXISTS ix_risks_risk_type ON risks (risk_type);
CREATE INDEX IF NOT EXISTS ix_risks_contract_severity ON risks ("contractId", severity);


-- =============================================================================
-- CONTRACT_VERSIONS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_contract_versions_contract_id ON contract_versions ("contractId");
CREATE INDEX IF NOT EXISTS ix_contract_versions_uploaded_at ON contract_versions ("uploadedAt");
CREATE INDEX IF NOT EXISTS ix_contract_versions_processing_status ON contract_versions (processingstatus);
CREATE INDEX IF NOT EXISTS ix_contract_versions_contract_version ON contract_versions ("contractId", version);


-- =============================================================================
-- AUDIT_LOGS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs ("userId");
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS ix_audit_logs_target_type ON audit_logs ("targetType");
CREATE INDEX IF NOT EXISTS ix_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS ix_audit_logs_target ON audit_logs ("targetType", "targetId");
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_time ON audit_logs ("userId", timestamp);


-- =============================================================================
-- PLAYBOOKS TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_playbooks_name ON playbooks (name);
CREATE INDEX IF NOT EXISTS ix_playbooks_status ON playbooks (status);
CREATE INDEX IF NOT EXISTS ix_playbooks_contract_type_id ON playbooks ("contractTypeId");


-- =============================================================================
-- PLAYBOOK_RULES TABLE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_playbook_rules_playbook_id ON playbook_rules ("playbookId");
CREATE INDEX IF NOT EXISTS ix_playbook_rules_category ON playbook_rules (category);
CREATE INDEX IF NOT EXISTS ix_playbook_rules_severity ON playbook_rules (severity);
CREATE INDEX IF NOT EXISTS ix_playbook_rules_playbook_severity ON playbook_rules ("playbookId", severity);
