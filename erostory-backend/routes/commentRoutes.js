// --- START OF FILE routes/commentRoutes.js ---
const express = require('express');
const commentController = require('../controllers/commentController');
const likeController = require('../controllers/likeController'); // Потрібен для /likes/toggle
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');

// mergeParams: true дозволяє отримати :storyId з батьківського роутера (storyRoutes)
const router = express.Router({ mergeParams: true });

// --- Застосовуємо захист до всіх маршрутів коментарів ---
// Навіть для GET, щоб мати req.user для перевірки статусу лайків
router.use(authMiddleware.protect);

// --- Маршрути для коментарів В МЕЖАХ ІСТОРІЇ (:storyId) ---

router.route('/')
    .get(commentController.getAllComments) // GET /stories/:storyId/comments
    .post(
        // storyId встановлюється автоматично з mergeParams
        validationMiddleware.validateCreateComment, // Валідація text, parentComment
        commentController.setStoryUserIds, // Встановлює author (story вже є)
        commentController.createComment // Створення коментаря
    );

// Отримання статусів лайків для списку коментарів (специфічно для коментарів)
// POST /stories/:storyId/comments/like-statuses - логічніше тут
router.post(
    '/like-statuses',
    validationMiddleware.validateGetCommentLikeStatuses, // Валідуємо масив commentIds в тілі
    commentController.getLikeStatuses // Отримує статуси лайків для поточного користувача
);

// --- Маршрути для ОДИНОЧНОГО коментаря (за ID коментаря) ---
// Ці маршрути не залежать від :storyId в URL, вони працюють з :id коментаря

const commentRouterById = express.Router(); // Створюємо окремий роутер для /comments/:id

// Захищаємо його також
commentRouterById.use(authMiddleware.protect);

commentRouterById.route('/:id') // /comments/:id
    .get(
        validationMiddleware.validateMongoId('id', 'params'),
        commentController.getComment
    )
    .patch(
        validationMiddleware.validateUpdateComment, // Валідація ID та тексту
        commentController.updateComment
    )
    .delete(
        validationMiddleware.validateMongoId('id', 'params'),
        commentController.deleteComment
    );

// Маршрут для лайка/анлайка конкретного коментаря (використовуємо універсальний)
// POST /comments/:id/toggle-like (приклад можливого окремого маршруту)
// Але краще використовувати універсальний /likes/toggle
// commentRouterById.post(
//     '/:id/toggle-like',
//     validationMiddleware.validateMongoId('id', 'params'),
//     (req, res, next) => { // Додаємо middleware для встановлення targetModel
//         req.body.targetId = req.params.id;
//         req.body.targetModel = 'Comment';
//         next();
//     },
//     validationMiddleware.validateToggleLike, // Перевіряємо тіло
//     likeController.toggleLike // Викликаємо універсальний контролер
// );


// Маршрут для оновлення статусу коментаря (модерація)
// PATCH /comments/:id/status
commentRouterById.patch(
    '/:id/status',
    validationMiddleware.validateMongoId('id', 'params'), // Валідація ID коментаря
    authMiddleware.restrictTo('admin', 'moderator'), // Обмеження доступу
    validationMiddleware.validateUpdateReportStatus, // Валідатор підходить (перевіряє поле status)
    commentController.updateCommentStatus
);

// Експортуємо обидва роутери
// Основний роутер буде підключено до /stories/:storyId/comments
// Другий роутер буде підключено до /comments
module.exports = { storyCommentRouter: router, commentByIdRouter: commentRouterById };
// --- END OF FILE routes/commentRoutes.js ---