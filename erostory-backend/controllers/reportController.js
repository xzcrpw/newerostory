// --- START OF FILE controllers/reportController.js ---
const mongoose = require('mongoose');
const Report = require('../models/Report');
const Story = require('../models/Story');
const Comment = require('../models/Comment');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const sendTelegramNotification = require('../utils/telegramNotifier');
const sendEmail = require('../utils/email');
require('colors');

// --- CREATE REPORT (Logged in users) ---
exports.createReport = catchAsync(async (req, res, next) => {
    const { type, reportedItem, reason } = req.body;
    const reporterId = req.user._id; // ID користувача, що скаржиться

    // Валідація вхідних даних (вже є в middleware)
    if (!type || !reportedItem || !reason) {
        return next(new AppError('Необхідно вказати тип, ID об\'єкта та причину скарги.', 400));
    }
    if (!['story', 'comment', 'user'].includes(type)) {
        return next(new AppError('Некоректний тип об\'єкта скарги.', 400));
    }
    if (!mongoose.Types.ObjectId.isValid(reportedItem)) {
        return next(new AppError('Некоректний ID об\'єкта скарги.', 400));
    }
    if (reason.trim().length < 10 || reason.trim().length > 500) {
        return next(new AppError('Причина скарги повинна містити від 10 до 500 символів.', 400));
    }

    // 1. Перевірка, чи користувач не скаржиться сам на себе
    if (type === 'user' && reportedItem.toString() === reporterId.toString()) {
        return next(new AppError('Ви не можете поскаржитися самі на себе.', 400));
    }

    // 2. Перевірка існування об'єкта скарги
    let Model;
    if (type === 'story') Model = Story;
    else if (type === 'comment') Model = Comment;
    else if (type === 'user') Model = User;
    else return next(new AppError('Помилка визначення моделі скарги.', 500)); // Малоймовірно

    const itemExists = await Model.exists({ _id: reportedItem });
    if (!itemExists) {
        return next(new AppError(`Об'єкт скарги (тип: ${type}, ID: ${reportedItem}) не знайдено. Можливо, його було видалено.`, 404));
    }

    // 3. Перевірка на дублюючу скаргу від цього ж користувача
    const existingReport = await Report.findOne({ reporter: reporterId, reportedItem, type, status: { $in: ['new', 'in_progress'] } });
    if (existingReport) {
        console.warn(`Повторна активна скарга від ${reporterId} на ${type} ${reportedItem}.`);
        // Можна повернути помилку або просто повідомлення про успіх
        return res.status(200).json({
            status: 'success',
            message: 'Ваша скарга на цей об\'єкт вже обробляється або була нещодавно подана.'
        });
    }

    // 4. Створення скарги
    const newReport = await Report.create({
        type,
        reportedItem,
        reason: reason.trim(),
        reporter: reporterId
    });

    // 5. Сповіщення адмінам/модераторам
    try {
        const adminBaseUrl = process.env.ADMIN_URL || process.env.FRONTEND_URL || '';
        // Формуємо URL адмінки (потрібно буде створити відповідний роут/сторінку)
        const reportAdminLink = `${adminBaseUrl}/admin/reports.html?reportId=${newReport._id}`;
        const message = `🔔 Нова скарга! (ID: ${newReport._id})
Тип: ${type}
ID Об'єкта: ${reportedItem}
Причина: ${reason.trim().substring(0, 200)}...
Від: ${req.user.name} (ID: ${reporterId})
Переглянути в адмінці: ${reportAdminLink}`;

        await sendTelegramNotification(message, { disable_web_page_preview: false }); // Дозволяємо прев'ю посилання
    } catch (notificationError) {
        console.error("Помилка відправки Telegram сповіщення про нову скаргу:".red, notificationError);
        // Не перериваємо процес через помилку сповіщення
    }

    console.log(`Створено нову скаргу ID: ${newReport._id} на ${type} ${reportedItem} від ${reporterId}`.blue);
    res.status(201).json({
        status: 'success',
        message: 'Вашу скаргу успішно надіслано та буде розглянуто модераторами найближчим часом.',
        data: { reportId: newReport._id }
    });
});

