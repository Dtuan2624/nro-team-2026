const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const serverBridge = require('./src/services/serverBridge');

// Root directory of the project (one level above admin-desktop)
const projectRoot = path.join(__dirname, '..');
const defaultWebsiteDirectory = path.join(projectRoot, 'website');

// ── State ──────────────────────────────────────────
let mainWindow = null;
let tray = null;
let pool = null;
let isDev = process.argv.includes('--dev');

// ── Config file path ───────────────────────────────
const configPath = path.join(app.getPath('userData'), 'nro-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) { }
  return {
    host: 'localhost',
    port: 3306,
    database: 'team2026',
    user: 'root',
    password: '',
    serverName: 'Ngọc Rồng Online',
    serverIp: '36.50.135.16',
    serverPort: '14445',
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

const defaultWebsiteContent = {
  siteName: 'Ngọc Rồng Online',
  tagline: 'Cùng khám phá thế giới Ngọc Rồng',
  heroImage: '',
  registrationEnabled: false,
  announcement: 'Chào mừng bạn đến với máy chủ. Theo dõi diễn đàn để cập nhật tin tức và sự kiện mới nhất.',
  mechanics: 'Chọn hành tinh và tạo nhân vật phù hợp với lối chơi của bạn.\n\nHoàn thành nhiệm vụ để làm quen với bản đồ, NPC và các tính năng cơ bản. Sức mạnh tăng qua luyện tập, trang bị và kỹ năng.\n\nMột số hoạt động có thể thay đổi theo sự kiện; hãy xem thông báo trên diễn đàn.',
  itemGuide: 'Nhiệm vụ: hoàn thành nhiệm vụ chính tuyến và nhiệm vụ hằng ngày để nhận vật phẩm, vàng hoặc kinh nghiệm.\n\nSăn quái và Boss: tìm hiểu khu vực xuất hiện, chuẩn bị tổ đội và quay lại vào thời điểm phù hợp.\n\nSự kiện: theo dõi thông báo để biết vật phẩm sự kiện, điều kiện tham gia và thời hạn.\n\nTỷ lệ rơi và phần thưởng có thể được điều chỉnh theo từng giai đoạn.',
  downloads: [
    { label: 'Tải bản Windows', url: '' },
    { label: 'Tải bản Android', url: '' },
    { label: 'Tải bản iOS', url: '' },
  ],
};

function websiteDirectory(cfg = loadConfig()) {
  return cfg.webDirectory || defaultWebsiteDirectory;
}

function readWebsiteContent(directory = websiteDirectory()) {
  const filePath = path.join(directory, 'content.json');
  if (!fs.existsSync(filePath)) return defaultWebsiteContent;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateWebsiteContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Dữ liệu website không hợp lệ.');
  }
  const text = (key, maxLength, required = false) => {
    const value = content[key];
    if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
      throw new Error(`Giá trị "${key}" không hợp lệ.`);
    }
    return value.trim();
  };
  const downloads = content.downloads;
  if (!Array.isArray(downloads) || downloads.length !== 3) {
    throw new Error('Cần nhập đủ ba mục tải game.');
  }
  const heroImage = text('heroImage', 120);
  if (heroImage && !/^uploads\/home\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(heroImage)) {
    throw new Error('Ảnh trang chủ phải được tải lên trong mục Quản lý Website.');
  }
  return {
    siteName: text('siteName', 60, true),
    tagline: text('tagline', 160),
    heroImage,
    registrationEnabled: content.registrationEnabled === true,
    announcement: text('announcement', 2000),
    mechanics: text('mechanics', 10000),
    itemGuide: text('itemGuide', 10000),
    downloads: downloads.map((download, index) => {
      if (!download || typeof download !== 'object' || Array.isArray(download)) {
        throw new Error(`Liên kết tải game ${index + 1} không hợp lệ.`);
      }
      const label = String(download.label || '').trim();
      const url = String(download.url || '').trim();
      if (!label || label.length > 60 || url.length > 2048) {
        throw new Error(`Liên kết tải game ${index + 1} không hợp lệ.`);
      }
      if (url && (!/^https?:\/\/\S+$/i.test(url) || !URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol))) {
        throw new Error(`Liên kết tải game ${index + 1} phải bắt đầu bằng http:// hoặc https://.`);
      }
      return { label, url };
    }),
  };
}

function websiteImagesDirectory(kind) {
  if (kind !== 'home' && kind !== 'forum') throw new Error('Loại ảnh website không hợp lệ.');
  const directory = path.join(websiteDirectory(), 'uploads', kind);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP hợp lệ.');
}

function storedForumImages(value) {
  if (!value || value === '0') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch (_) { }
  return [String(value)];
}

function localForumImage(value) {
  return /^uploads\/forum\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(value);
}

async function reloadRuntimeData(table) {
  const action = table === 'shop' || table === 'item_shop' || table === 'item_shop_option'
    ? 'shop.reload'
    : table === 'giftcode' ? 'giftcode.reload' : null;
  if (!action) return {};
  const runtime = await serverBridge.command(action);
  return {
    runtimeApplied: runtime.success === true,
    runtimeCode: runtime.success ? null : runtime.code,
    runtimeMessage: runtime.message || null,
  };
}

// ── Database Pool ──────────────────────────────────
async function createPool(cfg) {
  if (pool) {
    try { await pool.end(); } catch (e) { }
    pool = null;
  }
  pool = mysql.createPool({
    host: cfg.host,
    port: parseInt(cfg.port) || 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    charset: 'utf8mb4',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
  });
  return pool;
}

// ── Main Window ────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 600,
    backgroundColor: '#0d0f17',
    titleBarStyle: 'hidden',
    frame: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Custom menu
  Menu.setApplicationMenu(null);
}

