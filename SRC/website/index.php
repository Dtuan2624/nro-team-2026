<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('nro_site_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

require_once __DIR__ . '/../admin/config.php';

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function siteDb(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function siteContent(): array
{
    $path = __DIR__ . '/content.json';
    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('Không đọc được website/content.json.');
    }
    $content = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($content) || !isset($content['downloads']) || !is_array($content['downloads'])) {
        throw new RuntimeException('Cấu hình website không đúng định dạng.');
    }
    return $content;
}

function csrfToken(): string
{
    if (!isset($_SESSION['site_csrf'])) {
        $_SESSION['site_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['site_csrf'];
}

function csrfInput(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrfToken()) . '">';
}

function redirectTo(string $target): never
{
    header('Location: ' . $target, true, 303);
    exit;
}

function setFlash(string $key, string $message): void
{
    $_SESSION['site_flash'][$key] = $message;
}

function takeFlash(string $key): string
{
    $message = (string) ($_SESSION['site_flash'][$key] ?? '');
    unset($_SESSION['site_flash'][$key]);
    return $message;
}

function requireSignedIn(PDO $db): array
{
    $user = $_SESSION['site_user'] ?? null;
    if (!is_array($user) || empty($user['id']) || empty($user['username'])) {
        setFlash('error', 'Vui lòng đăng nhập để tiếp tục.');
        redirectTo('index.php?page=login');
    }
    $stmt = $db->prepare('SELECT username, ban FROM account WHERE id = ?');
    $stmt->execute([(int) $user['id']]);
    $account = $stmt->fetch();
    if (!$account || (int) $account['ban'] !== 0) {
        unset($_SESSION['site_user']);
        setFlash('error', 'Tài khoản không còn quyền truy cập diễn đàn.');
        redirectTo('index.php?page=login');
    }
    return ['id' => (int) $user['id'], 'username' => (string) $account['username']];
}

function enforceCooldown(string $key, int $seconds): void
{
    $now = time();
    $last = (int) ($_SESSION['site_cooldowns'][$key] ?? 0);
    if ($now - $last < $seconds) {
        throw new DomainException('Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.');
    }
    $_SESSION['site_cooldowns'][$key] = $now;
}

function forumImagePaths(mixed $raw): array
{
    if (!is_string($raw) || $raw === '' || $raw === '0') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    return array_values(array_filter(
        $decoded,
        static fn ($path): bool => is_string($path) && preg_match('#^uploads/forum/[a-f0-9-]+\.(?:jpg|png|webp)$#i', $path) === 1
    ));
}

function storeForumUploads(): array
{
    if (!isset($_FILES['images'])) {
        return [];
    }
    $upload = $_FILES['images'];
    if (!is_array($upload['name'] ?? null)) {
        throw new DomainException('Danh sách ảnh tải lên không hợp lệ.');
    }
    $fileCount = count($upload['name']);
    if ($fileCount > 2) {
        throw new DomainException('Mỗi bài viết chỉ được đính kèm tối đa 2 ảnh.');
    }

    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'forum';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Không thể tạo thư mục lưu ảnh diễn đàn.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $extensions = ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp'];
    $pending = [];
    foreach ($upload['name'] as $index => $_name) {
        $error = (int) ($upload['error'][$index] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK) {
            throw new DomainException('Không thể tải ảnh lên. Vui lòng chọn lại ảnh nhỏ hơn 5 MB.');
        }
        $tmp = (string) ($upload['tmp_name'][$index] ?? '');
        $size = (int) ($upload['size'][$index] ?? 0);
        if ($size < 1 || $size > 5 * 1024 * 1024 || !is_uploaded_file($tmp)) {
            throw new DomainException('Mỗi ảnh phải có dung lượng từ 1 byte đến 5 MB.');
        }
        $mime = $finfo->file($tmp);
        if (!isset($extensions[$mime])) {
            throw new DomainException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP hợp lệ.');
        }
        $dimensions = getimagesize($tmp);
        if ($dimensions === false || $dimensions[0] > 8000 || $dimensions[1] > 8000) {
            throw new DomainException('Ảnh không hợp lệ hoặc vượt quá kích thước 8000 × 8000.');
        }
        $pending[] = ['tmp' => $tmp, 'fileName' => bin2hex(random_bytes(16)) . $extensions[$mime]];
    }
    $stored = [];
    try {
        foreach ($pending as $file) {
            if (!move_uploaded_file($file['tmp'], $directory . DIRECTORY_SEPARATOR . $file['fileName'])) {
                throw new RuntimeException('Không thể lưu ảnh diễn đàn.');
            }
            $stored[] = 'uploads/forum/' . $file['fileName'];
        }
    } catch (Throwable $error) {
        foreach ($stored as $image) {
            $imagePath = $directory . DIRECTORY_SEPARATOR . basename($image);
            if (is_file($imagePath)) {
                unlink($imagePath);
            }
        }
        throw $error;
    }
    return $stored;
}

function handlePostRequest(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        return;
    }
    $token = (string) ($_POST['csrf_token'] ?? '');
    if ($token === '' || !hash_equals(csrfToken(), $token)) {
        http_response_code(403);
        throw new DomainException('Phiên biểu mẫu đã hết hạn. Hãy tải lại trang và thử lại.');
    }

    $action = (string) ($_POST['action'] ?? '');
    switch ($action) {
        case 'register':
            if (!(siteContent()['registrationEnabled'] ?? false)) {
                throw new DomainException('Đăng ký tài khoản mới hiện đang đóng.');
            }
            $db = siteDb();
            enforceCooldown('register', 5);
            $username = trim((string) ($_POST['username'] ?? ''));
            $password = (string) ($_POST['password'] ?? '');
            $confirm = (string) ($_POST['password_confirm'] ?? '');
            $email = trim((string) ($_POST['email'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $username)) {
                throw new DomainException('Tên tài khoản chỉ gồm chữ, số, dấu gạch dưới và dài 3–20 ký tự.');
            }
            if (strlen($password) < 8 || strlen($password) > 100) {
                throw new DomainException('Mật khẩu phải dài từ 8 đến 100 ký tự.');
            }
            if (!hash_equals($password, $confirm)) {
                throw new DomainException('Mật khẩu nhập lại không khớp.');
            }
            if ($email !== '' && (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
                throw new DomainException('Địa chỉ email không hợp lệ.');
            }
            $stmt = $db->prepare(
                'INSERT INTO account (username, password, email, token, xsrf_token, newpass) VALUES (?, ?, ?, ?, ?, ?)'
            );
            try {
                $stmt->execute([$username, $password, $email, '', '', '']);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    throw new DomainException('Tên tài khoản đã được sử dụng.');
                }
                throw $error;
            }
            session_regenerate_id(true);
            $_SESSION['site_user'] = ['id' => (int) $db->lastInsertId(), 'username' => $username];
            setFlash('success', 'Tạo tài khoản thành công. Bạn đã đăng nhập và có thể vào diễn đàn.');
            redirectTo('index.php?page=forum');

        case 'login':
            $db = siteDb();
            $now = time();
            $attempts = array_values(array_filter(
                $_SESSION['site_login_attempts'] ?? [],
                static fn ($at): bool => (int) $at > $now - 300
            ));
            if (count($attempts) >= 5) {
                throw new DomainException('Bạn đã đăng nhập sai nhiều lần. Hãy thử lại sau 5 phút.');
            }
            $username = trim((string) ($_POST['username'] ?? ''));
            $password = (string) ($_POST['password'] ?? '');
            $stmt = $db->prepare('SELECT id, username, ban FROM account WHERE username = ? AND password = ? LIMIT 1');
            $stmt->execute([$username, $password]);
            $account = $stmt->fetch();
            if (!$account || (int) $account['ban'] !== 0) {
                $attempts[] = $now;
                $_SESSION['site_login_attempts'] = $attempts;
                throw new DomainException('Tên tài khoản hoặc mật khẩu game không đúng, hoặc tài khoản đang bị khóa.');
            }
            unset($_SESSION['site_login_attempts']);
            session_regenerate_id(true);
            $_SESSION['site_user'] = ['id' => (int) $account['id'], 'username' => (string) $account['username']];
            setFlash('success', 'Đăng nhập thành công.');
            redirectTo('index.php?page=forum');

        case 'logout':
            unset($_SESSION['site_user']);
            session_regenerate_id(true);
            setFlash('success', 'Bạn đã đăng xuất.');
            redirectTo('index.php');

        case 'create_post':
            $db = siteDb();
            $user = requireSignedIn($db);
            enforceCooldown('forum_post', 15);
            $title = trim((string) ($_POST['title'] ?? ''));
            $body = trim((string) ($_POST['body'] ?? ''));
            if ($title === '' || mb_strlen($title, 'UTF-8') > 75) {
                throw new DomainException('Tiêu đề cần có từ 1 đến 75 ký tự.');
            }
            if ($body === '' || mb_strlen($body, 'UTF-8') > 5000) {
                throw new DomainException('Nội dung cần có từ 1 đến 5.000 ký tự.');
            }
            $images = storeForumUploads();
            if (count($images) > 2) {
                throw new DomainException('Mỗi bài viết chỉ được đính kèm tối đa 2 ảnh.');
            }
            $stmt = $db->prepare('INSERT INTO posts (tieude, noidung, username, theloai, image) VALUES (?, ?, ?, 0, ?)');
            try {
                $stmt->execute([$title, $body, $user['username'], $images ? json_encode($images, JSON_THROW_ON_ERROR) : null]);
            } catch (Throwable $error) {
                foreach ($images as $image) {
                    $savedImage = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $image);
                    if (is_file($savedImage)) {
                        unlink($savedImage);
                    }
                }
                throw $error;
            }
            $postId = (int) $db->lastInsertId();
            setFlash('success', 'Đã đăng chủ đề mới.');
            redirectTo('index.php?page=thread&id=' . $postId);

        case 'create_comment':
            $db = siteDb();
            $user = requireSignedIn($db);
            enforceCooldown('forum_comment', 5);
            $postId = filter_var($_POST['post_id'] ?? null, FILTER_VALIDATE_INT);
            $body = trim((string) ($_POST['body'] ?? ''));
            if (!$postId || $postId < 1) {
                throw new DomainException('Chủ đề không hợp lệ.');
            }
            if ($body === '' || mb_strlen($body, 'UTF-8') > 2000) {
                throw new DomainException('Bình luận cần có từ 1 đến 2.000 ký tự.');
            }
            $check = $db->prepare('SELECT id FROM posts WHERE id = ?');
            $check->execute([$postId]);
            if (!$check->fetch()) {
                throw new DomainException('Không tìm thấy chủ đề này.');
            }
            $stmt = $db->prepare('INSERT INTO comments (post_id, nguoidung, traloi) VALUES (?, ?, ?)');
            $stmt->execute([$postId, $user['username'], $body]);
            setFlash('success', 'Đã gửi bình luận.');
            redirectTo('index.php?page=thread&id=' . $postId);

        default:
            throw new DomainException('Thao tác không hợp lệ.');
    }
}

