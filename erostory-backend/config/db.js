// --- START OF FILE config/db.js ---
const mongoose = require('mongoose');
require('colors'); // Підключаємо colors один раз тут

const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
        console.error('ПОМИЛКА: MONGO_URI не знайдено в змінних середовища!'.red.bold);
        process.exit(1); // Критична помилка конфігурації
    }

    try {
        await mongoose.connect(mongoURI);
        console.log(`MongoDB підключено успішно до: ${mongoose.connection.host}`.cyan.underline);

        mongoose.connection.on('error', (err) => {
            console.error(`ПОМИЛКА MongoDB Connection: ${err.message}`.red.bold);
        });
        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB відключено.'.yellow);
        });
        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB перепідключено успішно.'.green);
        });

    } catch (err) {
        console.error(`ПОМИЛКА ПІДКЛЮЧЕННЯ до MongoDB: ${err.message}`.red.bold);
        console.error(`Середовище: ${process.env.NODE_ENV || 'development'}`);
        process.exit(1);
    }
};

module.exports = connectDB;
// --- END OF FILE config/db.js ---