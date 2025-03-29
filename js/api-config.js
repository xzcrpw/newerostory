// js/api-config.js

const API_BASE_URL = 'http://localhost:5000/api'; // Базовий URL нашого майбутнього API (змінимо на реальний URL пізніше)

window.apiConfig = {
    baseUrl: API_BASE_URL,
    endpoints: {
        // Автентифікація
        login: '/auth/login',
        register: '/auth/register',
        logout: '/auth/logout', // Можливо, не знадобиться, якщо вихід через видалення токену
        forgotPassword: '/auth/forgot-password',
        resetPassword: '/auth/reset-password',
        googleLogin: '/auth/google', // URL для ініціації Google OAuth

        // Користувач
        currentUser: '/users/me', // Отримати дані поточного користувача
        updateUser: '/users/me', // Оновити профіль
        changePassword: '/users/me/password', // Змінити пароль
        getUserBookmarks: '/users/me/bookmarks', // Отримати закладки
        toggleBookmark: (storyId) => `/users/me/bookmarks/${storyId}`, // Додати/видалити закладку
        getUserFollowing: '/users/me/following', // Отримати підписки на авторів
        toggleFollow: (authorId) => `/users/me/following/${authorId}`, // Підписатись/відписатись

        // Історії
        stories: '/stories', // GET (список), POST (створити)
        storyById: (storyId) => `/stories/${storyId}`, // GET, PUT, DELETE
        likeStory: (storyId) => `/stories/${storyId}/like`, // POST (лайк/анлайк)
        rateStory: (storyId) => `/stories/${storyId}/rate`, // POST (оцінка)

        // Автори
        authors: '/authors',
        authorById: (authorId) => `/authors/${authorId}`,
        authorStories: (authorId) => `/authors/${authorId}/stories`,

        // Категорії
        categories: '/categories',
        categoryBySlug: (slug) => `/categories/${slug}`,
        subscribeCategory: (slug) => `/categories/${slug}/subscribe`, // POST (підписка/відписка)

        // Коментарі
        commentsByStory: (storyId) => `/stories/${storyId}/comments`, // GET, POST
        likeComment: (commentId) => `/comments/${commentId}/like`, // POST (лайк/анлайк)

        // Преміум
        getPlans: '/premium/plans', // GET - Отримати список планів
        getCurrentSubscription: '/premium/subscription', // GET - Отримати поточну підписку користувача (або через /users/me)
        validateCoupon: '/premium/coupons/validate', // POST { code: '...', planId: '...' } - Перевірити промокод
        createSubscription: '/premium/subscribe', // POST (з даними платежу або ID транзакції)
        cancelSubscription: '/premium/subscription', // DELETE (або /premium/subscribe)

        // Контактна форма
        contact: '/contact', // POST

        // Переклад
        translate: '/translate' // POST { text: "...", targetLanguage: "en" }
    }
};

console.log('API Config Loaded:', window.apiConfig);