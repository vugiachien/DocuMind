import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 300000, // 300 seconds (5 minutes)
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => {
        console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || config.params);

        // Add JWT token if available
        const token = localStorage.getItem('jwt_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Don't set Content-Type for FormData - let browser set it with boundary
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => {
        const { method, url } = response.config;
        console.log(`✅ [API Response] ${method?.toUpperCase()} ${url}`, {
            status: response.status,
            data: response.data,
            headers: response.headers
        });
        return response;
    },
    (error) => {
        // Handle common errors
        if (error.response) {
            // Server responded with error status
            const { status, data, config } = error.response;
            console.error(`❌ [API Error] ${config.method?.toUpperCase()} ${config.url}`, {
                status,
                data,
                headers: error.response.headers
            });

            if (status === 401) {
                // Unauthorized - clear stale/expired token and redirect to login
                console.error('Unauthorized access – clearing session and redirecting to login');
                localStorage.removeItem('jwt_token');
                localStorage.removeItem('user');
                // Only redirect if not already on the login page to prevent redirect loops
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login';
                }
            } else if (status === 404) {
                console.error('Resource not found');
            } else if (status >= 500) {
                console.error('Server error');
            }

            // Return the full error object so components can handle specific status codes (e.g., 403, 409)
            return Promise.reject(error);
        } else if (error.request) {
            // Request made but no response
            console.error('⚠️ [API Error] No response received', error.request);
            return Promise.reject(new Error('Unable to connect to server. Please check your connection.'));
        } else {
            // Error setting up request
            console.error('⚠️ [API Error] Request setup failed', error.message);
            return Promise.reject(error);
        }
    }
);

// Helper function to extract error message safely
export const extractErrorMessage = (error: any, fallbackStr: string = 'Operation failed'): string => {
    if (typeof error === 'string') return error;

    // Check if it's an Axios error with response data
    if (error?.response?.data) {
        const data = error.response.data;

        // FastAPI typically returns { "detail": "string" } or { "detail": [{"msg": ...}] }
        if (data.detail) {
            if (typeof data.detail === 'string') {
                return data.detail;
            } else if (Array.isArray(data.detail)) {
                // Return the first validation error message
                return data.detail.map((err: any) => err.msg).join(', ');
            }
        }

        // Sometimes custom endpoints return direct message strings
        if (data.message && typeof data.message === 'string') return data.message;
        if (data.error && typeof data.error === 'string') return data.error;
    }

    // Fallback to standard Error message
    if (error?.message) return error.message;

    return fallbackStr;
};

export default apiClient;