function safeDownloadUrl(string $url): string
{
    $parts = parse_url($url);
    if (!is_array($parts) || filter_var($url, FILTER_VALIDATE_URL) === false || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)) {
        return '';
    }
    return $url;
}

function renderGuideText(string $text): string
{
    return nl2br(e($text), false);
}

function safeUploadedImage(string $path, string $type): string
{
    $folder = $type === 'home' ? 'home' : 'forum';
    if (preg_match('#^uploads/' . $folder . '/[a-f0-9-]+\.(?:jpg|png|webp)$#i', $path) !== 1) {
        return '';
    }
    return $path;
}

function renderForumImages(mixed $raw, string $className = 'forum-images'): void
{
    $images = forumImagePaths($raw);
    if (!$images) {
        return;
    }
    echo '<div class="' . e($className) . '">';
    foreach ($images as $index => $image) {
        echo '<a href="' . e($image) . '" target="_blank" rel="noopener noreferrer"><img src="' . e($image) . '" alt="Ảnh bài viết ' . ($index + 1) . '" loading="lazy"></a>';
    }
    echo '</div>';
}

function renderCharacterAvatar(mixed $avatarId): void
{
    $id = filter_var($avatarId, FILTER_VALIDATE_INT);
    if ($id === false || $id < 0) {
        return;
    }
    $assetPath = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'data'
        . DIRECTORY_SEPARATOR . 'icon' . DIRECTORY_SEPARATOR . 'x1' . DIRECTORY_SEPARATOR . $id . '.png';
    if (!is_file($assetPath)) {
        return;
    }
    echo '<img class="character-avatar" src="avatar.php?id=' . $id . '" alt="" loading="lazy">';
}

