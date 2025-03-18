// server.js - Головний файл сервера
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Завантаження змінних середовища
dotenv.config();

// Імпорт маршрутів
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const storyRoutes = require('./routes/stories');
const commentRoutes = require('./routes/comments');
const categoryRoutes = require('./routes/categories');

// Ініціалізація Express
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Дозволяє запити з фронтенду
app.use(express.json()); // Парсинг JSON
app.use(express.urlencoded({ extended: true })); // Парсинг URL-encoded форм

// Статичні файли
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Маршрути API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/categories', categoryRoutes);

// Тестовий маршрут
app.get('/', (req, res) => {
    res.send('API сервер "Таємний Світ" працює успішно');
});

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Підключено до MongoDB');

        // Запуск сервера
        app.listen(PORT, () => {
            console.log(`Сервер запущено на порту ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Помилка підключення до MongoDB:', err.message);
    });