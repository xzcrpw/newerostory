// --- START OF FILE config/passport.js ---
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User'); // Переконайся, що шлях правильний
const AppError = require('../utils/AppError');
require('colors'); // Для логування

module.exports = function(passportInstance) {

    // Перевірка змінних середовища
    const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SERVER_BASE_URL', 'GOOGLE_CALLBACK_URL'];
    const missingEnv = requiredEnv.filter(v => !process.env[v]);
    if (missingEnv.length > 0) {
        console.error(`ПОМИЛКА PASSPORT: Змінні середовища для Google OAuth не налаштовані! Відсутні: ${missingEnv.join(', ')}`.red.bold);
        return; // Не налаштовуємо стратегію
    }

    const callbackURL = `${process.env.SERVER_BASE_URL}${process.env.GOOGLE_CALLBACK_URL}`;
    console.log(`[Passport] Google Callback URL configured as: ${callbackURL}`.grey);

    passportInstance.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: callbackURL,
            scope: ['profile', 'email'] // Запитуємо профіль та email
        },
        async (accessToken, refreshToken, profile, done) => {
            // Ця функція викликається після успішної автентифікації Google
            try {
                // console.debug('Google Profile Raw:', JSON.stringify(profile, null, 2)); // Debug log

                const email = profile.emails?.[0]?.value?.toLowerCase();
                if (!email) {
                    console.error('[Passport Google Strategy] Не вдалося отримати email від Google profile:', profile);
                    return done(new AppError('Не вдалося отримати email від Google.', 400), false);
                }

                // Шукаємо користувача (включаючи неактивних)
                let user = await User.findOne({ email: email }).setOptions({ includeInactive: true });

                if (user) {
                    if (!user.isActive) {
                        console.warn(`[Passport Google Strategy] Спроба входу для неактивного користувача: ${email}`.yellow);
                        return done(null, false, { message: 'Обліковий запис не активний.' });
                    }
                    // Користувач існує і активний
                    console.log(`[Passport Google Strategy] Існуючий користувач увійшов через Google: ${email}`.blue);
                    let needsUpdate = false;
                    if (user.provider === 'local') { user.provider = 'google'; needsUpdate = true; } // Оновлюємо провайдера
                    if (!user.name && profile.displayName) { user.name = profile.displayName; needsUpdate = true; }
                    if (!user.avatarUrl && profile.photos?.[0]?.value) { user.avatarUrl = profile.photos[0].value; needsUpdate = true; }
                    if (needsUpdate) await user.save({ validateBeforeSave: false });

                    return done(null, user); // Передаємо користувача в authController.googleCallback
                } else {
                    // Створюємо нового користувача
                    console.log(`[Passport Google Strategy] Створення нового користувача через Google: ${email}`.blue);
                    const newUser = await User.create({
                        name: profile.displayName || profile.name?.givenName || email.split('@')[0],
                        email: email,
                        provider: 'google',
                        avatarUrl: profile.photos?.[0]?.value || null,
                        isActive: true
                    });
                    return done(null, newUser); // Передаємо нового користувача
                }
            } catch (err) {
                console.error('Помилка в Google OAuth стратегії Passport:'.red.bold, err);
                return done(err, false); // Передаємо помилку далі
            }
        }));

    // Функції serialize/deserialize НЕ потрібні, якщо використовуємо JWT
    // і не зберігаємо повну сесію користувача на сервері (session: false в authenticate)
};
// --- END OF FILE config/passport.js ---