function renderHeader(array $content, ?array $user): void
{
    $siteName = e($content['siteName'] ?? 'Ngọc Rồng Online');
    $csrf = csrfInput();
    echo '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<meta name="description" content="' . e($content['tagline'] ?? '') . '"><title>' . $siteName . '</title><link rel="stylesheet" href="style.css"></head><body>';
    echo '<header class="site-header"><div class="header-inner"><a class="brand" href="index.php"><span class="brand-mark">NRO</span><span>' . $siteName . '</span></a>';
    echo '<nav><a href="index.php?page=mechanics">Cơ chế</a><a href="index.php?page=items">Kiếm vật phẩm</a><a href="index.php?page=forum">Diễn đàn</a><a href="index.php#downloads">Tải game</a></nav>';
    echo '<div class="header-account">';
    if ($user) {
        echo '<span class="account-name">' . e($user['username']) . '</span><form method="post" class="inline-form">' . $csrf . '<input type="hidden" name="action" value="logout"><button class="button button-quiet" type="submit">Đăng xuất</button></form>';
    } else {
        echo '<a class="button button-quiet" href="index.php?page=login">Đăng nhập</a>';
        if (($content['registrationEnabled'] ?? false) === true) {
            echo '<a class="button button-primary" href="index.php?page=register">Đăng ký</a>';
        }
    }
    echo '</div></div></header><main class="container">';
}

