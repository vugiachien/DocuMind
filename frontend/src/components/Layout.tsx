import React, { ReactNode, useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Typography, Input, Badge, Button } from 'antd';
import {
    AppstoreOutlined,
    FileTextOutlined,
    BookOutlined,
    LogoutOutlined,
    SearchOutlined,
    BellOutlined,
    SettingOutlined,
    TagsOutlined,
    TeamOutlined,
    UserOutlined,
    ApartmentOutlined,
    DeleteOutlined,
    SecurityScanOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const { Header, Sider, Content } = AntLayout;
const { Title } = Typography;

// Horizon UI Brand Colors (kept for JSX dynamic values only)
const BRAND_BLUE = '#4318FF';

const TEXT_GRAY = '#707EAE';
const TEXT_DARK = '#2B3674';
const BG_LIGHT_GRAY = '#F4F7FE';
const WHITE = '#FFFFFF';

interface LayoutProps {
    children: ReactNode;
}

// Notification Dropdown Component
import { useNotifications } from '../contexts/NotificationContext';
import { Dropdown, Divider, Tooltip } from 'antd';
import {
    CheckCircleFilled,
    CloseCircleFilled,
    InfoCircleFilled,
    WarningFilled,
    ClockCircleOutlined,
    InboxOutlined
} from '@ant-design/icons';
import { Notification } from '../services/notificationService';

// Relative time helper
const getRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay < 7) return `${diffDay} ngày trước`;
    return date.toLocaleDateString('vi-VN');
};

// Type icon/color mapping
const getNotifIcon = (type: string) => {
    switch (type) {
        case 'success':
            return <CheckCircleFilled className="notif-icon notif-icon--success" />;
        case 'error':
            return <CloseCircleFilled className="notif-icon notif-icon--error" />;
        case 'warning':
            return <WarningFilled className="notif-icon notif-icon--warning" />;
        default:
            return <InfoCircleFilled className="notif-icon notif-icon--info" />;
    }
};

// Sanitize error messages for end users
const sanitizeMessage = (msg: string, type: string): string => {
    if (type !== 'error') return msg;
    // Hide stack traces & internal errors — show friendly Vietnamese message
    if (msg.includes('Traceback') || msg.includes('is not defined') || msg.includes('Error:') || msg.includes('Exception')) {
        return 'Phân tích thất bại do lỗi hệ thống. Vui lòng thử lại.';
    }
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Timeout')) {
        return 'Phân tích bị timeout. Vui lòng thử lại với file nhỏ hơn.';
    }
    return msg.length > 150 ? msg.substring(0, 147) + '...' : msg;
};

