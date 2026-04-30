import React, { useEffect, useState } from 'react';
import { Card, Spin, Table, Typography, message } from 'antd';
import {
    BarChartOutlined,
    ClockCircleOutlined,
    FileTextOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getStatusText } from '../../utils/statusHelpers';
import { ContractStatus } from '../../types/types';
import contractService, { DashboardStats } from '../../services/contractService';
import './DashboardPage.css';

const { Text } = Typography;

const STATUS_TONES: Record<ContractStatus, { fill: string; surface: string; text: string }> = {
    draft: { fill: '#d8d2c4', surface: '#f1eee7', text: '#3f3a32' },
    processing: { fill: '#9b8f7c', surface: '#eee9df', text: '#4a4237' },
    review: { fill: '#24303a', surface: '#e8edf0', text: '#1f2933' },
    update: { fill: '#b7aa93', surface: '#f4efe6', text: '#5a4d38' },
    negotiation: { fill: '#566676', surface: '#e8eef2', text: '#24303a' },
    manager_review: { fill: '#c8bca8', surface: '#f5f0e8', text: '#665843' },
    approval: { fill: '#587264', surface: '#e8f0eb', text: '#263d32' },
    signing: { fill: '#8b6f47', surface: '#f0eadf', text: '#5d4528' },
    active: { fill: '#3f7d58', surface: '#e7f1ea', text: '#254734' },
    expired: { fill: '#a65f55', surface: '#f4e7e4', text: '#6f332d' },
    terminated: { fill: '#7a4d48', surface: '#efe2df', text: '#59302c' },
};

type DashboardCardProps = {
    title: string;
    value: number;
    icon: React.ReactNode;
    inverted?: boolean;
};

const DashboardStatCard: React.FC<DashboardCardProps> = ({ title, value, icon, inverted = false }) => (
    <Card
        bordered={false}
        className={`dashboard-stat-card ${inverted ? 'dashboard-stat-card--dark' : ''}`}
    >
        <div className="dashboard-stat-card__content">
            <div className="dashboard-stat-card__icon">{icon}</div>
            <div className="dashboard-stat-card__copy">
                <span className="dashboard-stat-card__label">{title}</span>
                <h3 className="dashboard-stat-card__value">{value}</h3>
            </div>
        </div>
    </Card>
);

