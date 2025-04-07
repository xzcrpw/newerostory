// --- START OF FILE routes/adminRoutes.js ---
const express = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');
// Додаємо { body } для прямого використання валідаторів тіла запиту
const { body } = require('express-validator');

const router = express.Router();

// --- Застосовуємо захист та перевірку ролі до всіх маршрутів адмінки ---
router.use(authMiddleware.protect, authMiddleware.restrictTo('admin', 'moderator'));

// --- Маршрути доступні для Адмінів та Модераторів ---

// Дашборд
router.get('/dashboard', adminController.getDashboardStats);

// Модерація історій
router.get('/stories/pending', adminController.getPendingStories); // GET /admin/stories/pending
router.patch( // PATCH /admin/stories/:id/approve
    '/stories/:id/approve',
    validationMiddleware.validateMongoId('id', 'params'), // Валідація ID
    adminController.approveStory
);
router.patch( // PATCH /admin/stories/:id/reject
    '/stories/:id/reject',
    validationMiddleware.validateMongoId('id', 'params'),
    // Валідація тіла запиту для причини відхилення
    body('rejectionReason')
        .trim()
        .notEmpty().withMessage('Причина відхилення є обов\'язковою.')
        .isLength({ min: 5, max: 500 }).withMessage('Причина відхилення має бути від 5 до 500 символів.'),
    validationMiddleware.handleValidationErrors, // Обробник помилок валідації
    adminController.rejectStory
);

// Модерація коментарів
router.get('/comments/pending', adminController.getPendingComments); // GET /admin/comments/pending
router.patch( // PATCH /admin/comments/:id/approve
    '/comments/:id/approve',
    validationMiddleware.validateMongoId('id', 'params'),
    adminController.approveComment
);
router.patch( // PATCH /admin/comments/:id/reject
    '/comments/:id/reject',
    validationMiddleware.validateMongoId('id', 'params'),
    adminController.rejectComment
);

// Можна додати маршрути для перегляду всіх історій/коментарів/користувачів в адмінці
// Наприклад:
// router.get('/stories', storyController.getAllStories); // Використовуємо storyController, але з правами адміна
// router.get('/comments', commentController.getAllComments); // Потрібно буде додати логіку для адмінського перегляду всіх коментарів
// router.get('/users', userController.getAllUsers); // Вже є в userRoutes, але можна і тут для адмінки

// Маршрути для скарг (вже є в reportRoutes, але можна дублювати для зручності адмін-панелі)
// router.get('/reports', reportController.getAllReports);
// router.get('/reports/:id', validationMiddleware.validateMongoId('id'), reportController.getReport);
// router.patch('/reports/:id/status', validationMiddleware.validateUpdateReportStatus, reportController.updateReportStatus);

// --- Маршрути доступні ТІЛЬКИ для Адмінів ---
router.use(authMiddleware.restrictTo('admin')); // Подальше обмеження

// Керування налаштуваннями сайту
router.get('/settings', adminController.getSettings); // GET /admin/settings
router.patch( // PATCH /admin/settings
    '/settings',
    // Використовуємо спеціальний валідатор для налаштувань
    validationMiddleware.validateAdminUpdateSettings,
    adminController.updateSettings
);

// Маршрути для керування категоріями (вже є в categoryRoutes)
// router.post('/categories', validationMiddleware.validateCategory, categoryController.createCategory);
// router.patch('/categories/:idOrSlug', validationMiddleware.validateIdOrSlug, validationMiddleware.validateCategory, categoryController.updateCategory);
// router.delete('/categories/:idOrSlug', validationMiddleware.validateIdOrSlug, categoryController.deleteCategory);

// Маршрути для керування тегами (вже є в tagRoutes)
// router.post('/tags', validationMiddleware.validateTag, tagController.createTag);
// router.patch('/tags/:idOrSlug', validationMiddleware.validateIdOrSlug, validationMiddleware.validateTag, tagController.updateTag);
// router.delete('/tags/:idOrSlug', validationMiddleware.validateIdOrSlug, tagController.deleteTag);

// Маршрути для керування користувачами (вже є в userRoutes)
// router.get('/users', userController.getAllUsers);
// router.get('/users/:id', validationMiddleware.validateMongoId, userController.getUser);
// router.patch('/users/:id', validationMiddleware.validateAdminUpdateUser, userController.updateUser);
// router.delete('/users/:id', validationMiddleware.validateMongoId, userController.deleteUser);


module.exports = router;
// --- END OF FILE routes/adminRoutes.js ---