// --- GET ALL REPORTS (Admin/Moderator only) ---
exports.getAllReports = catchAsync(async (req, res, next) => {
    const filter = {};
    const allowedStatuses = ['new', 'in_progress', 'resolved', 'rejected'];
    const allowedTypes = ['story', 'comment', 'user'];

    // Фільтрація за query параметрами
    if (req.query.status && allowedStatuses.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.type && allowedTypes.includes(req.query.type)) filter.type = req.query.type;
    if (req.query.reporterId && mongoose.Types.ObjectId.isValid(req.query.reporterId)) filter.reporter = req.query.reporterId;
    if (req.query.reportedItemId && mongoose.Types.ObjectId.isValid(req.query.reportedItemId)) filter.reportedItem = req.query.reportedItemId;

    const features = new APIFeatures(
        Report.find(filter)
            .populate({ path: 'reporter', select: 'name email avatarUrl' }) // Додаємо аватар репортера
            .populate({ path: 'resolvedBy', select: 'name' }), // Ім'я того, хто вирішив
        req.query
    )
        // .filter() // Фільтр вже застосовано вище
        .sort(req.query.sort || '-createdAt') // Новіші спочатку
        .paginate(20); // Пагінація

    const reports = await features.query.lean(); // .lean() для продуктивності
    const totalDocuments = await Report.countDocuments(filter);

    // --- Populate reportedItem Details (динамічно) ---
    if (reports.length > 0) {
        const itemsToPopulate = { story: [], comment: [], user: [] };
        reports.forEach(report => {
            // Перевіряємо, чи є ID і чи він валідний
            if (report.reportedItem && mongoose.Types.ObjectId.isValid(report.reportedItem)) {
                if (report.type === 'story') itemsToPopulate.story.push(report.reportedItem);
                else if (report.type === 'comment') itemsToPopulate.comment.push(report.reportedItem);
                else if (report.type === 'user') itemsToPopulate.user.push(report.reportedItem);
            } else {
                report.reportedItemDetails = { _id: report.reportedItem, status: 'invalid_id' };
            }
        });

        // Виконуємо запити паралельно
        const [storyDetails, commentDetails, userDetails] = await Promise.all([
            itemsToPopulate.story.length > 0 ? Story.find({ _id: { $in: itemsToPopulate.story } }).select('title slug status author').populate('author', 'name').lean() : Promise.resolve([]),
            itemsToPopulate.comment.length > 0 ? Comment.find({ _id: { $in: itemsToPopulate.comment } }).select('text status author story').populate('author', 'name').populate('story', 'title slug').lean() : Promise.resolve([]),
            itemsToPopulate.user.length > 0 ? User.find({ _id: { $in: itemsToPopulate.user } }).select('name email role isActive avatarUrl').lean() : Promise.resolve([]),
        ]);

        // Створюємо мапи для швидкого доступу
        const storyMap = storyDetails.reduce((map, item) => { map[item._id.toString()] = item; return map; }, {});
        const commentMap = commentDetails.reduce((map, item) => { map[item._id.toString()] = item; return map; }, {});
        const userMap = userDetails.reduce((map, item) => { map[item._id.toString()] = item; return map; }, {});

        // Додаємо деталі до кожної скарги
        reports.forEach(report => {
            const itemIdStr = report.reportedItem?.toString();
            if (itemIdStr && !report.reportedItemDetails) { // Додаємо деталі, тільки якщо їх ще немає
                if (report.type === 'story' && storyMap[itemIdStr]) report.reportedItemDetails = storyMap[itemIdStr];
                else if (report.type === 'comment' && commentMap[itemIdStr]) report.reportedItemDetails = commentMap[itemIdStr];
                else if (report.type === 'user' && userMap[itemIdStr]) report.reportedItemDetails = userMap[itemIdStr];
                else report.reportedItemDetails = { _id: itemIdStr, status: 'deleted' }; // Якщо об'єкт видалено
            }
        });
    }
    // --- Кінець Populate ---

    res.status(200).json({
        status: 'success',
        results: reports.length,
        data: reports,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});


// --- GET ONE REPORT (Admin/Moderator only) ---
exports.getReport = catchAsync(async (req, res, next) => {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
        return next(new AppError('Некоректний ID скарги.', 400));
    }

    const report = await Report.findById(reportId)
        .populate({ path: 'reporter', select: 'name email avatarUrl' })
        .populate({ path: 'resolvedBy', select: 'name' })
        .lean(); // Використовуємо lean

    if (!report) {
        return next(new AppError('Скаргу не знайдено.', 404));
    }

    // --- Populate reportedItem Details (динамічно) ---
    if (report.reportedItem) {
        let Model;
        let selectFields = '_id'; // Мінімальний набір полів
        let populatePaths = []; // Шляхи для подальшого populate

        if (report.type === 'story') {
            Model = Story;
            selectFields = 'title slug status author imageUrl createdAt';
            populatePaths.push({ path: 'author', select: 'name avatarUrl' });
        } else if (report.type === 'comment') {
            Model = Comment;
            selectFields = 'text status author story createdAt';
            populatePaths.push(
                { path: 'author', select: 'name avatarUrl' },
                { path: 'story', select: 'title slug' }
            );
        } else if (report.type === 'user') {
            Model = User;
            selectFields = 'name email role isActive avatarUrl createdAt';
        }

        if (Model && mongoose.Types.ObjectId.isValid(report.reportedItem)) {
            try {
                let query = Model.findById(report.reportedItem).select(selectFields);
                populatePaths.forEach(p => query = query.populate(p));
                const itemDetails = await query.lean();
                report.reportedItemDetails = itemDetails || { _id: report.reportedItem, status: 'deleted' }; // Позначаємо як видалений, якщо не знайдено
            } catch (populateError) {
                console.error(`Помилка populate для reportedItem ${report.reportedItem} (${report.type}):`, populateError);
                report.reportedItemDetails = { _id: report.reportedItem, status: 'error_loading' };
            }
        } else if (!mongoose.Types.ObjectId.isValid(report.reportedItem)) {
            report.reportedItemDetails = { _id: report.reportedItem, status: 'invalid_id' };
        }
    }
    // --- Кінець Populate ---

    res.status(200).json({ status: 'success', data: report });
});

// --- UPDATE REPORT STATUS (Admin/Moderator only) ---
exports.updateReportStatus = catchAsync(async (req, res, next) => {
    const reportId = req.params.id;
    const { status, adminNotes } = req.body; // Валідація в middleware

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
        return next(new AppError('Некоректний ID скарги.', 400));
    }
    const allowedStatuses = ['new', 'in_progress', 'resolved', 'rejected'];
    if (!allowedStatuses.includes(status)) {
        return next(new AppError(`Неприпустимий статус скарги: ${status}.`, 400));
    }

    const updateData = {
        status,
        resolvedBy: req.user._id, // Той, хто оновив статус
        resolvedAt: Date.now()     // Час вирішення/зміни
    };
    // Додаємо нотатки, якщо вони передані (і не порожні після trim)
    if (adminNotes !== undefined && adminNotes !== null && String(adminNotes).trim()) {
        updateData.adminNotes = String(adminNotes).trim();
    } else if (adminNotes === '' || adminNotes === null) {
        // Дозволяємо очистити нотатки
        updateData.adminNotes = null;
    }


    const report = await Report.findByIdAndUpdate(reportId, updateData, {
        new: true, // Повернути оновлений документ
        runValidators: true, // Запустити валідацію (напр., довжина adminNotes)
    }).populate('reporter', 'name email telegramUserId preferredLang'); // Populate для сповіщення

    if (!report) return next(new AppError('Скаргу не знайдено.', 404));

    // --- Сповіщення користувачу, що подав скаргу ---
    if (report.reporter && ['resolved', 'rejected'].includes(report.status)) {
        try {
            const reporter = report.reporter;
            const reporterLang = reporter.preferredLang || 'uk';
            const reportIdShort = report._id.toString().slice(-6); // Короткий ID для листа
            const statusTextMap = {
                resolved: 'вирішено', // TODO: i18n
                rejected: 'відхилено' // TODO: i18n
            };
            const statusText = statusTextMap[report.status] || report.status;

            const subject = `Статус вашої скарги #${reportIdShort} оновлено`; // TODO: i18n
            const baseMessage = `Шановний(а) ${reporter.name || 'Користувач'}!\n\nСтатус вашої скарги #${reportIdShort} на об'єкт типу "${report.type}" (ID: ${report.reportedItem}) було оновлено на "${statusText}".`;
            const adminNoteMessage = report.adminNotes ? `\n\nПримітка модератора:\n${report.adminNotes}\n` : '\n';
            const closingMessage = `\nДякуємо за допомогу у підтримці безпеки нашого ресурсу.\n\nЗ повагою,\nКоманда EroStory`; // TODO: i18n

            const emailMessage = baseMessage + adminNoteMessage + closingMessage;
            // Формуємо повідомлення для Telegram (з HTML)
            const telegramMessage = `ℹ️ Статус вашої скарги <code>#${reportIdShort}</code> оновлено на "<b>${statusText}</b>".${report.adminNotes ? `\n\n<i>Примітка:</i> ${report.adminNotes}` : ''}`;

            // Надсилаємо Email
            if (reporter.email) {
                const plainTextMessage = emailMessage.replace(/<[^>]*>?/gm, '');
                sendEmail({ email: reporter.email, subject, message: plainTextMessage, html: emailMessage })
                    .catch(e => console.error(`Email notification error (report ${report._id}):`, e));
            }
            // Надсилаємо Telegram
            if(reporter.telegramUserId) {
                sendTelegramNotification(telegramMessage, { parse_mode: 'HTML' }, reporter.telegramUserId)
                    .catch(e => console.error(`Telegram notification error (user ${reporter.telegramUserId}):`, e));
            }
        } catch (notificationError) {
            console.error(`Помилка надсилання сповіщення користувачу про скаргу ${reportId}:`, notificationError);
        }
    }
    // --- Кінець сповіщення ---

    console.log(`Статус скарги ${report._id} змінено на "${status}" адміністратором ${req.user.name}`.cyan);
    res.status(200).json({ status: 'success', data: report });
});
// --- END OF FILE controllers/reportController.js ---