import apiClient from './api';
import { Playbook, PlaybookRule, PlaybookDocument } from '../types/types';

export const playbookService = {
    // Get all playbooks (documents), optionally filtered by type
    getPlaybooks: async (type?: 'playbook' | 'severity_rule'): Promise<PlaybookDocument[]> => {
        const params = type ? { type } : {};
        const response = await apiClient.get<PlaybookDocument[]>('/playbooks/', { params });
        return response.data;
    },

    // Get specific playbook details including rules
    getPlaybook: async (id: string): Promise<Playbook> => {
        const response = await apiClient.get<Playbook>(`/playbooks/${id}`);
        return response.data;
    },

    // Upload new playbook file
    uploadPlaybook: async (file: File, contractTypeId: string, docType: 'playbook' | 'severity_rule' = 'playbook'): Promise<{ document: PlaybookDocument, rules: PlaybookRule[] }> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('contract_type_id', contractTypeId);
        formData.append('doc_type', docType);

        const response = await apiClient.post<Playbook>('/playbooks/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        // Transform backend response to match frontend expected structure if needed
        // The backend returns the Playbook object which contains rules
        const playbook = response.data;

        return {
            document: {
                id: playbook.id,
                name: playbook.name,
                description: playbook.description || '',
                uploadedAt: new Date(playbook.uploadedAt),
                status: playbook.status as any,
                ruleCount: playbook.ruleCount || 0,
                type: playbook.type,
            },
            rules: playbook.rules || []
        };
    },

    // Analyze playbook (Trigger AI)
    analyzePlaybook: async (id: string): Promise<Playbook> => {
        const response = await apiClient.post<Playbook>(`/playbooks/${id}/analyze`);
        return response.data;
    },

    // Update playbook details
    updatePlaybook: async (id: string, data: any): Promise<Playbook> => {
        const response = await apiClient.put<Playbook>(`/playbooks/${id}`, data);
        return response.data;
    },

    // Get playbook preview URL
    getPlaybookPreviewUrl: async (id: string): Promise<{ url: string }> => {
        const response = await apiClient.get<{ url: string }>(`/playbooks/${id}/preview`);
        return response.data;
    },

    // Stream playbook file blob (Proxy)
    getPlaybookFileBlob: async (id: string): Promise<Blob> => {
        const response = await apiClient.get(`/playbooks/${id}/stream`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Get playbook rules
    getPlaybookRules: async (id: string): Promise<PlaybookRule[]> => {
        const response = await apiClient.get<PlaybookRule[]>(`/playbooks/${id}/rules`);
        return response.data;
    },

    // Delete playbook
    deletePlaybook: async (id: string): Promise<void> => {
        await apiClient.delete(`/playbooks/${id}`);
    },
    async updatePlaybookRule(ruleId: string, data: Partial<PlaybookRule>): Promise<PlaybookRule> {
        const response = await apiClient.put<PlaybookRule>(`/playbooks/rules/${ruleId}`, data);
        return response.data;
    }
};

export default playbookService;
