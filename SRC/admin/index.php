<?php
require_once 'config.php';

// Handle API requests
if (isset($_GET['api'])) {
    requireLogin();
    handleApi($_GET['api']);
    exit;
}

// Handle login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'login') {
    $user = $_POST['username'] ?? '';
    $pass = $_POST['password'] ?? '';
    if ($user === ADMIN_USERNAME && $pass === ADMIN_PASSWORD) {
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_user'] = $user;
        getCsrfToken(); // generate
        header('Location: index.php');
        exit;
    } else {
        $loginError = 'Tên đăng nhập hoặc mật khẩu không đúng!';
    }
}

// Handle logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_destroy();
    header('Location: index.php?page=login');
    exit;
}

$page = $_GET['page'] ?? 'dashboard';

// ========================
// API Handler
// ========================
function handleApi(string $api): void {
    $db = getDB();
    $method = $_SERVER['REQUEST_METHOD'];
    
    // All APIs require CSRF verification on mutations
    if (in_array($method, ['POST', 'PUT', 'DELETE'])) {
        if (!verifyCsrf()) {
            jsonResponse(['error' => 'Invalid CSRF token'], 403);
        }
    }
    
    switch ($api) {
        // ── Dashboard ──────────────────────────────────────────
        case 'stats':
            $stats = [];
            $tables = ['account', 'player', 'clan', 'giftcode', 'shop_ky_gui', 'history_transaction'];
            foreach ($tables as $table) {
                try {
                    $stats[$table] = $db->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
                } catch (Exception $e) {
                    $stats[$table] = 0;
                }
            }
            // Online players estimate
            try {
                $stats['online'] = $db->query("SELECT COUNT(*) FROM `account` WHERE server_login >= 0")->fetchColumn();
            } catch (Exception $e) { $stats['online'] = 0; }
            // Total VND nap
            try {
                $stats['total_vnd'] = $db->query("SELECT SUM(vnd) FROM `account`")->fetchColumn() ?? 0;
            } catch (Exception $e) { $stats['total_vnd'] = 0; }
            jsonResponse($stats);

        // ── Generic table fetch ────────────────────────────────
        case 'table':
            $table = validateTableName($_GET['table'] ?? '');
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = min(100, max(10, (int)($_GET['limit'] ?? 25)));
            $search = $_GET['search'] ?? '';
            $offset = ($page - 1) * $limit;
            $orderBy = $_GET['order'] ?? 'id';
            $orderDir = strtoupper($_GET['dir'] ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
            
            // Get columns
            $cols = $db->query("DESCRIBE `$table`")->fetchAll();
            $colNames = array_column($cols, 'Field');
            
            // Sanitize order column
            if (!in_array($orderBy, $colNames)) $orderBy = $colNames[0];
            
            // Build WHERE for search
            $whereClause = '';
            $params = [];
            if ($search !== '') {
                $searchCols = array_slice($colNames, 0, 5); // search first 5 cols
                $parts = array_map(fn($c) => "`$c` LIKE ?", $searchCols);
                $whereClause = 'WHERE ' . implode(' OR ', $parts);
                $params = array_fill(0, count($searchCols), "%$search%");
            }
            
            $total = $db->prepare("SELECT COUNT(*) FROM `$table` $whereClause");
            $total->execute($params);
            $totalRows = $total->fetchColumn();
            
            $stmt = $db->prepare("SELECT * FROM `$table` $whereClause ORDER BY `$orderBy` $orderDir LIMIT $limit OFFSET $offset");
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
            
            jsonResponse([
                'columns' => $cols,
                'rows' => $rows,
                'total' => $totalRows,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($totalRows / $limit),
            ]);

        // ── Get single row ─────────────────────────────────────
        case 'row':
            $table = validateTableName($_GET['table'] ?? '');
            $id = $_GET['id'] ?? null;
            $pkCol = getPrimaryKey($db, $table);
            $stmt = $db->prepare("SELECT * FROM `$table` WHERE `$pkCol` = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            $cols = $db->query("DESCRIBE `$table`")->fetchAll();
            jsonResponse(['row' => $row, 'columns' => $cols]);

        // ── Update row ─────────────────────────────────────────
        case 'update':
            $table = validateTableName($_POST['table'] ?? '');
            $pkCol = getPrimaryKey($db, $table);
            $pkVal = $_POST['pk_value'] ?? null;
            $data = $_POST['data'] ?? [];
            
            unset($data[$pkCol]); // don't update PK
            if (empty($data)) jsonResponse(['error' => 'No data provided'], 400);
            
            $sets = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($data)));
            $vals = array_values($data);
            $vals[] = $pkVal;
            
            $stmt = $db->prepare("UPDATE `$table` SET $sets WHERE `$pkCol` = ?");
            $stmt->execute($vals);
            jsonResponse(['success' => true, 'affected' => $stmt->rowCount()]);

        // ── Insert row ─────────────────────────────────────────
        case 'insert':
            $table = validateTableName($_POST['table'] ?? '');
            $data = $_POST['data'] ?? [];
            if (empty($data)) jsonResponse(['error' => 'No data provided'], 400);
            
            $cols2 = implode(', ', array_map(fn($k) => "`$k`", array_keys($data)));
            $placeholders = implode(', ', array_fill(0, count($data), '?'));
            $stmt = $db->prepare("INSERT INTO `$table` ($cols2) VALUES ($placeholders)");
            $stmt->execute(array_values($data));
            jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);

        // ── Delete row ─────────────────────────────────────────
        case 'delete':
            $table = validateTableName($_POST['table'] ?? '');
            $pkCol = getPrimaryKey($db, $table);
            $pkVal = $_POST['pk_value'] ?? null;
            $stmt = $db->prepare("DELETE FROM `$table` WHERE `$pkCol` = ?");
            $stmt->execute([$pkVal]);
            jsonResponse(['success' => true, 'affected' => $stmt->rowCount()]);

        // ── Execute raw SQL ────────────────────────────────────
        case 'sql':
            $sql = trim($_POST['sql'] ?? '');
            if (empty($sql)) jsonResponse(['error' => 'Empty SQL'], 400);
            
            // Very basic safety check (block dangerous ops)
            $lsql = strtolower($sql);
            $blocked = ['drop table', 'drop database', 'truncate', 'alter table'];
            foreach ($blocked as $b) {
                if (strpos($lsql, $b) !== false) {
                    jsonResponse(['error' => "Lệnh '$b' bị chặn vì lý do an toàn!"], 403);
                }
            }
            
            try {
                $stmt = $db->prepare($sql);
                $stmt->execute();
                if (stripos($sql, 'SELECT') === 0) {
                    $rows = $stmt->fetchAll();
                    $cols = $rows ? array_keys($rows[0]) : [];
                    jsonResponse(['type' => 'select', 'columns' => $cols, 'rows' => $rows, 'count' => count($rows)]);
                } else {
                    jsonResponse(['type' => 'update', 'affected' => $stmt->rowCount()]);
                }
            } catch (PDOException $e) {
                jsonResponse(['error' => $e->getMessage()], 400);
            }

        // ── List tables ────────────────────────────────────────
        case 'tables':
            $tables2 = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            $result = [];
            foreach ($tables2 as $t) {
                $count = $db->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
                $result[] = ['name' => $t, 'count' => $count];
            }
            jsonResponse($result);
        
        // ── Account management ─────────────────────────────────
        case 'ban':
            $uid = (int)($_POST['id'] ?? 0);
            $ban = (int)($_POST['ban'] ?? 1);
            $stmt = $db->prepare("UPDATE `account` SET `ban` = ? WHERE `id` = ?");
            $stmt->execute([$ban, $uid]);
            jsonResponse(['success' => true]);
        
        case 'giveVang':
            $uid = (int)($_POST['account_id'] ?? 0);
            $amt = (int)($_POST['amount'] ?? 0);
            $stmt = $db->prepare("UPDATE `account` SET `vang` = `vang` + ? WHERE `id` = ?");
            $stmt->execute([$amt, $uid]);
            jsonResponse(['success' => true]);
        
        case 'giveVnd':
            $uid = (int)($_POST['account_id'] ?? 0);
            $amt = (int)($_POST['amount'] ?? 0);
            $stmt = $db->prepare("UPDATE `account` SET `vnd` = `vnd` + ? WHERE `id` = ?");
            $stmt->execute([$amt, $uid]);
            jsonResponse(['success' => true]);

        // ── Server maintenance toggle ──────────────────────────
        case 'maintenance':
            $status = $_POST['status'] ?? 'hoatdong';
            $stmt = $db->prepare("UPDATE `adminpanel` SET `trangthai` = ?");
            $stmt->execute([$status]);
            jsonResponse(['success' => true]);
        
        // ── Giftcode management ────────────────────────────────
        case 'giftcodes':
            $page2 = max(1, (int)($_GET['page'] ?? 1));
            $limit2 = 20;
            $offset2 = ($page2 - 1) * $limit2;
            $total2 = $db->query("SELECT COUNT(*) FROM giftcode")->fetchColumn();
            $rows2 = $db->query("SELECT * FROM giftcode ORDER BY id DESC LIMIT $limit2 OFFSET $offset2")->fetchAll();
            jsonResponse(['rows' => $rows2, 'total' => $total2, 'pages' => ceil($total2 / $limit2)]);

        // ── Top players ────────────────────────────────────────
        case 'topPlayers':
            $col = in_array($_GET['by'] ?? 'power', ['power', 'vnd', 'level']) ? ($_GET['by'] ?? 'power') : 'power';
            if ($col === 'power') {
                $stmt = $db->query("SELECT p.name, a.username, a.vnd, a.vang, p.data_point, a.ban, a.is_admin FROM player p JOIN account a ON p.account_id = a.id ORDER BY a.vnd DESC LIMIT 20");
            } else {
                $stmt = $db->query("SELECT p.name, a.username, a.vnd, a.vang, a.ban, a.is_admin FROM player p JOIN account a ON p.account_id = a.id ORDER BY a.vnd DESC LIMIT 20");
            }
            jsonResponse($stmt->fetchAll());
        
        // ── Recent transactions ─────────────────────────────────
        case 'transactions':
            $limit3 = min(50, (int)($_GET['limit'] ?? 20));
            try {
                $rows3 = $db->query("SELECT * FROM history_transaction ORDER BY id DESC LIMIT $limit3")->fetchAll();
                jsonResponse($rows3);
            } catch (Exception $e) {
                jsonResponse([]);
            }

        default:
            jsonResponse(['error' => 'Unknown API endpoint'], 404);
    }
}