function renderFlash(): void
{
    foreach (['success', 'error'] as $key) {
        $message = takeFlash($key);
        if ($message !== '') {
            echo '<div class="flash flash-' . e($key) . '">' . e($message) . '</div>';
        }
    }
}

function renderHome(array $content): void
{
    $heroImage = safeUploadedImage((string) ($content['heroImage'] ?? ''), 'home');
    echo '<section class="hero"' . ($heroImage !== '' ? ' style="--hero-image: url(&quot;' . e($heroImage) . '&quot;)"' : '') . '><div class="hero-copy-wrap"><p class="eyebrow">THẾ GIỚI NGỌC RỒNG</p><h1>' . e($content['tagline'] ?? 'Cùng khám phá thế giới Ngọc Rồng') . '</h1><p class="hero-copy">Thông tin máy chủ, hướng dẫn nhập môn và nơi giao lưu cộng đồng.</p><div class="hero-actions"><a class="button button-primary" href="#downloads">Tải game</a><a class="button button-secondary" href="index.php?page=' . (($content['registrationEnabled'] ?? false) === true ? 'register">Tạo tài khoản' : 'login">Đăng nhập') . '</a></div></div></section>';
    $announcement = trim((string) ($content['announcement'] ?? ''));
    if ($announcement !== '') {
        echo '<aside class="notice"><strong>Thông báo</strong><p>' . renderGuideText($announcement) . '</p></aside>';
    }
    echo '<section class="section-block"><div class="section-title"><p class="eyebrow">CẨM NANG</p><h2>Khám phá trò chơi</h2><p>Hướng dẫn cơ chế và cách tìm kiếm vật phẩm trong game.</p></div><div class="guide-links"><a class="guide-link-card" href="index.php?page=mechanics"><span class="guide-link-icon">✦</span><span><strong>Cơ chế game</strong><small>Tìm hiểu các tính năng, hành tinh và hoạt động trong game.</small></span><span class="guide-arrow">→</span></a><a class="guide-link-card" href="index.php?page=items"><span class="guide-link-icon">◇</span><span><strong>Cách kiếm vật phẩm</strong><small>Gợi ý các hoạt động, nhiệm vụ và sự kiện nhận vật phẩm.</small></span><span class="guide-arrow">→</span></a></div></section>';
    echo '<section class="section-block" id="downloads"><div class="section-title"><p class="eyebrow">PHIÊN BẢN TRÒ CHƠI</p><h2>Tải game</h2><p>Chọn phiên bản phù hợp với thiết bị của bạn.</p></div><div class="download-list">';
    foreach ($content['downloads'] as $download) {
        if (!is_array($download)) {
            continue;
        }
        $label = trim((string) ($download['label'] ?? 'Tải game'));
        $url = safeDownloadUrl(trim((string) ($download['url'] ?? '')));
        echo '<div class="download-item"><span>' . e($label) . '</span>';
        if ($url !== '') {
            echo '<a class="button button-primary" href="' . e($url) . '" target="_blank" rel="noopener noreferrer">Tải xuống</a>';
        } else {
            echo '<span class="download-unavailable">Sắp cập nhật</span>';
        }
        echo '</div>';
    }
    echo '</div></section><section class="community-callout"><div><p class="eyebrow">CỘNG ĐỒNG</p><h2>Trao đổi cùng người chơi</h2><p>Đặt câu hỏi, chia sẻ kinh nghiệm và theo dõi tin tức trên diễn đàn.</p></div><a class="button button-secondary" href="index.php?page=forum">Mở diễn đàn</a></section>';
}