// ── App Events ─────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ══════════════════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════════════════

// ── Window controls ────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ── Config ─────────────────────────────────────────
ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', async (_, cfg) => {
  const mergedConfig = { ...loadConfig(), ...cfg };
  saveConfig(mergedConfig);
  try {
    await createPool(mergedConfig);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('web:load', () => ({
  directory: websiteDirectory(),
  content: readWebsiteContent(),
}));

ipcMain.handle('web:chooseDirectory', async () => {
  const currentDirectory = websiteDirectory();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn thư mục website đang được triển khai',
    defaultPath: fs.existsSync(currentDirectory) ? currentDirectory : projectRoot,
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const directory = result.filePaths[0];
  if (!fs.existsSync(path.join(directory, 'index.php'))) {
    throw new Error('Thư mục đã chọn không có index.php. Hãy chọn thư mục website PHP.');
  }
  const cfg = loadConfig();
  cfg.webDirectory = directory;
  saveConfig(cfg);
  return { canceled: false, directory, content: readWebsiteContent(directory) };
});

ipcMain.handle('web:save', (_, content) => {
  const directory = websiteDirectory();
  if (!fs.existsSync(path.join(directory, 'index.php'))) {
    throw new Error('Không tìm thấy index.php trong thư mục website. Hãy chọn lại thư mục triển khai.');
  }
  const validated = validateWebsiteContent(content);
  const filePath = path.join(directory, 'content.json');
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(validated, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  return { success: true };
});

ipcMain.handle('web:imageDataUrl', (_, relativePath) => {
  const image = String(relativePath || '');
  const match = image.match(/^uploads\/(?:home|forum)\/[a-f0-9-]+\.(jpg|png|webp)$/i);
  if (!match) {
    throw new Error('Đường dẫn ảnh website không hợp lệ.');
  }
  const imagePath = path.join(websiteDirectory(), ...image.split('/'));
  if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    throw new Error('Không tìm thấy ảnh trong thư mục website.');
  }
  const buffer = fs.readFileSync(imagePath);
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá giới hạn 5 MB.');
  const mime = ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[match[1].toLowerCase()];
  return `data:${mime};base64,${buffer.toString('base64')}`;
});

ipcMain.handle('web:uploadImages', async (_, { kind = 'home', postId } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  if (!['home', 'forum'].includes(kind)) throw new Error('Loại ảnh website không hợp lệ.');
  const options = {
    title: kind === 'home' ? 'Chọn ảnh trang chủ' : 'Chọn ảnh đính kèm bài viết',
    properties: kind === 'home' ? ['openFile'] : ['openFile', 'multiSelections'],
    filters: [{ name: 'Ảnh JPEG, PNG, WebP', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  };
  const selected = await dialog.showOpenDialog(mainWindow, options);
  if (selected.canceled || !selected.filePaths.length) return { canceled: true, images: [] };
  if (kind === 'home' && selected.filePaths.length !== 1) throw new Error('Chỉ chọn một ảnh trang chủ.');
  if (kind === 'forum' && selected.filePaths.length > 2) throw new Error('Mỗi lần chỉ được chọn tối đa hai ảnh.');

  let existingImages = [];
  let id;
  if (kind === 'forum') {
    id = Number(postId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Mã bài viết không hợp lệ.');
    const [[post]] = await pool.query('SELECT image FROM posts WHERE id = ?', [id]);
    if (!post) throw new Error('Không tìm thấy bài viết.');
    existingImages = storedForumImages(post.image);
    if (existingImages.length + selected.filePaths.length > 2) {
      throw new Error(`Bài viết đã có ${existingImages.length} ảnh; tối đa là 2 ảnh.`);
    }
  }

  const directory = websiteImagesDirectory(kind);
  const uploaded = [];
  try {
    for (const filePath of selected.filePaths) {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size < 1 || stat.size > 5 * 1024 * 1024) {
        throw new Error('Mỗi ảnh phải có dung lượng từ 1 byte đến 5 MB.');
      }
      const buffer = fs.readFileSync(filePath);
      const extension = imageExtension(buffer);
      const fileName = `${randomUUID()}${extension}`;
      fs.writeFileSync(path.join(directory, fileName), buffer, { flag: 'wx' });
      uploaded.push(`uploads/${kind}/${fileName}`);
    }
    if (kind === 'forum') {
      const images = [...existingImages, ...uploaded];
      const serialized = JSON.stringify(images);
      if (Buffer.byteLength(serialized, 'utf8') > 255) {
        throw new Error('Đường dẫn ảnh vượt quá giới hạn lưu của database.');
      }
      await pool.query('UPDATE posts SET image = ? WHERE id = ?', [serialized, id]);
    }
  } catch (error) {
    for (const image of uploaded) {
      const savedPath = path.join(websiteDirectory(), ...image.split('/'));
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    }
    throw error;
  }
  return { canceled: false, images: uploaded };
});

ipcMain.handle('web:forumRemoveImage', async (_, { postId, imageIndex } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  const id = Number(postId);
  const index = Number(imageIndex);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(index) || index < 0 || index > 1) {
    throw new Error('Thông tin ảnh bài viết không hợp lệ.');
  }
  const [[post]] = await pool.query('SELECT image FROM posts WHERE id = ?', [id]);
  if (!post) throw new Error('Không tìm thấy bài viết.');
  const images = storedForumImages(post.image);
  if (index >= images.length || !localForumImage(images[index])) {
    throw new Error('Không thể xóa ảnh cũ không được tải lên từ trình quản lý website.');
  }
  const [removed] = images.splice(index, 1);
  await pool.query('UPDATE posts SET image = ? WHERE id = ?', [images.length ? JSON.stringify(images) : null, id]);
  const filePath = path.join(websiteDirectory(), ...removed.split('/'));
  const uploadRoot = path.resolve(websiteImagesDirectory('forum'));
  if (path.resolve(filePath).startsWith(`${uploadRoot}${path.sep}`) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { success: true };
});

ipcMain.handle('web:forumList', async (_, { type = 'posts', page = 1, search = '' } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  if (!['posts', 'comments'].includes(type)) throw new Error('Loại nội dung diễn đàn không hợp lệ.');
  const requestedPage = Math.floor(Number(page));
  const pageNo = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const limit = 20;
  const offset = (pageNo - 1) * limit;
  const query = String(search || '').trim().slice(0, 100);
  const pattern = `%${query}%`;
  if (type === 'posts') {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM posts WHERE ? = ? OR tieude LIKE ? OR noidung LIKE ? OR username LIKE ?',
      [query, '', pattern, pattern, pattern]
    );
    const [rows] = await pool.query(
      `SELECT p.id, p.tieude AS title, p.noidung AS body, p.username AS author,
              p.created_at AS createdAt, p.ghimbai AS pinned,
              p.image AS image,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount
       FROM posts p
       WHERE ? = ? OR p.tieude LIKE ? OR p.noidung LIKE ? OR p.username LIKE ?
       ORDER BY p.ghimbai DESC, p.created_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [query, '', pattern, pattern, pattern, limit, offset]
    );
    return { rows, total: Number(total), page: pageNo, pages: Math.ceil(Number(total) / limit) };
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM comments c
     LEFT JOIN posts p ON p.id = c.post_id
     WHERE ? = ? OR c.nguoidung LIKE ? OR c.traloi LIKE ? OR p.tieude LIKE ?`,
    [query, '', pattern, pattern, pattern]
  );
  const [rows] = await pool.query(
    `SELECT c.id, c.post_id AS postId, c.nguoidung AS author,
            c.traloi AS body, c.created_at AS createdAt,
            p.tieude AS postTitle
     FROM comments c
     LEFT JOIN posts p ON p.id = c.post_id
     WHERE ? = ? OR c.nguoidung LIKE ? OR c.traloi LIKE ? OR p.tieude LIKE ?
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [query, '', pattern, pattern, pattern, limit, offset]
  );
  return { rows, total: Number(total), page: pageNo, pages: Math.ceil(Number(total) / limit) };
});

ipcMain.handle('web:forumPin', async (_, { postId, pinned } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  const id = Number(postId);
  if (!Number.isSafeInteger(id) || id < 1 || typeof pinned !== 'boolean') {
    throw new Error('Thông tin ghim bài không hợp lệ.');
  }
  const [result] = await pool.query('UPDATE posts SET ghimbai = ? WHERE id = ?', [pinned ? 1 : 0, id]);
  if (!result.affectedRows) {
    const [[post]] = await pool.query('SELECT id FROM posts WHERE id = ?', [id]);
    if (!post) throw new Error('Không tìm thấy bài viết.');
  }
  return { success: true };
});

ipcMain.handle('web:forumDeletePost', async (_, { postId } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  const id = Number(postId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Mã bài viết không hợp lệ.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[post]] = await connection.query('SELECT id FROM posts WHERE id = ? FOR UPDATE', [id]);
    if (!post) throw new Error('Không tìm thấy bài viết.');
    await connection.query('DELETE FROM comments WHERE post_id = ?', [id]);
    await connection.query('DELETE FROM posts WHERE id = ?', [id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

ipcMain.handle('web:forumDeleteComment', async (_, { commentId } = {}) => {
  if (!pool) throw new Error('Chưa kết nối database!');
  const id = Number(commentId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Mã bình luận không hợp lệ.');
  const [result] = await pool.query('DELETE FROM comments WHERE id = ?', [id]);
  if (!result.affectedRows) throw new Error('Không tìm thấy bình luận.');
  return { success: true };
});

// ── DB Connection test ─────────────────────────────
ipcMain.handle('db:connect', async (_, cfg) => {
  try {
    await createPool(cfg);
    const [rows] = await pool.query('SELECT 1 as ok');
    return { success: true };
  } catch (e) {
    pool = null;
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db:isConnected', async () => {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    return false;
  }
});

// ── Stats ──────────────────────────────────────────
ipcMain.handle('db:stats', async () => {
  if (!pool) throw new Error('Chưa kết nối database!');
  const tables = ['account', 'player', 'clan', 'giftcode', 'shop_ky_gui', 'history_transaction'];
  const result = {};
  for (const t of tables) {
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) as c FROM \`${t}\``);
      result[t] = rows[0].c;
    } catch (e) { result[t] = 0; }
  }
  try {
    const [r] = await pool.query("SELECT COUNT(*) as c FROM account WHERE server_login >= 0");
    result.online = r[0].c;
  } catch (e) { result.online = 0; }
  try {
    const [r] = await pool.query("SELECT SUM(vnd) as s FROM account");
    result.total_vnd = r[0].s || 0;
  } catch (e) { result.total_vnd = 0; }
  try {
    const [r] = await pool.query("SELECT SUM(vang) as s FROM account");
    result.total_vang = r[0].s || 0;
  } catch (e) { result.total_vang = 0; }
  return result;
});

// ── List tables ─────────────────────────────────────
ipcMain.handle('db:tables', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [tables] = await pool.query('SHOW TABLES');
  const dbName = (await pool.query('SELECT DATABASE() as d'))[0][0].d;
  const result = [];
  for (const row of tables) {
    const name = Object.values(row)[0];
    try {
      const [cnt] = await pool.query(`SELECT COUNT(*) as c FROM \`${name}\``);
      result.push({ name, count: cnt[0].c });
    } catch (e) {
      result.push({ name, count: 0 });
    }
  }
  return result;
});

