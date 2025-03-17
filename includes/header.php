<?php
// Включення файлу конфігурації
require_once 'includes/config.php';

// Ініціалізація змінних для відображення
$user_logged_in = isset($_SESSION['user_id']);
$is_premium = isset($_SESSION['is_premium']) && $_SESSION['is_premium'] == 1;
$current_user = isset($_SESSION['username']) ? $_SESSION['username'] : '';
?>
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($page_title) ? $page_title . ' — Таємний Світ' : 'Таємний Світ — ексклюзивні еротичні історії'; ?></title>

    <!-- Мета-теги для SEO -->
    <meta name="description" content="<?php echo isset($page_description) ? $page_description : 'Унікальні еротичні історії українською мовою. Читайте та діліться своїми фантазіями на Таємний Світ.'; ?>">

    <!-- Підключення CSS -->
    <link rel="stylesheet" href="css/main.css">
    <?php if (isset($additional_css)) echo $additional_css; ?>

    <!-- Шрифти -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">

    <!-- Font Awesome для іконок -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.1/css/all.min.css">

    <!-- Alpine.js для інтерактивності -->
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body>
<!-- Хедер -->
<header>
    <div class="container">
        <nav class="navbar">
            <a href="index.php" class="logo">Таємний<span>Світ</span></a>

            <ul class="nav-links">
                <li><a href="index.php" <?php if ($current_page == 'home') echo 'class="active"'; ?>>Головна</a></li>
                <li><a href="categories.php?filter=new" <?php if ($current_page == 'new_stories') echo 'class="active"'; ?>>Нові історії</a></li>
                <li><a href="categories.php?filter=top" <?php if ($current_page == 'top_stories') echo 'class="active"'; ?>>Топ рейтинг</a></li>
                <li><a href="categories.php" <?php if ($current_page == 'categories') echo 'class="active"'; ?>>Категорії</a></li>
                <li><a href="authors.php" <?php if ($current_page == 'authors') echo 'class="active"'; ?>>Автори</a></li>
            </ul>

            <div class="auth-buttons">
                <div class="lang-dropdown">
                    <span>UA</span>
                    <i class="fas fa-chevron-down"></i>
                </div>

                <?php if ($user_logged_in): ?>
                    <a href="profile.php" class="btn btn-outline"><i class="fas fa-user"></i> Профіль</a>
                    <a href="logout.php" class="btn btn-primary"><i class="fas fa-sign-out-alt"></i> Вийти</a>
                <?php else: ?>
                    <a href="login.php" class="btn btn-outline"><i class="fas fa-sign-in-alt"></i> Увійти</a>
                    <a href="login.php?action=register" class="btn btn-primary"><i class="fas fa-user-plus"></i> Реєстрація</a>
                <?php endif; ?>
            </div>
        </nav>
    </div>
</header>

<!-- Початок основного вмісту -->
<main>