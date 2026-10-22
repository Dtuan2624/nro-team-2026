/* ================================================
   NRO Admin Panel — app.js
   Ngọc Rồng Online Admin 2026 — By Mr Blue
   ================================================ */

'use strict';

// ── State ──────────────────────────────────────────
const State = {
  currentPage: null,
  currentTable: null,
  tableState: {},
  csrfToken: document.getElementById('csrfToken')?.value || '',
};

// ── Utilities ─────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const qs = () => new URLSearchParams(window.location.search);

function fmt(num) {
  if (num === null || num === undefined || num === '') return '—';
  return Number(num).toLocaleString('vi-VN');
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN');
}

function truncate(str, n = 40) {
  if (!str) return '—';
  str = String(str);
  return str.length > n ? str.slice(0, n) + '...' : str;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// ── Toast Notifications ───────────────────────────
function toast(msg, type = 'success', duration = 3500) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const ct = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${escHtml(msg)}</span>`;
  ct.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

// ── API calls ─────────────────────────────────────
async function api(endpoint, params = {}, method = 'GET', data = null) {
  const url = new URL('index.php', window.location.origin + window.location.pathname.replace('index.php', ''));
  url.searchParams.set('api', endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const opts = {
    method,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': State.csrfToken,
    },
  };

  if (data) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.append(k, v ?? '');
    fd.append('csrf_token', State.csrfToken);
    opts.body = fd;
  }

  const res = await fetch(url.toString(), opts);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ── Modal ─────────────────────────────────────────
function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modalTitle').innerHTML = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── Clock ─────────────────────────────────────────
function startClock() {
  const el = document.getElementById('topbarTime');
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

// ── Sidebar collapse ──────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const toggle = document.getElementById('sidebarToggle');
  const mobileBtn = document.getElementById('mobileMenu');

  if (!sidebar) return;

  const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    mainContent?.classList.add('expanded');
  }

  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent?.classList.toggle('expanded');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });

  mobileBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // Close modal on overlay click
  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
}

// ── Server Status Check ───────────────────────────
async function checkServerStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (!dot) return;

  try {
    const data = await api('stats');
    if (data) {
      dot.className = 'status-dot online';
      txt.textContent = `DB: ${fmt(data.account)} tài khoản`;
    }
  } catch (e) {
    dot.className = 'status-dot offline';
    txt.textContent = 'Lỗi kết nối DB';
  }
}

// ══════════════════════════════════════════════════
// PAGE ROUTER
// ══════════════════════════════════════════════════
async function loadPage(pageName) {
  const container = document.getElementById('pageContent');
  if (!container) return;

  State.currentPage = pageName;
  document.getElementById('bcPage').textContent = getPageTitle(pageName);

  // Mark active nav
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = $$(`.nav-item[href*="page=${pageName}"]`);
  activeNav.forEach(n => n.classList.add('active'));

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Đang tải...</p></div>';

  try {
    switch (pageName) {
      case 'dashboard':     await renderDashboard(container); break;
      case 'accounts':      await renderTablePage(container, 'account', '👥 Tài khoản'); break;
      case 'players':       await renderTablePage(container, 'player', '🎮 Nhân vật'); break;
      case 'clans':         await renderTablePage(container, 'clan', '🏰 Bang hội'); break;
      case 'giftcodes':     await renderTablePage(container, 'giftcode', '🎁 Giftcode'); break;
      case 'shop':          await renderTablePage(container, 'shop_ky_gui', '🛒 Shop Ký Gửi'); break;
      case 'transactions':  await renderTablePage(container, 'history_transaction', '💳 Giao dịch'); break;
      case 'tables':        await renderTablesPage(container); break;
      case 'sql':           renderSqlPage(container); break;
      case 'maintenance':   renderMaintenancePage(container); break;
      case 'settings':      renderSettingsPage(container); break;
      default:
        if (pageName.startsWith('table_')) {
          const tbl = pageName.replace('table_', '');
          await renderTablePage(container, tbl, '🗄️ ' + tbl);
        } else {
          await renderDashboard(container);
        }
    }
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Lỗi tải trang</h3>
        <p>${escHtml(err.message)}</p>
        <button class="btn btn-secondary mt-16" onclick="loadPage('${pageName}')">↺ Thử lại</button>
      </div>`;
  }
}

