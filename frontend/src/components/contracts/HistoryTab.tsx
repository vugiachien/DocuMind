
import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Empty, Descriptions, Modal, Button, Collapse, Space } from 'antd';
import { AuditLog } from '../../services/contractService';
import contractService from '../../services/contractService';
import {
    EyeOutlined,
    FileTextOutlined,
    RobotOutlined,
    CheckCircleOutlined,
    ShareAltOutlined,
    DeleteOutlined,
    UploadOutlined,
    DownloadOutlined,
    EditOutlined,
    ClockCircleOutlined,
    UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface HistoryTabProps {
    contractId: string;
}

const HistoryTab: React.FC<HistoryTabProps> = ({ contractId }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    useEffect(() => {
        loadHistory();
    }, [contractId]);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await contractService.getHistory(contractId);
            setLogs(data);
        } catch (error) {
            console.error("Failed to load history", error);
        } finally {
            setLoading(false);
        }
    };

    const showDetails = (log: AuditLog) => {
        setSelectedLog(log);
        setDetailModalVisible(true);
    };

    const getActionConfig = (action: string) => {
        switch (action) {
            case 'CREATE': return { color: 'green', icon: <FileTextOutlined />, label: 'Created' };
            case 'UPDATE': return { color: 'orange', icon: <EditOutlined />, label: 'Updated' };
            case 'DELETE': return { color: 'red', icon: <DeleteOutlined />, label: 'Deleted' };
            case 'VIEW': return { color: 'default', icon: <EyeOutlined />, label: 'Viewed' };
            case 'UPLOAD_FILE': return { color: 'cyan', icon: <UploadOutlined />, label: 'Uploaded File' };
            case 'DOWNLOAD_FILE': return { color: 'purple', icon: <DownloadOutlined />, label: 'Downloaded File' };
            case 'ANALYZE': return { color: 'geekblue', icon: <RobotOutlined />, label: 'AI Analyzed' };
            case 'SHARE': return { color: 'lime', icon: <ShareAltOutlined />, label: 'Shared' };
            case 'REVOKE': return { color: 'volcano', icon: <DeleteOutlined />, label: 'Revoked Share' };
            case 'CREATE_VERSION': return { color: 'gold', icon: <FileTextOutlined />, label: 'New Version' };
            case 'RISK_BATCH_APPLY': return { color: 'magenta', icon: <CheckCircleOutlined />, label: 'Auto-Applied Fixes' };
            default: return { color: 'blue', icon: <ClockCircleOutlined />, label: action };
        }
    };

    const renderDetailsSummary = (log: AuditLog) => {
        const details = log.details || {};

        switch (log.action) {
            case 'ANALYZE':
                return (
                    <Space direction="vertical" size={2}>
                        <Text>
                            Found <Text strong>{details.risks_found || 0}</Text> risks
                            ({details.full_context_mode ? 'Full Context' : 'Chunked'})
                        </Text>
                        {details.contract_name && (
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                Contract: {details.contract_name}
                            </Text>
                        )}
                    </Space>
                );
            case 'RISK_BATCH_APPLY':
                return (
                    <Text>
                        Applied <Text strong>{details.processed || 0}</Text> fixes
                        (Version {details.newVersion})
                    </Text>
                );
            case 'CREATE_VERSION':
                return <Text>Version {details.version} created</Text>;
            case 'SHARE':
                return <Text>Shared with {details.shared_with} ({details.permission})</Text>;
            case 'UPLOAD_FILE':
                return <Text>Filename: {details.filename?.split('/').pop() || 'Unknown'}</Text>;
            default:
                return <Text type="secondary" style={{ fontSize: '12px' }}>No summary available</Text>;
        }
    };

    const columns = [
        {
            title: 'Time',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (text: string) => {
                if (!text) return '-';
                const date = dayjs(text);
                return (
                    <Space direction="vertical" size={0}>
                        <Text>{date.fromNow()}</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            {date.format('MMM D, YYYY h:mm A')}
                        </Text>
                    </Space>
                );
            },
            width: 180,
        },
        {
            title: 'User',
            dataIndex: 'userName',
            key: 'userName',
            render: (text: string, record: AuditLog) => (
                <Space>
                    <UserOutlined style={{ color: '#8c8c8c' }} />
                    <Text>{text || record.userId || 'System'}</Text>
                </Space>
            ),
            width: 160,
        },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            width: 180,
            render: (action: string) => {
                const config = getActionConfig(action);
                return (
                    <Tag color={config.color} icon={config.icon}>
                        {config.label}
                    </Tag>
                );
            }
        },
        {
            title: 'Summary',
            key: 'summary',
            render: (_: any, record: AuditLog) => renderDetailsSummary(record)
        },
        {
            title: '',
            key: 'actions',
            width: 100,
            align: 'right' as const,
            render: (_: any, record: AuditLog) => (
                <Button
                    type="text"
                    size="small"
                    onClick={() => showDetails(record)}
                >
                    Raw Details
                </Button>
            )
        }
    ];

    return (
        <div style={{ padding: '0 0 24px 0' }}>
            <Table
                dataSource={logs}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 15 }}
                loading={loading}
                locale={{ emptyText: <Empty description="No history found" /> }}
            />

            <Modal
                title={
                    <Space>
                        {selectedLog ? getActionConfig(selectedLog.action).icon : <FileTextOutlined />}
                        <span>Audit Log Details</span>
                    </Space>
                }
                open={detailModalVisible}
                onCancel={() => setDetailModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailModalVisible(false)}>
                        Close
                    </Button>
                ]}
                width={600}
            >
                {selectedLog && (
                    <div>
                        <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="Action">
                                <Tag color={getActionConfig(selectedLog.action).color}>
                                    {selectedLog.action}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="User">
                                <UserOutlined style={{ marginRight: 8 }} />
                                {selectedLog.userName} ({selectedLog.userId})
                            </Descriptions.Item>
                            <Descriptions.Item label="Time">
                                <ClockCircleOutlined style={{ marginRight: 8 }} />
                                {dayjs(selectedLog.timestamp).format('MMMM D, YYYY h:mm:ss A')}
                                <Text type="secondary" style={{ marginLeft: 8 }}>
                                    ({dayjs(selectedLog.timestamp).fromNow()})
                                </Text>
                            </Descriptions.Item>
                        </Descriptions>

                        <Collapse
                            items={[{
                                key: '1',
                                label: 'Raw Payload JSON',
                                children: (
                                    <pre style={{
                                        margin: 0,
                                        padding: 12,
                                        background: '#f5f5f5',
                                        borderRadius: 4,
                                        fontSize: '12px',
                                        overflowX: 'auto'
                                    }}>
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                )
                            }]}
                        />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default HistoryTab;

