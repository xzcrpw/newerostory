// pages/Login.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import GoogleLoginButton from '../components/GoogleLoginButton';

const Login = () => {
    const { t } = useLanguage();
    const { login } = useAuth();
    const navigate = useNavigate();

    const [loginData, setLoginData] = useState({
        email: '',
        password: ''
    });

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setLoginData({
            ...loginData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(loginData.email, loginData.password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || t('login.invalidCredentials'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-form">
                <h2 className="auth-title">{t('login.title')}</h2>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">{t('login.email')}</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={loginData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">{t('login.password')}</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={loginData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-options">
                        <div className="remember-me">
                            <input type="checkbox" id="rememberMe" />
                            <label htmlFor="rememberMe">{t('login.rememberMe')}</label>
                        </div>
                        <Link to="/forgot-password">{t('login.forgotPassword')}</Link>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? t('general.loading') : t('general.login')}
                    </button>
                </form>

                <div className="auth-divider">{t('general.or')}</div>

                <div className="social-login">
                    <GoogleLoginButton />
                </div>

                <div className="auth-footer">
                    <p>
                        {t('login.noAccount')} <Link to="/register">{t('register.title')}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;