const NotificationList = ({ navigate }: { navigate: ReturnType<typeof useNavigate> }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

    const menu = (
        <div className="notif-dropdown">
            {/* Header */}
            <div className="notif-header">
                <div className="notif-header-left">
                    <h4>Thông báo</h4>
                    {unreadCount > 0 && (
                        <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                </div>
                {unreadCount > 0 && (
                    <button className="notif-mark-all-btn" onClick={() => markAllAsRead()}>
                        Đọc tất cả
                    </button>
                )}
            </div>

            {/* Body */}
            <div className="notif-body">
                {notifications.length === 0 ? (
                    <div className="notif-empty">
                        <InboxOutlined className="notif-empty-icon" />
                        <p>Không có thông báo</p>
                    </div>
                ) : (
                    notifications.map((item: Notification) => (
                        <div
                            key={item.id}
                            className={`notif-item ${item.isRead ? 'notif-item--read' : 'notif-item--unread'}`}
                            onClick={() => {
                                if (!item.isRead) markAsRead(item.id);
                                if (item.link) navigate(item.link);
                            }}
                        >
                            <div className="notif-item-icon">
                                {getNotifIcon(item.type)}
                            </div>
                            <div className="notif-item-content">
                                <div className="notif-item-title">
                                    <span className={item.isRead ? '' : 'notif-item-title--bold'}>
                                        {item.title}
                                    </span>
                                </div>
                                <div className="notif-item-msg">
                                    {sanitizeMessage(item.message, item.type)}
                                </div>
                                <div className="notif-item-time">
                                    <ClockCircleOutlined />
                                    <Tooltip title={new Date(item.createdAt.endsWith('Z') ? item.createdAt : `${item.createdAt}Z`).toLocaleString('vi-VN')}>
                                        <span>{getRelativeTime(item.createdAt)}</span>
                                    </Tooltip>
                                </div>
                            </div>
                            {!item.isRead && (
                                <Tooltip title="Đánh dấu đã đọc">
                                    <div
                                        className="notif-unread-dot"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            markAsRead(item.id);
                                        }}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return menu;
};

// User Profile Dropdown Component
interface User {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    role: string;
    is_active: boolean;
    avatar_url?: string;
    department?: {
        id: string;
        name: string;
    };
    analyze_limit?: number | null;
    analyze_count: number;
}

const UserProfileDropdown = ({
    user,
    logout,
    navigate
}: {
    user: User | null;
    logout: () => void;
    navigate: ReturnType<typeof useNavigate>
}) => {
    const menu = (
        <div className="user-dropdown">
            {/* User Info Section with Avatar */}
            <div className="user-dropdown-info">
                <Avatar
                    src={user?.avatar_url}
                    className="user-dropdown-avatar"
                    size={48}
                >
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <div className="user-dropdown-meta">
                    <div className="user-dropdown-name">
                        {user?.full_name ? `${user.full_name} (${user.username})` : (user?.username || 'User')}
                    </div>
                    <div className="user-dropdown-email">
                        {user?.email || ''}
                    </div>
                </div>
            </div>

            {/* Divider */}
            <Divider style={{ margin: '8px 0' }} />

            {/* Menu Items */}
            <Button
                type="text"
                icon={<SecurityScanOutlined />}
                onClick={() => { navigate('/settings/information'); }}
                className="user-dropdown-btn"
            >
                Information & Security
            </Button>

            <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => { navigate('/settings'); }}
                className="user-dropdown-btn"
            >
                Setting
            </Button>

            {/* Divider */}
            <Divider style={{ margin: '8px 0' }} />

            {/* Logout Button */}
            <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={() => { logout(); navigate('/login'); }}
                className="user-dropdown-btn--logout"
            >
                Sign out
            </Button>
        </div>
    );

    return menu;
};

const AppLayout: React.FC<LayoutProps> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, isAdmin } = useAuth();
    const { unreadCount } = useNotifications();
    const [collapsed, setCollapsed] = useState(false);

    const menuItems = [
        {
            key: '/dashboard',
            icon: <AppstoreOutlined style={{ fontSize: '18px' }} />,
            label: 'Overview',
        },
        {
            key: '/contracts',
            icon: <FileTextOutlined style={{ fontSize: '18px' }} />,
            label: 'Contract Management',
        },
        // Visible to ALL authenticated users (read-only for non-admin)
        {
            key: '/library',
            icon: <BookOutlined style={{ fontSize: '18px' }} />,
            label: 'Library',
        },
        {
            key: '/contract-types',
            icon: <TagsOutlined style={{ fontSize: '18px' }} />,
            label: 'Contract Type',
        },
        // Admin-only management menus
        ...(isAdmin ? [
            {
                key: '/partners',
                icon: <TeamOutlined style={{ fontSize: '18px' }} />,
                label: 'Partner Management',
            },
            {
                key: '/users',
                icon: <UserOutlined style={{ fontSize: '18px' }} />,
                label: 'User Management'
            },
            {
                key: '/departments',
                icon: <ApartmentOutlined style={{ fontSize: '18px' }} />,
                label: 'Department'
            },
            {
                key: '/deleted-contracts',
                icon: <DeleteOutlined style={{ fontSize: '18px' }} />,
                label: 'Deleted Contracts'
            }
        ] : [])
    ];

    const getPageTitle = (path: string) => {
        if (path.includes('/dashboard')) return 'Overview';
        if (path.includes('/deleted-contracts')) return 'Deleted Contracts';
        if (path.includes('/contracts')) return 'Contract Management';
        if (path.includes('/library')) return 'Library';
        if (path.includes('/contract-types')) return 'Contract Types';
        if (path.includes('/partners')) return 'Partner Management';
        if (path.includes('/departments')) return 'Department Management';
        return 'Dashboard';
    };

    return (
        <AntLayout style={{ minHeight: '100vh', backgroundColor: BG_LIGHT_GRAY }}>
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                width={250}
                className="layout-sider"
            >
                <div className={`layout-logo-container ${collapsed ? 'layout-logo-container--collapsed' : ''}`}>
                    <div className={`layout-logo-wrap ${collapsed ? 'layout-logo-wrap--collapsed' : ''}`}>
                        <div className="layout-logo-icon">S</div>
                        {!collapsed && (
                            <Title level={4} style={{ margin: 0, color: TEXT_DARK, fontFamily: 'sans-serif' }}>
                                Smart<span className="layout-brand-light">Contract</span>
                            </Title>
                        )}
                    </div>
                </div>

                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    onClick={({ key }) => navigate(key)}
                    style={{ borderRight: 'none', padding: '0 12px' }}
                    items={menuItems.map(item => ({
                        ...item,
                        style: {
                            borderRadius: '8px',
                            marginBottom: '8px',
                            color: location.pathname === item.key ? WHITE : TEXT_GRAY,
                            background: location.pathname === item.key ? BRAND_BLUE : 'transparent',
                            fontWeight: location.pathname === item.key ? 600 : 500,
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center'
                        }
                    }))}
                />

            </Sider>

            <AntLayout style={{
                marginLeft: collapsed ? 80 : 250,
                transition: 'all 0.2s',
                backgroundColor: BG_LIGHT_GRAY
            }}>
                <Header className="layout-header">
                    <div className="layout-header-left">
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(!collapsed)}
                            className="layout-collapse-btn"
                        />
                        <Title level={2} style={{ margin: 0, color: TEXT_DARK, fontSize: '28px', fontWeight: 700 }}>
                            {getPageTitle(location.pathname)}
                        </Title>
                    </div>

                    <div className="layout-header-right">
                        <Input
                            prefix={<SearchOutlined style={{ color: TEXT_DARK }} />}
                            placeholder="Search..."
                            bordered={false}
                            className="layout-search-input"
                        />

                        {/* Notification Bell Dropdown */}
                        <Dropdown dropdownRender={() => <NotificationList navigate={navigate} />} trigger={['click']} placement="bottomRight" arrow>
                            <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 2]}>
                                <BellOutlined style={{ fontSize: '20px', color: TEXT_GRAY, cursor: 'pointer' }} />
                            </Badge>
                        </Dropdown>

                        <SettingOutlined style={{ fontSize: '20px', color: TEXT_GRAY, cursor: 'pointer' }} />
                        <Dropdown
                            dropdownRender={() => <UserProfileDropdown user={user} logout={logout} navigate={navigate} />}
                            trigger={['click']}
                            placement="bottomRight"
                            arrow
                        >
                            <Avatar
                                src={user?.avatar_url}
                                className="layout-avatar"
                                size="large"
                            >
                                {user?.username?.[0]?.toUpperCase() || 'U'}
                            </Avatar>
                        </Dropdown>
                    </div>
                </Header>

                <Content style={{ padding: '0 32px 32px', minHeight: 280, backgroundColor: 'transparent' }}>
                    {children}
                </Content>
            </AntLayout>
        </AntLayout>
    );
};

export default AppLayout;