function getPageTitle(page) {
  const titles = {
    dashboard: 'Dashboard', accounts: 'Tài khoản', players: 'Nhân vật',
    clans: 'Bang hội', giftcodes: 'Giftcode', shop: 'Shop Ký Gửi',
    transactions: 'Giao dịch', tables: 'Bảng DB', sql: 'SQL Console',
    maintenance: 'Bảo trì', settings: 'Cài đặt',
  };
  return titles[page] || page;
}

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
async function renderDashboard(container) {
  const stats = await api('stats');

  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">📊 Dashboard <span class="gradient-text">NRO Admin</span></h1>
      <p class="page-subtitle">Tổng quan hệ thống Ngọc Rồng Online</p>
    </div>

    <div class="stats-grid" id="statsGrid"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:0" id="dashGrids">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">🏆 Top người nạp</h2>
          <button class="btn btn-sm btn-outline" onclick="loadPage('accounts')">Xem tất cả →</button>
        </div>
        <div id="topPlayersContainer"><div class="spinner" style="margin:20px auto;display:block"></div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">💳 Giao dịch gần đây</h2>
          <button class="btn btn-sm btn-outline" onclick="loadPage('transactions')">Xem tất cả →</button>
        </div>
        <div id="recentTxContainer"><div class="spinner" style="margin:20px auto;display:block"></div></div>
      </div>
    </div>
  </div>`;

  // Stat cards
  const statData = [
    { icon: '👥', label: 'Tài khoản', value: stats.account, color: '#6366f1', change: '+0' },
    { icon: '🎮', label: 'Nhân vật', value: stats.player, color: '#8b5cf6', change: '' },
    { icon: '🌐', label: 'Đang online', value: stats.online, color: '#22d3ee', change: '' },
    { icon: '🏰', label: 'Bang hội', value: stats.clan, color: '#f59e0b', change: '' },
    { icon: '🎁', label: 'Giftcode', value: stats.giftcode, color: '#10b981', change: '' },
    { icon: '💰', label: 'Tổng VND', value: fmt(stats.total_vnd), color: '#ec4899', isStr: true },
    { icon: '🛒', label: 'Shop KG', value: stats.shop_ky_gui, color: '#14b8a6', change: '' },
    { icon: '📋', label: 'Giao dịch', value: stats.history_transaction, color: '#f97316', change: '' },
  ];

  const grid = document.getElementById('statsGrid');
  grid.innerHTML = statData.map(s => `
    <div class="stat-card" style="--stat-color:${s.color}">
      <span class="stat-icon">${s.icon}</span>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="color:${s.color}">${s.isStr ? s.value : fmt(s.value)}</div>
    </div>
  `).join('');

  // Top players
  try {
    const top = await api('topPlayers');
    const tpEl = document.getElementById('topPlayersContainer');
    if (!top.length) { tpEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div><p>Chưa có dữ liệu</p></div>'; return; }
    tpEl.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>#</th><th>Tên nhân vật</th><th>Tài khoản</th><th>VND</th><th>Vàng</th><th>Trạng thái</th></tr></thead>
      <tbody>${top.slice(0,10).map((p,i) => `<tr>
        <td><strong>#${i+1}</strong></td>
        <td>${escHtml(p.name||'?')}</td>
        <td>${escHtml(p.username||'?')}</td>
        <td class="text-warning text-mono">${fmt(p.vnd)}</td>
        <td class="text-primary text-mono">${fmt(p.vang)}</td>
        <td>${p.ban ? '<span class="badge badge-danger">Banned</span>' : '<span class="badge badge-success">Active</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) {
    document.getElementById('topPlayersContainer').innerHTML = `<p class="text-muted">Lỗi: ${e.message}</p>`;
  }

  // Recent transactions
  try {
    const txs = await api('transactions', { limit: 8 });
    const txEl = document.getElementById('recentTxContainer');
    if (!txs.length) { txEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><p>Chưa có giao dịch</p></div>'; return; }
    const cols = Object.keys(txs[0]);
    txEl.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>${cols.slice(0,5).map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${txs.map(r => `<tr>${cols.slice(0,5).map(c => `<td>${escHtml(truncate(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) {
    document.getElementById('recentTxContainer').innerHTML = `<p class="text-muted">Lỗi: ${e.message}</p>`;
  }
}

// ══════════════════════════════════════════════════
// GENERIC TABLE PAGE
// ══════════════════════════════════════════════════
async function renderTablePage(container, tableName, title) {
  const stateKey = tableName;
  if (!State.tableState[stateKey]) {
    State.tableState[stateKey] = { page: 1, limit: 25, search: '', order: '', dir: 'ASC', sortedCol: '' };
  }
  const ts = State.tableState[stateKey];
  State.currentTable = tableName;

  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div class="flex items-center justify-between flex-wrap gap-8">
        <div>
          <h1 class="page-title">${title}</h1>
          <p class="page-subtitle" id="tableSubtitle">Đang tải...</p>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-sm btn-outline" onclick="refreshTable()">↺ Làm mới</button>
          <button class="btn btn-sm btn-primary" onclick="openInsertModal('${tableName}')">+ Thêm mới</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="searchInput" placeholder="Tìm kiếm..." value="${escHtml(ts.search)}">
        </div>
        <select id="limitSelect" class="btn btn-sm btn-outline" style="cursor:pointer">
          <option value="10" ${ts.limit==10?'selected':''}>10 dòng</option>
          <option value="25" ${ts.limit==25?'selected':''}>25 dòng</option>
          <option value="50" ${ts.limit==50?'selected':''}>50 dòng</option>
          <option value="100" ${ts.limit==100?'selected':''}>100 dòng</option>
        </select>
      </div>
      <div id="tableContainer">
        <div class="loading-spinner"><div class="spinner"></div></div>
      </div>
      <div id="paginationContainer" class="pagination mt-16"></div>
    </div>
  </div>`;

  // Search debounce
  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ts.search = e.target.value;
      ts.page = 1;
      loadTableData(tableName);
    }, 400);
  });

  document.getElementById('limitSelect').addEventListener('change', (e) => {
    ts.limit = parseInt(e.target.value);
    ts.page = 1;
    loadTableData(tableName);
  });

  await loadTableData(tableName);
}

async function loadTableData(tableName) {
  const ts = State.tableState[tableName];
  const tableContainer = document.getElementById('tableContainer');
  if (!tableContainer) return;

  tableContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const data = await api('table', {
      table: tableName,
      page: ts.page,
      limit: ts.limit,
      search: ts.search,
      order: ts.sortedCol,
      dir: ts.dir,
    });

    const subtitle = document.getElementById('tableSubtitle');
    if (subtitle) subtitle.textContent = `${fmt(data.total)} bản ghi • Trang ${data.page}/${data.pages}`;

    if (!data.rows.length) {
      tableContainer.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🗄️</div>
        <h3>Không có dữ liệu</h3>
        <p>Thử thay đổi bộ lọc hoặc thêm bản ghi mới</p>
      </div>`;
      document.getElementById('paginationContainer').innerHTML = '';
      return;
    }

    const pkCol = data.columns.find(c => c.Key === 'PRI')?.Field || data.columns[0]?.Field;
    const colDefs = data.columns;

    // Build table
    const colHeaders = colDefs.map(c => {
      const isSorted = ts.sortedCol === c.Field;
      const arrow = isSorted ? (ts.dir === 'ASC' ? ' ↑' : ' ↓') : '';
      return `<th class="${isSorted ? 'sorted' : ''}" onclick="sortTable('${tableName}', '${c.Field}')">${escHtml(c.Field)}${arrow}</th>`;
    }).join('') + '<th>Hành động</th>';

    const rows = data.rows.map(row => {
      const cells = colDefs.map(col => {
        let val = row[col.Field];
        let display = val === null ? '<span class="text-muted">NULL</span>' : escHtml(truncate(String(val), 35));
        // Special rendering
        if (col.Field === 'ban' || col.Field === 'active') {
          display = val == 1
            ? (col.Field === 'ban' ? '<span class="badge badge-danger">Banned</span>' : '<span class="badge badge-success">Active</span>')
            : (col.Field === 'ban' ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-danger">Inactive</span>');
        } else if (col.Field === 'is_admin' || col.Field === 'admin') {
          display = val == 1 ? '<span class="badge badge-purple">Admin</span>' : '';
        } else if (col.Field.includes('vnd') || col.Field.includes('vang') || col.Field.includes('money') || col.Field.includes('amount')) {
          display = `<span class="text-mono text-warning">${fmt(val)}</span>`;
        } else if (col.Field.includes('time') || col.Field.includes('_at') || col.Field.includes('date')) {
          display = `<span class="text-muted" style="font-size:11px">${val ? escHtml(String(val).slice(0,19)) : '—'}</span>`;
        }
        return `<td title="${escHtml(String(val||''))}">${display}</td>`;
      }).join('');

      const pkVal = row[pkCol];
      return `<tr>
        ${cells}
        <td><div class="td-actions">
          <button class="btn btn-xs btn-outline" onclick="openEditModal('${escHtml(tableName)}', '${escHtml(String(pkVal))}')">✏️</button>
          <button class="btn btn-xs btn-danger" onclick="deleteRow('${escHtml(tableName)}', '${escHtml(String(pkVal))}', this)">🗑️</button>
        </div></td>
      </tr>`;
    }).join('');

    tableContainer.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead><tr>${colHeaders}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    renderPagination(tableName, data.page, data.pages);
  } catch (e) {
    tableContainer.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Lỗi tải dữ liệu</h3>
      <p>${escHtml(e.message)}</p>
    </div>`;
  }
}

function sortTable(tableName, col) {
  const ts = State.tableState[tableName];
  if (ts.sortedCol === col) {
    ts.dir = ts.dir === 'ASC' ? 'DESC' : 'ASC';
  } else {
    ts.sortedCol = col;
    ts.dir = 'ASC';
  }
  ts.page = 1;
  loadTableData(tableName);
}

function renderPagination(tableName, currentPage, totalPages) {
  const container = document.getElementById('paginationContainer');
  if (!container || totalPages <= 1) { if(container) container.innerHTML=''; return; }

  const ts = State.tableState[tableName];
  let html = '';

  html += `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="goToPage('${tableName}',${currentPage-1})">‹</button>`;

  let pages = [];
  if (totalPages <= 7) {
    pages = Array.from({length: totalPages}, (_,i) => i+1);
  } else {
    pages = [1,2];
    if (currentPage > 4) pages.push('...');
    for (let p = Math.max(3, currentPage-1); p <= Math.min(totalPages-2, currentPage+1); p++) pages.push(p);
    if (currentPage < totalPages-3) pages.push('...');
    pages.push(totalPages-1, totalPages);
  }

  pages.forEach(p => {
    if (p === '...') html += `<span class="page-btn" style="cursor:default">...</span>`;
    else html += `<button class="page-btn ${p===currentPage?'active':''}" onclick="goToPage('${tableName}',${p})">${p}</button>`;
  });

  html += `<button class="page-btn" ${currentPage===totalPages?'disabled':''} onclick="goToPage('${tableName}',${currentPage+1})">›</button>`;
  container.innerHTML = html;
}

function goToPage(tableName, page) {
  State.tableState[tableName].page = page;
  loadTableData(tableName);
}

function refreshTable() {
  if (State.currentTable) loadTableData(State.currentTable);
}

// ── Edit Row Modal ─────────────────────────────────
async function openEditModal(tableName, pkVal) {
  openModal('⌛ Đang tải...', '<div class="loading-spinner"><div class="spinner"></div></div>');
  try {
    const data = await api('row', { table: tableName, id: pkVal });
    const { row, columns } = data;
    const pkCol = columns.find(c => c.Key === 'PRI')?.Field || columns[0]?.Field;

    const fields = columns.map(col => {
      const val = row ? (row[col.Field] ?? '') : '';
      const isPk = col.Field === pkCol;
      const isLong = String(val).length > 60 || col.Type.includes('text');
      const input = isLong
        ? `<textarea class="${isPk ? 'pk-field' : ''}" name="${col.Field}" ${isPk ? 'readonly' : ''}>${escHtml(String(val))}</textarea>`
        : `<input class="${isPk ? 'pk-field' : ''}" type="text" name="${col.Field}" value="${escHtml(String(val))}" ${isPk ? 'readonly' : ''}>`;

      return `<div class="row-field">
        <label>${escHtml(col.Field)} <span class="field-type">${col.Type}</span>${isPk ? ' 🔑' : ''}</label>
        ${input}
      </div>`;
    }).join('');

    openModal(
      `✏️ Sửa bản ghi — <code>${escHtml(tableName)}</code> #${escHtml(String(pkVal))}`,
      `<div class="row-editor" id="editForm">${fields}</div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Huỷ</button>
       <button class="btn btn-primary" onclick="submitEdit('${escHtml(tableName)}', '${escHtml(String(pkVal))}', '${escHtml(pkCol)}')">💾 Lưu thay đổi</button>`
    );
  } catch (e) {
    openModal('❌ Lỗi', `<p>${escHtml(e.message)}</p>`, `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`);
  }
}

async function submitEdit(tableName, pkVal, pkCol) {
  const form = document.getElementById('editForm');
  const payload = { table: tableName, pk_value: pkVal };
  form.querySelectorAll('input, textarea').forEach(el => {
    if (el.name && el.name !== pkCol) payload[`data[${el.name}]`] = el.value;
  });

  try {
    await api('update', {}, 'POST', payload);
    toast('Đã lưu thành công!', 'success');
    closeModal();
    loadTableData(tableName);
  } catch (e) {
    toast('Lỗi: ' + e.message, 'error');
  }
}

// (flattenData no longer needed — payload built inline)

// ── Insert Row Modal ───────────────────────────────
async function openInsertModal(tableName) {
  openModal('⌛ Đang tải...', '<div class="loading-spinner"><div class="spinner"></div></div>');
  try {
    const data = await api('row', { table: tableName, id: '' });
    const { columns } = data;
    const pkCol = columns.find(c => c.Key === 'PRI')?.Field;

    const fields = columns.filter(c => c.Field !== pkCol || c.Extra !== 'auto_increment').map(col => {
      const isLong = col.Type.includes('text');
      const input = isLong
        ? `<textarea name="${col.Field}" placeholder="${escHtml(col.Default || '')}"></textarea>`
        : `<input type="text" name="${col.Field}" placeholder="${escHtml(col.Default !== null ? String(col.Default) : '')}">`;
      return `<div class="row-field">
        <label>${escHtml(col.Field)} <span class="field-type">${col.Type}</span></label>
        ${input}
      </div>`;
    }).join('');

    openModal(
      `➕ Thêm bản ghi — <code>${escHtml(tableName)}</code>`,
      `<div class="row-editor" id="insertForm">${fields}</div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Huỷ</button>
       <button class="btn btn-success" onclick="submitInsert('${escHtml(tableName)}')">➕ Thêm</button>`
    );
  } catch (e) {
    openModal('❌ Lỗi', `<p>${escHtml(e.message)}</p>`, `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`);
  }
}

async function submitInsert(tableName) {
  const form = document.getElementById('insertForm');
  const payload = { table: tableName };
  form.querySelectorAll('input, textarea').forEach(el => {
    if (el.name) payload[`data[${el.name}]`] = el.value;
  });

  try {
    const res = await api('insert', {}, 'POST', payload);
    toast(`Đã thêm thành công! ID: ${res.id}`, 'success');
    closeModal();
    loadTableData(tableName);
  } catch (e) {
    toast('Lỗi: ' + e.message, 'error');
  }
}

// ── Delete Row ─────────────────────────────────────
async function deleteRow(tableName, pkVal, btn) {
  if (!confirm(`Xác nhận XÓA bản ghi #${pkVal} trong bảng "${tableName}"?\nHành động này không thể hoàn tác!`)) return;
  try {
    btn.disabled = true;
    btn.textContent = '⌛';
    await api('delete', {}, 'POST', { table: tableName, pk_value: pkVal });
    toast('Đã xóa thành công', 'success');
    const row = btn.closest('tr');
    row.style.opacity = '0';
    row.style.transition = 'opacity 0.3s';
    setTimeout(() => { row.remove(); }, 300);
  } catch (e) {
    toast('Lỗi: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '🗑️';
  }
}

// ══════════════════════════════════════════════════
// TABLES LIST PAGE
// ══════════════════════════════════════════════════
async function renderTablesPage(container) {
  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">🗄️ Tất cả bảng dữ liệu</h1>
      <p class="page-subtitle">Database: <strong>team2026</strong></p>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="tableSearch" placeholder="Tìm bảng...">
        </div>
      </div>
      <div class="tables-grid" id="tablesGrid">
        <div class="loading-spinner"><div class="spinner"></div></div>
      </div>
    </div>
  </div>`;

  const tableIcons = {
    account: '👤', player: '🎮', clan: '🏰', giftcode: '🎁', shop: '🛒',
    item_template: '🗡️', mob_template: '👾', map_template: '🗺️', skill_template: '⚡',
    history_transaction: '💳', bank_transfers: '🏦', payments: '💰', napthe: '📱',
    notify: '🔔', phongchat: '💬', comments: '💬', posts: '📝',
    super_rank: '🏆', adminpanel: '⚙️', settings: '⚙️',
  };

  try {
    const tables = await api('tables');
    const grid = document.getElementById('tablesGrid');

    grid.innerHTML = tables.map(t => {
      const icon = tableIcons[t.name] || '📋';
      return `<div class="table-card" onclick="loadPage('table_${t.name}')">
        <div class="table-card-icon">${icon}</div>
        <div class="table-card-info">
          <div class="table-card-name">${escHtml(t.name)}</div>
          <div class="table-card-count">${fmt(t.count)} bản ghi</div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('tableSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      grid.querySelectorAll('.table-card').forEach(card => {
        const name = card.querySelector('.table-card-name').textContent.toLowerCase();
        card.style.display = name.includes(q) ? '' : 'none';
      });
    });
  } catch (e) {
    document.getElementById('tablesGrid').innerHTML = `<p class="text-muted">Lỗi: ${e.message}</p>`;
  }
}

// ══════════════════════════════════════════════════
// SQL CONSOLE PAGE
// ══════════════════════════════════════════════════
function renderSqlPage(container) {
  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">⌨️ SQL Console</h1>
      <p class="page-subtitle">Thực thi câu lệnh SQL trực tiếp — <strong style="color:var(--danger)">Cẩn thận với câu lệnh UPDATE/DELETE!</strong></p>
    </div>
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">📝 SQL Editor</h2>
        <div class="flex gap-8">
          <button class="btn btn-sm btn-outline" onclick="sqlClear()">🗑 Xóa</button>
          <button class="btn btn-sm btn-primary" onclick="runSql()">▶ Chạy <kbd style="font-size:10px;opacity:0.7">Ctrl+Enter</kbd></button>
        </div>
      </div>

      <div class="flex gap-8 mb-16 flex-wrap">
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT * FROM account LIMIT 20')">account</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT * FROM player LIMIT 20')">player</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT * FROM clan LIMIT 20')">clan</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT * FROM giftcode LIMIT 20')">giftcode</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT a.username, p.name, a.vnd, a.vang, a.ban FROM account a LEFT JOIN player p ON p.account_id = a.id ORDER BY a.vnd DESC LIMIT 20')">Top VND</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SHOW TABLES')">SHOW TABLES</button>
        <button class="btn btn-xs btn-outline" onclick="sqlPreset('SELECT COUNT(*) as count, server_login FROM account GROUP BY server_login')">Online</button>
      </div>

      <textarea class="sql-editor" id="sqlEditor" placeholder="-- Nhập câu lệnh SQL ở đây...\n-- VD: SELECT * FROM account WHERE ban = 1 LIMIT 10\n\nSELECT * FROM account LIMIT 10"></textarea>

      <div id="sqlResult"></div>
    </div>
  </div>`;

  document.getElementById('sqlEditor').addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') runSql();
  });
}

function sqlPreset(sql) {
  document.getElementById('sqlEditor').value = sql;
}

function sqlClear() {
  document.getElementById('sqlEditor').value = '';
  document.getElementById('sqlResult').innerHTML = '';
}

async function runSql() {
  const sql = document.getElementById('sqlEditor').value.trim();
  if (!sql) return;

  const resultEl = document.getElementById('sqlResult');
  resultEl.innerHTML = '<div class="loading-spinner" style="min-height:80px"><div class="spinner"></div></div>';

  try {
    const start = performance.now();
    const res = await api('sql', {}, 'POST', { sql });
    const ms = (performance.now() - start).toFixed(1);

    if (res.type === 'select') {
      const colHtml = res.columns.map(c => `<th>${escHtml(c)}</th>`).join('');
      const rowHtml = res.rows.map(r => `<tr>${res.columns.map(c => `<td>${escHtml(truncate(String(r[c]??''),60))}</td>`).join('')}</tr>`).join('');
      resultEl.innerHTML = `
        <div class="sql-result">
          <div class="sql-result-header">
            <span>✅ ${fmt(res.count)} bản ghi trả về</span>
            <span class="text-muted">${ms}ms</span>
          </div>
          <div class="table-wrapper" style="max-height:500px">
            <table><thead><tr>${colHtml}</tr></thead><tbody>${rowHtml||'<tr><td colspan="99" class="text-muted" style="text-align:center;padding:20px">Không có kết quả</td></tr>'}</tbody></table>
          </div>
        </div>`;
    } else {
      resultEl.innerHTML = `
        <div class="sql-result">
          <div class="sql-result-header" style="background:rgba(16,185,129,0.1);color:#34d399">
            <span>✅ Thực thi thành công — ${res.affected} hàng bị ảnh hưởng</span>
            <span>${ms}ms</span>
          </div>
        </div>`;
      toast(`Thực thi thành công! ${res.affected} hàng bị ảnh hưởng`, 'success');
    }
  } catch (e) {
    resultEl.innerHTML = `
      <div class="sql-result">
        <div class="sql-result-header" style="background:rgba(239,68,68,0.1);color:#f87171">
          ❌ Lỗi SQL
        </div>
        <div style="padding:14px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#fca5a5">${escHtml(e.message)}</div>
      </div>`;
    toast('Lỗi SQL: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// MAINTENANCE PAGE
// ══════════════════════════════════════════════════
function renderMaintenancePage(container) {
  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">🔧 Bảo trì Server</h1>
      <p class="page-subtitle">Quản lý trạng thái và hoạt động của server</p>
    </div>
    <div class="maintenance-grid">
      <div class="action-card" style="--card-color:#10b981">
        <span class="action-icon">🟢</span>
        <h3>Mở server</h3>
        <p>Đặt trạng thái server thành "hoạt động". Người chơi có thể đăng nhập bình thường.</p>
        <button class="btn btn-success w-full" onclick="setMaintenance('hoatdong')">✅ Mở server</button>
      </div>
      <div class="action-card" style="--card-color:#f59e0b">
        <span class="action-icon">🟡</span>
        <h3>Bảo trì</h3>
        <p>Đặt trạng thái server thành "bảo trì". Người chơi sẽ thấy thông báo bảo trì khi đăng nhập.</p>
        <button class="btn btn-warning w-full" onclick="setMaintenance('baotri')">🔧 Bật bảo trì</button>
      </div>
      <div class="action-card" style="--card-color:#ef4444">
        <span class="action-icon">🔴</span>
        <h3>Đóng server</h3>
        <p>Đặt trạng thái server thành "đóng cửa". Không ai có thể đăng nhập (trừ admin).</p>
        <button class="btn btn-danger w-full" onclick="setMaintenance('dongcua')">⛔ Đóng server</button>
      </div>

      <div class="action-card" style="--card-color:#6366f1">
        <span class="action-icon">🎁</span>
        <h3>Tặng vàng toàn server</h3>
        <p>Thêm một lượng vàng nhất định cho tất cả tài khoản trên server.</p>
        <div class="flex gap-8 mt-8">
          <input type="number" id="giveAllVang" placeholder="Số vàng..." class="btn btn-outline" style="flex:1">
        </div>
        <button class="btn btn-primary w-full mt-8" onclick="giveAllVang()">💰 Tặng vàng</button>
      </div>

      <div class="action-card" style="--card-color:#8b5cf6">
        <span class="action-icon">💎</span>
        <h3>Tặng VND toàn server</h3>
        <p>Thêm một lượng VND nhất định cho tất cả tài khoản trên server.</p>
        <div class="flex gap-8 mt-8">
          <input type="number" id="giveAllVnd" placeholder="Số VND..." class="btn btn-outline" style="flex:1">
        </div>
        <button class="btn btn-primary w-full mt-8" style="background:linear-gradient(135deg,#7c3aed,#8b5cf6)" onclick="giveAllVnd()">💎 Tặng VND</button>
      </div>

      <div class="action-card" style="--card-color:#22d3ee">
        <span class="action-icon">🔔</span>
        <h3>Thông báo toàn server</h3>
        <p>Ghi thông báo vào bảng notify để hiển thị cho người chơi khi đăng nhập.</p>
        <textarea id="notifyMsg" placeholder="Nội dung thông báo..." class="field-group" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;color:#fff;font-family:inherit;resize:vertical;min-height:60px;outline:none"></textarea>
        <button class="btn btn-primary w-full mt-8" style="background:linear-gradient(135deg,#0891b2,#22d3ee);color:#000" onclick="sendNotify()">📢 Gửi thông báo</button>
      </div>
    </div>

    <!-- Quick player actions -->
    <div class="card mt-24">
      <div class="card-header">
        <h2 class="card-title">🎯 Thao tác nhanh tài khoản</h2>
      </div>
      <div class="form-row">
        <div class="field-group">
          <label>Tên tài khoản</label>
          <input type="text" id="quickUsername" placeholder="username...">
        </div>
        <div class="field-group">
          <label>Số vàng</label>
          <input type="number" id="quickVang" placeholder="0">
        </div>
        <div class="field-group">
          <label>Số VND</label>
          <input type="number" id="quickVnd" placeholder="0">
        </div>
        <div class="field-group" style="justify-content:flex-end">
          <label>&nbsp;</label>
          <div class="flex gap-8">
            <button class="btn btn-success" onclick="quickGive()">💰 Tặng</button>
            <button class="btn btn-danger" onclick="quickBan(1)">🔨 Ban</button>
            <button class="btn btn-outline" onclick="quickBan(0)">✅ Unban</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

async function setMaintenance(status) {
  const labels = { hoatdong: 'Mở server', baotri: 'Bảo trì', dongcua: 'Đóng server' };
  if (!confirm(`Xác nhận đặt trạng thái server: "${labels[status]}"?`)) return;
  try {
    await api('maintenance', {}, 'POST', { status });
    toast(`Đã đặt trạng thái: ${labels[status]}`, 'success');
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

async function giveAllVang() {
  const amt = parseInt(document.getElementById('giveAllVang').value);
  if (!amt || amt <= 0) { toast('Nhập số vàng hợp lệ!', 'warning'); return; }
  if (!confirm(`Tặng ${fmt(amt)} vàng cho TẤT CẢ tài khoản?`)) return;
  try {
    await api('sql', {}, 'POST', { sql: `UPDATE account SET vang = vang + ${amt}` });
    toast(`Đã tặng ${fmt(amt)} vàng cho tất cả!`, 'success');
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

async function giveAllVnd() {
  const amt = parseInt(document.getElementById('giveAllVnd').value);
  if (!amt || amt <= 0) { toast('Nhập số VND hợp lệ!', 'warning'); return; }
  if (!confirm(`Tặng ${fmt(amt)} VND cho TẤT CẢ tài khoản?`)) return;
  try {
    await api('sql', {}, 'POST', { sql: `UPDATE account SET vnd = vnd + ${amt}` });
    toast(`Đã tặng ${fmt(amt)} VND cho tất cả!`, 'success');
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

async function sendNotify() {
  const msg = document.getElementById('notifyMsg').value.trim();
  if (!msg) { toast('Nhập nội dung thông báo!', 'warning'); return; }
  try {
    const escaped = msg.replace(/'/g, "''");
    await api('sql', {}, 'POST', { sql: `INSERT INTO notify (content, type, time) VALUES ('${escaped}', 1, UNIX_TIMESTAMP())` });
    toast('Đã gửi thông báo!', 'success');
    document.getElementById('notifyMsg').value = '';
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

async function quickGive() {
  const username = document.getElementById('quickUsername').value.trim();
  const vang = parseInt(document.getElementById('quickVang').value) || 0;
  const vnd = parseInt(document.getElementById('quickVnd').value) || 0;
  if (!username) { toast('Nhập tên tài khoản!', 'warning'); return; }
  if (!vang && !vnd) { toast('Nhập số vàng hoặc VND!', 'warning'); return; }

  try {
    let parts = [];
    if (vang) parts.push(`vang = vang + ${vang}`);
    if (vnd) parts.push(`vnd = vnd + ${vnd}`);
    const sql = `UPDATE account SET ${parts.join(', ')} WHERE username = '${username.replace(/'/g,"''")}'`;
    const res = await api('sql', {}, 'POST', { sql });
    if (res.affected === 0) { toast(`Không tìm thấy tài khoản: ${username}`, 'warning'); return; }
    toast(`Đã tặng cho ${username}: ${vang?fmt(vang)+' vàng ':''} ${vnd?fmt(vnd)+' VND':''}`, 'success');
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

