import apiClient from './api';
import { Contract, Partner, ContractType, DashboardStats, PlatformComment, PlatformCommentReply } from '../types/types';

export type { DashboardStats, PlatformComment, PlatformCommentReply };

export interface ContractCreate {
    name: string;
    partnerId: string;
    contractTypeId: string;
    playbookId?: string;  // NEW: Rule Type
    value: number;
    effectiveDate: Date;
    expiryDate: Date;
}

export interface Comment {
    id: string;
    author: string;
    date: string;
    text: string;
    quote?: string; // Text referenced by the comment
}

export interface AuditLog {
    id: string;
    userId: string;
    userName?: string;
    action: string;
    targetType: string;
    targetId: string;
    timestamp: string;
    details?: any;
}

const contractService = {

    // Get contract history
    async getHistory(id: string): Promise<AuditLog[]> {
        const response = await apiClient.get(`/contracts/${id}/history`);
        return response.data;
    },

    // Get all contracts
    async getContracts(status?: string): Promise<Contract[]> {
        const params = status ? { status } : {};
        const response = await apiClient.get('/contracts/', { params });
        return response.data;
    },

    // Get single contract by ID
    async getContract(id: string): Promise<Contract> {
        const response = await apiClient.get(`/contracts/${id}`);
        return response.data;
    },

    // Create new contract
    async createContract(data: ContractCreate): Promise<Contract> {
        const response = await apiClient.post('/contracts/', data);
        return response.data;
    },

    // Update contract
    async updateContract(id: string, data: ContractCreate): Promise<Contract> {
        const response = await apiClient.put(`/contracts/${id}`, data);
        return response.data;
    },

    // Delete contract
    async deleteContract(id: string): Promise<void> {
        await apiClient.delete(`/contracts/${id}`);
    },

    // Run AI analysis on contract
    async analyzeContract(id: string, useLawAnalysis: boolean = false, fullContextMode: boolean = false): Promise<Contract> {
        const response = await apiClient.post(`/contracts/${id}/analyze`, {
            full_context_mode: fullContextMode,
            use_law_analysis: useLawAnalysis,
        });
        return response.data;
    },


    // Get all partners
    async getPartners(): Promise<Partner[]> {
        const response = await apiClient.get('/contracts/partners/list');
        return response.data;
    },

    // Create partner
    async createPartner(data: Omit<Partner, 'id'>): Promise<Partner> {
        const response = await apiClient.post('/contracts/partners/', data);
        return response.data;
    },

    // Update partner
    async updatePartner(id: string, data: Omit<Partner, 'id'>): Promise<Partner> {
        const response = await apiClient.put(`/contracts/partners/${id}`, data);
        return response.data;
    },

    // Delete partner
    async deletePartner(id: string): Promise<void> {
        await apiClient.delete(`/contracts/partners/${id}`);
    },

    // Get all contract types
    async getContractTypes(): Promise<ContractType[]> {
        const response = await apiClient.get('/contracts/types/list');
        return response.data;
    },

    // Get all playbooks (Rule Types), optionally filtered by type
    async getPlaybooks(type?: 'playbook' | 'severity_rule'): Promise<any[]> {
        const params = type ? { type } : {};
        const response = await apiClient.get('/playbooks/', { params });
        return response.data;
    },

    // Extract metadata from file (Auto-detection)
    async extractMetadata(file: File): Promise<{
        success: boolean;
        suggested_partner_id: string | null;
        suggested_type_id: string | null;
        confidence: number;
        details: {
            detected_partner_name: string | null;
            detected_type_name: string | null;
        }
    }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/contracts/extract-metadata', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    // Create contract type
    async createContractType(data: Partial<ContractType>): Promise<ContractType> {
        const response = await apiClient.post('/contracts/types/', data);
        return response.data;
    },

    // Update contract type
    async updateContractType(id: string, data: Partial<ContractType>): Promise<ContractType> {
        const response = await apiClient.put(`/contracts/types/${id}`, data);
        return response.data;
    },

    // Delete contract type
    async deleteContractType(id: string): Promise<void> {
        await apiClient.delete(`/contracts/types/${id}`);
    },

    // Upload DOCX template for a contract type (Admin only)
    async uploadContractTypeTemplate(typeId: string, file: File): Promise<ContractType> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.put(`/contracts/types/${typeId}/template`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    // Get template file as Blob (for docx-preview)
    async getContractTypeTemplateBlob(typeId: string): Promise<Blob> {
        const response = await apiClient.get(`/contracts/types/${typeId}/template/stream`, {
            responseType: 'blob',
        });
        return response.data;
    },

    // Download template file for a contract type
    async downloadContractTypeTemplate(typeId: string, fileName?: string): Promise<void> {
        const response = await apiClient.get(`/contracts/types/${typeId}/template`, {
            responseType: 'blob',
        });

        // Create trigger for download
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName || `template_${typeId}.docx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    // Get dashboard statistics
    async getDashboardStats(): Promise<DashboardStats> {
        const response = await apiClient.get('/contracts/stats/dashboard');
        return response.data;
    },

    // Check if uploaded file is a new version
    async checkContractUpload(file: File): Promise<{ isNewVersion: boolean; contract: Contract | null; matchReason?: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/contracts/upload/check', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    // Upload file for existing contract
    async uploadContractFile(id: string, file: File): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post(`/contracts/${id}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    // Accept risk and fix document (Optimistic Locking)
    async acceptRisk(contractId: string, riskId: string, currentVersion: string): Promise<any> {
        return (await apiClient.post(`/contracts/${contractId}/risks/${riskId}/accept`, null, {
            params: { current_version: currentVersion }
        })).data;
    },

    // Batch accept risks (Optimistic Locking)
    async acceptRisksBatch(contractId: string, riskIds: string[], currentVersion: string): Promise<any> {
        return (await apiClient.post(`/contracts/${contractId}/risks/accept-batch`, riskIds, {
            params: { current_version: currentVersion }
        })).data;
    },

    // Update risk suggestion text (manual review)
    async updateRiskSuggestion(contractId: string, riskId: string, updatedText: string): Promise<any> {
        const response = await apiClient.put(`/contracts/${contractId}/risks/${riskId}/update-suggestion`, {
            updated_text: updatedText
        });
        return response.data;
    },

    // Download contract file
    async downloadContract(contractId: string, fileName: string): Promise<void> {
        const response = await apiClient.get(`/contracts/${contractId}/download`, {
            responseType: 'blob',
        });

        // Create trigger for download
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },
    async downloadContractVersion(versionId: string, fileName: string): Promise<void> {
        const response = await apiClient.get(`/contracts/versions/${versionId}/download`, {
            responseType: 'blob',
        });

        // Create trigger fordownload
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    // Compare two versions
    async compareVersions(contractId: string, versionId1: string, versionId2: string): Promise<any> {
        const response = await apiClient.post(`/contracts/${contractId}/compare`, null, {
            params: {
                version_id_1: versionId1,
                version_id_2: versionId2
            }
        });
        return response.data;
    },

    // Compare two versions (HTML-level diff, preserves formatting)
    async compareVersionsHtml(contractId: string, versionId1: string, versionId2: string): Promise<{ html: string }> {
        const response = await apiClient.post(`/contracts/${contractId}/compare-html`, null, {
            params: {
                version_id_1: versionId1,
                version_id_2: versionId2
            }
        });
        return response.data;
    },

    // Get version preview or full text
    async getVersionPreview(id: string, versionId: string, full: boolean = false): Promise<any> {
        const response = await apiClient.get(`/contracts/${id}/versions/${versionId}/preview`, {
            params: { max_chars: full ? -1 : 500 }
        });
        return response.data;
    },

    // Create manual version
    async createManualVersion(id: string, content: string, changes: string, resolvedRiskIds: string[] = []): Promise<any> {
        const response = await apiClient.post(`/contracts/${id}/versions/manual`, {
            content,
            changes,
            resolved_risk_ids: resolvedRiskIds
        });
        return response.data;
    },

    // ✅ NEW: Fetch server-side rendered HTML
    async getVersionHtmlPreview(contactId: string, versionId: string): Promise<{ html: string, cached: boolean }> {
        const response = await apiClient.get(`/contracts/${contactId}/versions/${versionId}/html`);
        return response.data;
    },

    // Get version file for DOCX preview
    async getVersionFile(id: string, versionId: string): Promise<Blob> {
        const response = await apiClient.get(`/contracts/${id}/versions/${versionId}/file`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Get version comments from DOCX
    async getVersionComments(contractId: string, versionId: string): Promise<{ comments: Comment[], count: number }> {
        const response = await apiClient.get(`/contracts/${contractId}/versions/${versionId}/comments`);
        return response.data;
    },

    // Check PDF conversion status (async upload polling)
    async checkConversionStatus(contractId: string): Promise<{ status: string, fileUrl: string, message: string }> {
        const response = await apiClient.get(`/contracts/${contractId}/conversion-status`);
        return response.data;
    },

    // Share Contract
    async shareContract(id: string, sharedType: 'user' | 'department', targetId: string, permission: string = 'view'): Promise<any> {
        const response = await apiClient.post(`/contracts/${id}/shares`, {
            sharedType,
            targetId,
            permission
        });
        return response.data;
    },

    // Revoke Share
    async revokeShare(contractId: string, shareId: string): Promise<void> {
        await apiClient.delete(`/contracts/${contractId}/shares/${shareId}`);
    },

    // Get Shares
    async getShares(contractId: string): Promise<any[]> {
        const response = await apiClient.get(`/contracts/${contractId}/shares`);
        return response.data;
    },

    // ── Platform Comments ─────────────────────────────────────────────────────

    async getPlatformComments(contractId: string, versionId?: string): Promise<PlatformComment[]> {
        const params = versionId ? { version_id: versionId } : {};
        const response = await apiClient.get(`/contracts/${contractId}/platform-comments`, { params });
        return response.data;
    },

    async createPlatformComment(contractId: string, payload: { versionId?: string; quote?: string; paragraphIndex?: number; offsetStart?: number; offsetEnd?: number; text: string }): Promise<PlatformComment> {
        const response = await apiClient.post(`/contracts/${contractId}/platform-comments`, payload);
        return response.data;
    },

    async createCommentReply(contractId: string, commentId: string, text: string): Promise<PlatformCommentReply> {
        const response = await apiClient.post(`/contracts/${contractId}/platform-comments/${commentId}/replies`, { text });
        return response.data;
    },

    async resolvePlatformComment(contractId: string, commentId: string): Promise<PlatformComment> {
        const response = await apiClient.patch(`/contracts/${contractId}/platform-comments/${commentId}/resolve`);
        return response.data;
    },

    async deletePlatformComment(contractId: string, commentId: string): Promise<void> {
        await apiClient.delete(`/contracts/${contractId}/platform-comments/${commentId}`);
    },
};

export default contractService;
