import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await login(username, password);
            navigate('/dashboard');
        } catch (error: any) {
            console.error('Login failed:', error);
            setError(error.message || 'Invalid username or password');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialLogin = (provider: string) => {
        console.log('[v0] Social login with:', provider);
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                backgroundImage: "url('/images/gradient-background.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Dark overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.15)',
                    pointerEvents: 'none',
                }}
            />

            {/* Floating glass orbs */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div
                    className="animate-pulse"
                    style={{
                        position: 'absolute',
                        top: '25%',
                        left: '25%',
                        width: '128px',
                        height: '128px',
                        borderRadius: '50%',
                        opacity: 0.5,
                        background: 'rgba(255, 255, 255, 0.15)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: '0 8px 32px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                    }}
                />
                <div
                    className="animate-pulse"
                    style={{
                        position: 'absolute',
                        top: '75%',
                        right: '25%',
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        opacity: 0.4,
                        background: 'rgba(255, 255, 255, 0.15)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: '0 8px 32px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                        animationDelay: '1s',
                    }}
                />
                <div
                    className="animate-pulse"
                    style={{
                        position: 'absolute',
                        top: '50%',
                        right: '33%',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        opacity: 0.45,
                        background: 'rgba(255, 255, 255, 0.15)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: '0 8px 32px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                        animationDelay: '0.5s',
                    }}
                />
            </div>

            {/* Login Card */}
            <div
                className="glass-effect hover-lift"
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    position: 'relative',
                    zIndex: 10,
                    background: 'rgba(255, 255, 255, 0.25)',
                    backdropFilter: 'blur(40px) saturate(250%)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '24px',
                    boxShadow: '0 32px 80px rgba(0, 0, 0, 0.3), 0 16px 64px rgba(255, 255, 255, 0.2), inset 0 3px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.3)',
                }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', padding: '48px 40px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h1 style={{
                        fontSize: '32px',
                        fontWeight: 'bold',
                        margin: 0,
                        color: 'rgba(60, 60, 60, 0.9)',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}>
                        Welcome Back
                    </h1>
                    <p style={{
                        margin: 0,
                        color: 'rgba(60, 60, 60, 0.7)',
                        fontSize: '15px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}>
                        Sign in to your account to continue
                    </p>
                </div>

                {/* Form */}
                <div style={{ padding: '0 40px 48px' }}>
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Username Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label
                                htmlFor="username"
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(60, 60, 60, 0.9)',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                }}
                            >
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.4)',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: 'rgba(60, 60, 60, 0.9)',
                                    fontSize: '14px',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                }}
                                onFocus={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                                    e.target.style.borderColor = '#0C115B';
                                }}
                                onBlur={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                                }}
                                required
                            />
                            {error && (
                                <p style={{ color: '#ff4d4f', fontSize: '13px', margin: 0 }}>
                                    {error}
                                </p>
                            )}
                        </div>

                        {/* Password Field */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label
                                htmlFor="password"
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(60, 60, 60, 0.9)',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                }}
                            >
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.4)',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: 'rgba(60, 60, 60, 0.9)',
                                    fontSize: '14px',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                }}
                                onFocus={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                                    e.target.style.borderColor = '#0C115B';
                                }}
                                onBlur={(e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                                }}
                                required
                            />
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            className="ripple-effect hover-lift"
                            style={{
                                width: '100%',
                                padding: '16px',
                                marginTop: '8px',
                                borderRadius: '12px',
                                border: 'none',
                                backgroundColor: '#0C115B',
                                color: 'white',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                opacity: isLoading ? 0.7 : 1,
                                transition: 'all 0.3s',
                            }}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div style={{ position: 'relative', marginTop: '32px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', fontSize: '12px', textTransform: 'uppercase' }}>
                            <span style={{
                                padding: '0 8px',
                                color: 'rgba(60, 60, 60, 0.6)',
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                            }}>
                                Or continue with
                            </span>
                        </div>
                    </div>

                    {/* Social Login Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            onClick={() => handleSocialLogin('Google')}
                            className="hover-lift"
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'rgba(60, 60, 60, 0.9)',
                                fontSize: '14px',
                                fontWeight: 500,
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.3s',
                            }}
                        >
                            <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 2.43-4.53 6.16-4.53z" />
                            </svg>
                            Continue with Google
                        </button>

                        <button
                            onClick={() => handleSocialLogin('Microsoft')}
                            className="hover-lift"
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'rgba(60, 60, 60, 0.9)',
                                fontSize: '14px',
                                fontWeight: 500,
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.3s',
                            }}
                        >
                            <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 23 23">
                                <path fill="#f25022" d="M0 0h11v11H0z" />
                                <path fill="#00a4ef" d="M12 0h11v11H12z" />
                                <path fill="#7fba00" d="M0 12h11v11H0z" />
                                <path fill="#ffb900" d="M12 12h11v11H12z" />
                            </svg>
                            Continue with Microsoft
                        </button>
                    </div>

                    {/* Forgot Password Link */}
                    <div style={{ textAlign: 'center', marginTop: '24px' }}>
                        <a
                            href="#"
                            style={{
                                fontSize: '14px',
                                color: 'rgba(60, 60, 60, 0.7)',
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                textDecoration: 'none',
                                transition: 'color 0.3s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'rgba(60, 60, 60, 0.9)';
                                e.currentTarget.style.textDecoration = 'underline';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgba(60, 60, 60, 0.7)';
                                e.currentTarget.style.textDecoration = 'none';
                            }}
                        >
                            Forgot your password?
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
