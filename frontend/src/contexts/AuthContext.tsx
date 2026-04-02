import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '../services/api';

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

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    isAuthenticated: boolean;
    isAdmin: boolean;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing token on mount
        const storedToken = localStorage.getItem('jwt_token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            // Validate token expiry before restoring session
            try {
                // JWT payload is base64-encoded in the second segment
                const payloadBase64 = storedToken.split('.')[1];
                const payload = JSON.parse(atob(payloadBase64));
                const isExpired = payload.exp && Date.now() / 1000 > payload.exp;

                if (isExpired) {
                    // Token expired – clear stale session silently
                    localStorage.removeItem('jwt_token');
                    localStorage.removeItem('user');
                } else {
                    setToken(storedToken);
                    setUser(JSON.parse(storedUser));
                }
            } catch {
                // Malformed token – clear and force re-login
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (username: string, password: string) => {
        try {
            const response = await apiClient.post('/auth/login', { username, password });
            const { access_token, user: userData } = response.data;

            setToken(access_token);
            setUser(userData);

            localStorage.setItem('jwt_token', access_token);
            localStorage.setItem('user', JSON.stringify(userData));
        } catch (error: any) {
            throw new Error(error.response?.data?.detail || error || 'Login failed');
        }
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user');
    };

    const refreshUser = async () => {
        try {
            const response = await apiClient.get('/auth/me');
            const userData = response.data;
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
        } catch (error: any) {
            if (error.response?.status === 401) {
                // Token is invalid/expired – force logout
                setToken(null);
                setUser(null);
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('user');
                // Redirect to login if not already there (the 401 interceptor also handles this,
                // but we do it explicitly here as a safety net)
            } else {
                console.error('Failed to refresh user data:', error);
            }
        }
    };

    const value: AuthContextType = {
        user,
        token,
        login,
        logout,
        refreshUser,
        isAuthenticated: !!token,
        isAdmin: user?.role === 'admin',
        loading
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
