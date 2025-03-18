// components/GoogleLoginButton.js
import React from 'react';
import { useLanguage } from '../hooks/useLanguage';

const GoogleLoginButton = () => {
    const { t } = useLanguage();

    const handleClick = () => {
        // Перенаправлення на API-ендпоінт для автентифікації через Google
        window.location.href = `${process.env.REACT_APP_API_URL}/api/auth/google`;
    };

    return (
        <button
            className="social-btn google-btn"
            onClick={handleClick}
        >
            <i className="fab fa-google"></i> {t('login.loginWithGoogle')}
        </button>
    );
};

export default GoogleLoginButton;