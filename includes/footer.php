</main>

<!-- Плаваюча кнопка для створення історії -->
<?php if (isset($_SESSION['user_id'])): ?>
    <a href="create_story.php" class="floating-button" title="Створити історію">
        <i class="fas fa-plus"></i>
    </a>
<?php endif; ?>

<!-- Підключення JavaScript -->
<script src="js/main.js"></script>
<?php if (isset($additional_js)) echo $additional_js; ?>
</body>
</html>