import { ContractStatus } from '../types/types';

export const getStatusColor = (status: ContractStatus): string => {
    const colors: Record<ContractStatus, string> = {
        draft: 'default',
        review: 'processing',
        processing: 'processing', // Added processing
        update: 'warning',
        negotiation: 'warning',
        manager_review: 'processing',
        approval: 'cyan',
        signing: 'purple',
        active: 'success',
        expired: 'default',
        terminated: 'error',
    };
    return colors[status];
};

// Specific colors for pie chart visualization
export const getStatusChartColor = (status: ContractStatus): string => {
    const chartColors: Record<ContractStatus, string> = {
        draft: '#d9d9d9',        // Gray
        review: '#1890ff',       // Blue
        processing: '#1890ff',   // Blue (Same as Review)
        update: '#faad14',       // Orange
        negotiation: '#fa8c16',  // Dark Orange
        manager_review: '#13c2c2', // Cyan
        approval: '#52c41a',     // Green
        signing: '#722ed1',      // Purple
        active: '#2f54eb',       // Active Blue (not in workflow chart)
        expired: '#8c8c8c',      // Dark Gray
        terminated: '#ff4d4f',   // Red
    };
    return chartColors[status];
};

export const getStatusText = (status: ContractStatus): string => {
    const texts: Record<ContractStatus, string> = {
        draft: 'Draft',
        review: 'Review',
        processing: 'Processing', // Added processing
        update: 'Update',
        negotiation: 'Negotiation',
        manager_review: 'Manager Review',
        approval: 'Approval',
        signing: 'Signing',
        active: 'Active',
        expired: 'Expired',
        terminated: 'Terminated',
    };
    return texts[status];
};

export const getSeverityColor = (severity: string): string => {
    switch (severity) {
        case 'high':
            return 'red';
        case 'medium':
            return 'orange';
        case 'low':
            return 'gold';
        default:
            return 'default';
    }
};

export const getSeverityText = (severity: string): string => {
    switch (severity) {
        case 'high':
            return 'High';
        case 'medium':
            return 'Medium';
        case 'low':
            return 'Low';
        default:
            return severity;
    }
};
