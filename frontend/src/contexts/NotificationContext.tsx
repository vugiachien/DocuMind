import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { notification as antNotification } from 'antd';
import { useNavigate } from 'react-router-dom';
import notificationService, { Notification } from '../services/notificationService';
import { useAuth } from './AuthContext';

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    refreshNotifications: () => Promise<void>;
    lastNotification: Notification | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, token } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const data = await notificationService.getNotifications(0, 50);
            setNotifications(data);
            setUnreadCount(data.filter((n: Notification) => !n.isRead).length);
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchNotifications();
        } else {
            setNotifications([]);
            setUnreadCount(0);
        }
    }, [user, fetchNotifications]);

    const markAsRead = useCallback(async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n =>
                n.id === id ? { ...n, isRead: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read', error);
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read', error);
        }
    }, []);

    // SSE Connection with automatic reconnection
    useEffect(() => {
        if (!user || !token) return;

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';
        let eventSource: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let reconnectDelay = 1000; // Start at 1s, exponential backoff
        const MAX_RECONNECT_DELAY = 30000;
        let isCancelled = false;

        const connect = () => {
            if (isCancelled) return;

            console.log("🔌 Connecting to SSE Notifications...");
            eventSource = new EventSource(`${API_URL}/notifications/stream?token=${token}`);

            eventSource.onopen = () => {
                console.log("✅ SSE Notifications Connected");
                reconnectDelay = 1000; // Reset backoff on successful connection
            };

            eventSource.onmessage = (event) => {
                try {
                    const parsedData = JSON.parse(event.data);
                    console.log("📩 New SSE Message:", parsedData);

                    const notificationPayload = typeof parsedData === 'string' ? JSON.parse(parsedData) : parsedData;

                    if (notificationPayload.id && notificationPayload.title) {
                        const newNotification: Notification = {
                            ...notificationPayload,
                            isRead: false,
                            createdAt: notificationPayload.createdAt || new Date().toISOString()
                        };

                        setNotifications(prev => [newNotification, ...prev]);
                        setUnreadCount(prev => prev + 1);

                        const isClickable = !!newNotification.link;
                        const toastKey = `open${Date.now()}`;
                        antNotification[newNotification.type || 'info']({
                            key: toastKey,
                            message: newNotification.title,
                            description: newNotification.message,
                            placement: 'topRight',
                            duration: 4,
                            style: {
                                borderRadius: '12px',
                                cursor: isClickable ? 'pointer' : 'default',
                                padding: '16px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            },
                            onClick: () => {
                                if (newNotification.link) {
                                    navigate(newNotification.link);
                                }
                                if (newNotification.id) {
                                    markAsRead(newNotification.id);
                                }
                                antNotification.destroy(toastKey);
                            }
                        });
                    }
                } catch (e) {
                    console.error("Error parsing SSE message:", e);
                }
            };

            eventSource.onerror = () => {
                console.error(`❌ SSE Error — reconnecting in ${reconnectDelay / 1000}s...`);
                eventSource?.close();
                eventSource = null;

                if (!isCancelled) {
                    reconnectTimer = setTimeout(connect, reconnectDelay);
                    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
                }
            };
        };

        connect();

        return () => {
            console.log("🔌 Closing SSE Connection");
            isCancelled = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            eventSource?.close();
        };
    }, [user, token, navigate, markAsRead]);

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            loading,
            markAsRead,
            markAllAsRead,
            refreshNotifications: fetchNotifications,
            lastNotification: notifications.length > 0 ? notifications[0] : null // Expose latest
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
