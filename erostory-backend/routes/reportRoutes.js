// --- START OF FILE routes/reportRoutes.js ---
const express = require('express');
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');

const router = express.Router();

// --- Створення скарги (потребує лише авторизації) ---
router.post(
    '/',
    authMiddleware.protect, // Користувач має бути залогінений, щоб скаржитись
    validationMiddleware.validateCreateReport, // Валідуємо тіло запиту (type, reportedItem, reason)
    reportController.createReport
);

// --- Маршрути для адмінів/модераторів ---
router.use(authMiddleware.protect, authMiddleware.restrictTo('admin', 'moderator'));

// GET /reports - Отримати всі скарги (з фільтрами/пагінацією)
router.get('/', reportController.getAllReports);

// Маршрути для конкретної скарги
router.route('/:id')
    .get(
        validationMiddleware.validateMongoId('id', 'params'), // Валідація ID скарги
        reportController.getReport // GET /reports/:id - Отримати деталі однієї скарги
    )
    .patch(
        validationMiddleware.validateUpdateReportStatus, // Валідація ID та тіла (status, adminNotes)
        reportController.updateReportStatus // PATCH /reports/:id - Оновити статус скарги
    );

// Можна додати DELETE /reports/:id, якщо адмінам потрібна можливість видаляти скарги
// router.delete(
//     '/:id',
//     validationMiddleware.validateMongoId('id', 'params'),
//     authMiddleware.restrictTo('admin'), // Наприклад, тільки головний адмін
//     reportController.deleteReport // Потрібно створити цей контролер
// );

module.exports = router;
// --- END OF FILE routes/reportRoutes.js ---