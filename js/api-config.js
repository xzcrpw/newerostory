// js/api-config.js

const API_BASE_URL = 'http://localhost:5000/api'; // Базовий URL нашого майбутнього API

// Розширена конфігурація для API
window.apiConfig = {
    baseUrl: API_BASE_URL,
    
    // Налаштування запитів
    requestDefaults: {
        timeout: 30000, // 30 секунд максимум на запит
        retryAttempts: 3, // Кількість автоматичних спроб при помилці мережі
        retryDelay: 1000, // Початкова затримка перед повторною спробою (ms)
    },
    
    // Ендпоінти API
    endpoints: {
        // Автентифікація
        login: '/auth/login',
        register: '/auth/register',
        forgotPassword: '/auth/forgot-password',
        resetPassword: '/auth/reset-password',
        googleLogin: '/auth/google',
        
        // Користувачі
        currentUser: '/users/me',
        updateUser: '/users/me',
        changePassword: '/users/me/password',
        getUserBookmarks: '/users/me/bookmarks',
        getUserFollowing: '/users/me/following',
        toggleBookmark: (storyId) => `/stories/${storyId}/bookmark`,
        toggleFollow: (authorId) => `/authors/${authorId}/follow`,
        
        // Історії
        stories: '/stories',
        storyById: (id) => `/stories/${id}`,
        likeStory: (id) => `/stories/${id}/like`,
        rateStory: (id) => `/stories/${id}/rate`,
        
        // Автори
        authors: '/authors',
        authorById: (id) => `/authors/${id}`,
        authorStories: (id) => `/authors/${id}/stories`,
        
        // Категорії
        categories: '/categories',
        categoryBySlug: (slug) => `/categories/${slug}`,
        subscribeCategory: (slug) => `/categories/${slug}/subscribe`,
        
        // Коментарі
        commentsByStory: (storyId) => `/stories/${storyId}/comments`,
        likeComment: (id) => `/comments/${id}/like`,
        
        // Преміум
        getPlans: '/premium/plans',
        getCurrentSubscription: '/premium/subscription',
        validateCoupon: '/premium/validate-coupon',
        createSubscription: '/premium/subscribe',
        cancelSubscription: '/premium/subscription',
        
        // Контакт
        contact: '/contact'
    }
};

// Налаштування для різних середовищ
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Running in development environment');
    // Налаштування для локальної розробки
    window.apiConfig.devMode = true;
} else if (window.location.hostname.includes('staging')) {
    // Налаштування для тестового середовища
    window.apiConfig.baseUrl = 'https://api-staging.taemnysvit.com/api';
} else if (window.location.hostname.includes('taemnysvit.com')) {
    // Налаштування для продакшну
    window.apiConfig.baseUrl = 'https://api.taemnysvit.com/api';
    window.apiConfig.devMode = false;
}

console.log('API Config Loaded:', window.apiConfig);