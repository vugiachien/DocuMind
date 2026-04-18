import apiClient from './api';
import { Playbook, PlaybookRule, PlaybookDocument } from '../types/types';

type FrontendPlaybookType = 'playbook' | 'severity_rule';
type BackendPlaybookType = 'audit_policy' | 'severity_rule';

const toBackendPlaybookType = (type?: FrontendPlaybookType): BackendPlaybookType | undefined => {
    if (!type) return undefined;
    return type === 'playbook' ? 'audit_policy' : type;
};

const fromBackendPlaybookType = (type?: string): FrontendPlaybookType | undefined => {
    if (!type) return undefined;
    return type === 'audit_policy' ? 'playbook' : (type as FrontendPlaybookType);
};

const normalizePlaybookRule = (rule: any): PlaybookRule => ({
    ...rule,
    documentId: rule.documentId || rule.auditPolicyId,
});

const normalizePlaybookDocument = (playbook: any): PlaybookDocument => ({
    ...playbook,
    contractTypeId: playbook.contractTypeId || playbook.agreementTypeId,
    type: fromBackendPlaybookType(playbook.type),
});

const normalizePlaybook = (playbook: any): Playbook => ({
    ...playbook,
    contractTypeId: playbook.contractTypeId || playbook.agreementTypeId,
    type: fromBackendPlaybookType(playbook.type),
    rules: (playbook.rules || []).map(normalizePlaybookRule),
});

const normalizePlaybookUpdate = (data: any) => ({
    ...data,
    agreementTypeId: data.agreementTypeId || data.contractTypeId,
    type: toBackendPlaybookType(data.type),
});

export const playbookService = {
    // Get all playbooks (documents), optionally filtered by type
    getPlaybooks: async (type?: FrontendPlaybookType): Promise<PlaybookDocument[]> => {
        const params = type ? { type: toBackendPlaybookType(type) } : {};
        const response = await apiClient.get('/audit_policies/', { params });
        return response.data.map(normalizePlaybookDocument);
    },

    // Get specific playbook details including rules
    getPlaybook: async (id: string): Promise<Playbook> => {
        const response = await apiClient.get(`/audit_policies/${id}`);
        return normalizePlaybook(response.data);
    },

    // Upload new playbook file
    uploadPlaybook: async (file: File, contractTypeId: string, docType: FrontendPlaybookType = 'playbook'): Promise<{ document: PlaybookDocument, rules: PlaybookRule[] }> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('contract_type_id', contractTypeId);
        formData.append('doc_type', toBackendPlaybookType(docType) || 'audit_policy');

        const response = await apiClient.post('/audit_policies/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        const playbook = normalizePlaybook(response.data);

        return {
            document: normalizePlaybookDocument(playbook),
            rules: playbook.rules || []
        };
    },

    // Analyze playbook (Trigger AI)
    analyzePlaybook: async (id: string): Promise<Playbook> => {
        const response = await apiClient.post(`/audit_policies/${id}/analyze`);
        return normalizePlaybook(response.data);
    },

    // Update playbook details
    updatePlaybook: async (id: string, data: any): Promise<Playbook> => {
        const response = await apiClient.put(`/audit_policies/${id}`, normalizePlaybookUpdate(data));
        return normalizePlaybook(response.data);
    },

    // Get playbook preview URL
    getPlaybookPreviewUrl: async (id: string): Promise<{ url: string }> => {
        const response = await apiClient.get<{ url: string }>(`/audit_policies/${id}/preview`);
        return response.data;
    },

    // Stream playbook file blob (Proxy)
    getPlaybookFileBlob: async (id: string): Promise<Blob> => {
        const response = await apiClient.get(`/audit_policies/${id}/stream`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Get playbook rules
    getPlaybookRules: async (id: string): Promise<PlaybookRule[]> => {
        const response = await apiClient.get(`/audit_policies/${id}/rules`);
        return response.data.map(normalizePlaybookRule);
    },

    // Delete playbook
    deletePlaybook: async (id: string): Promise<void> => {
        await apiClient.delete(`/audit_policies/${id}`);
    },
    async updatePlaybookRule(ruleId: string, data: Partial<PlaybookRule>): Promise<PlaybookRule> {
        const response = await apiClient.put(`/audit_policies/rules/${ruleId}`, data);
        return normalizePlaybookRule(response.data);
    }
};

export default playbookService;