// ── Validate table name ─────────────────────────────
async function validateTable(name) {
  const [tables] = await pool.query('SHOW TABLES');
  const names = tables.map(r => Object.values(r)[0]);
  if (!names.includes(name)) throw new Error('Tên bảng không hợp lệ: ' + name);
  return name;
}

async function getPK(tableName) {
  const [cols] = await pool.query(`DESCRIBE \`${tableName}\``);
  const pk = cols.find(c => c.Key === 'PRI');
  return pk ? pk.Field : cols[0].Field;
}

// ── Fetch table data ────────────────────────────────
ipcMain.handle('db:table', async (_, { table, page = 1, limit = 25, search = '', orderBy = '', dir = 'ASC' }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await validateTable(table);
  const offset = (page - 1) * limit;
  const safedir = dir === 'DESC' ? 'DESC' : 'ASC';

  const [cols] = await pool.query(`DESCRIBE \`${table}\``);
  const colNames = cols.map(c => c.Field);
  const safeOrder = colNames.includes(orderBy) ? orderBy : colNames[0];

  let whereSql = '';
  let params = [];
  if (search) {
    const searchCols = colNames.slice(0, 5);
    whereSql = 'WHERE ' + searchCols.map(c => `\`${c}\` LIKE ?`).join(' OR ');
    params = Array(searchCols.length).fill(`%${search}%`);
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM \`${table}\` ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT * FROM \`${table}\` ${whereSql} ORDER BY \`${safeOrder}\` ${safedir} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    columns: cols,
    rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
});

// ── Get single row ──────────────────────────────────
ipcMain.handle('db:row', async (_, { table, id }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await validateTable(table);
  const pkCol = await getPK(table);
  const [cols] = await pool.query(`DESCRIBE \`${table}\``);
  if (!id) return { columns: cols, row: null };
  const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${pkCol}\` = ? LIMIT 1`, [id]);
  return { columns: cols, row: rows[0] || null };
});

