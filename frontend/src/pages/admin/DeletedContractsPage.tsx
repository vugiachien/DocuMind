import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Tag, message, Space, Card, Typography, Empty, Timeline } from 'antd';
import {
    DeleteOutlined,
    HistoryOutlined,
    ReloadOutlined,
    FileTextOutlined,
    UserOutlined,
    ClockCircleOutlined,
    UndoOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import apiClient from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { Title, Text } = Typography;

interface DeletedContract {
    id: string;
    contractNumber: string;
    name: string;
    deleted_at: string;
    deleted_by: {
        id: string;
        username: string;
        full_name: string;
    } | null;
    original_owner_id: string;
    status_before_delete: string;
}

interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    targetType: string;
    targetId: string;
    timestamp: string;
    details: any;
}

const DeletedContractsPage: React.FC = () => {
    const [deletedContracts, setDeletedContracts] = useState<DeletedContract[]>([]);
    const [loading, setLoading] = useState(false);
    const [auditModalVisible, setAuditModalVisible] = useState(false);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const { isAdmin } = useAuth();

    // Redirect if not admin
    if (!isAdmin) {
        window.location.href = '/dashboard';
        return null;
    }

    useEffect(() => {
        fetchDeletedContracts();
    }, []);

    const fetchDeletedContracts = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/contracts/deleted');
            setDeletedContracts(response.data);
        } catch (error: any) {
            message.error('Failed to load deleted contracts');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAuditLogs = async (contractId: string) => {
        setAuditLoading(true);
        try {
            const response = await apiClient.get(`/contracts/audit/${contractId}`);
            setAuditLogs(response.data);
        } catch (error: any) {
            message.error('Failed to load audit logs');
            console.error(error);
        } finally {
            setAuditLoading(false);
        }
    };

    const showAuditLogs = (contractId: string) => {
        setAuditModalVisible(true);
        fetchAuditLogs(contractId);
    };

    const restoreContract = async (contractId: string, contractName: string) => {
        try {
            await apiClient.post(`/contracts/${contractId}/restore`);
            message.success(`Contract "${contractName}" restored successfully`);
            fetchDeletedContracts();
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Failed to restore contract');
        }
    };

    const permanentDeleteContract = (contractId: string, contractName: string) => {
        Modal.confirm({
            title: 'Permanently Delete Contract',
            icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
            content: (
                <div>
                    <p>Are you sure you want to <strong>permanently delete</strong> contract <strong>"{contractName}"</strong>?</p>
                    <p style={{ color: '#ff4d4f' }}>This action cannot be undone. All associated files will be removed.</p>
                </div>
            ),
            okText: 'Delete Permanently',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    await apiClient.delete(`/contracts/${contractId}/permanent`);
                    message.success(`Contract "${contractName}" permanently deleted`);
                    fetchDeletedContracts();
                } catch (error: any) {
                    message.error(error.response?.data?.detail || 'Failed to delete contract');
                }
            },
        });
    };

    const getActionColor = (action: string): string => {
        const colors: Record<string, string> = {
            'CREATE': 'green',
            'UPDATE': 'orange',
            'DELETE': 'red',
            'VIEW': 'default',
            'UPLOAD_FILE': 'cyan',
            'DOWNLOAD_FILE': 'purple',
            'ANALYZE': 'geekblue',
            'SHARE': 'lime',
            'REVOKE': 'volcano',
            'CREATE_VERSION': 'gold',
            'RISK_BATCH_APPLY': 'magenta',
        };
        return colors[action] || 'blue';
    };

    const columns = [
        {
            title: 'Contract Number',
            dataIndex: 'contractNumber',
            key: 'contractNumber',
            render: (text: string) => (
                <Space>
                    <FileTextOutlined />
                    <Text strong>{text}</Text>
                </Space>
            ),
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: 'Status Before Delete',
            dataIndex: 'status_before_delete',
            key: 'status_before_delete',
            render: (status: string) => {
                const statusColors: Record<string, string> = {
                    'draft': 'default',
                    'review': 'processing',
                    'active': 'success',
                    'error': 'error',
                };
                return <Tag color={statusColors[status] || 'default'}>{status?.toUpperCase()}</Tag>;
            },
        },
        {
            title: 'Deleted At',
            dataIndex: 'deleted_at',
            key: 'deleted_at',
            render: (text: string) => (
                <Space>
                    <ClockCircleOutlined />
                    {new Date(text).toLocaleString('vi-VN')}
                </Space>
            ),
            sorter: (a: DeletedContract, b: DeletedContract) =>
                new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime(),
            defaultSortOrder: 'descend' as const,
        },
        {
            title: 'Deleted By',
            dataIndex: 'deleted_by',
            key: 'deleted_by',
            render: (deletedBy: DeletedContract['deleted_by']) => (
                deletedBy ? (
                    <Space>
                        <UserOutlined />
                        <span>
                            <Text strong>{deletedBy.full_name || deletedBy.username}</Text>
                            <Text type="secondary" style={{ marginLeft: 4 }}>
                                (@{deletedBy.username})
                            </Text>
                        </span>
                    </Space>
                ) : (
                    <Text type="secondary">Unknown</Text>
                )
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 320,
            render: (_: any, record: DeletedContract) => (
                <Space size="small">
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={() => restoreContract(record.id, record.name)}
                    >
                        Restore
                    </Button>
                    <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => permanentDeleteContract(record.id, record.name)}
                    >
                        Delete Forever
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<HistoryOutlined />}
                        onClick={() => showAuditLogs(record.id)}
                    >
                        History
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Title level={3} style={{ margin: 0 }}>
                        <DeleteOutlined style={{ marginRight: 8 }} />
                        Deleted Contracts
                    </Title>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchDeletedContracts}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </div>

                <Table
                    dataSource={deletedContracts}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    locale={{
                        emptyText: (
                            <Empty
                                description="No deleted contracts found"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        )
                    }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            {/* Audit Log Modal */}
            <Modal
                title={
                    <Space>
                        <HistoryOutlined />
                        <span>Activity History</span>
                    </Space>
                }
                open={auditModalVisible}
                onCancel={() => setAuditModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setAuditModalVisible(false)}>
                        Close
                    </Button>
                ]}
                width={700}
            >
                {auditLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
                ) : auditLogs.length === 0 ? (
                    <Empty description="No activity logs found" />
                ) : (
                    <Timeline
                        mode="left"
                        items={auditLogs.map(log => ({
                            color: getActionColor(log.action),
                            label: new Date(log.timestamp).toLocaleString('vi-VN'),
                            children: (
                                <div>
                                    <Space>
                                        <Tag color={getActionColor(log.action)}>{log.action}</Tag>
                                        <Text>by</Text>
                                        <Text strong>{log.userName || 'Unknown'}</Text>
                                    </Space>
                                    {log.details && Object.keys(log.details).length > 0 && (
                                        <div style={{
                                            marginTop: 8,
                                            padding: 8,
                                            background: '#f5f5f5',
                                            borderRadius: 4,
                                            fontSize: 12
                                        }}>
                                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ),
                        }))}
                    />
                )}
            </Modal>
        </div>
    );
};

export default DeletedContractsPage;
