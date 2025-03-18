// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Серіалізація користувача для сесії
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Десеріалізація користувача з сесії
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Налаштування Google OAuth стратегії
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: '/api/auth/google/callback',
            scope: ['profile', 'email']
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Перевірка, чи існує користувач з таким Google ID
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    return done(null, user);
                }

                // Перевірка, чи існує користувач з такою email-адресою
                const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
                if (email) {
                    user = await User.findOne({ email });

                    if (user) {
                        // Оновлюємо користувача, додаючи Google ID
                        user.googleId = profile.id;
                        await user.save();
                        return done(null, user);
                    }
                }

                // Створення нового користувача
                const username = `${profile.name.givenName || ''}${profile.name.familyName || ''}${Math.floor(Math.random() * 1000)}`;
                const newUser = await User.create({
                    googleId: profile.id,
                    email: email,
                    username: username,
                    password: Math.random().toString(36).slice(-8), // Генерація випадкового пароля
                    avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : 'default-avatar.jpg'
                });

                return done(null, newUser);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);

module.exports = passport;