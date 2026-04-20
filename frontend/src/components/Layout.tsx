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
    MenuFoldOutlined,
    MenuUnfoldOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const { Header, Sider, Content } = AntLayout;
const { Title } = Typography;

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
    department?: {
        id: string;
        name: string;
    };
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
    const [collapsed, setCollapsed] = useState(
        () => (typeof window !== 'undefined' ? window.innerWidth < 1200 : false)
    );

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

    const getSelectedMenuKey = (path: string) => {
        if (path.startsWith('/dashboard')) return '/dashboard';
        if (path.startsWith('/contracts')) return '/contracts';
        if (path.startsWith('/library')) return '/library';
        if (path.startsWith('/contract-types')) return '/contract-types';
        if (path.startsWith('/partners')) return '/partners';
        if (path.startsWith('/users')) return '/users';
        if (path.startsWith('/departments')) return '/departments';
        if (path.startsWith('/deleted-contracts')) return '/deleted-contracts';
        return '/dashboard';
    };

    return (
        <AntLayout className="layout-shell">
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                width={250}
                className="layout-sider"
            >
                <div className={`layout-logo-container ${collapsed ? 'layout-logo-container--collapsed' : ''}`}>
                    <div className={`layout-logo-wrap ${collapsed ? 'layout-logo-wrap--collapsed' : ''}`}>
                        <div className="layout-logo-icon">D</div>
                        {!collapsed && (
                            <div className="layout-brand-block">
                                <Title level={4} className="layout-brand-title">
                                    DocuMind
                                </Title>
                                <span className="layout-brand-subtitle">Legal Intelligence</span>
                            </div>
                        )}
                    </div>
                </div>

                <Menu
                    className="layout-nav-menu"
                    mode="inline"
                    selectedKeys={[getSelectedMenuKey(location.pathname)]}
                    onClick={({ key }) => navigate(key)}
                    style={{ borderRight: 'none' }}
                    items={menuItems}
                />

            </Sider>

            <AntLayout
                className="layout-main"
                style={{
                    marginLeft: collapsed ? 80 : 250,
                }}
            >
                <Header className="layout-header">
                    <div className="layout-header-left">
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(!collapsed)}
                            className="layout-collapse-btn"
                        />
                        <div className="layout-page-copy">
                            <span className="layout-page-kicker">Workspace</span>
                            <Title level={2} className="layout-page-title">
                                {getPageTitle(location.pathname)}
                            </Title>
                        </div>
                    </div>

                    <div className="layout-header-right">
                        <Input
                            prefix={<SearchOutlined className="layout-search-icon" />}
                            placeholder="Search agreements, playbooks..."
                            bordered={false}
                            className="layout-search-input"
                        />

                        {/* Notification Bell Dropdown */}
                        <Dropdown dropdownRender={() => <NotificationList navigate={navigate} />} trigger={['click']} placement="bottomRight" arrow>
                            <button type="button" className="layout-header-icon-btn" aria-label="Notifications">
                                <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 2]}>
                                    <BellOutlined className="layout-header-icon" />
                                </Badge>
                            </button>
                        </Dropdown>

                        <button
                            type="button"
                            className="layout-header-icon-btn"
                            aria-label="Settings"
                            onClick={() => navigate('/settings')}
                        >
                            <SettingOutlined className="layout-header-icon" />
                        </button>
                        <Dropdown
                            dropdownRender={() => <UserProfileDropdown user={user} logout={logout} navigate={navigate} />}
                            trigger={['click']}
                            placement="bottomRight"
                            arrow
                        >
                            <button type="button" className="layout-user-trigger" aria-label="User profile">
                                <Avatar
                                    className="layout-avatar"
                                    size="large"
                                >
                                    {user?.username?.[0]?.toUpperCase() || 'U'}
                                </Avatar>
                            </button>
                        </Dropdown>
                    </div>
                </Header>

                <Content className="layout-content">
                    {children}
                </Content>
            </AntLayout>
        </AntLayout>
    );
};

export default AppLayout;
