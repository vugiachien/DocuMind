import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Table, Space, message, Spin, Select, Tooltip } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import playbookService from '../../services/playbookService';
import { useAuth } from '../../contexts/AuthContext';
import { Playbook, PlaybookRule, RiskSeverity } from '../../types/types';
import './PlaybookRulesPage.css';

const { Paragraph } = Typography;

const riskLevelColors: Record<RiskSeverity, string> = {
    high: '#ba1a1a',
    medium: '#f59e0b',
    low: '#10b981'
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
            render: (text: string) => <Tag color="#e6f0fa" style={{ color: '#0055b3', border: 'none', borderRadius: '4px' }}>{text}</Tag>,
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
            render: (text: string) => text ? <Tag color="#f0f0f0" style={{ color: '#667085', border: 'none', borderRadius: '4px' }}>{text}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>,
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
            render: (text: string) => text ? <Tag color="#f9f0ff" style={{ color: '#531dab', border: 'none', borderRadius: '4px' }}>{text}</Tag> : <span style={{ color: '#bfbfbf' }}>-</span>,
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
                        <Tag color={riskLevelColors[level] || '#d9d9d9'} className="severity-tag" style={{ border: 'none', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
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
                <Space align="center" size="middle">
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/library')} style={{ paddingLeft: 0, color: '#667085', fontWeight: 500 }}>
                        Back to Library
                    </Button>
                    <div>
                        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '32px', fontWeight: 500, color: '#24303a', margin: 0, letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                            {playbook?.name}
                        </h1>
                        <Paragraph type="secondary" style={{ margin: '4px 0 0 0', color: '#667085', fontSize: '15px' }}>
                            {playbook?.description || 'No description provided'}
                        </Paragraph>
                    </div>
                </Space>
                <Tag color={playbook?.status === 'active' ? '#10b981' : '#8c8c8c'} style={{ border: 'none', borderRadius: '4px', fontWeight: 600, color: '#fff', padding: '4px 12px', fontSize: '13px' }}>
                    {(playbook?.status || '').toUpperCase()}
                </Tag>
            </div>

            <Card
                title={
                    <Space>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: 500 }}>Rules / Clauses List</span>
                        <Tag color="#f8f9fa" style={{ color: '#667085', border: '1px solid rgba(198, 198, 205, 0.4)', borderRadius: '4px' }}>{rules.length} Rules</Tag>
                    </Space>
                }
                className="playbook-rules-card"
                styles={{ header: { borderBottom: '1px solid rgba(198, 198, 205, 0.4)' }, body: { padding: 0 } }}
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