function validateTableName(string $name): string {
    $db = getDB();
    $tables = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array($name, $tables)) {
        jsonResponse(['error' => 'Invalid table name'], 400);
    }
    return $name;
}

function getPrimaryKey(PDO $db, string $table): string {
    $cols = $db->query("DESCRIBE `$table`")->fetchAll();
    foreach ($cols as $col) {
        if ($col['Key'] === 'PRI') return $col['Field'];
    }
    return $cols[0]['Field'] ?? 'id';
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= SERVER_NAME ?> — Admin Panel</title>
<meta name="description" content="Bảng điều khiển quản trị server Ngọc Rồng Online">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>

<?php if (!isLoggedIn() || $page === 'login'): ?>
<!-- ==================== LOGIN PAGE ==================== -->
<div class="login-wrapper">
  <div class="login-bg-orbs">
    <div class="orb orb1"></div>
    <div class="orb orb2"></div>
    <div class="orb orb3"></div>
  </div>
  <div class="login-card">
    <div class="login-logo">
      <div class="logo-icon">🐉</div>
      <h1>NRO Admin</h1>
      <p>Ngọc Rồng Online Control Panel</p>
    </div>
    <?php if (isset($loginError)): ?>
    <div class="alert alert-danger"><?= htmlspecialchars($loginError) ?></div>
    <?php endif; ?>
    <form method="POST" action="index.php" class="login-form" id="loginForm">
      <input type="hidden" name="action" value="login">
      <div class="form-group">
        <label for="username">Tên đăng nhập</label>
        <div class="input-icon">
          <span class="icon">👤</span>
          <input type="text" id="username" name="username" placeholder="admin" required autocomplete="username">
        </div>
      </div>
      <div class="form-group">
        <label for="password">Mật khẩu</label>
        <div class="input-icon">
          <span class="icon">🔒</span>
          <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">
        <span>Đăng nhập</span>
        <span class="btn-arrow">→</span>
      </button>
    </form>
    <p class="login-footer">Ngọc Rồng Online © 2026 – By Mr Blue</p>
  </div>
</div>

<?php else: ?>
<!-- ==================== MAIN PANEL ==================== -->
<div class="app-layout">

  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <span class="logo-dragon">🐉</span>
        <div class="logo-text">
          <span class="logo-title">NRO Admin</span>
          <span class="logo-sub">v2.0.26</span>
        </div>
      </div>
      <button class="sidebar-toggle" id="sidebarToggle" title="Thu gọn">‹</button>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section-label">Tổng quan</div>
      <a href="index.php?page=dashboard" class="nav-item <?= $page==='dashboard'?'active':'' ?>" id="nav-dashboard">
        <span class="nav-icon">📊</span><span class="nav-text">Dashboard</span>
      </a>

      <div class="nav-section-label">Quản lý</div>
      <a href="index.php?page=accounts" class="nav-item <?= $page==='accounts'?'active':'' ?>">
        <span class="nav-icon">👥</span><span class="nav-text">Tài khoản</span>
      </a>
      <a href="index.php?page=players" class="nav-item <?= $page==='players'?'active':'' ?>">
        <span class="nav-icon">🎮</span><span class="nav-text">Nhân vật</span>
      </a>
      <a href="index.php?page=clans" class="nav-item <?= $page==='clans'?'active':'' ?>">
        <span class="nav-icon">🏰</span><span class="nav-text">Bang hội</span>
      </a>
      <a href="index.php?page=giftcodes" class="nav-item <?= $page==='giftcodes'?'active':'' ?>">
        <span class="nav-icon">🎁</span><span class="nav-text">Giftcode</span>
      </a>
      <a href="index.php?page=shop" class="nav-item <?= $page==='shop'?'active':'' ?>">
        <span class="nav-icon">🛒</span><span class="nav-text">Shop Ký Gửi</span>
      </a>
      <a href="index.php?page=transactions" class="nav-item <?= $page==='transactions'?'active':'' ?>">
        <span class="nav-icon">💳</span><span class="nav-text">Giao dịch</span>
      </a>

      <div class="nav-section-label">Cơ sở dữ liệu</div>
      <a href="index.php?page=tables" class="nav-item <?= $page==='tables'?'active':'' ?>">
        <span class="nav-icon">🗄️</span><span class="nav-text">Bảng DB</span>
      </a>
      <a href="index.php?page=sql" class="nav-item <?= $page==='sql'?'active':'' ?>">
        <span class="nav-icon">⌨️</span><span class="nav-text">SQL Console</span>
      </a>

      <div class="nav-section-label">Hệ thống</div>
      <a href="index.php?page=maintenance" class="nav-item <?= $page==='maintenance'?'active':'' ?>">
        <span class="nav-icon">🔧</span><span class="nav-text">Bảo trì</span>
      </a>
      <a href="index.php?page=settings" class="nav-item <?= $page==='settings'?'active':'' ?>">
        <span class="nav-icon">⚙️</span><span class="nav-text">Cài đặt</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">A</div>
        <div class="user-details">
          <span class="user-name"><?= htmlspecialchars($_SESSION['admin_user'] ?? 'Admin') ?></span>
          <span class="user-role">Super Admin</span>
        </div>
      </div>
      <a href="index.php?action=logout" class="logout-btn" title="Đăng xuất">⏻</a>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main-content" id="mainContent">
    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-btn" id="mobileMenu">☰</button>
        <div class="breadcrumb" id="breadcrumb">
          <span>🏠</span>
          <span class="bc-sep">/</span>
          <span id="bcPage"><?= ucfirst($page) ?></span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="server-status">
          <span class="status-dot" id="statusDot"></span>
          <span class="status-text" id="statusText">Đang kết nối...</span>
        </div>
        <div class="topbar-time" id="topbarTime"></div>
        <button class="btn btn-sm btn-outline" onclick="window.location.reload()">↺ Làm mới</button>
      </div>
    </header>

    <!-- Page Content -->
    <div class="page-content" id="pageContent">
      <!-- Content loaded here by JS -->
      <div class="loading-spinner"><div class="spinner"></div><p>Đang tải...</p></div>
    </div>
  </main>
</div>

<!-- ==================== MODAL ==================== -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modal">
    <div class="modal-header">
      <h3 id="modalTitle">Modal</h3>
      <button class="modal-close" id="modalClose">✕</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

<!-- Toast Notifications -->
<div class="toast-container" id="toastContainer"></div>

<!-- Hidden CSRF -->
<input type="hidden" id="csrfToken" value="<?= getCsrfToken() ?>">

<script src="app.js"></script>
<?php endif; ?>
</body>
</html>