// ── Game data catalogs ─────────────────────────────
ipcMain.handle('game:itemTemplates', async (_, { search = '' } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const term = `%${String(search).trim()}%`;
  const [rows] = await pool.query(
    'SELECT id, NAME AS name, TYPE AS type, gender, level, icon_id AS iconId, part, head, body, leg, description FROM item_template WHERE CAST(id AS CHAR) LIKE ? OR NAME LIKE ? ORDER BY id',
    [term, term]
  );
  return rows;
});

ipcMain.handle('game:parts', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query(
    `SELECT p.id, p.TYPE AS type, p.DATA AS data,
      COALESCE(refs.itemUseCount, 0) AS itemUseCount,
      COALESCE(refs.costumeUseCount, 0) AS costumeUseCount
    FROM part p
    LEFT JOIN (
      SELECT part_id,
        COUNT(DISTINCT item_id) AS itemUseCount,
        COUNT(DISTINCT CASE WHEN is_costume = 1 THEN item_id END) AS costumeUseCount
      FROM (
        SELECT part AS part_id, id AS item_id, (TYPE = 5) AS is_costume FROM item_template WHERE part >= 0
        UNION ALL
        SELECT head AS part_id, id AS item_id, 1 AS is_costume FROM item_template WHERE head >= 0
        UNION ALL
        SELECT body AS part_id, id AS item_id, 1 AS is_costume FROM item_template WHERE body >= 0
        UNION ALL
        SELECT leg AS part_id, id AS item_id, 1 AS is_costume FROM item_template WHERE leg >= 0
      ) all_refs
      GROUP BY part_id
    ) refs ON refs.part_id = p.id
    ORDER BY p.id`
  );
  return rows;
});

ipcMain.handle('game:updateCostume', async (_, options = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const { id, name, part } = options;
  const itemId = Number(id);
  if (!Number.isSafeInteger(itemId) || itemId < 0) throw new Error('ID cải trang không hợp lệ.');
  const overrideFields = ['head', 'body', 'leg'];
  if (name === undefined && part === undefined && !overrideFields.some((key) => options[key] !== undefined)) {
    throw new Error('Không có thay đổi để lưu.');
  }

  const fields = [];
  const values = [];
  let itemName;
  let nextPart;
  if (name !== undefined) {
    itemName = String(name).trim();
    if (!itemName || itemName.length > 100) throw new Error('Tên cải trang phải có từ 1 đến 100 ký tự.');
    fields.push('NAME = ?');
    values.push(itemName);
  }
  if (part !== undefined) {
    nextPart = Number(part);
    if (!Number.isInteger(nextPart) || nextPart < -1 || nextPart > 32767) throw new Error('Part cải trang không hợp lệ.');
    fields.push('part = ?');
    values.push(nextPart);
  }

  const nextAppearance = {};
  for (const key of overrideFields) {
    const value = options[key];
    if (value === undefined) continue;
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < -1 || numericValue > 32767) {
      throw new Error(`Giá trị ${key} phải từ -1 đến 32767.`);
    }
    nextAppearance[key] = numericValue;
    fields.push(`\`${key}\` = ?`);
    values.push(numericValue);
  }

  const [[current]] = await pool.query('SELECT NAME AS name, part, head, body, leg FROM item_template WHERE id = ? AND TYPE = 5 LIMIT 1', [itemId]);
  if (!current) throw new Error('Không tìm thấy cải trang.');
  await pool.query(`UPDATE item_template SET ${fields.join(', ')} WHERE id = ? AND TYPE = 5`, [...values, itemId]);

  const nameChanged = itemName !== undefined && itemName !== current.name;
  const appearanceChanged = (nextPart !== undefined && nextPart !== Number(current.part))
    || Object.entries(nextAppearance).some(([key, value]) => value !== Number(current[key]));
  const runtime = nameChanged
    ? await serverBridge.command('item.renameCostume', { itemId, name: itemName })
    : { success: true };
  return {
    success: true,
    name: itemName ?? current.name,
    part: nextPart ?? Number(current.part),
    ...Object.fromEntries(['head', 'body', 'leg'].map((key) => [key, nextAppearance[key] ?? Number(current[key])])),
    nameRuntimeChanged: nameChanged,
    runtimeApplied: nameChanged ? runtime.success === true : null,
    runtimeCode: nameChanged && !runtime.success ? runtime.code : null,
    runtimeMessage: runtime.message || null,
    appearanceRestartRequired: appearanceChanged,
  };
});

