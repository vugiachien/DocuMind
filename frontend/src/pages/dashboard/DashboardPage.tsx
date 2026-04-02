import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Table, Spin, message } from 'antd';
import {
    FileTextOutlined,
    ClockCircleOutlined,
    SyncOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { getStatusText } from '../../utils/statusHelpers';
import { ContractStatus } from '../../types/types';
import contractService, { DashboardStats } from '../../services/contractService';

const { Title, Text } = Typography;

// Horizon UI Colors
const BRAND_BLUE = '#4318FF';
const TEXT_DARK = '#2B3674';
const TEXT_GRAY = '#A3AED0';

// Custom Card Component for Horizon Style
const DashboardCard = ({ title, icon, value, suffix }: any) => (
    <Card
        bordered={false}
        style={{
            borderRadius: '20px',
            boxShadow: '0px 18px 40px rgba(112, 144, 176, 0.12)',
            height: '100%',
        }}
        bodyStyle={{ padding: '20px' }}
    >
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#F4F7FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '18px'
            }}>
                <span style={{ fontSize: '24px', color: BRAND_BLUE }}>{icon}</span>
            </div>
            <div>
                <Text style={{ color: TEXT_GRAY, fontSize: '14px', fontWeight: 500 }}>{title}</Text>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <Title level={3} style={{ margin: 0, color: TEXT_DARK, fontWeight: 700 }}>
                        {value}
                    </Title>
                    {suffix && <span style={{ marginLeft: '4px', color: TEXT_GRAY }}>{suffix}</span>}
                </div>
            </div>
        </div>
    </Card>
);

const DashboardPage: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            console.log("🚀 [Dashboard] Starting to fetch stats...");
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <Spin size="large" tip="Loading dashboard..." />
            </div>
        );
    }

    if (!stats) {
        return <div>No data available</div>;
    }

    // Define workflow statuses in order (including processing)
    const workflowStatuses: ContractStatus[] = ['draft', 'processing', 'review', 'update', 'negotiation', 'manager_review', 'approval', 'signing'];

    // Horizon UI Chart Colors (Cool Spectrum)
    const getChartColor = (status: ContractStatus): string => {
        const colors: Record<ContractStatus, string> = {
            draft: '#E9EDF7',       // Very Light Blue/Gray
            review: '#4318FF',      // Brand Blue
            processing: '#7551FF',  // Purple (distinct from review)
            update: '#6AD2FF',      // Light Blue
            negotiation: '#39B8FF', // Cyan Blue
            manager_review: '#868CFF', // Light Purple
            approval: '#01B574',    // Green (Success)
            signing: '#2B3674',     // Dark Blue
            active: '#05CD99',      // Teal
            expired: '#E31A1A',     // Red
            terminated: '#EE5D50',  // Light Red
        };
        return colors[status];
    };

    // Always show all workflow statuses
    const chartData = workflowStatuses.map(status => {
        const statusStat = stats.contractsByStatus.find(s => s.status === status);
        return {
            name: getStatusText(status),
            value: statusStat?.count || 0,
            color: getChartColor(status),
        };
    });

    // Check if there's any data to display
    const hasChartData = chartData.some(d => d.value > 0);



    const activityColumns = [
        {
            title: 'Contract Number',
            dataIndex: 'contractNumber',
            key: 'contractNumber',
            render: (text: string) => <Text strong style={{ color: TEXT_DARK }}>{text}</Text>
        },
        {
            title: 'Contract Name',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (text: string) => <Text style={{ color: TEXT_GRAY }}>{text}</Text>
        },
        {
            title: 'Partner',
            dataIndex: 'partnerName',
            key: 'partnerName',
            render: (text: string) => <Text style={{ color: TEXT_DARK, fontWeight: 500 }}>{text}</Text>
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: Date) => (
                <Text style={{ color: TEXT_GRAY }}>
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: ContractStatus) => <Text style={{ color: getChartColor(status), fontWeight: 'bold' }}>{getStatusText(status)}</Text>
        },
    ];

    return (
        <div>
            {/* Statistics Cards */}
            <Row gutter={[20, 20]} style={{ marginBottom: '20px' }}>
                <Col xs={24} sm={12} lg={8}>
                    <DashboardCard
                        title="Total Contracts"
                        value={stats.totalContracts}
                        icon={<FileTextOutlined />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <DashboardCard
                        title="In Review"
                        value={stats.inReview}
                        icon={<SyncOutlined spin />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <DashboardCard
                        title="Pending Approval"
                        value={stats.pendingApproval}
                        icon={<ClockCircleOutlined />}
                    />
                </Col>
            </Row>

            {/* Charts and Recent Activity */}
            <Row gutter={[20, 20]}>
                <Col xs={24} lg={10}>
                    <Card
                        bordered={false}
                        title={<Title level={5} style={{ color: TEXT_DARK, margin: 0 }}>Status Distribution</Title>}
                        style={{
                            borderRadius: '20px',
                            boxShadow: '0px 18px 40px rgba(112, 144, 176, 0.12)',
                            height: '100%'
                        }}
                    >
                        {hasChartData ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={chartData.filter(d => d.value > 0)}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                >
                                    {chartData.filter(d => d.value > 0).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    itemStyle={{ color: TEXT_DARK }}
                                />
                                <Legend
                                    content={() => {
                                        return (
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', paddingTop: '20px', flexWrap: 'wrap' }}>
                                                {chartData.map((entry, index) => (
                                                    <div key={`legend-${index}`} style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: TEXT_GRAY }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, marginRight: 8 }}></div>
                                                        <span>{entry.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: TEXT_GRAY }}>
                                <FileTextOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
                                <Text style={{ color: TEXT_GRAY }}>No contracts yet</Text>
                            </div>
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={14}>
                    <Card
                        bordered={false}
                        title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Title level={5} style={{ color: TEXT_DARK, margin: 0 }}>Recent Activity (New Contracts)</Title>
                                <div style={{
                                    background: '#F4F7FE',
                                    padding: '6px',
                                    borderRadius: '10px',
                                    color: BRAND_BLUE
                                }}>
                                    <BarChartOutlined />
                                </div>
                            </div>
                        }
                        style={{
                            borderRadius: '20px',
                            boxShadow: '0px 18px 40px rgba(112, 144, 176, 0.12)',
                            height: '100%'
                        }}
                        bodyStyle={{ padding: '0 24px 24px' }}
                    >
                        <Table
                            dataSource={stats.recentContracts || []}
                            columns={activityColumns}
                            pagination={false}
                            rowKey="id"
                            size="middle"
                            className="horizon-table"
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default DashboardPage;
