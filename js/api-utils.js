// api-utils.js - Утиліти для роботи з API
/**
 * Функція для виконання запитів до API
 * @param {string} endpoint - Кінцева точка API
 * @param {string} method - HTTP-метод (GET, POST, PUT, DELETE)
 * @param {object} data - Дані для відправки (для POST, PUT)
 * @param {boolean} requiresAuth - Чи потрібна авторизація
 * @returns {Promise} Проміс з результатом запиту
 */
async function apiRequest(endpoint, method = 'GET', data = null, requiresAuth = false) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: { ...API_CONFIG.HEADERS }
    };

    // Додавання токена авторизації, якщо потрібно
    if (requiresAuth) {
        const token = getAuthToken();
        if (!token) {
            throw new Error('Необхідна авторизація');
        }
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    // Додавання тіла запиту для методів POST і PUT
    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }

    try {
        // Виконання запиту з таймаутом
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Перевищено час очікування запиту')), API_CONFIG.TIMEOUTS.DEFAULT);
        });

        const response = await Promise.race([
            fetch(url, options),
            timeoutPromise
        ]);

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.message || 'Виникла помилка при запиті до API');
        }

        return responseData;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Функція для завантаження файлів на сервер
 * @param {string} endpoint - Кінцева точка API
 * @param {FormData} formData - Дані форми з файлом
 * @returns {Promise} Проміс з результатом запиту
 */
async function uploadFile(endpoint, formData) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    const options = {
        method: 'POST',
        body: formData,
        headers: {}
    };

    // Додавання токена авторизації
    const token = getAuthToken();
    if (!token) {
        throw new Error('Необхідна авторизація для завантаження файлів');
    }
    options.headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(url, options);
        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.message || 'Виникла помилка при завантаженні файлу');
        }

        return responseData;
    } catch (error) {
        console.error('Upload Error:', error);
        throw error;
    }
}

/**
 * Об'єкт з методами для роботи з API аутентифікації
 */
