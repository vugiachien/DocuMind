import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Input, Select, Card, message, Spin, Space, Modal, Tooltip, Checkbox, Typography } from 'antd';
import ShareContractModal from '../../components/ShareContractModal';
import {
    SearchOutlined, FilterOutlined, EyeOutlined,
    UploadOutlined, RobotOutlined, CheckCircleOutlined, DeleteOutlined, ReloadOutlined,
    ShareAltOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Contract, ContractStatus } from '../../types/types';
import { getStatusText } from '../../utils/statusHelpers';
import contractService from '../../services/contractService';
import { useSSE } from '../../hooks/useSSE';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import BulkUploadModal from '../../components/contracts/BulkUploadModal';
import { useAnalysisSettings } from '../../contexts/AnalysisSettingsContext';

const { Option } = Select;
const { Text } = Typography;

const getBadgeColor = (status: string): string => {
    const colors: Record<string, string> = {
        draft: '#64748B',       // slate
        review: '#EAB308',      // yellow
        processing: '#3B82F6',  // blue
        update: '#F59E0B',      // amber
        negotiation: '#8B5CF6', // violet
        manager_review: '#06B6D4', // cyan
        approval: '#10B981',    // emerald
        signing: '#0EA5E9',     // sky
        active: '#22C55E',      // green
        expired: '#EF4444',     // red
        terminated: '#991B1B',  // dark red
    };
    return colors[status] || '#76777d';
};

const ContractListPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useAuth();

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
        setFullContextMode(false);
        setLawAnalysisTarget(id);
    };

    /** Called when user confirms in the analyze modal */
    const handleAnalyze = async (id: string, isFullContext: boolean) => {
        setLawAnalysisTarget(null);
        try {
            setAnalyzingIds(prev => new Set(prev).add(id));
            await contractService.analyzeContract(id, false, isFullContext);
            message.info('Analysis started in background...');
            fetchContracts(true);
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
            title: 'Agreement Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Contract) => (
                <Space direction="vertical" size={2}>
                    <Text style={{ color: '#111827', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{text}</Text>
                    {user && record.ownerId && user.id !== record.ownerId && (
                        <span style={{ fontSize: '10px', color: '#f59e0b', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Shared</span>
                    )}
                </Space>
            ),
        },
        {
            title: 'Counterparty',
            dataIndex: 'partnerName',
            key: 'partnerName',
            render: (text: string) => <Text style={{ color: '#667085', fontFamily: 'Inter, sans-serif' }}>{text}</Text>
        },
        {
            title: 'Type',
            dataIndex: 'contractTypeName',
            key: 'contractTypeName',
            render: (type: string) => (
                <Text style={{ color: '#667085', fontSize: '13px' }}>{type}</Text>
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
                    const dateStr = d.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    return <Text style={{ color: '#76777d', fontSize: '13px' }}>{dateStr}</Text>;
                } catch (e) {
                    return <Text style={{ color: '#76777d', fontSize: '13px' }}>Unknown Date</Text>;
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
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 500 }}>
                                <CheckCircleOutlined style={{ marginRight: '4px' }} /> Analyzed
                            </span>
                            <Tooltip title="Re-analyze with updated Context">
                                <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    type="text"
                                    className="text-on-surface-variant hover:bg-surface-container"
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
                <span style={{
                    color: getBadgeColor(status),
                    backgroundColor: `${getBadgeColor(status)}1A`,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }}>
                    {getStatusText(status as ContractStatus)}
                </span>
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
        <div style={{ padding: '0 24px', maxWidth: '1440px', margin: '0 auto' }}>
            {/* Header Area */}
            <div style={{ marginBottom: '40px', marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '36px', fontWeight: 500, color: '#24303a', margin: 0, letterSpacing: '-0.02em' }}>Agreements</h1>
                </div>
                <Space size="large">
                    <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={() => navigate('/contracts/create')}
                        style={{ background: '#24303a', borderRadius: '4px', height: '40px', border: 'none', fontWeight: 500, padding: '0 24px' }}
                    >
                        Upload Agreement
                    </Button>
                </Space>
            </div>

            <Card bordered={false} className="bg-surface-container-lowest shadow-sm" style={{ borderRadius: '4px', border: '1px solid rgba(198, 198, 205, 0.4)' }} bodyStyle={{ padding: '24px' }}>
                <div style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
                    <Input
                        placeholder="Search counterparty or name..."
                        prefix={<SearchOutlined style={{ color: '#76777d' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ width: '320px', borderRadius: '4px', border: '1px solid rgba(198, 198, 205, 0.6)' }}
                        size="large"
                    />
                    <Select
                        value={statusFilter}
                        onChange={value => setStatusFilter(value)}
                        style={{ width: '200px' }}
                        size="large"
                        suffixIcon={<FilterOutlined />}
                    >
                        <Option value="all">All Status</Option>
                        <Option value="draft">Draft</Option>
                        <Option value="review">Review</Option>
                        <Option value="update">Update</Option>
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
                    className="editorial-table"
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
                    onOk={() => lawAnalysisTarget && handleAnalyze(lawAnalysisTarget, fullContextMode)}
                    onCancel={() => setLawAnalysisTarget(null)}
                    okText="Start Analysis"
                    cancelText="Cancel"
                >
                    <p>The contract will be analyzed using the <strong>Playbook rules</strong>.</p>
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
            </Card>
        </div>
    );
};

export default ContractListPage;