const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await contractService.getDashboardStats();
                setStats(data);
            } catch (error) {
                console.error('Failed to fetch dashboard stats:', error);
                message.error('Failed to load dashboard statistics');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="dashboard-loading">
                <Spin size="large" tip="Loading dashboard..." />
            </div>
        );
    }

    if (!stats) {
        return <div className="dashboard-empty-root">No data available</div>;
    }

    const workflowStatuses: ContractStatus[] = [
        'draft',
        'processing',
        'review',
        'update',
        'negotiation',
        'manager_review',
        'approval',
        'signing',
    ];

    const chartData = workflowStatuses.map((status) => {
        const tone = STATUS_TONES[status];
        const statusStat = stats.contractsByStatus.find((item) => item.status === status);

        return {
            key: status,
            name: getStatusText(status),
            value: statusStat?.count || 0,
            color: tone.fill,
        };
    });

    const activeChartData = chartData.filter((entry) => entry.value > 0);

    const activityColumns = [
        {
            title: 'Agreement ID',
            dataIndex: 'contractNumber',
            key: 'contractNumber',
            render: (text: string) => (
                <Text className="dashboard-table__id">{text}</Text>
            ),
        },
        {
            title: 'Agreement Name',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (text: string) => (
                <Text className="dashboard-table__name">{text}</Text>
            ),
        },
        {
            title: 'Counterparty',
            dataIndex: 'partnerName',
            key: 'partnerName',
            render: (text: string) => (
                <Text className="dashboard-table__partner">{text}</Text>
            ),
        },
        {
            title: 'Added Date',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: Date) => (
                <Text className="dashboard-table__date">
                    {new Date(date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    })}
                </Text>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: ContractStatus) => {
                const tone = STATUS_TONES[status] || STATUS_TONES.draft;

                return (
                    <span
                        className="dashboard-status-pill"
                        style={{
                            backgroundColor: tone.surface,
                            color: tone.text,
                        }}
                    >
                        {getStatusText(status)}
                    </span>
                );
            },
        },
    ];

    return (
        <div className="dashboard-shell">
            <section className="dashboard-hero">
                <div className="dashboard-hero__row">
                    <div className="dashboard-hero__copy">
                        <h1 className="dashboard-hero__title">Dashboard</h1>
                    </div>

                    <div className="dashboard-hero__pulse">
                        <span className="dashboard-hero__pulse-label">Tracked Agreements</span>
                        <strong className="dashboard-hero__pulse-value">{stats.totalContracts}</strong>
                    </div>
                </div>
            </section>

            <section className="dashboard-stats-grid">
                <DashboardStatCard
                    title="Total Agreements"
                    value={stats.totalContracts}
                    icon={<FileTextOutlined />}
                    inverted
                />
                <DashboardStatCard
                    title="Active Reviews"
                    value={stats.inReview}
                    icon={<SyncOutlined spin />}
                />
                <DashboardStatCard
                    title="Approval Queue"
                    value={stats.pendingApproval}
                    icon={<ClockCircleOutlined />}
                />
            </section>

            <section className="dashboard-panels-grid">
                <Card
                    bordered={false}
                    className="dashboard-panel dashboard-panel--dark"
                    title={(
                        <div className="dashboard-panel__header">
                            <div>
                                <h2 className="dashboard-panel__title dashboard-panel__title--light">
                                    Status Distribution
                                </h2>
                            </div>
                        </div>
                    )}
                >
                    {activeChartData.length > 0 ? (
                        <>
                            <div className="dashboard-chart">
                                <div className="dashboard-chart__canvas">
                                    <ResponsiveContainer width="100%" height={320}>
                                        <PieChart>
                                            <Pie
                                                data={activeChartData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={80}
                                                outerRadius={116}
                                                paddingAngle={3}
                                                stroke="none"
                                            >
                                                {activeChartData.map((entry) => (
                                                    <Cell key={entry.key} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: '18px',
                                                    border: '1px solid rgba(17, 17, 17, 0.12)',
                                                    boxShadow: '0 18px 40px rgba(0,0,0,0.16)',
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="dashboard-chart__center">
                                        <span>Tracked</span>
                                        <strong>{stats.totalContracts}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="dashboard-legend">
                                {activeChartData.map((entry) => (
                                    <div key={entry.key} className="dashboard-legend__item">
                                        <span
                                            className="dashboard-legend__swatch"
                                            style={{ backgroundColor: entry.color }}
                                        />
                                        <span className="dashboard-legend__label">{entry.name}</span>
                                        <strong className="dashboard-legend__value">{entry.value}</strong>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="dashboard-empty dashboard-empty--dark">
                            <FileTextOutlined className="dashboard-empty__icon" />
                            <span>No agreements found</span>
                        </div>
                    )}
                </Card>

                <Card
                    bordered={false}
                    className="dashboard-panel"
                    title={(
                        <div className="dashboard-panel__header dashboard-panel__header--split">
                            <div>
                                <h2 className="dashboard-panel__title">Recent Agreements</h2>
                            </div>
                            <div className="dashboard-panel__chip">
                                <BarChartOutlined />
                            </div>
                        </div>
                    )}
                >
                    <Table
                        dataSource={stats.recentContracts || []}
                        columns={activityColumns}
                        pagination={false}
                        rowKey="id"
                        size="middle"
                        className="dashboard-table"
                        locale={{
                            emptyText: (
                                <div className="dashboard-table-empty">
                                    <FileTextOutlined className="dashboard-table-empty__icon" />
                                    <span>No agreements recorded yet</span>
                                </div>
                            ),
                        }}
                    />
                </Card>
            </section>
        </div>
    );
};

export default DashboardPage;