const AuthAPI = {
    /**
     * Реєстрація нового користувача
     * @param {string} username - Ім'я користувача
     * @param {string} email - Електронна пошта
     * @param {string} password - Пароль
     * @returns {Promise} Проміс з результатом запиту
     */
    async register(username, email, password) {
        return apiRequest('/auth/register', 'POST', { username, email, password });
    },

    /**
     * Вхід користувача
     * @param {string} email - Електронна пошта
     * @param {string} password - Пароль
     * @returns {Promise} Проміс з результатом запиту
     */
    async login(email, password) {
        const response = await apiRequest('/auth/login', 'POST', { email, password });

        if (response.success && response.token) {
            setAuthToken(response.token);
            setCurrentUser(response.user);
        }

        return response;
    },

    /**
     * Вихід користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async logout() {
        try {
            await apiRequest('/auth/logout', 'GET', null, true);
        } finally {
            clearAuth();
        }

        return { success: true };
    },

    /**
     * Отримання поточного користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getCurrentUser() {
        return apiRequest('/auth/me', 'GET', null, true);
    }
};

/**
 * Об'єкт з методами для роботи з API історій
 */
const StoriesAPI = {
    /**
     * Отримання списку історій
     * @param {object} params - Параметри запиту (фільтри, сортування тощо)
     * @returns {Promise} Проміс з результатом запиту
     */
    async getStories(params = {}) {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                queryParams.append(key, value);
            }
        });

        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return apiRequest(`/stories${queryString}`);
    },

    /**
     * Отримання однієї історії за ID
     * @param {string} id - ID історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async getStory(id) {
        return apiRequest(`/stories/${id}`);
    },

    /**
     * Створення нової історії
     * @param {object} storyData - Дані історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async createStory(storyData) {
        return apiRequest('/stories', 'POST', storyData, true);
    },

    /**
     * Оновлення історії
     * @param {string} id - ID історії
     * @param {object} storyData - Дані для оновлення
     * @returns {Promise} Проміс з результатом запиту
     */
    async updateStory(id, storyData) {
        return apiRequest(`/stories/${id}`, 'PUT', storyData, true);
    },

    /**
     * Видалення історії
     * @param {string} id - ID історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async deleteStory(id) {
        return apiRequest(`/stories/${id}`, 'DELETE', null, true);
    },

    /**
     * Завантаження зображення для історії
     * @param {string} id - ID історії
     * @param {File} imageFile - Файл зображення
     * @returns {Promise} Проміс з результатом запиту
     */
    async uploadStoryImage(id, imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        return uploadFile(`/stories/${id}/image`, formData);
    },

    /**
     * Оцінка історії
     * @param {string} id - ID історії
     * @param {number} rating - Оцінка (1-5)
     * @returns {Promise} Проміс з результатом запиту
     */
    async rateStory(id, rating) {
        return apiRequest(`/stories/${id}/rate`, 'POST', { rating }, true);
    },

    /**
     * Лайк історії
     * @param {string} id - ID історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async likeStory(id) {
        return apiRequest(`/stories/${id}/like`, 'POST', null, true);
    },

    /**
     * Збереження історії у закладки
     * @param {string} id - ID історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async saveStory(id) {
        return apiRequest(`/stories/${id}/save`, 'POST', null, true);
    },

    /**
     * Отримання історій за категорією
     * @param {string} categoryId - ID категорії
     * @param {object} params - Параметри запиту (фільтри, сортування тощо)
     * @returns {Promise} Проміс з результатом запиту
     */
    async getStoriesByCategory(categoryId, params = {}) {
        const queryParams = new URLSearchParams({ category: categoryId });

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                queryParams.append(key, value);
            }
        });

        return apiRequest(`/stories?${queryParams.toString()}`);
    },

    /**
     * Отримання популярних історій
     * @param {number} limit - Кількість історій
     * @returns {Promise} Проміс з результатом запиту
     */
    async getPopularStories(limit = 6) {
        return apiRequest(`/stories?sort=-views&limit=${limit}`);
    },

    /**
     * Отримання нових історій
     * @param {number} limit - Кількість історій
     * @returns {Promise} Проміс з результатом запиту
     */
    async getNewStories(limit = 6) {
        return apiRequest(`/stories?sort=-createdAt&limit=${limit}`);
    }
};

/**
 * Об'єкт з методами для роботи з API категорій
 */
const CategoriesAPI = {
    /**
     * Отримання всіх категорій
     * @returns {Promise} Проміс з результатом запиту
     */
    async getCategories() {
        return apiRequest('/categories');
    },

    /**
     * Отримання однієї категорії за ID
     * @param {string} id - ID категорії
     * @returns {Promise} Проміс з результатом запиту
     */
    async getCategory(id) {
        return apiRequest(`/categories/${id}`);
    },

    /**
     * Створення нової категорії (тільки для адміністраторів)
     * @param {object} categoryData - Дані категорії
     * @returns {Promise} Проміс з результатом запиту
     */
    async createCategory(categoryData) {
        return apiRequest('/categories', 'POST', categoryData, true);
    },

    /**
     * Оновлення категорії (тільки для адміністраторів)
     * @param {string} id - ID категорії
     * @param {object} categoryData - Дані для оновлення
     * @returns {Promise} Проміс з результатом запиту
     */
    async updateCategory(id, categoryData) {
        return apiRequest(`/categories/${id}`, 'PUT', categoryData, true);
    },

    /**
     * Видалення категорії (тільки для адміністраторів)
     * @param {string} id - ID категорії
     * @returns {Promise} Проміс з результатом запиту
     */
    async deleteCategory(id) {
        return apiRequest(`/categories/${id}`, 'DELETE', null, true);
    }
};

/**
 * Об'єкт з методами для роботи з API коментарів
 */