ipcMain.handle('game:createCostume', async (_, options = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const { name, gender = 0, level = 0, iconId = -1, part = -1, head = -1, body = -1, leg = -1 } = options;

  const itemName = String(name ?? '').trim();
  if (!itemName || itemName.length > 100) throw new Error('Tên cải trang phải có từ 1 đến 100 ký tự.');

  const genderNum = Number(gender);
  const levelNum = Number(level);
  const iconNum = Number(iconId);
  if (![0, 1, 2, 3].includes(genderNum)) throw new Error('Tộc không hợp lệ (0=Trái Đất, 1=Namek, 2=Saiyan, 3=Tất cả).');
  if (!Number.isInteger(levelNum) || levelNum < 0 || levelNum > 999) throw new Error('Cấp độ phải từ 0 đến 999.');

  const checkNum = (val, label) => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < -1 || n > 32767) throw new Error(`${label} phải từ -1 đến 32767.`);
    return n;
  };
  const pPart   = checkNum(part,   'Part mẫu');
  const pHead   = checkNum(head,   'Đầu');
  const pBody   = checkNum(body,   'Thân');
  const pLeg    = checkNum(leg,    'Chân');
  const pIconId = iconNum >= 0 ? iconNum : -1;

  // Find next available ID >= 1 that isn't taken
  const [[{ maxId }]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM item_template WHERE type = 5');
  const nextId = Number(maxId) + 1;
  if (nextId > 32767) throw new Error('Đã đạt giới hạn số lượng cải trang (ID > 32767).');

  await pool.query(
    `INSERT INTO item_template (id, NAME, TYPE, gender, level, icon_id, part, head, body, leg, description)
     VALUES (?, ?, 5, ?, ?, ?, ?, ?, ?, ?, '')`,
    [nextId, itemName, genderNum, levelNum, pIconId, pPart, pHead, pBody, pLeg]
  );

  return {
    success: true,
    id: nextId,
    name: itemName,
    type: 5,
    gender: genderNum,
    level: levelNum,
    iconId: pIconId,
    part: pPart,
    head: pHead,
    body: pBody,
    leg: pLeg,
    description: '',
    isNew: true,
  };
});

// ── Ngoại hình hợp thể (array_head_2_frames) ────────────────────────────────
ipcMain.handle('game:fusionForms', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query('SELECT id, data FROM array_head_2_frames ORDER BY id');
  return rows.map((r) => {
    let frames = [];
    try { frames = JSON.parse(String(r.data).replace(/,\s*]/g, ']')); } catch (_) {}
    return { id: r.id, frames: Array.isArray(frames) ? frames.map(Number) : [], rawData: r.data };
  });
});

ipcMain.handle('game:updateFusionForm', async (_, { id, frames } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const rowId = Number(id);
  if (!Number.isInteger(rowId) || rowId < 0) throw new Error('ID hợp thể không hợp lệ.');
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('Danh sách frame không được rỗng.');
  const cleaned = frames.map((v, i) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 32767) throw new Error(`Frame[${i}] phải là Icon ID từ 0 đến 32767.`);
    return n;
  });
  const [[exists]] = await pool.query('SELECT id FROM array_head_2_frames WHERE id = ? LIMIT 1', [rowId]);
  if (!exists) throw new Error(`Không tìm thấy ngoại hình hợp thể #${rowId}.`);
  await pool.query('UPDATE array_head_2_frames SET data = ? WHERE id = ?', [JSON.stringify(cleaned), rowId]);
  return { success: true, id: rowId, frames: cleaned, restartRequired: true };
});

ipcMain.handle('game:createFusionForm', async (_, { frames } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('Phải có ít nhất 1 frame icon.');
  const cleaned = frames.map((v, i) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 32767) throw new Error(`Frame[${i}] phải là Icon ID từ 0 đến 32767.`);
    return n;
  });
  const [[{ maxId }]] = await pool.query('SELECT COALESCE(MAX(id), -1) AS maxId FROM array_head_2_frames');
  const nextId = Number(maxId) + 1;
  await pool.query('INSERT INTO array_head_2_frames (id, data) VALUES (?, ?)', [nextId, JSON.stringify(cleaned)]);
  return { success: true, id: nextId, frames: cleaned, restartRequired: true };
});

ipcMain.handle('game:deleteFusionForm', async (_, { id } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const rowId = Number(id);
  if (!Number.isInteger(rowId) || rowId < 0) throw new Error('ID hợp thể không hợp lệ.');
  const [[exists]] = await pool.query('SELECT id FROM array_head_2_frames WHERE id = ? LIMIT 1', [rowId]);
  if (!exists) throw new Error(`Không tìm thấy ngoại hình hợp thể #${rowId}.`);
  await pool.query('DELETE FROM array_head_2_frames WHERE id = ?', [rowId]);
  return { success: true, id: rowId };
});

