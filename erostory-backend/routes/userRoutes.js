// --- START OF FILE routes/userRoutes.js ---
const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

const router = express.Router();

// --- Захищаємо всі маршрути нижче (потрібна автентифікація) ---
router.use(authMiddleware.protect);

// --- Маршрути для поточного користувача (/me) ---
router.get('/me', userController.getMe, userController.getUser); // Використовує getMe для встановлення req.params.id

router.patch(
    '/me', // Використовуємо PATCH для оновлення
    userController.getMe, // Встановлюємо req.params.id = req.user._id
    uploadMiddleware.uploadAvatar, // Обробка файлу (поле 'avatar')
    uploadMiddleware.handleAvatarUrl, // Обробка URL/видалення/GCS -> req.body.imageUrl
    uploadMiddleware.handleMulterError, // Обробка помилок Multer
    validationMiddleware.validateUpdateMe, // Валідація name, bio, removeAvatar
    userController.updateMe
);

router.patch( // Використовуємо PATCH
    '/updateMyPassword',
    validationMiddleware.validateUpdatePassword, // Валідація паролів
    userController.updatePassword
);

// Закладки
router.get('/bookmarks', userController.getBookmarks); // Отримати список закладок
router.post( // POST для зміни стану
    '/bookmarks/:storyId',
    validationMiddleware.validateMongoId('storyId', 'params'), // Валідація ID історії
    userController.toggleBookmark // Додати/видалити закладку
);

// Підписки на авторів
router.get('/following', userController.getFollowing); // Отримати список тих, на кого підписаний
router.post( // POST для зміни стану
    '/follow/:authorId',
    validationMiddleware.validateMongoId('authorId', 'params'), // Валідація ID автора
    userController.toggleFollow // Підписатись/відписатись
);
router.get( // GET для отримання статусу
    '/following/:authorId/status',
    validationMiddleware.validateMongoId('authorId', 'params'), // Валідація ID автора
    userController.checkIfFollowing // Перевірити, чи стежить за автором
);

// Статус взаємодії з конкретною історією
router.get(
    '/stories/:storyId/interaction-status',
    validationMiddleware.validateMongoId('storyId', 'params'), // Валідація ID історії
    userController.getStoryInteractionStatus
);

// --- Маршрути тільки для Адміністраторів ---
router.use(authMiddleware.restrictTo('admin'));

router.route('/') // Маршрут /api/v1/users/
    .get(userController.getAllUsers); // Отримати всіх користувачів

router.route('/:id') // Маршрут /api/v1/users/:id
    .get(
        validationMiddleware.validateMongoId('id', 'params'), // Валідація ID
        userController.getUser // Отримати користувача за ID
    )
    .patch(
        // Валідація ID та тіла запиту для адмінського оновлення
        validationMiddleware.validateAdminUpdateUser,
        userController.updateUser // Оновити користувача (роль, статус, преміум)
    )
    .delete(
        validationMiddleware.validateMongoId('id', 'params'), // Валідація ID
        userController.deleteUser // Деактивувати (м'яке видалення) користувача
    );

module.exports = router;
// --- END OF FILE routes/userRoutes.js ---