const CommentsAPI = {
    /**
     * Отримання коментарів до історії
     * @param {string} storyId - ID історії
     * @returns {Promise} Проміс з результатом запиту
     */
    async getCommentsByStory(storyId) {
        return apiRequest(`/comments?story=${storyId}`);
    },

    /**
     * Створення нового коментаря
     * @param {string} storyId - ID історії
     * @param {string} text - Текст коментаря
     * @param {string} parentComment - ID батьківського коментаря (якщо є)
     * @returns {Promise} Проміс з результатом запиту
     */
    async createComment(storyId, text, parentComment = null) {
        const data = { story: storyId, text };

        if (parentComment) {
            data.parentComment = parentComment;
        }

        return apiRequest('/comments', 'POST', data, true);
    },

    /**
     * Оновлення коментаря
     * @param {string} id - ID коментаря
     * @param {string} text - Новий текст коментаря
     * @returns {Promise} Проміс з результатом запиту
     */
    async updateComment(id, text) {
        return apiRequest(`/comments/${id}`, 'PUT', { text }, true);
    },

    /**
     * Видалення коментаря
     * @param {string} id - ID коментаря
     * @returns {Promise} Проміс з результатом запиту
     */
    async deleteComment(id) {
        return apiRequest(`/comments/${id}`, 'DELETE', null, true);
    },

    /**
     * Лайк коментаря
     * @param {string} id - ID коментаря
     * @returns {Promise} Проміс з результатом запиту
     */
    async likeComment(id) {
        return apiRequest(`/comments/${id}/like`, 'POST', null, true);
    }
};

/**
 * Об'єкт з методами для роботи з API користувачів
 */
const UsersAPI = {
    /**
     * Отримання профілю користувача за ID
     * @param {string} id - ID користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getUserProfile(id) {
        return apiRequest(`/users/${id}`, 'GET', null, true);
    },

    /**
     * Оновлення профілю користувача
     * @param {object} userData - Дані для оновлення
     * @returns {Promise} Проміс з результатом запиту
     */
    async updateUserProfile(userData) {
        const user = getCurrentUser();
        if (!user) {
            throw new Error('Необхідна авторизація');
        }

        return apiRequest(`/users/${user._id}`, 'PUT', userData, true);
    },

    /**
     * Завантаження аватара користувача
     * @param {File} imageFile - Файл зображення
     * @returns {Promise} Проміс з результатом запиту
     */
    async uploadAvatar(imageFile) {
        const user = getCurrentUser();
        if (!user) {
            throw new Error('Необхідна авторизація');
        }

        const formData = new FormData();
        formData.append('avatar', imageFile);

        return uploadFile(`/users/${user._id}/avatar`, formData);
    },

    /**
     * Отримання історій користувача
     * @param {string} userId - ID користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getUserStories(userId) {
        return apiRequest(`/stories?author=${userId}`);
    },

    /**
     * Отримання збережених історій користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getSavedStories() {
        return apiRequest('/users/saved-stories', 'GET', null, true);
    },

    /**
     * Отримання вподобаних історій користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getLikedStories() {
        return apiRequest('/users/liked-stories', 'GET', null, true);
    },

    /**
     * Підписка на автора
     * @param {string} authorId - ID автора
     * @returns {Promise} Проміс з результатом запиту
     */
    async followAuthor(authorId) {
        return apiRequest(`/users/follow/${authorId}`, 'POST', null, true);
    },

    /**
     * Скасування підписки на автора
     * @param {string} authorId - ID автора
     * @returns {Promise} Проміс з результатом запиту
     */
    async unfollowAuthor(authorId) {
        return apiRequest(`/users/unfollow/${authorId}`, 'POST', null, true);
    },

    /**
     * Отримання списку коментарів користувача
     * @returns {Promise} Проміс з результатом запиту
     */
    async getUserComments() {
        return apiRequest('/users/comments', 'GET', null, true);
    }
};