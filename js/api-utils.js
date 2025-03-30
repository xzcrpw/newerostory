// js/api-utils.js

(function(window) {
    // Перевірка наявності конфігурації API
    if (!window.apiConfig) {
        console.error('API Config (api-config.js) not found or loaded after api-utils.js');
        // Зупиняємо виконання, якщо конфігурації немає
        return;
    }

    const { baseUrl, endpoints } = window.apiConfig;

    // --- Допоміжні функції для роботи з локальним сховищем ---

    /**
     * Отримує токен автентифікації з localStorage.
     * @returns {string | null} Токен або null.
     */
    function getToken() {
        return localStorage.getItem('userToken');
    }

    /**
     * Зберігає токен автентифікації в localStorage.
     * @param {string} token - Токен для збереження.
     */
    function setToken(token) {
        if (token) {
            localStorage.setItem('userToken', token);
        } else {
            console.warn('Attempted to set an invalid token.');
        }
    }

    /**
     * Видаляє дані користувача (токен, статус, ID) з localStorage.
     */
    function removeToken() {
        localStorage.removeItem('userToken');
        localStorage.removeItem('isPremium');
        localStorage.removeItem('userId');
        console.log('User session data removed from localStorage.');
    }

    /**
     * Перевіряє, чи користувач автентифікований (наявність токена).
     * @returns {boolean} true, якщо є токен, інакше false.
     */
    function isAuthenticated() {
        return !!getToken();
    }

    /**
     * Перевіряє, чи користувач має преміум-статус (з localStorage).
     * @returns {boolean} true, якщо преміум, інакше false.
     */
    function isPremium() {
        return localStorage.getItem('isPremium') === 'true';
    }

    /**
     * Зберігає преміум-статус користувача в localStorage.
     * @param {boolean} status - true або false.
     */
    function setPremiumStatus(status) {
        localStorage.setItem('isPremium', status ? 'true' : 'false');
    }

    /**
     * Зберігає ID користувача в localStorage.
     * @param {string} userId - ID користувача.
     */
    function setUserId(userId) {
        if (userId) {
            localStorage.setItem('userId', userId);
        } else {
            localStorage.removeItem('userId');
        }
    }

    /**
     * Отримує ID поточного користувача з localStorage.
     * @returns {string | null} ID користувача або null.
     */
    function getUserId() {
        return localStorage.getItem('userId');
    }


    /**
     * Універсальна функція для виконання API запитів за допомогою Fetch API.
     * Обробляє JSON та FormData, додає токен авторизації, обробляє відповіді та помилки.
     *
     * @param {string} endpoint - Шлях до API ендпоінту (напр., '/stories' або функція, що повертає шлях).
     * @param {object} options - Опції для fetch (method, body, headers тощо).
     * @param {boolean} needsAuth - Чи потрібна автентифікація для цього запиту (за замовчуванням false).
     * @returns {Promise<any>} - Розпарсені дані відповіді від API (зазвичай об'єкт).
     * @throws {Error} - Викидає помилку у разі невдалого запиту (статус не 2xx) або мережевої помилки.
     */
    async function request(endpoint, options = {}, needsAuth = false) {
        const url = `${baseUrl}${endpoint}`;
        const headers = { ...options.headers };
        let body = options.body;
        
        // Додаємо таймаут для fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, window.apiConfig.requestDefaults?.timeout || 30000);
        
        // Додаємо обробку автентифікації з перевіркою JWT дати закінчення
        const token = getToken();
        if (needsAuth) {
            if (!token) {
                console.error(`Authentication token is missing for protected request: ${options.method || 'GET'} ${url}`);
                clearTimeout(timeoutId);
                
                // Перевіряємо, чи це AJAX запит або завантаження сторінки
                if (isAjaxRequest()) {
                    throw new Error('Необхідна автентифікація');
                } else {
                    const redirectParam = '?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
                    window.location.href = 'login.html' + redirectParam;
                    return new Promise(() => {}); // Запобігаємо продовженню виконання
                }
            }
            
            // Перевірка JWT на дату закінчення
            try {
                if (isTokenExpired(token)) {
                    console.warn('Token expired. Redirecting to login.');
                    clearTimeout(timeoutId);
                    removeToken();
                    
                    if (isAjaxRequest()) {
                        throw new Error('Термін дії токена закінчився');
                    } else {
                        const redirectParam = '?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
                        window.location.href = 'login.html' + redirectParam;
                        return new Promise(() => {});
                    }
                }
            } catch (e) {
                console.error('Error checking token expiration:', e);
            }
            
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Налаштування конфігурації Fetch
        const config = {
            method: options.method || 'GET',
            headers,
            signal: controller.signal,
        };
        
        // Обробка тіла запиту
        if (body) {
            if (body instanceof FormData) {
                config.body = body;
            } else if (typeof body === 'object') {
                try {
                    config.body = JSON.stringify(body);
                    if (!headers['Content-Type']) {
                        headers['Content-Type'] = 'application/json';
                        config.headers = headers;
                    }
                } catch (jsonError) {
                    console.error('Error stringifying request body:', jsonError);
                    throw new Error('Не вдалося перетворити тіло запиту в JSON.');
                }
            } else {
                config.body = body;
                if (typeof body === 'string' && !headers['Content-Type']) {
                    headers['Content-Type'] = 'text/plain';
                    config.headers = headers;
                }
            }
        }
        
        // Функція для виконання запиту з повторними спробами
        const executeRequestWithRetry = async (retriesLeft = window.apiConfig.requestDefaults?.retryAttempts || 3) => {
            try {
                const requestInfo = `${config.method} ${url}`;
                console.log(`API Request (${retriesLeft} retries left): ${requestInfo}`);
                
                const response = await fetch(url, config);
                clearTimeout(timeoutId);
                
                // Успіх без контенту (наприклад, DELETE або деякі PUT/POST)
                if (response.status === 204) {
                    console.log(`API Response: ${response.status} No Content`);
                    return { success: true };
                }
                
                let responseData;
                try {
                    responseData = await response.json();
                    console.log(`API Response: ${response.status}`, responseData);
                } catch (parseError) {
                    if (response.ok) {
                        console.warn(`API Response ${response.status} was not JSON, but status is OK.`);
                        return { success: true, message: 'Відповідь не містить JSON, але статус ОК.' };
                    } else {
                        console.error('Error parsing JSON response:', parseError);
                        throw new Error(`Помилка сервера (статус ${response.status}, відповідь не JSON)`);
                    }
                }
                
                if (!response.ok) {
                    const errorMessage = responseData?.message || responseData?.error || `Помилка HTTP: ${response.status}`;
                    console.error('API Error:', errorMessage, responseData);
                    
                    if (response.status === 401 || response.status === 403) {
                        console.log('Authentication/Authorization error detected. Removing token.');
                        removeToken();
                    }
                    throw new Error(errorMessage);
                }
                
                return responseData;
                
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    console.error('Request timed out after', window.apiConfig.requestDefaults?.timeout || 30000, 'ms');
                    throw new Error('Запит перевищив час очікування. Спробуйте пізніше.');
                }
                
                if ((error instanceof TypeError && error.message === 'Failed to fetch' || 
                    error.message.includes('NetworkError')) && retriesLeft > 0) {
                    
                    console.warn(`Network error. Retrying... (${retriesLeft} left)`);
                    const delay = window.apiConfig.requestDefaults?.retryDelay || 1000;
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return executeRequestWithRetry(retriesLeft - 1);
                }
                
                throw error;
            }
        };
        
        return executeRequestWithRetry();
    }

    // Функція для перевірки, чи запит є AJAX (не завантажує нову сторінку)
    function isAjaxRequest() {
        try {
            const stack = new Error().stack || '';
            return stack.includes('fetch') || stack.includes('xhr') || 
                   stack.includes('api.') || stack.includes('async');
        } catch (e) {
            return false;
        }
    }

    // Функція для перевірки закінчення терміну дії JWT
    function isTokenExpired(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));
            
            return payload.exp * 1000 < Date.now() + 10000;
        } catch (e) {
            console.error('Error parsing JWT:', e);
            return false;
        }
    }

    // --- Об'єкт API з методами для взаємодії з бекендом ---
    window.api = {
        // --- Утиліти ---
        utils: {
            getToken,
            setToken,
            removeToken,
            isAuthenticated,
            isPremium,
            setPremiumStatus,
            setUserId,
            getUserId,
            request, // Надаємо доступ до базової функції запиту, якщо потрібно
        },

        // --- Автентифікація ---
        auth: {
            /**
             * Вхід користувача.
             * @param {string} email
             * @param {string} password
             * @returns {Promise<object>} Відповідь API (включаючи токен та дані користувача).
             */
            async login(email, password) {
                const data = await request(endpoints.login, {
                    method: 'POST',
                    body: { email, password }, // Об'єкт автоматично перетвориться в JSON
                });
                // Зберігаємо дані сесії після успішного входу
                if (data.token) {
                    setToken(data.token);
                    if (data.user) {
                        setPremiumStatus(data.user.isPremium || false);
                        setUserId(data.user._id || null);
                        console.log('User session data saved:', { premium: data.user.isPremium, id: data.user._id });
                    } else {
                        console.warn('User data not found in login response. Fetching separately...');
                        // Якщо бекенд не повертає користувача при логіні, робимо дод. запит
                        try {
                            await api.users.getCurrentUser(); // Завантажить та збереже дані
                        } catch (e) {
                            console.error('Failed to fetch user data after login:', e);
                            // Вирішити, чи є це критичною помилкою
                        }
                    }
                } else {
                    console.error('Token not found in login response.');
                    throw new Error('Не вдалося отримати токен автентифікації.');
                }
                return data;
            },

            /**
             * Реєстрація нового користувача.
             * @param {string} name
             * @param {string} email
             * @param {string} password
             * @returns {Promise<object>} Відповідь API (зазвичай підтвердження або дані нового користувача).
             */
            async register(name, email, password) {
                return await request(endpoints.register, {
                    method: 'POST',
                    body: { name, email, password },
                });
                // Після успішної реєстрації може бути автоматичний логін або перенаправлення на сторінку входу
            },

            /**
             * Вихід користувача (очищення локальних даних).
             */
            logout() {
                removeToken();
                console.log('User logged out.');
                // Опціонально: повідомити бекенд про вихід для інвалідації токена на сервері
                // request(endpoints.logout, { method: 'POST' }, true).catch(e => console.warn('Logout API call failed:', e));
            },

            /**
             * Запит на відновлення паролю.
             * @param {string} email
             * @returns {Promise<object>} Відповідь API.
             */
            async forgotPassword(email) {
                return await request(endpoints.forgotPassword, {
                    method: 'POST',
                    body: { email },
                });
            },

            /**
             * Встановлення нового паролю за токеном відновлення.
             * @param {string} token - Токен відновлення (з email або URL).
             * @param {string} password - Новий пароль.
             * @returns {Promise<object>} Відповідь API.
             */
            async resetPassword(token, password) {
                // Ендпоінт може відрізнятися, можливо /auth/reset-password/:token
                // Передаємо токен в тілі або змінюємо ендпоінт
                return await request(endpoints.resetPassword, {
                    method: 'POST',
                    body: { token, password },
                });
            },

            /**
             * Перенаправлення на сторінку Google OAuth на бекенді.
             */
            googleLoginRedirect() {
                console.log(`Redirecting to Google OAuth endpoint: ${baseUrl}${endpoints.googleLogin}`);
                window.location.href = `${baseUrl}${endpoints.googleLogin}`;
            },
            // facebookLoginRedirect() { ... } // Аналогічно для Facebook
        },

        // --- Користувачі ---
        users: {
            /**
             * Отримати дані поточного авторизованого користувача.
             * @returns {Promise<object>} Дані користувача.
             */
            async getCurrentUser() {
                const data = await request(endpoints.currentUser, {}, true);
                // Оновлюємо локальні дані після отримання
                if (data) {
                    setPremiumStatus(data.isPremium || false);
                    setUserId(data._id || null);
                }
                return data;
            },

            /**
             * Оновити профіль поточного користувача.
             * @param {object} profileData - Об'єкт з полями для оновлення (name, bio, avatarUrl).
             * @returns {Promise<object>} Оновлені дані користувача.
             */
            async updateUser(profileData) {
                // Перевірка даних перед відправкою
                const validData = {};
                if (profileData.name !== undefined) validData.name = profileData.name;
                if (profileData.email !== undefined) validData.email = profileData.email; // Увага до зміни email
                if (profileData.bio !== undefined) validData.bio = profileData.bio;
                if (profileData.avatarUrl !== undefined) validData.avatarUrl = profileData.avatarUrl;
                // TODO: Обробка завантаження файлу аватара, якщо потрібно

                return await request(endpoints.updateUser, {
                    method: 'PUT', // Або PATCH
                    body: validData,
                }, true);
            },

            /**
             * Змінити пароль поточного користувача.
             * @param {string} currentPassword - Поточний пароль.
             * @param {string} newPassword - Новий пароль.
             * @returns {Promise<object>} Відповідь API.
             */
            async changePassword(currentPassword, newPassword) {
                return await request(endpoints.changePassword, {
                    method: 'POST', // Або PUT/PATCH
                    body: { currentPassword, newPassword },
                }, true);
            },

            /**
             * Отримати список збережених історій (закладок) користувача.
             * @param {object} params - Параметри запиту (напр., { page: 1, limit: 10 }).
             * @returns {Promise<object>} Відповідь API зі списком історій та пагінацією.
             */
            async getBookmarks(params = {}) {
                const query = new URLSearchParams(params).toString();
                return await request(`${endpoints.getUserBookmarks}?${query}`, {}, true);
            },

            /**
             * Додати або видалити історію з закладок.
             * @param {string} storyId - ID історії.
             * @returns {Promise<object>} Відповідь API.
             */
            async toggleBookmark(storyId) {
                // Метод POST для перемикання стану
                return await request(endpoints.toggleBookmark(storyId), { method: 'POST' }, true);
            },

            /**
             * Отримати список авторів, на яких підписаний користувач.
             * @param {object} params - Параметри запиту (напр., { page: 1, limit: 10 }).
             * @returns {Promise<object>} Відповідь API зі списком авторів та пагінацією.
             */
            async getFollowing(params = {}) {
                const query = new URLSearchParams(params).toString();
                return await request(`${endpoints.getUserFollowing}?${query}`, {}, true);
            },

            /**
             * Підписатися або відписатися від автора.
             * @param {string} authorId - ID автора.
             * @returns {Promise<object>} Відповідь API.
             */
            async toggleFollow(authorId) {
                return await request(endpoints.toggleFollow(authorId), { method: 'POST' }, true);
            },

            // TODO: Додати ендпоінти та методи для getReadingHistory, getLikedStories, getMyComments
            // async getReadingHistory(params = {}) { ... }
            // async getLikedStories(params = {}) { ... }
            // async getMyComments(params = {}) { ... }
        },

        // --- Історії ---
        stories: {
            /**
             * Отримати список історій з фільтрами та сортуванням.
             * @param {object} params - Параметри (page, limit, sort, filter, category, authorId, tags).
             * @returns {Promise<object>} Відповідь API зі списком історій та пагінацією.
             */
            async getStories(params = {}) {
                const query = new URLSearchParams(params).toString();
                // Автентифікація не потрібна для загального списку
                return await request(`${endpoints.stories}?${query}`);
            },

            /**
             * Отримати дані однієї історії за ID.
             * @param {string} storyId - ID історії.
             * @returns {Promise<object>} Дані історії.
             */
            async getStoryById(storyId) {
                // Може бути потрібна автентифікація для перевірки статусу преміум, лайків тощо
                return await request(endpoints.storyById(storyId), {}, isAuthenticated());
            },

            /**
             * Створити нову історію.
             * @param {object} storyData - Дані історії (title, content, category, tags, image: File, etc.).
             * @returns {Promise<object>} Дані створеної історії.
             */
            async createStory(storyData) {
                let body;
                let headers = {};
                let hasFile = storyData.image instanceof File;

                if (hasFile) {
                    body = new FormData();
                    Object.keys(storyData).forEach(key => {
                        if (key === 'tags' && Array.isArray(storyData[key])) {
                            storyData[key].forEach(tag => body.append('tags', tag));
                        } else if (storyData[key] !== null && storyData[key] !== undefined) {
                            body.append(key, storyData[key]);
                        }
                    });
                } else {
                    const dataToSend = { ...storyData };
                    if ('image' in dataToSend) delete dataToSend.image; // Видаляємо ключ, якщо це не файл
                    body = dataToSend; // Передаємо об'єкт для автоматичного JSON.stringify
                }

                return await request(endpoints.stories, {
                    method: 'POST',
                    body: body,
                    // Заголовки встановляться автоматично в `request`
                }, true); // Потрібна автентифікація
            },

            /**
             * Оновити існуючу історію.
             * @param {string} storyId - ID історії.
             * @param {object} storyData - Дані для оновлення.
             * @returns {Promise<object>} Оновлені дані історії.
             */
            async updateStory(storyId, storyData) {
                let body;
                let headers = {};
                let hasFile = storyData.image instanceof File;

                if (hasFile) {
                    body = new FormData();
                    Object.keys(storyData).forEach(key => {
                        if (key === 'tags' && Array.isArray(storyData[key])) {
                            storyData[key].forEach(tag => body.append('tags', tag));
                        } else if (storyData[key] !== null && storyData[key] !== undefined) {
                            body.append(key, storyData[key]);
                        }
                    });
                } else {
                    const dataToSend = { ...storyData };
                    if ('image' in dataToSend) delete dataToSend.image;
                    body = dataToSend;
                }

                return await request(endpoints.storyById(storyId), {
                    method: 'PUT', // Або PATCH
                    body: body,
                }, true);
            },

            /**
             * Лайкнути або зняти лайк з історії.
             * @param {string} storyId - ID історії.
             * @returns {Promise<object>} Відповідь API (може містити нову кількість лайків).
             */
            async likeStory(storyId) {
                return await request(endpoints.likeStory(storyId), { method: 'POST' }, true);
            },

            /**
             * Оцінити історію.
             * @param {string} storyId - ID історії.
             * @param {number} rating - Оцінка (0-5). 0 для скасування.
             * @returns {Promise<object>} Відповідь API (новий середній рейтинг, кількість оцінок).
             */
            async rateStory(storyId, rating) {
                return await request(endpoints.rateStory(storyId), {
                    method: 'POST',
                    body: { rating }, // Передаємо об'єкт
                }, true);
            },

            // TODO: Додати методи deleteStory(storyId), getRelatedStories(storyId)
            // async deleteStory(storyId) { ... }
            // async getRelatedStories(storyId, params = {}) { ... }
        },

        // --- Автори ---
        authors: {
            /**
             * Отримати список авторів.
             * @param {object} params - Параметри (page, limit, sort, search).
             * @returns {Promise<object>} Відповідь API зі списком авторів та пагінацією.
             */
            async getAuthors(params = {}) {
                const query = new URLSearchParams(params).toString();
                return await request(`${endpoints.authors}?${query}`);
            },
            /**
             * Отримати дані одного автора за ID.
             * @param {string} authorId - ID автора.
             * @returns {Promise<object>} Дані автора.
             */
            async getAuthorById(authorId) {
                return await request(endpoints.authorById(authorId));
            },
            /**
             * Отримати історії конкретного автора.
             * @param {string} authorId - ID автора.
             * @param {object} params - Параметри (page, limit, sort).
             * @returns {Promise<object>} Відповідь API зі списком історій та пагінацією.
             */
            async getAuthorStories(authorId, params = {}) {
                const query = new URLSearchParams(params).toString();
                return await request(`${endpoints.authorStories(authorId)}?${query}`);
            }
            // toggleFollow реалізовано в api.users
        },

        // --- Категорії ---
        categories: {
            /**
             * Отримати список всіх категорій.
             * @returns {Promise<Array>} Масив об'єктів категорій.
             */
            async getCategories() {
                // Зазвичай категорії не змінюються часто, можна додати кешування
                return await request(endpoints.categories);
            },
            /**
             * Отримати дані однієї категорії за її slug (або ID).
             * @param {string} slug - Slug або ID категорії.
             * @returns {Promise<object>} Дані категорії.
             */
            async getCategoryBySlug(slug) {
                return await request(endpoints.categoryBySlug(slug));
            },
            /**
             * Підписатися або відписатися від категорії.
             * @param {string} slug - Slug категорії.
             * @returns {Promise<object>} Відповідь API.
             */
            async subscribeCategory(slug) {
                // TODO: Уточнити метод (POST для перемикання чи PUT/DELETE)
                return await request(endpoints.subscribeCategory(slug), { method: 'POST' }, true);
            }
        },

        // --- Коментарі ---
        comments: {
            /**
             * Отримати коментарі до історії.
             * @param {string} storyId - ID історії.
             * @param {object} params - Параметри (page, limit, sort).
             * @returns {Promise<object>} Відповідь API зі списком коментарів та пагінацією.
             */
            async getComments(storyId, params = {}) {
                const query = new URLSearchParams(params).toString();
                return await request(`${endpoints.commentsByStory(storyId)}?${query}`);
            },
            /**
             * Створити новий коментар до історії.
             * @param {string} storyId - ID історії.
             * @param {string} text - Текст коментаря.
             * @returns {Promise<object>} Дані створеного коментаря.
             */
            async createComment(storyId, text) {
                return await request(endpoints.commentsByStory(storyId), {
                    method: 'POST',
                    body: { text },
                }, true);
            },
            /**
             * Лайкнути або зняти лайк з коментаря.
             * @param {string} commentId - ID коментаря.
             * @returns {Promise<object>} Відповідь API.
             */
            async likeComment(commentId) {
                return await request(endpoints.likeComment(commentId), { method: 'POST' }, true);
            }
            // TODO: Додати методи updateComment(commentId, text), deleteComment(commentId)
        },

        // --- Преміум ---
        premium: {
            /**
             * Отримати список доступних планів підписки.
             * @returns {Promise<Array>} Масив об'єктів планів.
             */
            async getPlans() {
                // Цей ендпоінт зазвичай публічний
                return await request(endpoints.getPlans);
            },
            /**
             * Отримати інформацію про поточну підписку користувача.
             * @returns {Promise<object | null>} Дані підписки або null, якщо немає.
             */
            async getCurrentSubscription() {
                // Потребує автентифікації
                try {
                    // Спробуємо отримати дані, якщо користувач має підписку
                    return await request(endpoints.getCurrentSubscription, {}, true);
                } catch (error) {
                    // Якщо API повертає 404 Not Found, коли підписки немає, обробляємо це
                    if (error.message.includes('404') || error.message.toLowerCase().includes('not found')) {
                        console.log('User has no active subscription.');
                        return null; // Підписки немає
                    }
                    // Інші помилки кидаємо далі
                    throw error;
                }
            },
            /**
             * Перевірити валідність промокоду для певного плану.
             * @param {string} code - Промокод.
             * @param {string} planId - ID обраного плану.
             * @param {string} billingCycle - 'monthly' або 'yearly'.
             * @returns {Promise<object>} Відповідь API з деталями знижки або помилкою.
             */
            async validateCoupon(code, planId, billingCycle) {
                return await request(endpoints.validateCoupon, {
                    method: 'POST',
                    body: { code, planId, billingCycle },
                }, true); // Можливо, не вимагає auth, залежить від логіки
            },
            /**
             * Створити (оформити) преміум-підписку.
             * @param {object} subscriptionData - Дані для створення підписки.
             *   Має містити ID плану, тип оплати (card/crypto),
             *   платіжні дані (токен Stripe/LiqPay або ID крипто-транзакції), промокод (якщо є).
             * @returns {Promise<object>} Відповідь API (статус нової підписки).
             */
            async subscribe(subscriptionData) {
                return await request(endpoints.createSubscription, {
                    method: 'POST',
                    body: subscriptionData,
                }, true); // Потрібна автентифікація
            },
            /**
             * Скасувати активну преміум-підписку.
             * @returns {Promise<object>} Відповідь API.
             */
            async cancel() {
                return await request(endpoints.cancelSubscription, { method: 'DELETE' }, true);
            }
        }, // кінець premium

        // --- Контактна форма ---
        contact: {
            /**
             * Надіслати повідомлення з контактної форми.
             * @param {object} formData - Дані форми (name, email, subject, message).
             * @returns {Promise<object>} Відповідь API.
             */
            async sendMessage(formData) {
                return await request(endpoints.contact, {
                    method: 'POST',
                    body: formData, // Не потребує автентифікації
                });
            }
        },

        // Модуль translation поки що не потрібен для контенту
        translation: {
            async translateText(text, targetLanguage) {
                console.warn('Client-side story translation is disabled. Implement on backend.');
                throw new Error('Функцію перекладу контенту буде реалізовано на сервері.');
            }
        }
    };

    console.log('API Utils loaded successfully.');

})(window);