ipcMain.handle('game:updatePart', async (_, { id, data } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const partId = Number(id);
  if (!Number.isInteger(partId) || partId < 0 || partId > 32767) throw new Error('ID part không hợp lệ.');

  let entries;
  try {
    entries = typeof data === 'string' ? JSON.parse(data.replace(/\\"/g, '"')) : data;
    entries = entries.map((entry) => typeof entry === 'string' ? JSON.parse(entry) : entry);
  } catch (_) {
    throw new Error('DATA phải là JSON hợp lệ.');
  }
  if (!Array.isArray(entries)) throw new Error('DATA phải là danh sách JSON.');
  const normalized = entries.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every(Number.isInteger)) {
      throw new Error(`DATA[${index}] phải gồm ba số nguyên [iconId, dx, dy].`);
    }
    const [iconId, dx, dy] = entry;
    if (iconId < 0 || iconId > 32767 || dx < -128 || dx > 127 || dy < -128 || dy > 127) {
      throw new Error(`DATA[${index}] vượt giới hạn iconId hoặc tọa độ.`);
    }
    return [iconId, dx, dy];
  });
  const [parts] = await pool.query('SELECT id, DATA AS data FROM part WHERE id = ? LIMIT 1', [partId]);
  if (!parts.length) throw new Error('Không tìm thấy part.');
  let original;
  try {
    original = JSON.parse(String(parts[0].data).replace(/\\"/g, '"'));
    original = original.map((entry) => typeof entry === 'string' ? JSON.parse(entry) : entry);
  } catch (_) {
    throw new Error('DATA part hiện tại không hợp lệ; không thể bảo toàn số frame.');
  }
  if (!Array.isArray(original) || original.length !== normalized.length) {
    throw new Error(`Không được thay đổi số frame của part #${partId}; cần giữ đúng ${original.length} frame.`);
  }
  await pool.query('UPDATE part SET DATA = ? WHERE id = ?', [JSON.stringify(normalized), partId]);
  return { success: true, id: partId, data: normalized, restartRequired: true };
});

ipcMain.handle('game:renameCostume', async (_, { id, name } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const itemId = Number(id);
  const itemName = String(name ?? '').trim();
  if (!Number.isSafeInteger(itemId) || itemId < 0) throw new Error('ID cải trang không hợp lệ.');
  if (!itemName || itemName.length > 100) throw new Error('Tên cải trang phải có từ 1 đến 100 ký tự.');

  const [items] = await pool.query('SELECT id FROM item_template WHERE id = ? AND type = 5 LIMIT 1', [itemId]);
  if (!items.length) throw new Error('Không tìm thấy cải trang.');
  await pool.query('UPDATE item_template SET NAME = ? WHERE id = ? AND type = 5', [itemName, itemId]);
  const runtime = await serverBridge.command('item.renameCostume', { itemId, name: itemName });
  return {
    success: true,
    name: itemName,
    runtimeApplied: runtime.success === true,
    runtimeCode: runtime.success ? null : runtime.code,
    runtimeMessage: runtime.message || null,
  };
});

ipcMain.handle('game:itemOptions', async (_, { search = '', limit = 250 } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 500);
  const term = `%${String(search).trim()}%`;
  const [rows] = await pool.query(
    'SELECT id, NAME AS name FROM item_option_template WHERE CAST(id AS CHAR) LIKE ? OR NAME LIKE ? ORDER BY id LIMIT ?',
    [term, term, safeLimit]
  );
  return rows;
});

ipcMain.handle('game:mobTemplates', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query('SELECT id, NAME AS name, TYPE AS type, hp, range_move AS rangeMove, speed, dart_Type AS dartType, percent_dame AS percentDame, percent_tiem_nang AS percentTiemNang FROM mob_template ORDER BY id');
  return rows;
});

ipcMain.handle('game:npcTemplates', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query('SELECT id, NAME AS name, head, body, leg, avatar FROM npc_template ORDER BY id');
  return rows;
});

ipcMain.handle('game:headAvatars', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query('SELECT head_id AS headId, avatar_id AS avatarId FROM head_avatar ORDER BY head_id');
  return rows;
});

ipcMain.handle('game:skillTemplates', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query('SELECT nclass_id AS classId, id, NAME AS name, max_point AS maxPoint, icon_id AS iconId, dam_info AS damageInfo, slot FROM skill_template ORDER BY nclass_id, slot, id');
  return rows;
});