function renderGuidePage(string $page, array $content): void
{
    $isMechanics = $page === 'mechanics';
    $title = $isMechanics ? 'Cơ chế game' : 'Cách kiếm vật phẩm';
    $eyebrow = $isMechanics ? 'HƯỚNG DẪN TRÒ CHƠI' : 'CẨM NANG VẬT PHẨM';
    $key = $isMechanics ? 'mechanics' : 'itemGuide';
    echo '<p class="back-link"><a href="index.php">← Về trang chủ</a></p><section class="page-heading guide-page-heading"><p class="eyebrow">' . e($eyebrow) . '</p><h1>' . e($title) . '</h1><p>' . ($isMechanics ? 'Tìm hiểu những kiến thức cơ bản và các hoạt động trong thế giới Ngọc Rồng.' : 'Tham khảo những cách nhận vật phẩm từ nhiệm vụ, quái vật, Boss và sự kiện.') . '</p></section><article class="guide-page-content">' . renderGuideText((string) ($content[$key] ?? '')) . '</article>';
    echo '<div class="guide-page-navigation"><a href="index.php?page=' . ($isMechanics ? 'items' : 'mechanics') . '">' . ($isMechanics ? 'Xem cách kiếm vật phẩm →' : '← Xem cơ chế game') . '</a><a href="index.php?page=forum">Tham gia diễn đàn →</a></div>';
}

function renderAuthForm(string $page, bool $registrationEnabled): void
{
    $register = $page === 'register';
    if ($register && !$registrationEnabled) {
        echo '<section class="auth-card"><p class="eyebrow">TÀI KHOẢN GAME</p><h1>Đăng ký đang đóng</h1><p class="muted">Hiện chưa mở đăng ký tài khoản mới. Nếu bạn đã có tài khoản game, hãy đăng nhập để tham gia diễn đàn.</p><a class="button button-primary button-full" href="index.php?page=login">Đăng nhập bằng tài khoản game</a></section>';
        return;
    }
    echo '<section class="auth-card"><p class="eyebrow">' . ($register ? 'TÀI KHOẢN GAME' : 'CHÀO MỪNG TRỞ LẠI') . '</p><h1>' . ($register ? 'Đăng ký tài khoản' : 'Đăng nhập bằng tài khoản game') . '</h1>';
    echo '<p class="muted">' . ($register ? 'Tài khoản này dùng để đăng nhập vào game và diễn đàn.' : 'Nhập đúng tên tài khoản và mật khẩu bạn dùng để đăng nhập game.') . '</p>';
    echo '<form method="post" class="stack-form">' . csrfInput() . '<input type="hidden" name="action" value="' . ($register ? 'register' : 'login') . '">';
    echo '<label>' . ($register ? 'Tên tài khoản' : 'Tên tài khoản game') . '<input name="username" type="text" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="username" required></label>';
    if ($register) {
        echo '<label>Email <span class="muted">(không bắt buộc)</span><input name="email" type="email" maxlength="254" autocomplete="email"></label>';
    }
    echo '<label>Mật khẩu<input name="password" type="password" minlength="' . ($register ? '8' : '1') . '" maxlength="100" autocomplete="' . ($register ? 'new-password' : 'current-password') . '" required></label>';
    if ($register) {
        echo '<label>Nhập lại mật khẩu<input name="password_confirm" type="password" minlength="8" maxlength="100" autocomplete="new-password" required></label>';
        echo '<p class="form-note">Mật khẩu được đồng bộ với hệ thống đăng nhập game. Hãy dùng mật khẩu riêng, không dùng lại mật khẩu từ dịch vụ khác.</p>';
    }
    echo '<button class="button button-primary button-full" type="submit">' . ($register ? 'Tạo tài khoản' : 'Đăng nhập') . '</button></form>';
    echo '<p class="auth-switch">' . ($register ? 'Đã có tài khoản? <a href="index.php?page=login">Đăng nhập</a>' : ($registrationEnabled ? 'Chưa có tài khoản? <a href="index.php?page=register">Đăng ký</a>' : 'Đăng ký tài khoản mới hiện đang đóng.')) . '</p></section>';
}

