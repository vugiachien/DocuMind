import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Input, Select, Card, message, Spin, Space, Modal, Tooltip, Checkbox } from 'antd';
import ShareContractModal from '../../components/ShareContractModal';
import {
    SearchOutlined, FilterOutlined, EyeOutlined,
    UploadOutlined, RobotOutlined, CheckCircleOutlined, DeleteOutlined, ReloadOutlined,
    ShareAltOutlined, TeamOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Contract } from '../../types/types';
import { getStatusColor, getStatusText } from '../../utils/statusHelpers';
import contractService from '../../services/contractService';
import { useSSE } from '../../hooks/useSSE';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import BulkUploadModal from '../../components/contracts/BulkUploadModal';
import { useAnalysisSettings } from '../../contexts/AnalysisSettingsContext';


const { Option } = Select;


const ContractListPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user, refreshUser } = useAuth();

    // Check quota
    const isQuotaEmpty = user && user.analyze_limit !== null && user.analyze_limit !== undefined
        && user.analyze_count >= user.analyze_limit;

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
    const [isBulkUploadVisible, setIsBulkUploadVisible] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const [shareContractId, setShareContractId] = useState<string | null>(null);
    // Law Analysis Modal state
    const [lawAnalysisTarget, setLawAnalysisTarget] = useState<string | null>(null); // contract id
    const [useLawAnalysis, setUseLawAnalysis] = useState(false);
    const { fullContextMode, setFullContextMode } = useAnalysisSettings();


    const fetchContracts = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await contractService.getContracts();
            setContracts(data);
        } catch (error) {
            console.error('Failed to fetch contracts:', error);
            if (!silent) message.error('Failed to load contracts');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        console.log("ContractListPage mounted - Permission Column Version");
        fetchContracts();
    }, [fetchContracts]);

    // Real-time Updates via SSE
    useSSE(
        useCallback((data) => {
            const relevantEvents = [
                'analysis_completed',
                'analysis_failed',
                'conversion_completed',
                'conversion_failed',
                'contract_revoked'
            ];

            if (!relevantEvents.includes(data.event || '')) {
                return;
            }

            fetchContracts(true);

            if (data.event === 'analysis_completed') {
                message.success('Contract analysis completed!');
            } else if (data.event === 'analysis_failed') {
                message.error(`Analysis failed: ${data.error || 'Unknown error'}`);
            } else if (data.event === 'conversion_completed') {
                message.success('Contract conversion completed!');
            } else if (data.event === 'conversion_failed') {
                message.error(`Contract conversion failed: ${data.error || 'Unknown error'}`);
            } else if (data.event === 'contract_revoked') {
                message.warning('Access to a contract has been revoked.');
                // Optimistic removal could be done here, but fetchContracts(true) is already called above
            }

        }, [fetchContracts])
    );

    // Listen for Notification Service Events (Shared Contracts)
    const { lastNotification } = useNotifications();
    useEffect(() => {
        if (lastNotification && !lastNotification.isRead) {
            console.log("🔔 New notification received:", lastNotification);

            // Check for Optimistic Update Payload
            if (lastNotification.payload &&
                lastNotification.payload.entity === 'contract' &&
                lastNotification.payload.action === 'share' &&
                lastNotification.payload.data) {

                const newContract = lastNotification.payload.data as Contract;
                console.log("⚡ Optimistic UI: Adding shared contract to list", newContract.name);

                setContracts(prev => {
                    // Check if already exists (avoid duplicates)
                    if (prev.some(c => c.id === newContract.id)) {
                        return prev;
                    }
                    // Prepend new contract
                    return [newContract, ...prev];
                });
                // No need to fetchContracts(true)
            } else {
                // Fallback for other notifications or missing payload
                console.log("🔄 Refreshing full list from server...");
                fetchContracts(true);
            }
        }
    }, [lastNotification, fetchContracts]);

    /** Open the analyze modal for a contract */
    const openAnalyzeModal = (id: string) => {
        setUseLawAnalysis(false);
        setFullContextMode(false);
        setLawAnalysisTarget(id);
    };

    /** Called when user confirms in the analyze modal */
    const handleAnalyze = async (id: string, withLaw: boolean, isFullContext: boolean) => {
        setLawAnalysisTarget(null);
        try {
            setAnalyzingIds(prev => new Set(prev).add(id));
            await contractService.analyzeContract(id, withLaw, isFullContext);
            message.info(withLaw
                ? 'Analysis started (Playbook + Vietnamese Law) in background...'
                : 'Analysis started in background...');
            fetchContracts(true);
            // Refresh user data to update analyze_count
            refreshUser();
        } catch (error) {
            console.error('Analysis Error:', error);
            message.error('Analysis request failed');
        } finally {
            setAnalyzingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await contractService.deleteContract(id);
            message.success('Contract deleted successfully');
            fetchContracts();
        } catch (error) {
            message.error('Failed to delete contract');
        }
    };



    const filteredContracts = contracts.filter(contract => {
        const matchesSearch = contract.name.toLowerCase().includes(searchText.toLowerCase()) ||
            contract.partnerName.toLowerCase().includes(searchText.toLowerCase());
        const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const columns = [
        {
            title: 'No.',
            key: 'index',
            width: 60,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <span style={{ fontWeight: 500 }}>
                    {(pagination.current - 1) * pagination.pageSize + index + 1}
                </span>
            ),
        },
        {
            title: 'Contract Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Contract) => (
                <Space direction="vertical" size={2}>
                    <span style={{ fontWeight: 500 }}>{text}</span>
                    {user && record.ownerId && user.id !== record.ownerId && (
                        <Tag color="orange" icon={<TeamOutlined />} style={{ fontSize: '10px', lineHeight: '16px' }}>Shared</Tag>
                    )}
                </Space>
            ),
        },
        {
            title: 'Counterparty',
            dataIndex: 'partnerName',
            key: 'partnerName',
        },
        {
            title: 'Type',
            dataIndex: 'contractTypeName',
            key: 'contractTypeName',
            render: (type: string) => (
                <Tag color="geekblue">{type}</Tag>
            ),
        },
        // Owner column (Admin only)
        ...(isAdmin ? [{
            title: 'Owner',
            dataIndex: 'createdBy',
            key: 'owner',
            render: (createdBy: string) => (
                <Tag color="cyan">{createdBy || 'Unknown'}</Tag>
            ),
        }] : []),
        // Permission column (Only show for non-admins, since Admin always has full access)
        ...(!isAdmin ? [{
            title: 'Permission',
            dataIndex: 'currentUserPermission',
            key: 'permission',
            render: (perm: string) => {
                let color = 'default';
                let text = 'Unknown';
                if (perm === 'admin') { color = 'volcano'; text = 'Admin'; }
                else if (perm === 'owner') { color = 'gold'; text = 'Owner'; }
                else if (perm === 'edit') { color = 'blue'; text = 'Can Edit'; }
                else if (perm === 'view') { color = 'green'; text = 'View Only'; }

                return <Tag color={color}>{text}</Tag>;
            }
        }] : []),
        {
            title: 'Last Updated',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            render: (date: string | Date) => {
                // Ensure date is treated as UTC if it's a string without timezone info
                const dateStrRaw = typeof date === 'string' && !date.endsWith('Z') ? `${date}Z` : date;
                const d = new Date(dateStrRaw);

                // Try toLocaleString with timezone first
                try {
                    const timeStr = d.toLocaleTimeString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });

                    const dateStr = d.toLocaleDateString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });

                    console.log('Using locale string:', `${timeStr} ${dateStr}`);
                    return `${timeStr} ${dateStr}`;
                } catch (e) {
                    // Fallback: Manual UTC+7 calculation
                    console.log('Locale string failed, using manual calculation');
                    const vietnamDate = new Date(d.getTime() + (7 * 60 * 60 * 1000));
                    const hours = vietnamDate.getUTCHours().toString().padStart(2, '0');
                    const minutes = vietnamDate.getUTCMinutes().toString().padStart(2, '0');
                    const day = vietnamDate.getUTCDate().toString().padStart(2, '0');
                    const month = (vietnamDate.getUTCMonth() + 1).toString().padStart(2, '0');
                    const year = vietnamDate.getUTCFullYear();
                    return `${hours}:${minutes} ${day}/${month}/${year}`;
                }
            }
        },
        {
            title: 'Analysis',
            key: 'analysis',
            render: (_: any, record: Contract) => {
                const isAnalyzing = analyzingIds.has(record.id) || record.status === 'processing';
                const hasRisks = record.risks && record.risks.length > 0;

                if (isAnalyzing) {
                    return <Spin size="small" tip="Processing..." />;
                }

                if (hasRisks || record.status === 'review') {
                    return (
                        <Space>
                            <Tag icon={<CheckCircleOutlined />} color="success">
                                Analyzed
                            </Tag>
                            <Tooltip title="Re-analyze with updated Context">
                                <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    type="text"
                                    onClick={() => openAnalyzeModal(record.id)}
                                />
                            </Tooltip>
                        </Space>
                    );
                }

                return (
                    <Button
                        size="small"
                        icon={<RobotOutlined />}
                        onClick={() => openAnalyzeModal(record.id)}
                    >
                        Analyze
                    </Button>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={getStatusColor(status as any)}>
                    {getStatusText(status as any)}
                </Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: Contract) => (
                <Space>
                    <Tooltip title="Share">
                        <Button
                            type="text"
                            size="small"
                            icon={<ShareAltOutlined />}
                            onClick={() => setShareContractId(record.id)}
                            disabled={!isAdmin && user?.id !== record.ownerId}
                        />
                    </Tooltip>
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/contracts/${record.id}`)}
                    >
                        View
                    </Button>
                    <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={!isAdmin && user?.id !== record.ownerId}
                        onClick={() => {
                            Modal.confirm({
                                title: 'Delete Contract',
                                content: 'Are you sure you want to delete this contract?',
                                okText: 'Yes',
                                okType: 'danger',
                                cancelText: 'No',
                                onOk: () => handleDelete(record.id)
                            });
                        }}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <Card bordered={false} style={{ borderRadius: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    {user && user.analyze_limit !== null && user.analyze_limit !== undefined && (
                        <Tag color={isQuotaEmpty ? "red" : "blue"} style={{ padding: '4px 12px', fontSize: '14px' }}>
                            Ai Analysis Quota: <strong>{user.analyze_count} / {user.analyze_limit}</strong> used
                        </Tag>
                    )}
                </div>
                <Space>
                    {/* Bulk Upload Button - Temporarily disabled per user feedback
                     <Button
                        icon={<UploadOutlined />}
                        onClick={() => setIsBulkUploadVisible(true)}
                        style={{ borderRadius: '10px', height: '40px' }}
                    >
                        Bulk Upload
                    </Button>
                    */}
                    <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={() => navigate('/contracts/create')}
                        style={{ background: '#4318FF', borderRadius: '10px', height: '40px' }}
                    >
                        New Contract
                    </Button>
                </Space>
            </div>

            <div style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
                <Input
                    placeholder="Search by name or counterparty"
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    style={{ width: '300px', borderRadius: '10px' }}
                />
                <Select
                    value={statusFilter}
                    onChange={value => setStatusFilter(value)}
                    style={{ width: '200px' }}
                    suffixIcon={<FilterOutlined />}
                >
                    <Option value="all">All Status</Option>
                    <Option value="draft">Draft</Option>
                    <Option value="review">Review</Option>
                    <Option value="update">Update</Option>
                    <Option value="negotiation">Negotiation</Option>
                    <Option value="manager_review">Manager Review</Option>
                    <Option value="approval">Approval</Option>
                    <Option value="signing">Signing</Option>
                </Select>
            </div>

            <Table
                columns={columns as any}
                dataSource={filteredContracts}
                rowKey="id"
                pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`
                }}
                loading={loading}
                className="horizon-table"
                scroll={{ x: 'max-content' }}
            />

            <BulkUploadModal
                visible={isBulkUploadVisible}
                onClose={() => setIsBulkUploadVisible(false)}
                onSuccess={() => fetchContracts()}
            />

            <ShareContractModal
                visible={!!shareContractId}
                contractId={shareContractId || ""}
                onClose={() => setShareContractId(null)}
            />

            {/* Law Analysis Confirm Modal */}
            <Modal
                title="🤖 Run AI Analysis"
                open={!!lawAnalysisTarget}
                onOk={() => lawAnalysisTarget && handleAnalyze(lawAnalysisTarget, useLawAnalysis, fullContextMode)}
                onCancel={() => setLawAnalysisTarget(null)}
                okText="Start Analysis"
                cancelText="Cancel"
                okButtonProps={{ disabled: !!isQuotaEmpty }}
            >
                {isQuotaEmpty ? (
                    <div style={{ padding: '16px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: '8px', marginBottom: '16px' }}>
                        <span style={{ color: '#cf1322', fontWeight: 'bold' }}>⚠️ Analysis limit reached.</span>
                        <p style={{ margin: '8px 0 0 0', color: '#cf1322' }}>
                            You have used all {user?.analyze_limit} of your available AI analyses. Please contact an administrator to increase your quota.
                        </p>
                    </div>
                ) : null}
                <p>The contract will be analyzed using the <strong>Playbook rules</strong>.</p>
                <Checkbox
                    checked={useLawAnalysis}
                    onChange={e => setUseLawAnalysis(e.target.checked)}
                    style={{ marginTop: 8 }}
                >
                    <span>
                        ⚖️ <strong>Also analyze with Vietnamese Law</strong>
                        <br />
                        <small style={{ color: '#888' }}>
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
        </Card >
    );
};

export default ContractListPage;