ipcMain.handle('game:taskTemplates', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.detail,
            s.name AS subName, s.max_count AS maxCount,
            s.notify, s.npc_id AS npcId, s.map AS mapId
     FROM task_main_template m
     LEFT JOIN task_sub_template s ON s.task_main_id = m.id
     ORDER BY m.id`
  );
  const taskMap = new Map();
  for (const row of rows) {
    if (!taskMap.has(row.id)) {
      taskMap.set(row.id, { id: row.id, name: row.name, detail: row.detail, subTasks: [] });
    }
    if (row.subName !== null && row.subName !== undefined) {
      taskMap.get(row.id).subTasks.push({
        name: row.subName, maxCount: row.maxCount, notify: row.notify,
        npcId: row.npcId, mapId: row.mapId
      });
    }
  }
  return [...taskMap.values()];
});

ipcMain.handle('db:shopDetails', async (_, { shopId }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const id = Number(shopId);
  if (!Number.isInteger(id)) throw new Error('Shop ID không hợp lệ!');
  const [[shop]] = await pool.query('SELECT * FROM shop WHERE id = ?', [id]);
  if (!shop) throw new Error('Không tìm thấy shop!');
  const [tabs] = await pool.query('SELECT * FROM tab_shop WHERE shop_id = ? ORDER BY id', [id]);
  for (const tab of tabs) {
    const [items] = await pool.query(
      `SELECT i.*, t.NAME AS itemName, t.icon_id AS iconId
       FROM item_shop i LEFT JOIN item_template t ON t.id = i.temp_id
       WHERE i.tab_id = ? ORDER BY i.create_time DESC`, [tab.id]
    );
    for (const item of items) {
      const [options] = await pool.query('SELECT o.*, t.NAME AS optionName FROM item_shop_option o LEFT JOIN item_option_template t ON t.id = o.option_id WHERE o.item_shop_id = ? ORDER BY o.id', [item.id]);
      item.options = options;
    }
    tab.items = items;
  }
  return { shop, tabs };
});

ipcMain.handle('db:addShopTab', async (_, { shopId, name } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const id = Number(shopId);
  const tabName = String(name || '').trim();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Shop ID không hợp lệ!');
  if (!tabName || tabName.length > 50) throw new Error('Tên tab phải có 1–50 ký tự!');
  const [[shop]] = await pool.query('SELECT id FROM shop WHERE id = ?', [id]);
  if (!shop) throw new Error('Không tìm thấy shop!');
  const [result] = await pool.query('INSERT INTO tab_shop (shop_id, NAME) VALUES (?, ?)', [id, tabName]);
  return { success: true, id: result.insertId, ...await reloadRuntimeData('shop') };
});

ipcMain.handle('db:deleteShopTab', async (_, { shopId, tabId } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const shop = Number(shopId);
  const tab = Number(tabId);
  if (!Number.isInteger(shop) || shop <= 0 || !Number.isInteger(tab) || tab <= 0) throw new Error('Shop/tab ID không hợp lệ!');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[tabRow]] = await connection.query('SELECT id FROM tab_shop WHERE id = ? AND shop_id = ? FOR UPDATE', [tab, shop]);
    if (!tabRow) throw new Error('Không tìm thấy tab trong shop này!');
    await connection.query('DELETE FROM item_shop_option WHERE item_shop_id IN (SELECT id FROM item_shop WHERE tab_id = ?)', [tab]);
    await connection.query('DELETE FROM item_shop WHERE tab_id = ?', [tab]);
    const [deleted] = await connection.query('DELETE FROM tab_shop WHERE id = ? AND shop_id = ?', [tab, shop]);
    if (deleted.affectedRows !== 1) throw new Error('Không thể xóa tab shop!');
    await connection.commit();
    return { success: true, ...await reloadRuntimeData('shop') };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

ipcMain.handle('db:updateShopItem', async (_, { itemId, data, options = [] }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Item shop không hợp lệ!');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const allowed = ['temp_id', 'is_new', 'is_sell', 'type_sell', 'cost', 'icon_spec'];
    const updates = allowed.filter((key) => Object.prototype.hasOwnProperty.call(data, key));
    if (updates.length) {
      const sql = updates.map((key) => `\`${key}\` = ?`).join(', ');
      await connection.query(`UPDATE item_shop SET ${sql} WHERE id = ?`, [...updates.map((key) => data[key]), id]);
    }
    await connection.query('DELETE FROM item_shop_option WHERE item_shop_id = ?', [id]);
    for (const option of options) {
      const optionId = Number(option.option_id ?? option.id);
      if (!Number.isInteger(optionId) || optionId < 0) continue;
      await connection.query('INSERT INTO item_shop_option (item_shop_id, option_id, param) VALUES (?, ?, ?)', [id, optionId, Number(option.param) || 0]);
    }
    await connection.commit();
    return { success: true, ...await reloadRuntimeData('shop') };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

