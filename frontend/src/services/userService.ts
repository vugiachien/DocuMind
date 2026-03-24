import apiClient from './api';
import { User } from '../types/types';

export interface UserUpdateSelf {
    email?: string;
    full_name?: string;
    department_id?: string;
}

export interface ChangePasswordRequest {
    old_password: string;
    new_password: string;
}

export interface Department {
    id: string;
    name: string;
    description?: string;
    created_at: string;
}

const userService = {
    async searchUsers(query: string): Promise<User[]> {
        const response = await apiClient.get('/users/search', { params: { q: query } });
        return response.data;
    },

    async updateMyProfile(data: UserUpdateSelf): Promise<User> {
        const response = await apiClient.put('/auth/me', data);
        return response.data;
    },

    async changePassword(data: ChangePasswordRequest): Promise<{ message: string }> {
        const response = await apiClient.put('/auth/change-password', data);
        return response.data;
    },

    async uploadAvatar(file: File): Promise<{ message: string; avatar_url: string; avatar_path: string }> {
        const formData = new FormData();
        formData.append('file', file);
        
        // Don't set Content-Type header - let browser set it with boundary for FormData
        const response = await apiClient.post('/auth/upload-avatar', formData);
        return response.data;
    },

    async getDepartments(): Promise<Department[]> {
        const response = await apiClient.get('/departments/');
        return response.data;
    }
};

export default userService;