function renderForum(bool $registrationEnabled): void
{
    $db = siteDb();
    $stmt = $db->query('SELECT id, tieude, noidung, username, created_at, image, '
        . '(SELECT ha.avatar_id FROM account a JOIN player p ON p.account_id = a.id '
        . 'JOIN head_avatar ha ON ha.head_id = p.head WHERE a.username = posts.username ORDER BY p.id LIMIT 1) AS avatar_id '
        . 'FROM posts ORDER BY ghimbai DESC, created_at DESC, id DESC LIMIT 50');
    $posts = $stmt->fetchAll();
    $user = $_SESSION['site_user'] ?? null;
    echo '<section class="page-heading"><p class="eyebrow">CỘNG ĐỒNG NGƯỜI CHƠI</p><h1>Diễn đàn</h1><p>Chia sẻ câu hỏi và kinh nghiệm với cộng đồng.</p></section>';
    if ($user) {
        echo '<details class="new-post"><summary class="button button-primary">Đăng bài mới</summary><section class="content-card"><h2>Tạo chủ đề mới</h2><form method="post" enctype="multipart/form-data" class="stack-form">' . csrfInput() . '<input type="hidden" name="action" value="create_post"><label>Tiêu đề<input name="title" maxlength="75" required></label><label>Nội dung<textarea name="body" rows="5" maxlength="5000" required></textarea></label><label>Ảnh đính kèm <span class="muted">(tối đa 2 ảnh, mỗi ảnh 5 MB)</span><input name="images[]" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><button class="button button-primary" type="submit">Đăng chủ đề</button></form></section></details>';
    } else {
        echo '<div class="notice"><p><a href="index.php?page=login">Đăng nhập</a> để đăng bài và bình luận.';
        if ($registrationEnabled) {
            echo ' Chưa có tài khoản? <a href="index.php?page=register">Đăng ký</a>.';
        } else {
            echo ' Đăng ký tài khoản mới hiện đang đóng.';
        }
        echo '</p></div>';
    }
    echo '<div class="forum-list">';
    if (!$posts) {
        echo '<div class="content-card empty-state">Chưa có chủ đề nào. Hãy bắt đầu cuộc trò chuyện đầu tiên!</div>';
    }
    foreach ($posts as $post) {
        $excerpt = mb_substr((string) $post['noidung'], 0, 260, 'UTF-8');
        echo '<article class="forum-topic"><div><a class="topic-title" href="index.php?page=thread&id=' . (int) $post['id'] . '">' . e($post['tieude']) . '</a><p class="topic-excerpt">' . e($excerpt) . (mb_strlen((string) $post['noidung'], 'UTF-8') > 260 ? '…' : '') . '</p>';
        renderForumImages($post['image'], 'forum-images forum-topic-images');
        echo '</div><div class="topic-meta">';
        renderCharacterAvatar($post['avatar_id']);
        echo '<strong>' . e($post['username']) . '</strong><time>' . e($post['created_at']) . '</time></div></article>';
    }
    echo '</div>';
}