async function quickBan(ban) {
  const username = document.getElementById('quickUsername').value.trim();
  if (!username) { toast('Nhập tên tài khoản!', 'warning'); return; }
  const action = ban ? 'BAN' : 'UNBAN';
  if (!confirm(`Xác nhận ${action} tài khoản: ${username}?`)) return;
  try {
    const res = await api('sql', {}, 'POST', { sql: `UPDATE account SET ban = ${ban} WHERE username = '${username.replace(/'/g,"''")}'` });
    if (res.affected === 0) { toast(`Không tìm thấy tài khoản: ${username}`, 'warning'); return; }
    toast(`Đã ${action} tài khoản: ${username}`, ban ? 'warning' : 'success');
  } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════
// SETTINGS PAGE
// ══════════════════════════════════════════════════
function renderSettingsPage(container) {
  container.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">⚙️ Cài đặt hệ thống</h1>
      <p class="page-subtitle">Cấu hình Admin Panel</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
      <div class="card">
        <div class="config-section">
          <h3>🌐 Thông tin server</h3>
          <div class="config-row">
            <div class="config-label"><h4>Tên server</h4><p>Hiển thị trong dashboard</p></div>
            <span class="badge badge-info">Ngọc Rồng Online</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>Database</h4></div>
            <span class="badge badge-success text-mono">team2026@localhost</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>Server IP</h4></div>
            <span class="text-mono text-muted">36.50.135.16:14445</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>Phiên bản</h4></div>
            <span class="badge badge-purple">2026.09</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="config-section">
          <h3>🔑 Bảo mật</h3>
          <div class="config-row">
            <div class="config-label"><h4>CSRF Protection</h4><p>Bảo vệ chống tấn công CSRF</p></div>
            <span class="badge badge-success">✅ Bật</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>SQL Injection Filter</h4><p>Chặn DROP, TRUNCATE, ALTER</p></div>
            <span class="badge badge-success">✅ Bật</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>Session Auth</h4></div>
            <span class="badge badge-success">✅ Bật</span>
          </div>
          <div class="config-row">
            <div class="config-label"><h4>Đổi mật khẩu admin</h4></div>
            <button class="btn btn-sm btn-outline" onclick="openChangePassword()">🔒 Đổi mật khẩu</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-24" style="max-width:900px">
      <div class="config-section">
        <h3>📊 Thống kê Database</h3>
        <div id="dbStats"><div class="spinner"></div></div>
      </div>
    </div>
  </div>`;

  // Load DB stats
  api('tables').then(tables => {
    const el = document.getElementById('dbStats');
    const totalRows = tables.reduce((s, t) => s + parseInt(t.count||0), 0);
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px">
        <div class="stat-card" style="--stat-color:#6366f1">
          <span class="stat-icon">🗄️</span>
          <div class="stat-label">Tổng bảng</div>
          <div class="stat-value" style="color:var(--primary)">${tables.length}</div>
        </div>
        <div class="stat-card" style="--stat-color:#10b981">
          <span class="stat-icon">📋</span>
          <div class="stat-label">Tổng bản ghi</div>
          <div class="stat-value" style="color:var(--success)">${fmt(totalRows)}</div>
        </div>
        <div class="stat-card" style="--stat-color:#f59e0b">
          <span class="stat-icon">⚡</span>
          <div class="stat-label">Engine</div>
          <div class="stat-value" style="color:var(--warning);font-size:18px">MariaDB</div>
        </div>
      </div>`;
  }).catch(() => {
    document.getElementById('dbStats').innerHTML = '<p class="text-muted">Không thể tải thống kê DB</p>';
  });
}

function openChangePassword() {
  openModal('🔒 Đổi mật khẩu Admin',
    `<div class="row-editor">
      <div class="row-field"><label>Mật khẩu mới</label><input type="password" id="newPass" placeholder="Nhập mật khẩu mới..."></div>
      <div class="row-field"><label>Xác nhận mật khẩu</label><input type="password" id="confirmPass" placeholder="Nhập lại mật khẩu..."></div>
      <p class="text-muted" style="font-size:12px">⚠️ Để thay đổi mật khẩu, hãy chỉnh sửa ADMIN_PASSWORD trong file config.php</p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`
  );
}

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  startClock();
  checkServerStatus();
  setInterval(checkServerStatus, 30000);

  // Handle nav clicks (SPA-style)
  document.querySelectorAll('.nav-item[href]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = new URL(link.href);
      const page = url.searchParams.get('page') || 'dashboard';
      history.pushState({ page }, '', link.href);
      loadPage(page);
      // Close mobile sidebar
      document.getElementById('sidebar')?.classList.remove('mobile-open');
    });
  });

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    const page = e.state?.page || qs().get('page') || 'dashboard';
    loadPage(page);
  });

  // Load initial page
  const initialPage = qs().get('page') || 'dashboard';
  loadPage(initialPage);
});
