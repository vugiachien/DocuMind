import api from './api';

export interface Notification {
    id: string;
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    isRead: boolean;
    createdAt: string;
    link?: string;
    payload?: any; // Extra metadata for optimistic UI
}

const notificationService = {
    getNotifications: async (skip = 0, limit = 20, unreadOnly = false) => {
        const response = await api.get('/notifications/', {
            params: { skip, limit, unread_only: unreadOnly },
        });
        return response.data;
    },

    markAsRead: async (id: string) => {
        const response = await api.post(`/notifications/${id}/read`);
        return response.data;
    },

    markAllAsRead: async () => {
        const response = await api.post('/notifications/read-all');
        return response.data;
    },
};

export default notificationService;
