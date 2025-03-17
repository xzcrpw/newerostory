<?php
// Налаштування часового поясу
date_default_timezone_set('Europe/Kiev');

// Налаштування підключення до бази даних
define('DB_HOST', 'localhost');
define('DB_USER', 'ваш_користувач');
define('DB_PASS', 'ваш_пароль');
define('DB_NAME', 'erostory');

// Створення підключення
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

// Перевірка підключення
if ($conn->connect_error) {
    die("Помилка підключення до бази даних: " . $conn->connect_error);
}

// Встановлення кодування
$conn->set_charset("utf8mb4");

// Функція для очищення вводу користувача
function clean_input($data) {
    global $conn;
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $conn->real_escape_string($data);
}

// Перевірка авторизації користувача
function is_logged_in() {
    return isset($_SESSION['user_id']);
}

// Перевірка преміум статусу
function is_premium_user() {
    return isset($_SESSION['is_premium']) && $_SESSION['is_premium'] == 1;
}

// Ініціалізація сесії
session_start();
?>