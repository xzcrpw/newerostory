// js/api-config.js
const API_URL = 'http://localhost:5000/api'; // Під час розробки
// const API_URL = 'https://erostory.world/api'; // Для продакшн

// Функції для роботи з токеном авторизації
const saveToken = (token) => {
    localStorage.setItem('authToken', token);
};

const getToken = () => {
    return localStorage.getItem('authToken');
};

const removeToken = () => {
    localStorage.removeItem('authToken');
};

// Функція для перевірки, чи авторизований користувач
const isAuthenticated = () => {
    return getToken() !== null;
};

// Функція для отримання заголовків авторизації
const getAuthHeaders = () => {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// API для авторизації
const authAPI = {
    // Реєстрація нового користувача
    register: async (userData) => {
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка реєстрації');
            }

            // Зберігаємо токен, якщо реєстрація успішна
            if (data.token) {
                saveToken(data.token);
            }

            return data;
        } catch (error) {
            console.error('Помилка реєстрації:', error);
            throw error;
        }
    },

    // Вхід користувача
    login: async (credentials) => {
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка входу');
            }

            // Зберігаємо токен, якщо вхід успішний
            if (data.token) {
                saveToken(data.token);
            }

            return data;
        } catch (error) {
            console.error('Помилка входу:', error);
            throw error;
        }
    },

    // Отримання даних поточного користувача
    getCurrentUser: async () => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/auth/me`, {
                method: 'GET',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання даних користувача');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка отримання даних користувача:', error);
            throw error;
        }
    },

    // Вихід користувача
    logout: () => {
        removeToken();
    }
};

// API для роботи з історіями
const storiesAPI = {
    // Отримання всіх історій (з можливістю фільтрації)
    getStories: async (filters = {}) => {
        try {
            let url = `${API_URL}/stories`;

            // Додавання фільтрів до URL
            if (Object.keys(filters).length > 0) {
                const queryParams = new URLSearchParams();

                for (const key in filters) {
                    if (filters[key] !== undefined && filters[key] !== null) {
                        queryParams.append(key, filters[key]);
                    }
                }

                url += `?${queryParams.toString()}`;
            }

            const headers = {
                ...getAuthHeaders()
            };

            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання історій');
            }

            return data;
        } catch (error) {
            console.error('Помилка отримання історій:', error);
            throw error;
        }
    },

    // Отримання однієї історії за ID
    getStory: async (id) => {
        try {
            const headers = {
                ...getAuthHeaders()
            };

            const response = await fetch(`${API_URL}/stories/${id}`, {
                method: 'GET',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка отримання історії:', error);
            throw error;
        }
    },

    // Створення нової історії
    createStory: async (storyData) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/stories`, {
                method: 'POST',
                headers,
                body: JSON.stringify(storyData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка створення історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка створення історії:', error);
            throw error;
        }
    },

    // Оновлення існуючої історії
    updateStory: async (id, storyData) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/stories/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(storyData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка оновлення історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка оновлення історії:', error);
            throw error;
        }
    },

    // Видалення історії
    deleteStory: async (id) => {
        try {
            const headers = {
                ...getAuthHeaders()
            };

            const response = await fetch(`${API_URL}/stories/${id}`, {
                method: 'DELETE',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка видалення історії');
            }

            return data;
        } catch (error) {
            console.error('Помилка видалення історії:', error);
            throw error;
        }
    },

    // Завантаження зображення для історії
    uploadStoryImage: async (id, imageFile) => {
        try {
            const formData = new FormData();
            formData.append('image', imageFile);

            const headers = {
                ...getAuthHeaders()
                // Не додаємо 'Content-Type' для FormData
            };

            const response = await fetch(`${API_URL}/stories/${id}/image`, {
                method: 'PUT',
                headers,
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка завантаження зображення');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка завантаження зображення:', error);
            throw error;
        }
    },

    // Оцінка історії
    rateStory: async (id, rating) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/stories/${id}/rate`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ rating })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка оцінювання історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка оцінювання історії:', error);
            throw error;
        }
    },

    // Лайк історії
    likeStory: async (id) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/stories/${id}/like`, {
                method: 'POST',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка лайку історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка лайку історії:', error);
            throw error;
        }
    },

    // Збереження історії
    saveStory: async (id) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/stories/${id}/save`, {
                method: 'POST',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка збереження історії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка збереження історії:', error);
            throw error;
        }
    }
};

// API для роботи з категоріями
const categoriesAPI = {
    // Отримання всіх категорій
    getCategories: async () => {
        try {
            const response = await fetch(`${API_URL}/categories`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання категорій');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка отримання категорій:', error);
            throw error;
        }
    },

    // Отримання однієї категорії за ID
    getCategory: async (id) => {
        try {
            const response = await fetch(`${API_URL}/categories/${id}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання категорії');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка отримання категорії:', error);
            throw error;
        }
    }
};

// API для роботи з коментарями
const commentsAPI = {
    // Отримання коментарів для історії
    getComments: async (storyId) => {
        try {
            const response = await fetch(`${API_URL}/comments?story=${storyId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка отримання коментарів');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка отримання коментарів:', error);
            throw error;
        }
    },

    // Створення нового коментаря
    createComment: async (commentData) => {
        try {
            const headers = {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${API_URL}/comments`, {
                method: 'POST',
                headers,
                body: JSON.stringify(commentData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка створення коментаря');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка створення коментаря:', error);
            throw error;
        }
    },

    // Лайк коментаря
    likeComment: async (id) => {
        try {
            const headers = {
                ...getAuthHeaders()
            };

            const response = await fetch(`${API_URL}/comments/${id}/like`, {
                method: 'POST',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Помилка лайку коментаря');
            }

            return data.data;
        } catch (error) {
            console.error('Помилка лайку коментаря:', error);
            throw error;
        }
    }
};

// Експортуємо API функції
window.api = {
    auth: authAPI,
    stories: storiesAPI,
    categories: categoriesAPI,
    comments: commentsAPI,
    utils: {
        isAuthenticated,
        getAuthHeaders,
        getToken,
        saveToken,
        removeToken
    }
};