function renderThread(): void
{
    $postId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$postId || $postId < 1) {
        http_response_code(404);
        echo '<section class="content-card"><h1>Không tìm thấy chủ đề</h1><a href="index.php?page=forum">Quay lại diễn đàn</a></section>';
        return;
    }
    $db = siteDb();
    $stmt = $db->prepare('SELECT id, tieude, noidung, username, created_at, image, '
        . '(SELECT ha.avatar_id FROM account a JOIN player p ON p.account_id = a.id '
        . 'JOIN head_avatar ha ON ha.head_id = p.head WHERE a.username = posts.username ORDER BY p.id LIMIT 1) AS avatar_id '
        . 'FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    $post = $stmt->fetch();
    if (!$post) {
        http_response_code(404);
        echo '<section class="content-card"><h1>Không tìm thấy chủ đề</h1><a href="index.php?page=forum">Quay lại diễn đàn</a></section>';
        return;
    }
    echo '<p class="back-link"><a href="index.php?page=forum">← Quay lại diễn đàn</a></p><article class="thread-card"><p class="eyebrow">CHỦ ĐỀ</p><h1>' . e($post['tieude']) . '</h1><div class="topic-meta">';
    renderCharacterAvatar($post['avatar_id']);
    echo '<strong>' . e($post['username']) . '</strong><time>' . e($post['created_at']) . '</time></div><div class="thread-body">' . renderGuideText((string) $post['noidung']) . '</div>';
    renderForumImages($post['image']);
    echo '</article>';
    $comments = $db->prepare('SELECT nguoidung, traloi, created_at, '
        . '(SELECT ha.avatar_id FROM account a JOIN player p ON p.account_id = a.id '
        . 'JOIN head_avatar ha ON ha.head_id = p.head WHERE a.username = comments.nguoidung ORDER BY p.id LIMIT 1) AS avatar_id '
        . 'FROM comments WHERE post_id = ? ORDER BY created_at ASC, id ASC LIMIT 100');
    $comments->execute([$postId]);
    echo '<section class="comments-section"><h2>Bình luận</h2>';
    foreach ($comments->fetchAll() as $comment) {
        echo '<article class="comment"><div class="topic-meta">';
        renderCharacterAvatar($comment['avatar_id']);
        echo '<strong>' . e($comment['nguoidung']) . '</strong><time>' . e($comment['created_at']) . '</time></div><p>' . renderGuideText((string) $comment['traloi']) . '</p></article>';
    }
    if (empty($_SESSION['site_user'])) {
        echo '<p class="muted">Hãy <a href="index.php?page=login">đăng nhập</a> để gửi bình luận.</p>';
    } else {
        echo '<form method="post" class="stack-form comment-form">' . csrfInput() . '<input type="hidden" name="action" value="create_comment"><input type="hidden" name="post_id" value="' . (int) $postId . '"><label>Bình luận<textarea name="body" rows="4" maxlength="2000" required></textarea></label><button class="button button-primary" type="submit">Gửi bình luận</button></form>';
    }
    echo '</section>';
}

try {
    handlePostRequest();
    $content = siteContent();
    $registrationEnabled = ($content['registrationEnabled'] ?? false) === true;
    $user = $_SESSION['site_user'] ?? null;
    $page = (string) ($_GET['page'] ?? 'home');
    $allowedPages = ['home', 'mechanics', 'items', 'register', 'login', 'forum', 'thread'];
    if (!in_array($page, $allowedPages, true)) {
        $page = 'home';
    }
    renderHeader($content, is_array($user) ? $user : null);
    renderFlash();
    switch ($page) {
        case 'register':
        case 'login':
            renderAuthForm($page, $registrationEnabled);
            break;
        case 'forum':
            renderForum($registrationEnabled);
            break;
        case 'mechanics':
        case 'items':
            renderGuidePage($page, $content);
            break;
        case 'thread':
            renderThread();
            break;
        default:
            renderHome($content);
    }
    echo '</main><footer class="site-footer"><div class="container"><span>' . e($content['siteName'] ?? 'Ngọc Rồng Online') . '</span><span>Chơi vui, giao lưu văn minh.</span></div></footer></body></html>';
} catch (DomainException $error) {
    if (http_response_code() < 400) {
        http_response_code(400);
    }
    setFlash('error', $error->getMessage());
    $page = (string) ($_GET['page'] ?? 'home');
    redirectTo('index.php?page=' . rawurlencode(in_array($page, ['register', 'login', 'forum', 'thread'], true) ? $page : 'home') . (isset($_GET['id']) ? '&id=' . (int) $_GET['id'] : ''));
} catch (Throwable $error) {
    error_log('[NRO website] ' . $error->getMessage());
    http_response_code(500);
    echo '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lỗi website</title><link rel="stylesheet" href="style.css"><body><main class="container"><div class="content-card"><h1>Website đang gặp sự cố</h1><p>Không thể tải dữ liệu. Vui lòng thử lại sau hoặc liên hệ quản trị viên.</p></div></main></body></html>';
}
