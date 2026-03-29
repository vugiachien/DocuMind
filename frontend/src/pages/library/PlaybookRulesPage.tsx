import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Table, Space, message, Spin, Select, Tooltip } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import playbookService from '../../services/playbookService';
import { useAuth } from '../../contexts/AuthContext';
import { Playbook, PlaybookRule, RiskSeverity } from '../../types/types';
import './PlaybookRulesPage.css';

const { Title, Paragraph } = Typography;

const riskLevelColors: Record<RiskSeverity, string> = {
    high: '#f5222d',
    medium: '#faad14',
    low: '#52c41a'
};

// Helper component for expandable text
const ExpandableText = ({ text, color, italic }: { text: string, color?: string, italic?: boolean }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Click to collapse" : "Click to expand"}
            className={`expandable-text-wrap${italic ? ' expandable-text-wrap--italic' : ''}`}
            {...(color ? { style: { '--expandable-color': color } as React.CSSProperties } : {})}
        >
            <div className={`expandable-text-inner ${expanded ? 'expandable-text-inner--expanded' : 'expandable-text-inner--collapsed'}`}>
                {text || '-'}
            </div>
        </div>
    );
};

const PlaybookRulesPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [playbook, setPlaybook] = useState<Playbook | null>(null);
    const [rules, setRules] = useState<PlaybookRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [editedSeverity, setEditedSeverity] = useState<RiskSeverity | null>(null);
    const { isAdmin } = useAuth();

    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [playbookData, rulesData] = await Promise.all([
                playbookService.getPlaybook(id!),
                playbookService.getPlaybookRules(id!)
            ]);
            setPlaybook(playbookData);
            setRules(rulesData);
        } catch (error) {
            message.error('Failed to load playbook data');
            navigate('/library');
        } finally {
            setLoading(false);
        }
    };

    const handleEditSeverity = (rule: PlaybookRule) => {
        setEditingRuleId(rule.id);
        setEditedSeverity(rule.severity);
    };

    const handleCancelEdit = () => {
        setEditingRuleId(null);
        setEditedSeverity(null);
    };

    const handleSaveSeverity = async (ruleId: string) => {
        if (!editedSeverity) return;
        try {
            await playbookService.updatePlaybookRule(ruleId, { severity: editedSeverity });
            message.success('Severity updated successfully');

            // Update local state
            setRules(prev => prev.map(r => r.id === ruleId ? { ...r, severity: editedSeverity } : r));

            setEditingRuleId(null);
            setEditedSeverity(null);
        } catch (error) {
            message.error('Failed to update severity');
        }
    };

    const columns = [
        {
            title: 'No.',
            key: 'index',
            width: 60,
            align: 'center' as const,
            render: (_: any, __: any, index: number) => (
                <span className="table-no-cell">
                    {(pagination.current - 1) * pagination.pageSize + index + 1}
                </span>
            ),
        },
        {
            title: 'Rule Name',
            dataIndex: 'name',
            key: 'name',
            width: 200,
            render: (text: string) => <div className="table-rule-name">{text}</div>,
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 150,
            render: (text: string) => <Tag color="blue">{text}</Tag>,
        },
        {
            title: 'Original Content (Clause)',
            dataIndex: 'standardClause',
            key: 'standardClause',
            width: 400,
            render: (text: string) => (
                <div className="table-clause-cell">
                    <ExpandableText text={text} color="#262626" />
                    <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        className="table-copy-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(text);
                            message.success('Copied to clipboard');
                        }}
                    >
                        Copy
                    </Button>
                </div>
            ),
        },

        {
            title: 'Clause Reference',
            dataIndex: 'clauseRef',
            key: 'clauseRef',
            width: 150,
            render: (text: string) => text ? <Tag color="geekblue">{text}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>,
        },
        {
            title: 'Acceptable Deviation',
            dataIndex: 'acceptableDeviation',
            key: 'acceptableDeviation',
            width: 280,
            render: (text: string) => text ? (
                <div className="table-description-cell">
                    <ExpandableText text={text} color="#0050b3" italic />
                </div>
            ) : <span style={{ color: '#bfbfbf' }}>-</span>,
        },
        {
            title: 'Approval Level',
            dataIndex: 'approvalLevel',
            key: 'approvalLevel',
            width: 140,
            align: 'center' as const,
            render: (text: string) => text ? <Tag color="purple">{text}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>,
        },
        {
            title: 'Severity',

            dataIndex: 'severity',
            key: 'severity',
            width: 150,
            align: 'center' as const,
            render: (level: RiskSeverity, record: PlaybookRule) => {
                const isEditing = editingRuleId === record.id;

                if (isEditing) {
                    return (
                        <Space>
                            <Select
                                value={editedSeverity}
                                onChange={(val) => setEditedSeverity(val)}
                                size="small"
                                className="severity-select"
                            >
                                <Select.Option value="high">HIGH</Select.Option>
                                <Select.Option value="medium">MEDIUM</Select.Option>
                                <Select.Option value="low">LOW</Select.Option>
                            </Select>
                            <Button
                                type="text"
                                icon={<SaveOutlined style={{ color: '#52c41a' }} />}
                                size="small"
                                onClick={() => handleSaveSeverity(record.id)}
                            />
                            <Button
                                type="text"
                                icon={<CloseOutlined style={{ color: '#f5222d' }} />}
                                size="small"
                                onClick={handleCancelEdit}
                            />
                        </Space>
                    );
                }

                return (
                    <div className="severity-cell">
                        <Tag color={riskLevelColors[level] || '#d9d9d9'} className="severity-tag">
                            {level?.toUpperCase() || 'UNKNOWN'}
                        </Tag>
                        {isAdmin && (
                            <Tooltip title="Edit Severity">
                                <Button
                                    type="text"
                                    icon={<EditOutlined />}
                                    size="small"
                                    className="severity-edit-btn"
                                    onClick={() => handleEditSeverity(record)}
                                />
                            </Tooltip>
                        )}
                    </div>
                );
            },
        }
    ];

    if (loading) {
        return (
            <div className="page-loading-center">
                <Spin size="large" tip="Loading rules..." />
            </div>
        );
    }

    return (
        <div className="playbook-rules-page">
            <div className="playbook-rules-header">
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/library')}>
                        Back to Library
                    </Button>
                    <div>
                        <Title level={3} style={{ margin: 0, color: '#2B3674' }}>
                            {playbook?.name}
                        </Title>
                        <Paragraph type="secondary" style={{ margin: 0 }}>
                            {playbook?.description || 'No description provided'}
                        </Paragraph>
                    </div>
                </Space>
                <Tag color={playbook?.status === 'active' ? 'success' : 'default'}>
                    {(playbook?.status || '').toUpperCase()}
                </Tag>
            </div>

            <Card
                title={
                    <Space>
                        <span>Rules / Clauses List</span>
                        <Tag color="blue">{rules.length} Rules</Tag>
                    </Space>
                }
                className="playbook-rules-card"
            >
                <Table
                    dataSource={rules}
                    columns={columns}
                    rowKey="id"
                    pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`
                    }}
                    bordered
                    scroll={{ x: 'max-content', y: 500 }}
                />
            </Card>
        </div>
    );
};

export default PlaybookRulesPage;
