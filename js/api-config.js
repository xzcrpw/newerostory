// --- START OF FILE api-config.js ---
window.apiConfig = {
    baseUrl: '/api', // Залишаємо відносним
    devMode: false,
    requestDefaults: { timeout: 30000, retryAttempts: 2, retryDelay: 1500 },
    endpoints: {
        // Автентифікація
        login: '/v1/auth/login',
        register: '/v1/auth/register',
        forgotPassword: '/v1/auth/forgot-password',
        resetPassword: '/v1/auth/reset-password', // Токен додається в URL
        googleLogin: '/v1/auth/google', // Шлях для ініціації

        // Користувачі
        currentUser: '/v1/users/me',
        updateUser: '/v1/users/me', // Для PATCH /updateMe
        changePassword: '/v1/users/updateMyPassword',
        getUserBookmarks: '/v1/users/bookmarks',
        getUserFollowing: '/v1/users/following',
        toggleBookmark: (storyId) => `/v1/users/bookmarks/${storyId}`,
        toggleFollow: (authorId) => `/v1/users/follow/${authorId}`,
        checkFollowStatus: (authorId) => `/v1/users/following/${authorId}/status`,
        getStoryInteractionStatus: (storyId) => `/v1/users/stories/${storyId}/interaction-status`,

        // Історії
        stories: '/v1/stories',
        storyById: (id) => `/v1/stories/${id}`,
        createStory: '/v1/stories',
        updateStory: (id) => `/v1/stories/${id}`,
        deleteStory: (id) => `/v1/stories/${id}`,
        getRelatedStories: (id) => `/v1/stories/${id}/related`,
        rateStory: (storyId) => `/v1/stories/${storyId}/rate`,

        // Автори (Припускаємо шляхи, треба буде додати роути на бекенді)
        authors: '/v1/authors',
        authorById: (id) => `/v1/authors/${id}`,
        authorStories: (id) => `/v1/authors/${id}/stories`,

        // Категорії
        categories: '/v1/categories',
        categoryBySlug: (slug) => `/v1/categories/${slug}`,
        getCategoryStatus: (slug) => `/v1/categories/${slug}/status`,
        toggleFavoriteCategory: (slug) => `/v1/categories/${slug}/favorite`,
        subscribeCategory: (slug) => `/v1/categories/${slug}/subscribe`,

        // Теги
        tags: '/v1/tags',
        popularTags: '/v1/tags/popular', // Можливо, варто додати на бекенд
        tagBySlug: (slug) => `/v1/tags/${slug}`,

        // Коментарі
        commentsByStory: (storyId) => `/v1/stories/${storyId}/comments`,
        createComment: (storyId) => `/v1/stories/${storyId}/comments`,
        updateComment: (commentId) => `/v1/comments/${commentId}`, // Використовує окремий роут
        deleteComment: (commentId) => `/v1/comments/${commentId}`, // Використовує окремий роут
        getCommentLikeStatuses: (storyId) => `/v1/stories/${storyId}/comments/like-statuses`, // Уточнено шлях

        // Лайки
        toggleLike: '/v1/likes/toggle',

        // Преміум
        getPlans: '/v1/premium/plans',
        getCurrentSubscription: '/v1/premium/subscription',
        validateCoupon: '/v1/premium/validate-coupon',
        createSubscription: '/v1/premium/subscribe',
        cancelSubscription: '/v1/premium/subscription', // DELETE

        // Контакт
        contact: '/v1/contact', // TODO: Перевірити/реалізувати

        // Переклад
        translateText: '/v1/translate', // TODO: Перевірити/реалізувати

        // Звіти
        reports: '/v1/reports',

        // Адмінка
        adminDashboard: '/v1/admin/dashboard',
        adminPendingStories: '/v1/admin/stories/pending',
        adminApproveStory: (id) => `/v1/admin/stories/${id}/approve`,
        adminRejectStory: (id) => `/v1/admin/stories/${id}/reject`,
        adminPendingComments: '/v1/admin/comments/pending',
        adminApproveComment: (id) => `/v1/admin/comments/${id}/approve`,
        adminRejectComment: (id) => `/v1/admin/comments/${id}/reject`,
        adminSettings: '/v1/admin/settings',
    }
};

// Налаштування для різних середовищ
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Running in development environment');
    // Вказуємо повний шлях до бекенду для розробки
    window.apiConfig.baseUrl = 'http://localhost:5000/api';
    window.apiConfig.devMode = true;
} else if (window.location.hostname.includes('staging')) {
    window.apiConfig.baseUrl = 'https://api-staging.erostory.world/api'; // Приклад
    window.apiConfig.devMode = false;
} else if (window.location.hostname.includes('erostory.world')) { // Продакшен домен
    window.apiConfig.baseUrl = '/api'; // Використовуємо відносний шлях
    window.apiConfig.devMode = false;
}

console.log('API Config Loaded:', window.apiConfig);
// --- END OF FILE api-config.js ---