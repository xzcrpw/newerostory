// js/api-utils.js

(function(window) {
    // --- AppError Class (moved inside for encapsulation) ---
    class AppError extends Error {
        constructor(message, statusCode) {
            super(message);
            this.statusCode = statusCode;
            this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
            this.isOperational = true; // Mark as operational error
            // Capture stack trace (optional)
            if (Error.captureStackTrace) {
                Error.captureStackTrace(this, this.constructor);
            } else {
                this.stack = (new Error(message)).stack;
            }
        }
    }
    window.AppError = AppError; // Make it available globally if needed, or remove this line

    // --- API Configuration Check ---
    if (!window.apiConfig) {
        console.error('API Config (api-config.js) not found or loaded after api-utils.js');
        document.body.innerHTML = '<div style="padding: 2rem; text-align: center; color: red;">Помилка конфігурації API. Будь ласка, спробуйте оновити сторінку або зв\'яжіться з підтримкою.</div>';
        return;
    }

    const { baseUrl, endpoints } = window.apiConfig;

    // --- Session Data Management ---
    let currentUser = null; // Stores current user data
    let userLoadPromise = null; // Prevents parallel /me requests

    function setCurrentUser(user) {
        currentUser = user ? { ...user } : null; // Store a copy
        try {
            if (user) {
                localStorage.setItem('isPremium', user.isPremium ? 'true' : 'false');
                localStorage.setItem('userId', user._id);
                localStorage.setItem('userRole', user.role || 'user');
            } else {
                localStorage.removeItem('isPremium');
                localStorage.removeItem('userId');
                localStorage.removeItem('userRole');
            }
        } catch (e) {
            console.warn('Could not access localStorage to store user session info:', e);
        }
    }

    function clearCurrentUser() {
        currentUser = null;
        try {
            localStorage.removeItem('isPremium');
            localStorage.removeItem('userId');
            localStorage.removeItem('userRole');
            console.log('User session data cleared.');
        } catch (e) {
            console.warn('Could not access localStorage to clear user session info:', e);
        }
    }

    /**
     * Asynchronously loads or returns the current user data.
     * Uses caching and prevents parallel requests.
     * @param {boolean} forceRefresh - Force refresh data from the server.
     * @returns {Promise<object|null>} - User object or null.
     */
    async function fetchOrGetCurrentUser(forceRefresh = false) {
        if (currentUser && !forceRefresh) {
            return currentUser;
        }
        if (userLoadPromise && !forceRefresh) {
            return userLoadPromise;
        }

        userLoadPromise = (async () => {
            try {
                console.log('API Request: GET /users/me');
                const response = await request(endpoints.currentUser, {}, true); // true = needsAuth
                const user = response?.data?.user || response?.data; // Handle both structures
                if (user && user._id) { // Check for a valid user object
                    setCurrentUser(user);
                    console.log('Current user data loaded:', user);
                    return user;
                } else {
                    console.log('No valid user data in /me response, clearing session.');
                    clearCurrentUser();
                    return null;
                }
            } catch (error) {
                if (error.statusCode === 401 || error.statusCode === 403) {
                    console.log('/me request failed with auth error, clearing session.');
                    clearCurrentUser();
                } else {
                    console.warn('Failed to fetch current user:', error);
                }
                return null;
            } finally {
                userLoadPromise = null; // Reset promise after completion
            }
        })();
        return userLoadPromise;
    }


    // --- Status Functions ---
    function isAuthenticated() { return !!currentUser; }
    function isPremium() { return !!currentUser?.isPremium; }
    function getUserId() { return currentUser?._id || null; }
    function getUserRole() { return currentUser?.role || 'guest'; }

    function logoutSession() {
        clearCurrentUser();
        // Backend should clear the httpOnly cookie on a /logout request
        // Or the cookie will simply expire.
    }

    /**
     * Universal function for making API requests.
     * @param {string} endpoint - API path (e.g., '/users/me').
     * @param {object} options - Fetch options (method, body, headers).
     * @param {boolean} needsAuth - Whether auth is required (for error handling logic).
     * @returns {Promise<any>} Parsed response data.
     * @throws {AppError} Throws AppError on failure.
     */
    async function request(endpoint, options = {}, needsAuth = false) {
        const url = `${baseUrl}${endpoint}`;
        const headers = { ...(options.headers || {}) };
        let body = options.body;

        const controller = new AbortController();
        const timeoutDuration = window.apiConfig.requestDefaults?.timeout || 30000;
        const timeoutId = setTimeout(() => controller.abort('Request Timeout'), timeoutDuration);

        const config = {
            method: options.method || 'GET',
            headers,
            signal: controller.signal,
            credentials: 'include' // Send cookies automatically
        };

        if (body) {
            if (body instanceof FormData) {
                config.body = body;
                // Content-Type is set automatically by the browser for FormData
            } else if (typeof body === 'object') {
                try {
                    config.body = JSON.stringify(body);
                    if (!headers['Content-Type']) {
                        headers['Content-Type'] = 'application/json';
                        config.headers = headers;
                    }
                } catch (jsonError) {
                    clearTimeout(timeoutId);
                    throw new AppError('Не вдалося перетворити тіло запиту в JSON.', 400);
                }
            } else {
                config.body = body;
                if (typeof body === 'string' && !headers['Content-Type']) {
                    headers['Content-Type'] = 'text/plain'; config.headers = headers;
                }
            }
        }

        const executeRequestWithRetry = async (retriesLeft = window.apiConfig.requestDefaults?.retryAttempts || 2) => {
            try {
                const requestInfo = `${config.method} ${url}`;
                console.log(`API Request (${retriesLeft} retries left): ${requestInfo}`, config.body ? `Body type: ${body?.constructor?.name}` : '');

                const response = await fetch(url, config);
                clearTimeout(timeoutId);

                if (response.status === 204) {
                    console.log(`API Response: ${response.status} No Content`);
                    return { success: true }; // Indicate success for 204
                }

                let responseData;
                const contentType = response.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                    try {
                        responseData = await response.json();
                        console.log(`API Response: ${response.status}`, responseData);
                    } catch (parseError) {
                        if (response.ok) {
                            console.warn(`API Response ${response.status} was not valid JSON, but status is OK.`);
                            return { success: true, message: 'Відповідь не є валідним JSON, але статус ОК.' };
                        } else {
                            console.error('Error parsing JSON error response:', parseError);
                            let errorText = 'Не вдалося розпарсити відповідь сервера.'; try { errorText = await response.text(); } catch (e) {}
                            throw new AppError(`Помилка сервера (статус ${response.status}). ${errorText.substring(0, 150)}`, response.status);
                        }
                    }
                } else {
                    // Handle non-JSON responses if necessary, e.g., text/plain
                    const responseText = await response.text();
                    console.log(`API Response: ${response.status} (Non-JSON)`, responseText.substring(0, 100) + '...');
                    if (!response.ok) throw new AppError(`Помилка сервера (статус ${response.status}): ${responseText.substring(0, 150)}`, response.status);
                    // Return text data if response is OK but not JSON
                    return { success: true, data: responseText };
                }

                // Check response status and backend status field
                if (!response.ok || responseData.status !== 'success') {
                    const errorMessage = responseData?.message || responseData?.error?.message || `Помилка HTTP: ${response.status}`;
                    console.error('API Error:', errorMessage, responseData);
                    const error = new AppError(errorMessage, response.status || 500);
                    error.data = responseData; // Attach full response data to error

                    if (error.statusCode === 401 || error.statusCode === 403) {
                        console.log('Auth error detected, clearing front-end session.');
                        logoutSession(); // Use logoutSession which calls clearCurrentUser
                        // Optionally, redirect to login immediately
                        // window.location.href = '/login.html';
                    }
                    throw error;
                }

                return responseData; // Return successful JSON response

            } catch (error) {
                clearTimeout(timeoutId);

                // If it's already an AppError, rethrow it
                if (error instanceof AppError) {
                    if (error.statusCode === 401 || error.statusCode === 403) {
                        console.log('Auth error detected during fetch, clearing front-end session.');
                        logoutSession(); // Use logoutSession
                    }
                    throw error;
                }

                // Handle AbortError (timeout)
                if (error.name === 'AbortError') {
                    console.error(`Request aborted: ${url}`, error.message);
                    // Use i18n for messages if available
                    const i18nStore = window.$store?.i18n;
                    const timeoutMsg = i18nStore?.t('errors.requestTimeout') || 'Час очікування відповіді сервера вийшов.';
                    const cancelledMsg = i18nStore?.t('errors.requestCancelled') || 'Запит було скасовано.';
                    throw new AppError(error.message === 'Request Timeout' ? timeoutMsg : cancelledMsg, 408);
                }

                // Handle Network errors with retries
                const isNetworkError = (error instanceof TypeError && (error.message === 'Failed to fetch' || error.message.includes('NetworkError') || error.message.includes('fetch failed')));
                if (isNetworkError && retriesLeft > 0) {
                    const delay = (window.apiConfig.requestDefaults?.retryDelay || 1500) * Math.pow(2, (window.apiConfig.requestDefaults.retryAttempts || 2) - retriesLeft);
                    console.warn(`Network error on request to ${url}. Retrying in ${delay/1000}s... (${retriesLeft} left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return executeRequestWithRetry(retriesLeft - 1);
                }

                // Other unhandled errors
                console.error(`Unhandled request error to ${url}:`, error);
                const i18nStore = window.$store?.i18n;
                const networkErrorMsg = i18nStore?.t('errors.networkError') || 'Помилка мережі. Перевірте з\'єднання.';
                throw new AppError(isNetworkError ? networkErrorMsg : (error.message || 'Невідома помилка запиту'), 503); // 503 Service Unavailable
            }
        };
        return executeRequestWithRetry();
    }

    // --- API Object with Methods ---
    window.api = {
        utils: {
            isAuthenticated, isPremium, getUserId, getUserRole,
            logoutSession, request, getCurrentUser: fetchOrGetCurrentUser,
            setPremiumStatus(status) {
                if (currentUser) currentUser.isPremium = status;
                try { localStorage.setItem('isPremium', status ? 'true' : 'false'); } catch (e) {}
            }
        },
        auth: {
            async login(email, password) {
                const response = await request(endpoints.login, { method: 'POST', body: { email, password } });
                if (response.status === 'success' && response.data?.user) {
                    setCurrentUser(response.data.user);
                    return response.data.user;
                } else {
                    throw new AppError(response.message || 'Помилка входу: некоректна відповідь сервера.', 500);
                }
            },
            async register(name, email, password) {
                const response = await request(endpoints.register, { method: 'POST', body: { name, email, password } });
                if (response.status === 'success' && response.data?.user) {
                    setCurrentUser(response.data.user); // Auto-login
                    return response.data.user;
                }
                return response;
            },
            async logout() {
                try {
                    // await request('/auth/logout', { method: 'POST' }, true); // Optional backend logout call
                    console.log('Logout initiated.');
                } catch (e) { console.warn('Logout API call failed:', e); }
                finally {
                    logoutSession(); // Always clear frontend session
                }
            },
            async forgotPassword(email) { return await request(endpoints.forgotPassword, { method: 'POST', body: { email } }); },
            async resetPassword(token, password, confirmPassword) {
                const response = await request(`${endpoints.resetPassword}/${token}`, {
                    method: 'PATCH', body: { password, confirmPassword },
                });
                if (response.status === 'success' && response.data?.user) {
                    setCurrentUser(response.data.user);
                    return response.data.user;
                } else {
                    throw new AppError(response.message || 'Помилка скидання пароля.', 500);
                }
            },
            googleLoginRedirect() { window.location.href = `${baseUrl}${endpoints.googleLogin}`; },
        },
        users: {
            async updateUser(profileData) {
                const response = await request(endpoints.updateUser, { method: 'PATCH', body: profileData }, true);
                return response?.data;
            },
            async updateUserWithAvatar(formData) {
                const response = await request(endpoints.updateUser, { method: 'PATCH', body: formData }, true);
                return response?.data;
            },
            async changePassword(currentPassword, newPassword, confirmNewPassword) {
                const response = await request(endpoints.changePassword, { method: 'PATCH', body: { currentPassword, newPassword, confirmNewPassword }}, true);
                if (response.status === 'success' && response.data?.user) {
                    setCurrentUser(response.data.user); // Update user data
                }
                return response;
            },
            async getBookmarks(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.getUserBookmarks}?${q}`, {}, true); },
            async toggleBookmark(storyId) { return await request(endpoints.toggleBookmark(storyId), { method: 'POST' }, true); },
            async getFollowing(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.getUserFollowing}?${q}`, {}, true); },
            async toggleFollow(authorId) { return await request(endpoints.toggleFollow(authorId), { method: 'POST' }, true); },
            async checkIfFollowing(authorId) { return await request(endpoints.checkFollowStatus(authorId), {}, true); },
            async getStoryInteractionStatus(storyId) { return await request(endpoints.getStoryInteractionStatus(storyId), {}, true); },
        },
        stories: {
            async getStories(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.stories}?${q}`, {}, false); }, // Allow anonymous
            async getStoryById(storyId, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.storyById(storyId)}?${q}`, {}, false); }, // Allow anonymous
            async createStory(storyData) {
                const isFormData = storyData instanceof FormData;
                return await request(endpoints.createStory, { method: 'POST', body: storyData }, true);
            },
            async updateStory(storyId, storyData) {
                const isFormData = storyData instanceof FormData;
                return await request(endpoints.updateStory(storyId), { method: 'PATCH', body: storyData }, true);
            },
            async getRelatedStories(storyId, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.getRelatedStories(storyId)}?${q}`, {}, false); }, // Allow anonymous
            async deleteStory(storyId) { return await request(endpoints.deleteStory(storyId), { method: 'DELETE' }, true); }
        },
        authors: {
            async getAuthors(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.authors}?${q}`); },
            async getAuthorById(authorId, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.authorById(authorId)}?${q}`); },
            async getAuthorStories(authorId, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.authorStories(authorId)}?${q}`); }
        },
        categories: {
            async getCategories(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.categories}?${q}`); },
            async getCategoryBySlug(slug, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.categoryBySlug(slug)}?${q}`); },
            async getCategoryStatus(slug) { return await request(endpoints.getCategoryStatus(slug), {}, true); },
            async toggleFavorite(slug) { return await request(endpoints.toggleFavoriteCategory(slug), { method: 'POST' }, true); },
            async subscribeCategory(slug) { return await request(endpoints.subscribeCategory(slug), { method: 'POST' }, true); }
        },
        tags: {
            async getTags(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.tags}?${q}`); },
            async getPopularTags(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.popularTags}?${q}`); },
            async getTagBySlug(slug, params = {}) { const q = new URLSearchParams(params).toString(); return await request(`${endpoints.tagBySlug(slug)}?${q}`); }
        },
        comments: {
            async getComments(storyId, params = {}) { const q = new URLSearchParams(params).toString(); return await request(endpoints.commentsByStory(storyId) + `?${q}`, {}, true); }, // Needs auth for like status
            async createComment(storyId, text, parentComment = null) { return await request(endpoints.createComment(storyId), { method: 'POST', body: { text, parentComment } }, true); },
            async getLikeStatuses(commentIds) { return await request(endpoints.getCommentLikeStatuses, { method: 'POST', body: { commentIds } }, true); },
            async updateComment(commentId, text) { return await request(endpoints.updateComment(commentId), { method: 'PATCH', body: { text } }, true); },
            async deleteComment(commentId) { return await request(endpoints.deleteComment(commentId), { method: 'DELETE' }, true); }
        },
        likes: {
            async toggleLike(targetId, targetModel) { return await request(endpoints.toggleLike, { method: 'POST', body: { targetId, targetModel } }, true); }
        },
        ratings: {
            async rateStory(storyId, rating) { return await request(endpoints.rateStory(storyId), { method: 'POST', body: { rating } }, true); }
        },
        premium: {
            async getPlans() { return await request(endpoints.getPlans); },
            async getCurrentSubscription() {
                try { return await request(endpoints.getCurrentSubscription, {}, true); }
                catch (error) { if (error.statusCode === 404) return null; throw error; }
            },
            async validateCoupon(code, planId, billingCycle) { return await request(endpoints.validateCoupon, { method: 'POST', body: { code, planId, billingCycle } }, true); },
            async subscribe(subscriptionData) { return await request(endpoints.createSubscription, { method: 'POST', body: subscriptionData }, true); },
            async cancel() { return await request(endpoints.cancelSubscription, { method: 'DELETE' }, true); }
        },
        contact: {
            async sendMessage(formData) { return await request(endpoints.contact, { method: 'POST', body: formData }); }
        },
        translation: {
            async translateText(text, targetLanguage) {
                console.warn('Backend translation endpoint needed for /api/translate.');
                // Mock translation
                await new Promise(resolve => setTimeout(resolve, 500));
                return { translatedText: `[${targetLanguage.toUpperCase()}-Sim] ${text}` };
            }
        },
        reports: {
            async createReport(reportData) { return await request('/reports', { method: 'POST', body: reportData }, true); }
        },
        admin: { // Added Admin API methods
            async getDashboardStats() { return await request('/admin/dashboard', {}, true); },
            async getPendingStories(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`/admin/stories/pending?${q}`, {}, true); },
            async approveStory(storyId) { return await request(`/admin/stories/${storyId}/approve`, { method: 'PATCH' }, true); },
            async rejectStory(storyId, reason) { return await request(`/admin/stories/${storyId}/reject`, { method: 'PATCH', body: { rejectionReason: reason } }, true); },
            async getPendingComments(params = {}) { const q = new URLSearchParams(params).toString(); return await request(`/admin/comments/pending?${q}`, {}, true); },
            async approveComment(commentId) { return await request(`/admin/comments/${commentId}/approve`, { method: 'PATCH' }, true); },
            async rejectComment(commentId) { return await request(`/admin/comments/${commentId}/reject`, { method: 'PATCH' }, true); },
            async getSettings() { return await request('/admin/settings', {}, true); },
            async updateSettings(settingsData) { return await request('/admin/settings', { method: 'PATCH', body: settingsData }, true); },
            // TODO: Add other admin methods as needed
        }
    };

    console.log('API Utils loaded with httpOnly cookie strategy. Admin methods added.');

    // Attempt to load user data on script load
    fetchOrGetCurrentUser();

})(window);