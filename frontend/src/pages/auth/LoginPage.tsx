import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginPage.css';



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
        } catch (err: any) {
            console.error('Login failed:', err);
            setError(err.message || 'Invalid username or password');
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <div className="login-page">
            <div className="login-page__ambient login-page__ambient--primary" />
            <div className="login-page__ambient login-page__ambient--secondary" />

            <div className="login-shell">
                <section className="login-showcase">
                    <div className="login-brand">
                        <div className="login-brand__mark">D</div>
                        <div className="login-brand__copy">
                            <span className="login-brand__name">DocuMind</span>
                            <span className="login-brand__tag">Legal Intelligence</span>
                        </div>
                    </div>

                    <div className="login-showcase__content">
                        <span className="login-showcase__eyebrow">Legal Intelligence</span>
                        <h1 className="login-showcase__title">DocuMind</h1>
                    </div>

                    <div className="login-showcase__stats">
                        <article className="login-stat-card">
                            <span className="login-stat-card__label">Review Flow</span>
                            <strong className="login-stat-card__value">01</strong>
                        </article>

                        <article className="login-stat-card">
                            <span className="login-stat-card__label">Team Signal</span>
                            <strong className="login-stat-card__value">24/7</strong>
                        </article>
                    </div>
                </section>

                <section className="login-panel">
                    <div className="login-panel__header">
                        <span className="login-panel__eyebrow">Sign in</span>
                        <h2 className="login-panel__title">Welcome back</h2>
                    </div>

                    <form className="login-form" onSubmit={handleLogin}>
                        {error && (
                            <div className="login-error" role="alert" aria-live="polite">
                                {error}
                            </div>
                        )}

                        <div className="login-field">
                            <label className="login-field__label" htmlFor="username">
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                placeholder="Enter your username"
                                autoComplete="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="login-field__input"
                                required
                            />
                        </div>

                        <div className="login-field">
                            <div className="login-field__header">
                                <label className="login-field__label" htmlFor="password">
                                    Password
                                </label>
                            </div>
                            <input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="login-field__input"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="login-submit"
                            disabled={isLoading}
                        >
                            <span>{isLoading ? 'Signing in...' : 'Sign in to workspace'}</span>
                        </button>
                    </form>


                </section>
            </div>
        </div>
    );
};

export default LoginPage;
