import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './ContractDetailPage.css';
import {
    Button, Card, Typography, Tag, message,
    Space, Spin, Table, Checkbox, Tooltip,
    Drawer, Timeline, Modal, Alert, Tabs
} from 'antd';
import HistoryTab from '../../components/contracts/HistoryTab';
import {
    ArrowLeftOutlined,
    CloudDownloadOutlined,
    HistoryOutlined,
    RightOutlined,
    DownOutlined,
    LoadingOutlined,
    EyeOutlined,
    EditOutlined,
    RobotOutlined
} from '@ant-design/icons';
import { Contract, Risk, RiskSeverity } from '../../types/types';
import { getStatusColor, getStatusText } from '../../utils/statusHelpers';
import DocxViewerModal from '../../components/DocxViewerModal';
import contractService from '../../services/contractService';
import { useAnalysisSettings } from '../../contexts/AnalysisSettingsContext';
import { extractErrorMessage } from '../../services/api';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useSSE } from '../../hooks/useSSE';
import TinyMCEEditor from '../../components/TinyMCEEditor';
import { useAuth } from '../../contexts/AuthContext';


const { Title } = Typography;

const riskLevelColors: Record<RiskSeverity, string> = {
    high: '#f5222d',
    medium: '#faad14',
    low: '#52c41a'
};

// Helper component for expandable text (Moved outside to prevent re-mounting)
/**
 * Render Markdown table rows (`| col | col |`) as an HTML <table>.
 * Returns null if the text does not contain table data.
 * 
 * Handles two cases:
 * 1. Proper Markdown with newlines between rows (from document_pipeline)
 * 2. Flat text where LLM removed newlines (e.g. "| A | B | | C | D |")
 */
