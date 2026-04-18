import apiClient from './api';
import { User } from '../types/types';

const userService = {
    async searchUsers(query: string): Promise<User[]> {
        const response = await apiClient.get('/users/search', { params: { q: query } });
        return response.data;
    }
};

export default userService;
