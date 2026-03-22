export type RiskSeverity = 'high' | 'medium' | 'low';
export type ContractStatus = 'draft' | 'review' | 'update' | 'negotiation' | 'manager_review' | 'approval' | 'signing' | 'active' | 'expired' | 'terminated' | 'processing';
export type UserRole = 'admin' | 'legal' | 'business' | 'manager';

export interface BBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface Risk {
    id: string;
    description: string;
    severity: RiskSeverity;
    page: number;
    section_index?: number;
    section?: string;
    term?: string;
    quote: string;
    recommendation?: string;
    original_text?: string;  // Original contract text
    suggested_text?: string; // AI suggested replacement text
    auto_fixable?: boolean;  // Whether the risk can be auto-fixed or requires manual review
    risk_type?: string;      // "modification" (auto-fix) | "recommendation" (manual only)
    risk_source?: string;    // "playbook" | "template"
    confidence_score?: number; // 0-100: AI confidence in this risk
    bbox?: BBox;
}

export interface PDFLocation {
    page: number;
    bbox?: BBox;
    searchText?: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    avatar?: string;
}

export interface Partner {
    id: string;
    name: string;
    taxCode: string;
    representative: string;
    address?: string | null;
    email?: string | null;
}

export interface ContractType {
    id: string;
    code: string;
    name: string;
    description?: string;
    templateUrl?: string | null;  // MinIO path to template DOCX
}

export interface ContractVersion {
    id: string;
    version: string;
    fileUrl: string;
    uploadedBy: string;
    uploadedAt: Date;
    changes?: string;
    /** Origin: 'template' | 'upload' | 'ai_fix' | 'manual_edit' */
    versionType?: string;
}

export interface ContractShare {
    id: string;
    contractId: string;
    sharedType: 'user' | 'department';
    targetId: string;
    targetName?: string;
    permission: string;
    sharedBy: string;
    sharedAt: string | Date;
}

export interface SectionPair {
    contract_section_id: string;
    contract_title: string;
    contract_text_preview: string;
    template_text_preview: string;
    match_strategy: string;
}

export interface PlatformCommentReply {
    id: string;
    commentId: string;
    authorId: string;
    authorName: string;
    text: string;
    createdAt: string;
}

export interface PlatformComment {
    id: string;
    contractId: string;
    versionId: string | null;
    versionName?: string | null;
    authorId: string;
    authorName: string;
    quote: string | null;
    paragraphIndex: number | null;
    offsetStart: number | null;
    offsetEnd: number | null;
    text: string;
    resolved: boolean;
    createdAt: string;
    replies: PlatformCommentReply[];
}

export interface Contract {
    id: string;
    contractNumber: string;
    name: string;
    partnerId: string;
    partnerName: string;
    contractTypeId: string;
    contractTypeName: string;
    status: ContractStatus;
    value: number;
    effectiveDate: Date;
    expiryDate: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    currentVersion: string;
    fileUrl?: string;
    ownerId?: string;
    currentUserPermission?: string;
    isTemplateBased?: boolean;
    templateSimilarity?: number | null;
    sectionPairsJson?: SectionPair[] | null;  // Debug: contract↔template section pairs

    versions?: ContractVersion[];
    risks?: Risk[];
    shares?: ContractShare[];
}


export interface DashboardStats {
    totalContracts: number;
    inReview: number;
    pendingApproval: number;
    recentContracts: Contract[];
    contractsByStatus: {
        status: ContractStatus;
        count: number;
    }[];
}

export interface PlaybookDocument {
    id: string;
    name: string;
    description?: string;
    uploadedAt: Date;
    status: 'processing' | 'active' | 'error' | 'uploaded';
    ruleCount: number;
    contractTypeId?: string; // NEW
    type?: 'playbook' | 'severity_rule'; // Document type discriminator
}

export interface PlaybookRule {
    id: string;
    documentId: string; // Link to parent document
    category: string;
    name: string;
    description: string;
    standardClause: string;
    fallbackClause?: string;
    severity: RiskSeverity;
    clauseRef?: string;           // Clause reference (e.g., "Section 3.2")
    acceptableDeviation?: string; // Acceptable deviation from standard clause
    approvalLevel?: string;       // Required approval level (e.g., "Manager", "Director")
}

export interface Playbook {
    id: string;
    name: string;
    description?: string;
    fileUrl: string;
    uploadedAt: Date;
    status: string;
    ruleCount: number;
    contractTypeId?: string; // NEW
    rules: PlaybookRule[];
    type?: 'playbook' | 'severity_rule'; // Document type discriminator
}
