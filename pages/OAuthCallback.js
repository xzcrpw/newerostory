// pages/OAuthCallback.js
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const OAuthCallback = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const { setToken } = useAuth();

    useEffect(() => {
        // Отримання токена з URL-параметрів
        const params = new URLSearchParams(search);
        const token = params.get('token');

        if (token) {
            // Збереження токена
            setToken(token);

            // Перенаправлення на головну сторінку
            navigate('/');
        } else {
            // Якщо токена немає, перенаправлення на сторінку входу
            navigate('/login');
        }
    }, [search, setToken, navigate]);

    return (
        <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Авторизація...</p>
        </div>
    );
};

export default OAuthCallback;