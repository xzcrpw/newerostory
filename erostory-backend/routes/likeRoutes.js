// --- START OF FILE routes/likeRoutes.js ---
const express = require('express');
const likeController = require('../controllers/likeController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');

const router = express.Router();

// Всі дії з лайками потребують авторизації
router.use(authMiddleware.protect);

// Універсальний маршрут для лайків/анлайків
router.post( // Використовуємо POST для зміни стану
    '/toggle',
    validationMiddleware.validateToggleLike, // Валідація targetId та targetModel в тілі запиту
    likeController.toggleLike
);

// Можна додати інші маршрути, якщо потрібно, наприклад:
// GET /likes/stories/:storyId - отримати користувачів, що лайкнули історію
// GET /likes/comments/:commentId - отримати користувачів, що лайкнули коментар

module.exports = router;
// --- END OF FILE routes/likeRoutes.js ---