const renderMarkdownTable = (text: string): React.ReactNode | null => {
    // Quick check: must contain pipe characters
    if (!text.includes('|')) return null;

    // Count pipe chars — need a threshold to avoid false positives on text with casual "|"
    const pipeCount = (text.match(/\|/g) || []).length;
    if (pipeCount < 4) return null;

    // Strip [TABLE DATA] / [/TABLE DATA] wrapper tags
    let cleaned = text
        .replace(/\[TABLE DATA[^\]]*\]/gi, '')
        .replace(/\[\/TABLE DATA\]/gi, '')
        .trim();

    // --- Attempt 1: Standard newline-based parsing ---
    let lines = cleaned.split('\n').filter(l => l.trim());
    let tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));

    // --- Attempt 2: If few table lines found, try to reconstruct newlines ---
    // LLM may return "| A | B | | C | D |" as one line
    // Strategy: insert newline before each "|" that appears after another "|" with
    // possible whitespace, indicating the start of a new row
    if (tableLines.length < 2 && pipeCount >= 6) {
        // Reconstruct: split on pattern where a row ends "|" and new row starts "|"
        // Pattern: "| ... |" followed by whitespace/nothing then "| ... |"
        const reconstructed = cleaned.replace(/\|\s*\|/g, '|\n|');
        lines = reconstructed.split('\n').filter(l => l.trim());
        tableLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
    }

    const nonTableLines = lines.filter(l => !(l.trim().startsWith('|') && l.trim().endsWith('|')));

    // Need at least a header + 1 data row to be a table
    if (tableLines.length < 2) {
        // Final fallback: if text has [TABLE DATA] or many pipes, at least clean up display
        if (pipeCount >= 6) {
            const displayText = cleaned.replace(/\s*\|\s*/g, ' · ').replace(/·\s*·/g, '·').trim();
            return <div style={{ whiteSpace: 'pre-wrap' }}>{displayText}</div>;
        }
        return null;
    }

    // Parse rows, skip separator rows (| --- | --- |)
    const isSeparator = (line: string) => /^\|[\s\-|]+\|$/.test(line.trim());
    const dataRows = tableLines.filter(l => !isSeparator(l));
    if (dataRows.length < 1) return null;

    const parseRow = (line: string) =>
        line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

    const headerCells = parseRow(dataRows[0]);
    const bodyRows = dataRows.slice(1).map(parseRow);

    return (
        <div>
            {nonTableLines.length > 0 && (
                <div style={{ marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                    {nonTableLines.join('\n')}
                </div>
            )}
            <table style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '12px',
                lineHeight: '1.4',
            }}>
                <thead>
                    <tr>
                        {headerCells.map((cell, i) => (
                            <th key={i} style={{
                                border: '1px solid #d9d9d9',
                                padding: '4px 6px',
                                background: '#fafafa',
                                fontWeight: 600,
                                textAlign: 'left',
                            }}>{cell}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {bodyRows.map((row, ri) => (
                        <tr key={ri}>
                            {row.map((cell, ci) => (
                                <td key={ci} style={{
                                    border: '1px solid #d9d9d9',
                                    padding: '4px 6px',
                                }}>{cell}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const ExpandableText = ({ text, color, italic }: { text: string, color?: string, italic?: boolean }) => {
    const [expanded, setExpanded] = useState(false);

    // Check if text contains markdown table data
    const tableContent = text ? renderMarkdownTable(text) : null;

    return (
        <div
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Click to collapse" : "Click to expand"}
            className={`expandable-text-wrap${italic ? ' expandable-text-wrap--italic' : ''}`}
            {...(color ? { style: { '--expandable-color': color } as React.CSSProperties } : {})}
        >
            <div className={`expandable-text-inner ${expanded ? 'expandable-text-inner--expanded' : 'expandable-text-inner--collapsed'}`}>
                {tableContent || text || '-'}
            </div>
        </div>
    );
};


const ContractDetailPageContent: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { fullContextMode, setFullContextMode } = useAnalysisSettings();
    const { user: currentUser } = useAuth();
    const [contract, setContract] = useState<Contract | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [historyVisible, setHistoryVisible] = useState(false);

    // Version Comparison State
    const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
    const [diffModalVisible, setDiffModalVisible] = useState(false);
    const [diffData, setDiffData] = useState<any>(null);
    const [comparing, setComparing] = useState(false);

    // Version Preview State
    const [expandedVersions, setExpandedVersions] = useState<string[]>([]);
    const [versionPreviews, setVersionPreviews] = useState<Map<string, any>>(new Map());
    const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());

    // DOCX Viewer Modal State
    const [docxModalVisible, setDocxModalVisible] = useState(false);
    const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
    const [previewVersionName, setPreviewVersionName] = useState<string>('');
    const [negotiationMode, setNegotiationMode] = useState(false);

    // Edit Suggestion State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
    const [editedText, setEditedText] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    // Risk Source Filter: 'all' | 'playbook' | 'law'
    const [riskSourceFilter, setRiskSourceFilter] = useState<'all' | 'playbook' | 'law'>('all');

    // Law Analysis Modal state specifically for manual trigger
    const [lawAnalysisVisible, setLawAnalysisVisible] = useState(false);
    const [useLawAnalysis, setUseLawAnalysis] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Debug section pairs modal
    const [sectionPairsVisible, setSectionPairsVisible] = useState(false);

    const handleSelectRow = (riskId: string, checked: boolean) => {
        if (checked) {
            setSelectedRowKeys(prev => [...prev, riskId]);
        } else {
            setSelectedRowKeys(prev => prev.filter(key => key !== riskId));
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked && contract?.risks) {
            const allKeys = contract.risks
                .filter(r => !r.description.includes('[RESOLVED]') && r.auto_fixable !== false) // ✅ Exclude manual review items
                .map(r => r.id);
            setSelectedRowKeys(allKeys);
        } else {
            setSelectedRowKeys([]);
        }
    };

    const handleConflict = () => {
        Modal.warning({
            title: 'Data Conflict Detected',
            content: (
                <div>
                    <p>The contract has been modified by another user (or a newer version exists).</p>
                    <p>The page will now refresh to load the latest data.</p>
                </div>
            ),
            onOk: async () => {
                window.location.reload();
            }
        });
    };

    const handleBatchAccept = async () => {
        if (selectedRowKeys.length === 0 || !contract) return;

        try {
            message.loading({ content: `Applying ${selectedRowKeys.length} fixes...`, key: 'batch' });
            // Send currentVersion for Optimistic Locking
            const response = await contractService.acceptRisksBatch(id!, selectedRowKeys as string[], contract.currentVersion);

            // Show detailed feedback based on response
            const { processed, skipped_recommendations, skipped_missing, failed_count } = response;
            const skipped = (skipped_recommendations || 0) + (skipped_missing || 0);
            const failed = failed_count || 0;

            if (failed > 0 || skipped > 0) {
                const parts: string[] = [`Applied ${processed} fix(es).`];
                if (failed > 0) parts.push(`${failed} replacement(s) failed to match.`);
                if (skipped > 0) parts.push(`${skipped} item(s) require manual review.`);
                message[failed > 0 ? 'warning' : 'success']({
                    content: parts.join(' '),
                    key: 'batch',
                    duration: 6
                });
            } else {
                message.success({ content: `All ${processed} fixes applied successfully!`, key: 'batch' });
            }

            setSelectedRowKeys([]); // Clear selection

            // Refresh contract
            await fetchContract({ silent: true });
        } catch (error: any) {
            console.error("Batch Accept Error:", error);
            if (error.response) {
                console.error("Error Status:", error.response.status);
                console.error("Error Data:", error.response.data);
            }

            // Check for 409 Conflict
            if (error.response && error.response.status === 409) {
                handleConflict();
            } else if (error.response && error.response.status === 400) {
                // Handle "only recommendations selected" case
                message.warning({ content: extractErrorMessage(error, 'Selected items require manual review'), key: 'batch' });
            } else if (error.response && error.response.status === 403) {
                // Handle Permission Error
                message.error({ content: 'Permission Denied: You have "View Only" access.', key: 'batch' });
            } else {
                message.error({ content: extractErrorMessage(error, 'Failed to apply batch fixes'), key: 'batch' });
            }
        }
    };

    const handleDownload = async () => {
        if (!contract) return;
        try {
            message.loading({ content: 'Downloading file...', key: 'download' });
            const fileName = `${contract.contractNumber}_${contract.currentVersion}.docx`;
            await contractService.downloadContract(contract.id, fileName);
            message.success({ content: 'Download started', key: 'download' });
        } catch (error: any) {
            console.error("Download Error:", error);
            if (error.response && error.response.status === 403) {
                message.error('Permission Denied: You do not have permission to download this contract.');
            } else {
                message.error({ content: extractErrorMessage(error, 'Download failed'), key: 'download' });
            }
        }
    };

    const handleReanalyze = async () => {
        if (!contract) return;
        try {
            message.loading({ content: '🔄 Re-analyzing contract...', key: 'reanalyze', duration: 0 });
            await contractService.analyzeContract(contract.id);
            // Refresh contract data to get updated sectionPairsJson
            const updated = await contractService.getContract(contract.id);
            setContract(updated);
            message.success({ content: '✅ Re-analysis complete!', key: 'reanalyze', duration: 3 });
        } catch (error: any) {
            console.error("Re-analyze Error:", error);
            if (error.response?.status === 403) {
                message.error({ content: 'Permission Denied', key: 'reanalyze' });
            } else {
                message.error({ content: extractErrorMessage(error, 'Re-analysis failed'), key: 'reanalyze' });
            }
        }
    };

    // Handler for expand/collapse version preview
    const handleToggleVersionPreview = async (versionId: string) => {
        if (expandedVersions.includes(versionId)) {
            // Collapse
            setExpandedVersions(prev => prev.filter(id => id !== versionId));
        } else {
            // Expand - fetch preview if not cached
            if (!versionPreviews.has(versionId)) {
                try {
                    setLoadingPreviews(prev => new Set(prev).add(versionId));
                    const preview = await contractService.getVersionPreview(id!, versionId);
                    setVersionPreviews(new Map(versionPreviews).set(versionId, preview));
                } catch (error) {
                    message.error('Failed to load preview');
                    return;
                } finally {
                    setLoadingPreviews(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(versionId);
                        return newSet;
                    });
                }
            }
            setExpandedVersions(prev => [...prev, versionId]);
        }
    };

    const handleEditClick = (risk: Risk) => {
        setEditingRisk(risk);

        const suggested = risk.suggested_text || '';

        // Escape HTML entities to prevent XSS before constructing highlight markup
        const escaped = suggested
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const html = escaped.replace(/\[(.*?)\]/g, (match) => {
            return `<span style="background-color: #fffb8f; border-bottom: 2px solid #faad14;">${match}</span>`;
        });

        setEditedText(html);
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (!editingRisk || !id) return;

        try {
            setSavingEdit(true);

            // Strip HTML tags to save as plain text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = editedText;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';

            await contractService.updateRiskSuggestion(id, editingRisk.id, plainText);
            message.success('Suggestion updated successfully');
            setEditModalVisible(false);

            // Refresh contract to show updated status
            await fetchContract({ silent: true });
        } catch (error: any) {
            if (error.response && error.response.status === 403) {
                message.error('Permission Denied: You have "View Only" access.');
            } else {
                message.error('Failed to update suggestion');
            }
        } finally {
            setSavingEdit(false);
        }
    };

    const handleAnalyze = async () => {
        if (!id) return;
        try {
            setIsAnalyzing(true);
            await contractService.analyzeContract(id, useLawAnalysis, fullContextMode);
            message.info(useLawAnalysis
                ? 'Analysis started (Playbook + Vietnamese Law) in background...'
                : 'Analysis started in background...');
            setDiffModalVisible(false);
            setHistoryVisible(false);
            setLawAnalysisVisible(false);
            fetchContract({ silent: true });
        } catch (error) {
            console.error('Analysis Error:', error);
            message.error('Analysis request failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const fetchContract = useCallback(async (options?: { silent?: boolean }) => {
        if (!id) {
            navigate('/contracts');
            return;
        }

        try {
            if (!options?.silent) setLoading(true);
            const data = await contractService.getContract(id);

            // Stable sort: Page -> ID (to keep table rows from jumping on update)
            if (data.risks) {
                data.risks.sort((a, b) => {
                    const pageDiff = a.page - b.page;
                    if (pageDiff !== 0) return pageDiff;
                    return a.id.localeCompare(b.id);
                });
            }

            setContract(data);
        } catch (error) {
            console.error('Failed to fetch contract:', error);
        } finally {
            if (!options?.silent) setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        fetchContract();
    }, [fetchContract]);

    useSSE(
        useCallback((data) => {
            if (!id || data.contract_id !== id) return;

            const eventType = data.event;

            if (eventType === 'analysis_completed') {
                message.success('AI analysis completed');
                fetchContract({ silent: true });
            } else if (eventType === 'analysis_failed') {
                message.error(`Analysis failed: ${data.error || 'Unknown error'}`);
                fetchContract({ silent: true });
            } else if (eventType === 'conversion_completed') {
                message.success('File conversion completed');
                fetchContract({ silent: true });
            } else if (eventType === 'conversion_failed') {
                message.error(`File conversion failed: ${data.error || 'Unknown error'}`);
                fetchContract({ silent: true });
            }
        }, [fetchContract, id]),
        [id]
    );

    if (loading) {
        return (
            <div className="page-loading-center">
                <Spin size="large" tip="Loading contract details..." />
            </div>
        );
    }

    if (!contract) {
        return (
            <div className="page-not-found">
                <Title level={4} type="danger">Contract not found</Title>
                <p>Unable to load contract details for ID: {id}</p>
                <Button onClick={() => navigate('/contracts')}>Back to List</Button>
            </div>
        );
    }

    const riskColumns = [
        {
            title: 'No.',
            key: 'index',
            width: 50,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => <span className="table-no-cell">{index + 1}</span>,
        },
        {
            title: 'Section',
            dataIndex: 'section',
            key: 'section',
            width: 180,
            render: (text: string) => {
                const cleanText = text ? text.replace(/^AUTO-\d+\s*-\s*/, '') : '';
                return <div><ExpandableText text={cleanText} color="#262626" /></div>;
            },
        },
        {
            title: 'Risk Level',
            dataIndex: 'severity',
            key: 'severity',
            width: 120,
            align: 'center' as const,
            render: (level: RiskSeverity = 'medium') => (
                <Tag color={riskLevelColors[level] || '#d9d9d9'} className="table-risk-tag">
                    {level.toUpperCase()}
                </Tag>
            ),
        },
        
        {
            title: 'Type',
            dataIndex: 'risk_type',
            key: 'risk_type',
            width: 130,
            align: 'center' as const,
            render: (type: string = 'modification') => {
                const isRecommendation = type === 'recommendation';
                return (
                    <Tag
                        color={isRecommendation ? 'orange' : 'blue'}
                        className="table-type-tag"
                    >
                        {isRecommendation ? '📋 RECOMMEND' : '🔧 AUTO-FIX'}
                    </Tag>
                );
            },
        },
        {
            title: 'Risk',
            dataIndex: 'description',
            key: 'description',
            width: 250,
            render: (text: string) => (
                <div><ExpandableText text={text} color="#262626" /></div>
            ),
        },
        {
            title: 'Original Text',
            dataIndex: 'original_text',
            key: 'original_text',
            width: 250,
            render: (text: string, record: Risk) => {
                if (!text && record.risk_type === 'recommendation') {
                    return <Typography.Text type="secondary" italic>(Missing Clause)</Typography.Text>;
                }
                return <div><ExpandableText text={text} color="#666" /></div>;
            },
        },
        {
            title: 'Recommendation',
            dataIndex: 'recommendation',
            key: 'recommendation',
            width: 250,
            render: (text: string) => (
                <div><ExpandableText text={text} color="#262626" /></div>
            ),
        },
        {
            title: 'Suggested Text',
            dataIndex: 'suggested_text',
            key: 'suggested_text',
            width: 300,
            render: (text: string, record: Risk) => (
                <div className="table-suggested-cell">
                    <div style={{ flex: 1 }}>
                        <ExpandableText text={text} color="#52c41a" italic />
                        {record.auto_fixable === false && (
                            <div className="table-manual-review-hint">
                                ⚠️ Manual review required
                            </div>
                        )}
                    </div>
                    {!record.description.includes('[RESOLVED]') && (
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => handleEditClick(record)}
                            title="Edit Suggestion"
                        />
                    )}
                </div>
            ),
        },
        {
            title: (
                <Checkbox
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={
                        contract?.risks && contract.risks.length > 0 &&
                        contract.risks.filter(r => !r.description.includes('[RESOLVED]')).every(r => selectedRowKeys.includes(r.id)) &&
                        selectedRowKeys.length > 0
                    }
                    indeterminate={
                        selectedRowKeys.length > 0 &&
                        contract?.risks &&
                        selectedRowKeys.length < contract.risks.filter(r => !r.description.includes('[RESOLVED]')).length
                    }
                >
                    Select
                </Checkbox>
            ),
            key: 'select',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: Risk) => {
                const isResolved = record.description.includes('[RESOLVED]');
                return (
                    <div className="table-select-cell">
                        {isResolved ? (
                            <Tag color="success">Fixed</Tag>
                        ) : (
                            <Checkbox
                                checked={selectedRowKeys.includes(record.id)}
                                disabled={record.auto_fixable === false} // 🔒 Prevent selection if manual review needed
                                onChange={(e) => handleSelectRow(record.id, e.target.checked)}
                            />
                        )}
                    </div>
                );
            }
        }
    ];

    const formatDate = (date: Date | string) => {
        if (!date) return '-';
        const dateStr = typeof date === 'string' && !date.endsWith('Z') ? `${date}Z` : date;
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="contract-detail-page">
            {/* Header Actions */}
            <div className="contract-detail-header">
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contracts')}>
                        Back
                    </Button>
                    <Title level={3} className="contract-title">{contract.name}</Title>
                    <Tag color={getStatusColor(contract.status)}>
                        {getStatusText(contract.status)}
                    </Tag>
                    <Tag color="cyan">Ver: {contract.currentVersion}</Tag>
                    {/* Template-based badge */}
                    {contract.isTemplateBased && (
                        <Tag
                            color="green"
                            title={`TF-IDF similarity: ${((contract.templateSimilarity ?? 0) * 100).toFixed(1)}%`}
                            style={{ cursor: 'help' }}
                        >
                            📋 Template
                        </Tag>
                    )}
                </Space>
                <Space>
                    <Button icon={<HistoryOutlined />} onClick={() => {
                        setHistoryVisible(true);
                        setSelectedVersions([]);
                    }}>
                        Versioning
                    </Button>
                    <Tooltip title={(!contract.versions || contract.versions.length < 2) ? 'Cần ít nhất 2 phiên bản để so sánh (áp dụng AI Fix để tạo phiên bản mới)' : ''}>
                        <Button
                            type="primary"
                            ghost
                            disabled={!contract.versions || contract.versions.length < 2}
                            onClick={() => {
                                const sorted = [...contract.versions!].sort((a, b) => a.version.localeCompare(b.version));
                                const latest = sorted[sorted.length - 1];
                                setPreviewVersionId(latest.id);
                                setPreviewVersionName(`${contract.contractNumber}_${latest.version}`);
                                setNegotiationMode(true);
                                setDocxModalVisible(true);
                            }}
                        >
                            📋 Negotiation
                        </Button>
                    </Tooltip>
                    {/* Debug: Section pairs – available for all analyzed contracts */}
                    <Button
                        id="debug-section-pairs-btn"
                        onClick={() => setSectionPairsVisible(true)}
                    >
                        🔍 Debug Pairs
                    </Button>
                    <Button icon={<CloudDownloadOutlined />} onClick={handleDownload} type="primary">
                        Download DOCX
                    </Button>
                </Space>
            </div>

            {/* Version History Drawer */}
            <Drawer
                title={
                    <div className="drawer-version-header">
                        <span>Versioning History</span>
                        {selectedVersions.length === 2 && (
                            <Button
                                type="primary"
                                size="small"
                                onClick={async () => {
                                    try {
                                        setComparing(true);
                                        const data = await contractService.compareVersions(contract.id, selectedVersions[1], selectedVersions[0]);
                                        setDiffData(data);
                                        setDiffModalVisible(true);
                                    } catch (e) {
                                        message.error("Failed to compare versions");
                                    } finally {
                                        setComparing(false);
                                    }
                                }}
                                loading={comparing}
                            >
                                Compare (2)
                            </Button>
                        )}
                    </div>
                }
                placement="right"
                onClose={() => setHistoryVisible(false)}
                open={historyVisible}
                width={500}
            >
                <Alert message="Select exactly 2 versions to compare" type="info" showIcon style={{ marginBottom: 16 }} />

                <Timeline
                    items={contract.versions?.map(ver => ({
                        key: ver.id,
                        color: ver.version === contract.currentVersion ? "green" : "blue",
                        children: (
                            <div className="version-item-row">
                                <div className="version-item-content">
                                    <div
                                        onClick={() => handleToggleVersionPreview(ver.id)}
                                        className="version-item-title-row"
                                    >
                                        {loadingPreviews.has(ver.id) ? (
                                            <LoadingOutlined style={{ fontSize: 12 }} />
                                        ) : expandedVersions.includes(ver.id) ? (
                                            <DownOutlined style={{ fontSize: 12 }} />
                                        ) : (
                                            <RightOutlined style={{ fontSize: 12 }} />
                                        )}
                                        <p className="version-item-version-label">
                                            {ver.version} {ver.version === contract.currentVersion && "(Current)"}
                                        </p>
                                        {/* Version origin tag */}
                                        {ver.versionType === 'template' && (
                                            <Tag color="gold" style={{ fontSize: 10, lineHeight: '16px' }}>Template</Tag>
                                        )}
                                        {ver.versionType === 'upload' && (
                                            <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px' }}>Upload</Tag>
                                        )}
                                        {ver.versionType === 'ai_fix' && (
                                            <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px' }}>AI Fix</Tag>
                                        )}
                                        {ver.versionType === 'manual_edit' && (
                                            <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px' }}>Manual</Tag>
                                        )}
                                    </div>
                                    <p className="version-item-date">
                                        {formatDate(ver.uploadedAt)}
                                    </p>
                                    <p className="version-item-changes">{ver.changes || 'No details'}</p>

                                    {/* Expandable preview panel */}
                                    {expandedVersions.includes(ver.id) && versionPreviews.has(ver.id) && (
                                        <div className="version-preview-box">
                                            <div className="version-preview-meta">
                                                📄 Preview ({versionPreviews.get(ver.id)?.maxChars} chars)
                                                {versionPreviews.get(ver.id)?.truncated && (
                                                    <span> · Full: {versionPreviews.get(ver.id)?.fullLength} chars</span>
                                                )}
                                            </div>
                                            {versionPreviews.get(ver.id)?.preview}
                                        </div>
                                    )}

                                    {/* Actions: Preview & Download (Restored) */}
                                    <div className="version-actions">
                                        <Space size="small">
                                            <Button
                                                type="link"
                                                size="small"
                                                icon={<EyeOutlined />}
                                                onClick={() => {
                                                    setPreviewVersionId(ver.id);
                                                    setPreviewVersionName(`${contract.contractNumber}_${ver.version}`);
                                                    setDocxModalVisible(true);
                                                }}
                                            >
                                                Preview
                                            </Button>
                                            <Button
                                                type="link"
                                                size="small"
                                                icon={<CloudDownloadOutlined />}
                                                onClick={async () => {
                                                    try {
                                                        message.loading({ content: 'Downloading version...', key: 'dl_ver' });
                                                        const fileName = `${contract.contractNumber}_${ver.version}.docx`;
                                                        await contractService.downloadContractVersion(ver.id, fileName);
                                                        message.success({ content: 'Download started', key: 'dl_ver' });
                                                    } catch (e) {
                                                        message.error({ content: 'Download failed', key: 'dl_ver' });
                                                    }
                                                }}
                                                className="version-download-btn"
                                            >
                                                Download
                                            </Button>
                                        </Space>
                                    </div>
                                </div>
                                <Checkbox
                                    checked={selectedVersions.includes(ver.id)}
                                    disabled={selectedVersions.length >= 2 && !selectedVersions.includes(ver.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            if (selectedVersions.length < 2) {
                                                setSelectedVersions([...selectedVersions, ver.id]);
                                            }
                                        } else {
                                            setSelectedVersions(selectedVersions.filter(id => id !== ver.id));
                                        }
                                    }}
                                />
                            </div>
                        )
                    })) || []}
                />
            </Drawer>

            <Modal
                title="Version Comparison Result"
                open={diffModalVisible}
                onCancel={() => setDiffModalVisible(false)}
                footer={[
                    <Button
                        key="analyze"
                        type="primary"
                        icon={<RobotOutlined />}
                        loading={isAnalyzing}
                        onClick={() => setLawAnalysisVisible(true)}
                        disabled={contract.status === 'processing'}
                    >
                        Analyze
                    </Button>,
                    <Button key="close" onClick={() => setDiffModalVisible(false)}>Close</Button>
                ]}
                width={900}
                styles={{ body: { height: '70vh', overflowY: 'auto' } }}
            >
                {diffData && (
                    <div className="diff-container">
                        {/* Legend */}
                        <div className="diff-legend">
                            <span><span className="diff-legend-removed-word">Từ bị xóa/thay đổi</span></span>
                            <span><span className="diff-legend-added-word">Từ được thêm/sửa</span></span>
                        </div>
                        <div className="diff-document">
                            {diffData.diff.map((chunk: any, idx: number) => {
                                // ── Replaced chunks: show Before + After paragraphs ──────────
                                if (chunk.parts && chunk.type === 'replaced') {
                                    const beforeParts = chunk.parts.filter((p: any) => p.type !== 'added_part');
                                    const afterParts = chunk.parts.filter((p: any) => p.type !== 'removed_part');
                                    return (
                                        <div key={idx} className="diff-block" style={{ margin: '6px 0', borderLeft: '3px solid #e8e8e8', paddingLeft: 10 }}>
                                            <div style={{ marginBottom: 4, padding: '4px 8px', background: '#fff1f0', borderRadius: 4, borderLeft: '3px solid #cf1322' }}>
                                                {beforeParts.map((part: any, pIdx: number) => (
                                                    <span key={pIdx} className={part.type === 'removed_part' ? 'diff-part--removed-changed' : ''}>
                                                        {part.content}
                                                    </span>
                                                ))}
                                            </div>
                                            <div style={{ padding: '4px 8px', background: '#f6ffed', borderRadius: 4, borderLeft: '3px solid #389e0d' }}>
                                                {afterParts.map((part: any, pIdx: number) => (
                                                    <span key={pIdx} className={part.type === 'added_part' ? 'diff-part--added-changed' : ''}>
                                                        {part.content}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // ── Pure removed chunks ──────────
                                if (chunk.type === 'removed') {
                                    return (
                                        <div key={idx} className="diff-block" style={{ margin: '4px 0', padding: '4px 8px', background: '#fff1f0', borderRadius: 4, borderLeft: '3px solid #cf1322' }}>
                                            <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 600, marginRight: 6 }}>XÓA</span>
                                            <span className="diff-chunk--removed">{chunk.content}</span>
                                        </div>
                                    );
                                }

                                // ── Pure added chunks ──────────
                                if (chunk.type === 'added') {
                                    return (
                                        <div key={idx} className="diff-block" style={{ margin: '4px 0', padding: '4px 8px', background: '#f6ffed', borderRadius: 4, borderLeft: '3px solid #389e0d' }}>
                                            <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 600, marginRight: 6 }}>THÊM</span>
                                            <span className="diff-chunk--added">{chunk.content}</span>
                                        </div>
                                    );
                                }

                                // ── Strikethrough ──
                                if (chunk.type === 'strikethrough') {
                                    return (
                                        <div key={idx} className="diff-block">
                                            <span className="diff-chunk--strikethrough">{chunk.content}</span>
                                        </div>
                                    );
                                }

                                // ── Unchanged ──
                                return (
                                    <div key={idx} className="diff-block">
                                        <span>{chunk.content}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Modal>

            <DocxViewerModal
                visible={docxModalVisible}
                versionId={previewVersionId}
                contractId={contract.id}
                versionName={previewVersionName}
                versions={contract.versions?.map(v => ({ id: v.id, version: v.version })) || []}
                currentUserId={currentUser?.id || ''}
                currentUserRole={currentUser?.role || 'user'}
                initialTrackChanges={negotiationMode}
                onClose={() => {
                    setDocxModalVisible(false);
                    setNegotiationMode(false);
                }}
            />

            <Modal
                title="Edit Suggested Text"
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={handleSaveEdit}
                confirmLoading={savingEdit}
                width={800}
                destroyOnClose={true}
            >
                <div className="edit-modal-original-label">
                    <Typography.Text type="secondary" className="edit-modal-original-label">Original Text:</Typography.Text>
                    <div className="edit-modal-original-box">
                        {editingRisk?.original_text}
                    </div>

                    <Typography.Text strong className="edit-modal-suggested-label">Suggested Text (Editable):</Typography.Text>
                    <div className="edit-modal-editor-wrap">
                        <TinyMCEEditor
                            value={editedText}
                            onChange={(content) => setEditedText(content)}
                            height={300}
                            minimal={true}
                        />
                    </div>
                </div>
            </Modal>

            {/* Law Analysis Confirm Modal */}
            <Modal
                title="🤖 Run AI Analysis"
                open={lawAnalysisVisible}
                onOk={handleAnalyze}
                onCancel={() => setLawAnalysisVisible(false)}
                okText="Start Analysis"
                cancelText="Cancel"
                confirmLoading={isAnalyzing}
            >
                <p>The contract will be analyzed using the <strong>Playbook rules</strong>.</p>
                <Checkbox
                    checked={useLawAnalysis}
                    onChange={e => setUseLawAnalysis(e.target.checked)}
                    className="law-checkbox"
                >
                    <span>
                        ⚖️ <strong>Also analyze with Vietnamese Law</strong>
                        <br />
                        <small className="law-checkbox-hint">
                            Checks the contract against Vietnamese legal regulations (requires the Law DB to be loaded).
                        </small>
                    </span>
                </Checkbox>
                <br />
                <Checkbox
                    checked={fullContextMode}
                    onChange={e => setFullContextMode(e.target.checked)}
                    style={{ marginTop: 16 }}
                >
                    <span>
                        📄 <strong>Full Context Mode</strong>
                        <br />
                        <small style={{ color: '#888' }}>
                            Analyze the entire contract at once without chunking. Recommended for complex document structures.
                        </small>
                    </span>
                </Checkbox>
            </Modal>

            <Tabs
                defaultActiveKey="1"
                className="contract-tabs"
                items={[
                    {
                        key: '1',
                        label: 'Analysis & Overview',
                        children: (
                            <>
                                {/* Contract Information */}
                                <Card title="Contract Information" className="contract-info-card">
                                    <Table
                                        dataSource={[
                                            { key: '1', field: 'Contract Number', value: contract.contractNumber },
                                            { key: '2', field: 'Counterparty', value: contract.partnerName },
                                            { key: '3', field: 'Contract Type', value: contract.contractTypeName },
                                            { key: '4', field: 'Effective Date', value: new Date(contract.effectiveDate).toLocaleDateString() },
                                            { key: '5', field: 'Expiry Date', value: new Date(contract.expiryDate).toLocaleDateString() }
                                        ]}
                                        columns={[
                                            { title: 'Field', dataIndex: 'field', width: '30%', render: (text: string) => <strong>{text}</strong> },
                                            { title: 'Information', dataIndex: 'value', key: 'value' }
                                        ]}
                                        pagination={false}
                                        bordered
                                        size="middle"
                                    />
                                </Card>

                                {/* AI Risk Analysis Results – with risk_source toggle */}
                                {(() => {
                                    const allRisks = contract.risks || [];
                                    const playbookCount = allRisks.filter(r => !r.risk_source || r.risk_source === 'playbook').length;
                                    const lawCount = allRisks.filter(r => r.risk_source === 'law').length;
                                    const filteredRisks = riskSourceFilter === 'all'
                                        ? allRisks
                                        : allRisks.filter(r =>
                                            riskSourceFilter === 'playbook'
                                                ? (!r.risk_source || r.risk_source === 'playbook')
                                                : r.risk_source === 'law'
                                        );
                                    return (
                                        <Card
                                            title={
                                                <div className="risk-card-header">
                                                    <Space>
                                                        <span>AI Risk Analysis Results</span>
                                                        <Tag color="red">{filteredRisks.length} Risks Detected</Tag>
                                                    </Space>
                                                    <Space>
                                                        {/* Risk Source Toggle Buttons */}
                                                        <Space.Compact>
                                                            <Button
                                                                type={riskSourceFilter === 'all' ? 'primary' : 'default'}
                                                                size="small"
                                                                onClick={() => setRiskSourceFilter('all')}
                                                            >
                                                                All ({allRisks.length})
                                                            </Button>
                                                            <Button
                                                                type={riskSourceFilter === 'playbook' ? 'primary' : 'default'}
                                                                size="small"
                                                                onClick={() => setRiskSourceFilter('playbook')}
                                                                style={riskSourceFilter === 'playbook' ? { background: '#1890ff' } : {}}
                                                            >
                                                                📋 Playbook ({playbookCount})
                                                            </Button>
                                                            <Button
                                                                type={riskSourceFilter === 'law' ? 'primary' : 'default'}
                                                                size="small"
                                                                onClick={() => setRiskSourceFilter('law')}
                                                                style={riskSourceFilter === 'law' ? { background: '#722ed1' } : {}}
                                                            >
                                                                ⚖️ Vietnamese Law ({lawCount})
                                                            </Button>
                                                        </Space.Compact>
                                                        {selectedRowKeys.length > 0 && (
                                                            <Space>
                                                                <Button
                                                                    icon={<EditOutlined />}
                                                                    onClick={() => navigate(`/contracts/${contract.id}/edit`, { state: { selectedRiskIds: selectedRowKeys } })}
                                                                >
                                                                    Review & Edit
                                                                </Button>
                                                                <Button type="primary" onClick={handleBatchAccept} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                                                                    Apply Fix for {selectedRowKeys.length} items
                                                                </Button>
                                                            </Space>
                                                        )}
                                                    </Space>
                                                </div>
                                            }
                                            style={{ borderRadius: '12px' }}
                                        >
                                            <Table
                                                dataSource={
                                                    filteredRisks.slice().sort((a, b) => {
                                                        // 0. Sort by document order (Section Matching index)
                                                        const idxA = a.section_index ?? 99999;
                                                        const idxB = b.section_index ?? 99999;
                                                        if (idxA !== idxB) return idxA - idxB;

                                                        // 1. Sort by severity (high > medium > low)
                                                        const severityOrder = { high: 0, medium: 1, low: 2 };
                                                        const severityDiff = (severityOrder[a.severity] || 1) - (severityOrder[b.severity] || 1);
                                                        if (severityDiff !== 0) return severityDiff;

                                                        // 2. Sort by type (modification before recommendation)
                                                        const typeOrder: Record<string, number> = { modification: 0, recommendation: 1 };
                                                        const typeDiff = (typeOrder[a.risk_type || 'modification'] || 0) - (typeOrder[b.risk_type || 'modification'] || 0);
                                                        if (typeDiff !== 0) return typeDiff;

                                                        // 3. Sort by section name
                                                        return (a.section || '').localeCompare(b.section || '');
                                                    })
                                                }
                                                columns={riskColumns}
                                                rowKey="id"
                                                pagination={false}
                                                bordered
                                                size="small"
                                                scroll={{ x: 1600, y: "calc(100vh - 350px)" }}
                                            />
                                        </Card>
                                    );
                                })()}
                            </>
                        )
                    },
                    {
                        key: '2',
                        label: 'Activity History',
                        children: <HistoryTab contractId={contract.id} />
                    }
                ]}
            />

            {/* ── Debug: Section Pairs Modal (template-based analysis) ─────────── */}
            <Modal
                title={
                    contract.sectionPairsJson && contract.sectionPairsJson.length > 0
                        ? `🔍 Section Matching Debug — ${contract.sectionPairsJson.length} pairs`
                        : `🔍 Section Matching Debug — Chưa có dữ liệu`
                }
                open={sectionPairsVisible}
                onCancel={() => setSectionPairsVisible(false)}
                footer={null}
                width="90vw"
                style={{ top: 20 }}
            >
                {(!contract.sectionPairsJson || contract.sectionPairsJson.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#888' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Chưa có dữ liệu Section Pairs</div>
                        <div style={{ fontSize: 13, marginBottom: 20 }}>
                            Click nút <strong>🔄 Re-analyze</strong> ở trên để chạy lại phân tích.<br />
                            Sau khi hoàn thành, bảng này sẽ hiển thị các đoạn từ contract được đem đi so sánh với template.
                        </div>
                        <Button type="primary" onClick={() => { setSectionPairsVisible(false); handleReanalyze(); }}>
                            🔄 Re-analyze ngay
                        </Button>
                    </div>
                ) : (

                    <Table
                        id="section-pairs-debug-table"
                        dataSource={(contract.sectionPairsJson ?? []).map((item: any, idx: number) => ({ ...item, globalIndex: idx + 1 }))}
                        rowKey={(row: any) => String(row.globalIndex)}
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                        bordered
                        scroll={{ x: 1200 }}
                        columns={[
                            {
                                title: '#',
                                width: 55,
                                render: (_: any, record: any) => record.globalIndex,
                            },
                            {
                                title: 'Contract Section',
                                width: '30%',
                                render: (row: any) => (
                                    <div>
                                        <strong style={{ fontSize: 12 }}>{row.contract_title || '(no title)'}</strong>
                                        <div style={{ fontSize: 11, color: '#555', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 600, overflow: 'auto' }}>
                                            {row.contract_text_preview || '—'}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                title: 'Type',
                                dataIndex: 'pair_type',
                                width: 100,
                                filters: [
                                    { text: '📋 Template', value: 'template' },
                                    { text: '📖 Rule', value: 'rule' },
                                ],
                                onFilter: (value: any, record: any) => (record.pair_type || 'template') === value,
                                render: (type: string) => {
                                    if (type === 'rule') return <Tag color="purple">📖 Rule</Tag>;
                                    return <Tag color="blue">📋 Template</Tag>;
                                },
                            },
                            {
                                title: 'Strategy',
                                dataIndex: 'match_strategy',
                                width: 140,
                                render: (strategy: string) => {
                                    let label = strategy;
                                    let color = 'default';
                                    if (strategy === 'exact_title') { label = 'Title Trùng Khớp'; color = 'green'; }
                                    else if (strategy?.startsWith('fuzzy_title')) { label = 'Gần Giống Title'; color = 'blue'; }
                                    else if (strategy?.startsWith('content_similarity')) { label = 'Giống Nội Dung'; color = 'cyan'; }
                                    else if (strategy?.startsWith('position')) { label = 'Dựa Theo Vị Trí'; color = 'orange'; }
                                    else if (strategy?.startsWith('milvus_rag')) { label = 'Milvus RAG'; color = 'purple'; }
                                    else if (strategy?.startsWith('playbook_rule')) { label = 'Playbook Rule'; color = 'geekblue'; }
                                    else if (strategy === 'no_rules_matched') { label = 'No Rules Found'; color = 'red'; }
                                    else if (strategy === 'none' || strategy === 'no_match') { label = 'Không Tìm Thấy'; color = 'red'; }

                                    return <Tag color={color} style={{ fontSize: 11, whiteSpace: 'normal', wordBreak: 'break-all' }}>{label}</Tag>;
                                },
                            },
                            {
                                title: 'Risk',
                                width: 110,
                                render: (row: any) => {
                                    if (row.has_risk) {
                                        const rLevel = (row.risk_level || 'Có').toUpperCase();
                                        const rColor = rLevel === 'HIGH' ? 'red' : rLevel === 'MEDIUM' ? 'orange' : 'gold';
                                        return <Tag color={rColor} title={row.risk_summary}>{rLevel}</Tag>;
                                    }
                                    return <Tag color="success">None</Tag>;
                                }
                            },
                            {
                                title: 'Matched Content',
                                width: '30%',
                                render: (row: any) => (
                                    <div style={{ fontSize: 11, color: '#444', whiteSpace: 'pre-wrap', maxHeight: 600, overflow: 'auto' }}>
                                        {row.template_text_preview || <span style={{ color: '#aaa' }}>— no match —</span>}
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </Modal>
        </div>
    );
};


const ContractDetailPage: React.FC = () => (
    <ErrorBoundary>
        <ContractDetailPageContent />
    </ErrorBoundary>
);

export default ContractDetailPage;
