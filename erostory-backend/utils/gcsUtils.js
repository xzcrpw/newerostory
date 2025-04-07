// --- START OF FILE utils/gcsUtils.js ---
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const AppError = require('./AppError');
const dotenv = require('dotenv');
require('colors'); // Підключаємо colors

// Завантажуємо змінні один раз
dotenv.config();

let storage;
let bucket;
let gcsEnabled = false; // Початково false
let gcsInitializationError = null; // Зберігаємо помилку ініціалізації
const bucketName = process.env.GCS_BUCKET_NAME;

// Асинхронна ініціалізація та перевірка
async function initializeGCS() {
    if (!process.env.GCS_KEYFILE_PATH || !bucketName) {
        console.warn("[GCS] GCS_KEYFILE_PATH або GCS_BUCKET_NAME не знайдено в .env. Завантаження файлів у Google Cloud Storage вимкнено.".yellow);
        gcsEnabled = false;
        gcsInitializationError = 'GCS_KEYFILE_PATH or GCS_BUCKET_NAME not set';
        return;
    }

    try {
        console.log('[GCS] Ініціалізація Google Cloud Storage...');
        storage = new Storage({
            keyFilename: process.env.GCS_KEYFILE_PATH,
        });
        bucket = storage.bucket(bucketName);

        console.log(`[GCS] Перевірка існування бакету "${bucketName}"...`);
        const [exists] = await bucket.exists();

        if (exists) {
            gcsEnabled = true;
            gcsInitializationError = null;
            console.log(`[GCS] Google Cloud Storage підключено до бакету: ${bucketName}`.cyan);
        } else {
            gcsEnabled = false;
            gcsInitializationError = `Bucket "${bucketName}" not found or no access.`;
            console.error(`[GCS] ПОМИЛКА: Бакет "${bucketName}" не знайдено або немає доступу. Завантаження файлів буде вимкнено.`.red.bold);
        }
    } catch (error) {
        gcsEnabled = false;
        gcsInitializationError = error.message || 'GCS initialization failed';
        console.error("[GCS] ПОМИЛКА: Помилка ініціалізації Google Cloud Storage. Перевірте шлях до файлу ключа (`GCS_KEYFILE_PATH`). Завантаження файлів буде вимкнено.".red.bold, error);
    }
}

// Запускаємо асинхронну ініціалізацію
initializeGCS();

/**
 * Перевіряє, чи налаштовано та доступно GCS.
 * @returns {boolean}
 */
const isGcsEnabled = () => gcsEnabled;

/**
 * Завантажує файл (буфер з пам'яті) в Google Cloud Storage.
 * @param {object} file - Об'єкт файлу з multer (з полем buffer та mimetype).
 * @param {string} destinationPath - Шлях для збереження файлу в бакеті (напр., 'stories/image.jpg').
 * @returns {Promise<string>} - Проміс, що повертає публічний URL завантаженого файлу.
 * @throws {AppError} Якщо сталася помилка під час завантаження або GCS не доступний.
 */
const uploadToGCS = (file, destinationPath) => {
    return new Promise((resolve, reject) => {
        if (!isGcsEnabled() || !bucket) {
            console.error("[GCS Upload] Спроба завантаження при вимкненому або неініціалізованому GCS.");
            return reject(new AppError(`Сервіс GCS недоступний (${gcsInitializationError || 'невідома причина'}).`, 503));
        }
        if (!file || !file.buffer || !file.mimetype) {
            console.error("[GCS Upload] Некоректний об'єкт файлу:", file);
            return reject(new AppError('Некоректний формат файлу для завантаження.', 400));
        }

        const blob = bucket.file(destinationPath);
        const blobStream = blob.createWriteStream({
            resumable: false,
            gzip: true,
            metadata: {
                contentType: file.mimetype,
                cacheControl: 'public, max-age=31536000', // Кешування на 1 рік (приклад)
            }
        });

        blobStream.on('error', (err) => {
            console.error(`[GCS Upload Stream Error] ${destinationPath}:`, err);
            reject(new AppError('Помилка під час потокової передачі файлу в GCS.', 500));
        });

        blobStream.on('finish', async () => {
            try {
                // Робимо файл публічним (якщо це потрібно за логікою додатка)
                // Важливо: переконайтесь, що політика бакета це дозволяє (Uniform access)
                await blob.makePublic();
                const publicUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
                console.log(`[GCS Upload] Файл ${destinationPath} успішно завантажено: ${publicUrl}`.green);
                resolve(publicUrl);
            } catch (makePublicError) {
                console.error(`[GCS Make Public Error] ${destinationPath}:`, makePublicError);
                // Можливо, помилка не критична, якщо публічний доступ не потрібен одразу
                // Але для нашого випадку, де URL потрібен для показу, це помилка
                reject(new AppError('Помилка надання публічного доступу до файлу в GCS.', 500));
            }
        });

        // Починаємо запис буфера в потік
        blobStream.end(file.buffer);
    });
};

/**
 * Видаляє файл з Google Cloud Storage за його URL.
 * @param {string} fileUrl - Повний URL файлу в GCS.
 * @returns {Promise<void>} - Проміс завершується після спроби видалення.
 */
const deleteFromGCS = async (fileUrl) => {
    if (!isGcsEnabled() || !bucket) {
        console.log(`[GCS Delete] Пропуск: GCS вимкнено або не ініціалізовано.`);
        return;
    }
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith(`https://storage.googleapis.com/${bucketName}/`)) {
        console.log(`[GCS Delete] Пропуск: Некоректний або відсутній URL: ${fileUrl}`);
        return;
    }

    try {
        // Витягуємо шлях до файлу з URL
        const urlPrefix = `https://storage.googleapis.com/${bucketName}/`;
        const filePath = decodeURIComponent(fileUrl.substring(urlPrefix.length));

        if (!filePath) {
            console.warn(`[GCS Delete] Не вдалося витягти шлях з URL: ${fileUrl}`);
            return;
        }

        console.log(`[GCS Delete] Спроба видалення файлу: ${filePath}`.yellow);
        // ignoreNotFound: true - не видавати помилку, якщо файлу вже немає
        await bucket.file(filePath).delete({ ignoreNotFound: true });
        console.log(`[GCS Delete] Файл ${filePath} успішно видалено (або не знайдено).`.cyan);
    } catch (error) {
        console.error(`[GCS Delete] ПОМИЛКА: Не вдалося видалити файл ${fileUrl}.`.red.bold, error);
        // Не кидаємо помилку далі, лише логуємо, бо це може бути не критично
    }
};

module.exports = {
    isGcsEnabled,
    uploadToGCS,
    deleteFromGCS,
};
// --- END OF FILE utils/gcsUtils.js ---