ipcMain.handle('db:addShopItem', async (_, { tabId, data, options = [] }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const tab = Number(tabId);
  if (!Number.isInteger(tab) || tab <= 0) throw new Error('Tab shop không hợp lệ!');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      'INSERT INTO item_shop (tab_id, temp_id, is_new, is_sell, type_sell, cost, icon_spec) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tab, Number(data.temp_id), Number(data.is_new) || 0, Number(data.is_sell) ?? 1, Number(data.type_sell) || 0, Number(data.cost) || 0, Number(data.icon_spec) || 0]
    );
    for (const option of options) {
      const optionId = Number(option.option_id ?? option.id);
      if (Number.isInteger(optionId) && optionId >= 0) await connection.query('INSERT INTO item_shop_option (item_shop_id, option_id, param) VALUES (?, ?, ?)', [result.insertId, optionId, Number(option.param) || 0]);
    }
    await connection.commit();
    return { success: true, id: result.insertId, ...await reloadRuntimeData('shop') };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

ipcMain.handle('db:deleteShopItem', async (_, { itemId } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Item shop không hợp lệ!');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[itemRow]] = await connection.query('SELECT id FROM item_shop WHERE id = ? FOR UPDATE', [id]);
    if (!itemRow) throw new Error('Không tìm thấy vật phẩm shop!');
    await connection.query('DELETE FROM item_shop_option WHERE item_shop_id = ?', [id]);
    const [deleted] = await connection.query('DELETE FROM item_shop WHERE id = ?', [id]);
    if (deleted.affectedRows !== 1) throw new Error('Không thể xóa vật phẩm shop!');
    await connection.commit();
    return { success: true, ...await reloadRuntimeData('shop') };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

// ── Update row ──────────────────────────────────────
ipcMain.handle('db:update', async (_, { table, pkValue, data }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await validateTable(table);
  const pkCol = await getPK(table);
  delete data[pkCol];

  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const currentTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (data.hasOwnProperty('update_time')) {
    data.update_time = currentTime;
  }

  for (let key in data) {
    if (typeof data[key] === 'string' && (data[key].includes('GMT') || data[key].includes('Time'))) {
      const parsed = new Date(data[key]);
      if (!isNaN(parsed)) {
        data[key] = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
      }
    }
  }

  const sets = Object.keys(data).map(k => `\`${k}\` = ?`).join(', ');
  const vals = [...Object.values(data), pkValue];
  const [res] = await pool.query(`UPDATE \`${table}\` SET ${sets} WHERE \`${pkCol}\` = ?`, vals);
  return { success: true, affected: res.affectedRows, ...await reloadRuntimeData(table) };
});

// ── Insert row ──────────────────────────────────────
ipcMain.handle('db:insert', async (_, { table, data }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await validateTable(table);

  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const currentTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  if (data.hasOwnProperty('create_time')) data.create_time = currentTime;
  if (data.hasOwnProperty('update_time')) data.update_time = currentTime;

  for (let key in data) {
    if (typeof data[key] === 'string' && (data[key].includes('GMT') || data[key].includes('Time'))) {
      const parsed = new Date(data[key]);
      if (!isNaN(parsed)) {
        data[key] = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
      }
    }
  }

  const cols = Object.keys(data).map(k => `\`${k}\``).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const [res] = await pool.query(
    `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
    Object.values(data)
  );
  return { success: true, id: res.insertId, ...await reloadRuntimeData(table) };
});

// ── Delete row ──────────────────────────────────────
ipcMain.handle('db:delete', async (_, { table, pkValue }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await validateTable(table);
  const pkCol = await getPK(table);
  if (table === 'item_shop') {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM item_shop_option WHERE item_shop_id = ?', [pkValue]);
      const [res] = await connection.query(`DELETE FROM \`${table}\` WHERE \`${pkCol}\` = ?`, [pkValue]);
      await connection.commit();
      return { success: true, affected: res.affectedRows, ...await reloadRuntimeData(table) };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
  const [res] = await pool.query(`DELETE FROM \`${table}\` WHERE \`${pkCol}\` = ?`, [pkValue]);
  return { success: true, affected: res.affectedRows, ...await reloadRuntimeData(table) };
});

// ── Execute SQL ─────────────────────────────────────
ipcMain.handle('db:sql', async (_, { sql }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const lsql = sql.toLowerCase().trim();
  const blocked = ['drop table', 'drop database', 'truncate', 'alter table'];
  for (const b of blocked) {
    if (lsql.includes(b)) throw new Error(`Lệnh "${b}" bị chặn vì lý do an toàn!`);
  }
  const start = Date.now();
  const [result] = await pool.query(sql);
  const ms = Date.now() - start;

  if (Array.isArray(result)) {
    return {
      type: 'select',
      columns: result.length > 0 ? Object.keys(result[0]) : [],
      rows: result,
      count: result.length,
      ms,
    };
  } else {
    return { type: 'update', affected: result.affectedRows, ms };
  }
});

// ── Top players ─────────────────────────────────────
ipcMain.handle('db:topPlayers', async () => {
  if (!pool) throw new Error('Chưa kết nối!');
  try {
    const [rows] = await pool.query(
      `SELECT p.name, a.username, a.vnd, a.vang, a.ban, a.is_admin
       FROM player p JOIN account a ON p.account_id = a.id
       ORDER BY a.vnd DESC LIMIT 20`
    );
    return rows;
  } catch (e) { return []; }
});

// ── Recent transactions ─────────────────────────────
ipcMain.handle('db:transactions', async (_, { limit = 20 } = {}) => {
  if (!pool) throw new Error('Chưa kết nối!');
  try {
    const [rows] = await pool.query(`SELECT * FROM history_transaction ORDER BY id DESC LIMIT ?`, [limit]);
    return rows;
  } catch (e) { return []; }
});

// ── Maintenance helpers ─────────────────────────────
ipcMain.handle('db:maintenance', async (_, { status }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  await pool.query(`UPDATE adminpanel SET trangthai = ?`, [status]);
  return { success: true };
});

ipcMain.handle('db:quickSql', async (_, { sql }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const [res] = await pool.query(sql);
  return { affected: Array.isArray(res) ? res.length : res.affectedRows };
});

// ── Account actions ─────────────────────────────────
ipcMain.handle('db:accountAction', async (_, { action, accountId, amount = 0 }) => {
  if (!pool) throw new Error('Chưa kết nối!');
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID tài khoản không hợp lệ!');

  if (action === 'ban') {
    const [res] = await pool.query('UPDATE account SET ban = IF(ban = 1, 0, 1) WHERE id = ?', [id]);
    return { success: true, affected: res.affectedRows };
  }
  if (action === 'giveVang' || action === 'giveVnd') {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value === 0) throw new Error('Số lượng phải là số nguyên khác 0!');
    const column = action === 'giveVang' ? 'vang' : 'vnd';
    const [res] = await pool.query(`UPDATE account SET \`${column}\` = \`${column}\` + ? WHERE id = ?`, [value, id]);
    return { success: true, affected: res.affectedRows };
  }
  throw new Error('Thao tác tài khoản không hợp lệ!');
});

ipcMain.handle('server:status', () => serverBridge.command('server.status'));
ipcMain.handle('server:command', (_, { action, data } = {}) => serverBridge.command(action, data));

// ── Open file dialog ────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'SQL Files', extensions: ['sql', 'txt'] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return fs.readFileSync(result.filePaths[0], 'utf8');
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (_, { content, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export.sql',
    filters: [{ name: 'SQL Files', extensions: ['sql'] }, { name: 'CSV', extensions: ['csv'] }],
  });
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, content, 'utf8');
    return true;
  }
  return false;
});

// ── Shell open external ─────────────────────────────
ipcMain.on('shell:open', (_, url) => shell.openExternal(url));

// ── Restart server ──────────────────────────────────
ipcMain.handle('server:restart', async () => {
  const batFile = path.join(projectRoot, 'restart_server.bat');
  if (!fs.existsSync(batFile)) {
    throw new Error('Không tìm thấy file restart_server.bat tại: ' + batFile);
  }
  return new Promise((resolve, reject) => {
    const proc = spawn('cmd.exe', ['/c', batFile], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    });
    proc.on('error', (err) => reject(new Error('Không thể chạy restart_server.bat: ' + err.message)));
    proc.unref();
    resolve({ success: true });
  });
});
