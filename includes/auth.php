<?php
// Функції для авторизації користувачів

/**
 * Реєстрація нового користувача
 *
 * @param string $username Ім'я користувача
 * @param string $email Електронна пошта
 * @param string $password Пароль
 * @return array Результат операції
 */
function register_user($username, $email, $password) {
    global $conn;

    // Перевірка на існування користувача
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        return ['success' => false, 'message' => 'Користувач з такою електронною поштою вже існує'];
    }

    // Хешування паролю
    $password_hash = password_hash($password, PASSWORD_DEFAULT);

    // Створення нового користувача
    $stmt = $conn->prepare("INSERT INTO users (username, email, password_hash, registration_date) VALUES (?, ?, ?, NOW())");
    $stmt->bind_param("sss", $username, $email, $password_hash);
    $result = $stmt->execute();

    if ($result) {
        return ['success' => true, 'message' => 'Реєстрація успішна', 'user_id' => $stmt->insert_id];
    } else {
        return ['success' => false, 'message' => 'Помилка при реєстрації: ' . $stmt->error];
    }
}

/**
 * Авторизація користувача
 *
 * @param string $email Електронна пошта
 * @param string $password Пароль
 * @return array Результат операції
 */
function login_user($email, $password) {
    global $conn;

    $stmt = $conn->prepare("SELECT id, username, password_hash, is_premium FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        return ['success' => false, 'message' => 'Користувача не знайдено'];
    }

    $user = $result->fetch_assoc();

    if (password_verify($password, $user['password_hash'])) {
        // Створення сесії
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['is_premium'] = $user['is_premium'];

        // Оновлення часу останнього входу
        $stmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
        $stmt->bind_param("i", $user['id']);
        $stmt->execute();

        return [
            'success' => true,
            'message' => 'Авторизація успішна',
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'is_premium' => $user['is_premium']
            ]
        ];
    } else {
        return ['success' => false, 'message' => 'Невірний пароль'];
    }
}

/**
 * Вихід з системи
 */
function logout_user() {
    // Видалення всіх змінних сесії
    $_SESSION = array();

    // Знищення сесії
    session_destroy();

    // Перенаправлення на головну сторінку
    header("Location: index.php");
    exit;
}

/**
 * Відновлення паролю
 *
 * @param string $email Електронна пошта
 * @return array Результат операції
 */
function reset_password($email) {
    global $conn;

    // Перевірка наявності користувача
    $stmt = $conn->prepare("SELECT id, username FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        return ['success' => false, 'message' => 'Користувача з такою електронною поштою не знайдено'];
    }

    $user = $result->fetch_assoc();

    // Генерація унікального токена для скидання паролю
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

    // Збереження токена в базі даних
    $stmt = $conn->prepare("
        INSERT INTO password_resets (user_id, token, expires_at) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)
    ");
    $stmt->bind_param("iss", $user['id'], $token, $expires);
    $result = $stmt->execute();

    if ($result) {
        // Надсилання електронного листа з посиланням для скидання паролю
        // В реальному проекті тут буде код для відправки електронної пошти

        // Для демонстрації повертаємо успішний результат
        return ['success' => true, 'message' => 'Інструкції для відновлення паролю надіслані на вашу електронну пошту'];
    } else {
        return ['success' => false, 'message' => 'Помилка при створенні запиту на відновлення паролю'];
    }
}
?>