/* NRO Admin Desktop renderer */
(() => {
  const api = window.nroAPI;
  const state = { config: null, page: 'dashboard', table: null, pageNo: 1, search: '', serverStatusTimer: null, runtimePlayers: [], websiteForumTab: 'posts', websiteForumPage: 1, websiteForumSearch: '' };
  const labels = {
    dashboard: 'Dashboard', accounts: 'Tài khoản', players: 'Nhân vật', clans: 'Bang hội',
    giftcodes: 'Giftcode', shop_ky_gui: 'Shop Ký Gửi', transactions: 'Giao dịch',
    tables: 'Tất cả bảng', sql: 'SQL Console', maintenance: 'Bảo trì', settings: 'Cài đặt',
    radar: 'Quản lý Radar', bosses: 'Boss Runtime', events: 'Quản lý sự kiện', shop: 'Quản lý Shop', wardrobe: 'Cải trang / Avatar', parts: 'Quản lý Part', maps: 'Quản lý Map', website: 'Quản lý Website', 'website-mechanics': 'Nội dung Cơ chế game', 'website-items': 'Nội dung Kiếm vật phẩm', 'website-forum': 'Quản lý Diễn đàn', 'player-runtime': 'Player Runtime'
  };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
  const raceLabel = (value) => ({ 0: 'Trái Đất', 1: 'Namek', 2: 'Saiyan' })[Number(value)] || 'Khác';

  function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.textContent = message;
    $('toastContainer').appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function showError(error) {
    toast(error?.message || String(error), 'error');
  }

  function toastRuntimeSave(result, label) {
    if (result.runtimeApplied === false) {
      toast(`${label} đã lưu DB; runtime chưa cập nhật (${result.runtimeCode || 'SERVER_OFFLINE'}).`, 'error');
      return;
    }
    toast(result.runtimeApplied ? `${label} đã lưu và áp dụng runtime.` : `${label} đã lưu.`);
  }

  function setLoading(message = 'Đang tải...') {
    $('pageContent').innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>${esc(message)}</p></div>`;
  }

  function openModal(title, body, footer = '') {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = body;
    $('modalFooter').innerHTML = footer;
    $('modal').classList.toggle('modal-wide', /Map|Shop|Radar|Part|Tạo hình|Cải trang|Item Selector|Vật phẩm shop|Thêm vật phẩm/.test(title));
    $('modalOverlay').classList.add('open');
  }

  function closeModal() { $('modalOverlay').classList.remove('open'); }

  function field(label, name, value, type = 'text') {
    if (name === 'gender') {
      const raw = Number(value);
      const known = raw === 0 || raw === 1 || raw === 2;
      return `<div class="field-group"><label>Tộc / Hành tinh</label><select name="gender" data-pet-field>${known ? '' : `<option value="${esc(raw)}" selected>Khác</option>`}<option value="0" ${raw === 0 ? 'selected' : ''}>Trái Đất</option><option value="2" ${raw === 2 ? 'selected' : ''}>Saiyan</option><option value="1" ${raw === 1 ? 'selected' : ''}>Namek</option><option value="3">Khác</option></select></div>`;
    }
    return `<div class="field-group"><label>${esc(label)}</label><input name="${esc(name)}" type="${type}" value="${esc(value)}"></div>`;
  }

  const playerInfoFields = [
    ['id', 'ID', 'number'], ['account_id', 'Account ID', 'number'], ['name', 'Tên nhân vật'],
    ['gender', 'Tộc / Hành tinh', 'number'], ['head', 'Đầu', 'number'], ['clan_id', 'Clan ID', 'number'],
    ['have_tennis_space_ship', 'Tàu không gian', 'number'],
    ['gold', '💰 Vàng', 'number'], ['gem', '💎 Ngọc xanh', 'number'], ['ruby', '🔴 Hồng ngọc', 'number']
  ];

  function parseInventory(raw) {
    try {
      const arr = JSON.parse(raw || '[]');
      return { gold: Number(arr[0]) || 0, gem: Number(arr[1]) || 0, ruby: Number(arr[2]) || 0, coupon: Number(arr[3]) || 0, event: Number(arr[4]) || 0 };
    } catch (_) { return { gold: 0, gem: 0, ruby: 0, coupon: 0, event: 0 }; }
  }

  function serializeInventory(draft) {
    return JSON.stringify([draft.gold ?? 0, draft.gem ?? 0, draft.ruby ?? 0, draft.coupon ?? 0, draft.event ?? 0]);
  }

  function playerEditorData(draft) {
    return {
      name: draft.name, account_id: draft.account_id, gender: Number(draft.gender), head: draft.head,
      clan_id: draft.clan_id, have_tennis_space_ship: draft.have_tennis_space_ship,
      items_body: serializeContainer(draft.body), items_bag: serializeContainer(draft.bag),
      items_box: serializeContainer(draft.box), pet: serializePet(draft.pet),
      data_task: draft.data_task ?? draft.originalRow?.data_task,
      data_inventory: serializeInventory(draft)
    };
  }

  function playerHasDatabaseOnlyChanges(data, original) {
    const dbOnlyFields = ['name', 'account_id', 'gender', 'head', 'clan_id', 'have_tennis_space_ship', 'items_body', 'items_bag', 'items_box', 'pet', 'data_task'];
    if (dbOnlyFields.some((key) => String(data[key] ?? '') !== String(original[key] ?? ''))) return true;
    const before = parseInventory(original.data_inventory);
    const after = parseInventory(data.data_inventory);
    return ['gem', 'ruby', 'coupon', 'event'].some((key) => before[key] !== after[key]);
  }

  async function savePlayerDraft(draft) {
    const original = draft.originalRow || draft;
    const data = playerEditorData(draft);
    const gold = Number(draft.gold);
    if (!Number.isSafeInteger(gold) || gold < 0 || gold > 200000000000) {
      throw new Error('Vàng phải là số nguyên từ 0 đến 200.000.000.000.');
    }
    const goldChanged = gold !== parseInventory(original.data_inventory).gold;
    const databaseOnlyChanges = playerHasDatabaseOnlyChanges(data, original);

    await api.updateRow({ table: 'player', pkValue: original.id, data });

    let runtimeStatus = { success: true };
    if (goldChanged || databaseOnlyChanges) {
      try {
        runtimeStatus = await api.serverCommand({ action: 'player.get', data: { playerId: Number(original.id) } });
      } catch (error) {
        runtimeStatus = { success: false, code: error?.code || 'CONNECTION_ERROR' };
      }
    }
    let runtimeSave = runtimeStatus;
    const isRuntimeOnline = runtimeStatus.success && runtimeStatus.player?.status !== 'offline';
    if (isRuntimeOnline && goldChanged) {
      try {
        runtimeSave = await api.serverCommand({
          action: 'player.applyGold',
          data: { playerId: Number(original.id), gold: String(gold) }
        });
      } catch (error) {
        runtimeSave = { success: false, code: error?.code || 'CONNECTION_ERROR' };
      }
    }

    closeModal();
    renderTable('player');

    if (!runtimeStatus.success || !runtimeSave.success) {
      toast(`Đã lưu nhân vật vào DB; runtime chưa cập nhật (${runtimeSave.code || runtimeStatus.code || 'CONNECTION_ERROR'}).`, 'error');
    } else if (runtimeStatus.player?.status === 'offline' && (goldChanged || databaseOnlyChanges)) {
      toast('Đã lưu nhân vật vào DB; nhân vật offline nên dữ liệu mới sẽ được nạp lần đăng nhập sau.');
    } else if (databaseOnlyChanges) {
      toast(`Đã lưu nhân vật${goldChanged ? '; vàng đã áp dụng runtime' : ''}. Các trường khác chỉ lưu DB; phiên online có thể ghi đè.`, 'error');
    } else if (databaseOnlyChanges) {
      toast(`Đã lưu nhân vật${goldChanged ? '; vàng đã áp dụng runtime' : ''}. Các trường khác chỉ lưu DB.`);
    } else if (goldChanged) {
      toastRuntimeSave({ runtimeApplied: true }, 'Nhân vật');
    } else {
      toast('Đã lưu nhân vật');
    }
  }

  const bodySlots = ['Áo', 'Quần', 'Găng', 'Giày', 'Nhẫn', 'Phụ kiện', 'Cải trang', 'Pet', 'Đệ tử', 'Thú cưỡi', 'Ô 11', 'Ô 12'];

  function parseContainer(value) {
    try {
      const source = JSON.parse(value || '[]');
      return source.map((raw) => {
        const slot = Array.isArray(raw) ? raw : JSON.parse(raw);
        let options = [];
        try {
          const encoded = typeof slot[2] === 'string' ? JSON.parse(slot[2]) : (slot[2] || []);
          options = encoded.map((option) => {
            const pair = Array.isArray(option) ? option : JSON.parse(option);
            return { id: Number(pair[0]), param: Number(pair[1]) };
          });
        } catch (_) { options = []; }
        return { id: Number(slot[0]), quantity: Number(slot[1]) || 0, options, createTime: Number(slot[3]) || Date.now() };
      });
    } catch (_) { return []; }
  }

  function serializeContainer(items) {
    return JSON.stringify(items.map((item) => {
      const options = item.options.map((option) => JSON.stringify([Number(option.id), Number(option.param) || 0]));
      return JSON.stringify([Number(item.id), Number(item.quantity) || 0, JSON.stringify(options), Number(item.createTime) || Date.now()]);
    }));
  }

  function parseGiftDetail(value) {
    try {
      const source = JSON.parse(value || '[]');
      return source.map((item) => ({
        id: Number(item.id), quantity: Number(item.quantity) || 0,
        options: (item.options || []).map((option) => ({ id: Number(option.id), param: Number(option.param) || 0 }))
      }));
    } catch (_) { return []; }
  }

  function parsePet(value) {
    try {
      const source = JSON.parse(value || '[]');
      if (!source.length) return null;
      const info = JSON.parse(source[0]);
      const point = JSON.parse(source[1]);
      const skills = JSON.parse(source[3] || '[]').map((raw) => {
        const skill = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { id: Number(skill[0]), point: Number(skill[1]) || 0, lastUse: Number(skill[2]) || 0, level: Number(skill[3]) || 0 };
      });
      return {
        type: Number(info[0]), gender: Number(info[1]), name: String(info[2] || ''), fusion: Number(info[3]) || 0,
        fusionTime: Number(info[4]) || 0, status: Number(info[5]) || 0,
        limitPower: Number(point[0]) || 0, power: Number(point[1]) || 0, tiemNang: Number(point[2]) || 0,
        stamina: Number(point[3]) || 0, maxStamina: Number(point[4]) || 0, hpg: Number(point[5]) || 0,
        mpg: Number(point[6]) || 0, dameg: Number(point[7]) || 0, defg: Number(point[8]) || 0,
        critg: Number(point[9]) || 0, hp: Number(point[10]) || 0, mp: Number(point[11]) || 0,
        body: parseContainer(source[2]), skills
      };
    } catch (_) { return null; }
  }

  function serializePet(pet) {
    if (!pet) return '[]';
    const info = JSON.stringify([pet.type, pet.gender, pet.name, pet.fusion, pet.fusionTime, pet.status]);
    const point = JSON.stringify([pet.limitPower, pet.power, pet.tiemNang, pet.stamina, pet.maxStamina, pet.hpg, pet.mpg, pet.dameg, pet.defg, pet.critg, pet.hp, pet.mp]);
    const skills = JSON.stringify(pet.skills.map((skill) => JSON.stringify([skill.id, skill.point, skill.lastUse, skill.level])));
    return JSON.stringify([info, point, serializeContainer(pet.body), skills]);
  }

  function serializeGiftDetail(items) {
    return JSON.stringify(items.map((item) => ({
      id: Number(item.id), quantity: Number(item.quantity) || 0,
      options: item.options.map((option) => ({ id: Number(option.id), param: Number(option.param) || 0 }))
    })));
  }

  function itemTitle(item, catalog) {
    const found = catalog.find((entry) => Number(entry.id) === Number(item.id));
    return found ? found.name : (item.id < 0 ? 'Ô trống' : `Item #${item.id}`);
  }

  function itemMeta(item, catalog) {
    return catalog.find((entry) => Number(entry.id) === Number(item.id)) || null;
  }

  function itemIcon(item, catalog, className = 'item-icon') {
    const meta = itemMeta(item, catalog);
    const iconId = meta?.iconId;
    return `<span class="${className}">${iconId ? `<img src="../../data/icon/x4/${iconId}.png" alt="" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">` : ''}<span class="item-icon-fallback">${esc(item.id)}</span></span>`;
  }

  async function connect() {
    const cfg = {
      host: $('cfgHost').value.trim(), port: $('cfgPort').value, database: $('cfgDatabase').value.trim(),
      user: $('cfgUser').value.trim(), password: $('cfgPassword').value,
      serverName: 'Ngọc Rồng Online', serverIp: '', serverPort: ''
    };
    $('connectBtnText').textContent = 'Đang kết nối...';
    $('connectError').style.display = 'none';
    try {
      const result = await api.connect(cfg);
      if (!result.success) throw new Error(result.error);
      await api.saveConfig(cfg);
      state.config = cfg;
      $('connectScreen').style.display = 'none';
      $('appLayout').style.display = 'flex';
      $('dbName').textContent = `${cfg.database}@${cfg.host}`;
      $('titlebarSub').textContent = cfg.database;
      await navigate('dashboard');
    } catch (error) {
      $('connectError').textContent = error.message || 'Không thể kết nối database';
      $('connectError').style.display = 'block';
    } finally { $('connectBtnText').textContent = '🔌 Kết nối'; }
  }

  async function navigate(page) {
    state.page = page;
    state.pageNo = 1;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
    $('bcPage').textContent = labels[page] || page;
    if (page === 'dashboard') return renderDashboard();
    if (page === 'transactions') return renderTransactions();
    if (page === 'sql') return renderSql();
    if (page === 'settings') return renderSettings();
    if (page === 'tables') return renderTables();
    if (page === 'radar') return renderRadar();
    if (page === 'bosses') return renderBossRuntime();
    if (page === 'events') return renderEvents();
    if (page === 'player-runtime') return renderPlayerRuntime();
    if (page === 'shop') return renderShop();
    if (page === 'wardrobe') return renderWardrobe();
    if (page === 'fusion') return renderFusionForms();
    if (page === 'parts') return renderParts();
    if (page === 'maps') return renderMap();
    if (page === 'website') return renderWebsite();
    if (page === 'website-mechanics' || page === 'website-items') return renderWebsiteGuide(page);
    if (page === 'website-forum') return renderWebsiteForumPage();
    state.table = page === 'shop_ky_gui' ? 'shop_ky_gui' : page === 'giftcodes' ? 'giftcode' : page === 'accounts' ? 'account' : page === 'players' ? 'player' : page === 'clans' ? 'clan' : page;
    return renderTable(state.table);
  }

  async function renderDashboard() {
    setLoading();
    try {
      const [stats, top] = await Promise.all([api.stats(), api.topPlayers()]);
      const runtime = await api.serverStatus();
      const metrics = runtime.success ? runtime.metrics || {} : {};
      const metricPercent = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : 'N/A';
      const metricBytes = (value) => Number.isFinite(Number(value)) ? `${(Number(value) / (1024 ** 3)).toFixed(2)} GB` : 'N/A';
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Trung tâm điều hành</h1><p>Tổng quan dữ liệu và hoạt động server.</p></div><button class="btn btn-primary" id="dashboardRefresh">↺ Cập nhật</button></div>
        <div class="stat-grid">${[['online', 'Đang online', '🟢'], ['account', 'Tài khoản', '👥'], ['player', 'Nhân vật', '🎮'], ['total_vnd', 'Tổng nạp', '💰'], ['total_vang', 'Tổng vàng', '✨'], ['giftcode', 'Giftcode', '🎁']].map(([key, title, icon]) => `<div class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-label">${title}</span><strong>${formatNumber(stats[key])}</strong></div>`).join('')}</div>
        <section class="content-section"><div class="section-heading"><h2>Tình trạng runtime</h2><span>${runtime.success ? `${esc(runtime.serverName)} · online ${formatUptime(runtime.uptimeMs)}` : esc(runtime.code || 'SERVER_OFFLINE')}</span></div>${runtime.success ? `<div class="runtime-metrics"><div><span>CPU process</span><strong>${metricPercent(metrics.cpuPercent)}</strong></div><div><span>RAM hệ thống</span><strong>${metricPercent(metrics.ramPercent)}</strong><small>${metricBytes(metrics.ramUsedBytes)} / ${metricBytes(metrics.ramTotalBytes)}</small></div><div><span>JVM Heap</span><strong>${metricPercent(metrics.heapPercent)}</strong><small>${metricBytes(metrics.heapUsedBytes)} / ${metricBytes(metrics.heapMaxBytes)}</small></div><div><span>GPU</span><strong>${metrics.gpuAvailable ? metricPercent(metrics.gpuPercent) : 'Không khả dụng'}</strong></div><div><span>Tiềm năng toàn server</span><strong>x${runtime.expRate}</strong></div><div><span>Người chơi runtime</span><strong>${formatNumber(runtime.playerCount)}</strong></div></div>` : `<div class="runtime-warning"><span>!</span><div><strong>${esc(runtime.code || 'SERVER_OFFLINE')}</strong><p>${esc(runtime.message || 'Không kết nối được Java Admin Bridge.')}</p></div></div>`}</section>
        <section class="content-section runtime-controls"><div class="section-heading"><h2>Điều khiển server</h2><span>Thay đổi có hiệu lực trực tiếp trong Java runtime</span></div><div class="dashboard-controls"><form id="dashboardMaintenanceForm" class="runtime-form"><div class="field-group"><label>Đếm ngược bảo trì (giây)</label><input name="seconds" type="number" min="5" max="600" value="30" required></div><button class="btn btn-warning" type="submit">⏸ Bắt đầu bảo trì</button></form><form id="expRateForm" class="runtime-form"><div class="field-group"><label>Hệ số tiềm năng server (x1–x100)</label><input name="rate" type="number" min="1" max="100" value="${runtime.success ? runtime.expRate : 1}" required></div><button class="btn btn-primary" type="submit">Lưu hệ số</button></form></div><div id="dashboardRuntimeMessage" class="maintenance-status" style="display:none"></div></section>
        <section class="content-section"><div class="section-heading"><h2>Top tài khoản theo nạp</h2><button class="btn btn-sm btn-outline" data-page-jump="players">Xem nhân vật</button></div>${renderRows(top, ['name', 'username', 'vnd', 'vang', 'ban'])}</section>`;
      $('dashboardRefresh').onclick = () => renderDashboard();
      $('dashboardMaintenanceForm').onsubmit = async (event) => {
        event.preventDefault();
        const seconds = Number(new FormData(event.currentTarget).get('seconds'));
        if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600) return showError('Thời gian bảo trì phải từ 5 đến 600 giây.');
        const result = await api.serverCommand({ action: 'server.maintenance', data: { seconds } });
        showDashboardRuntimeResult(result);
      };
      $('expRateForm').onsubmit = async (event) => {
        event.preventDefault();
        const rate = Number(new FormData(event.currentTarget).get('rate'));
        if (!Number.isInteger(rate) || rate < 1 || rate > 100) return showError('Hệ số phải từ x1 đến x100.');
        const result = await api.serverCommand({ action: 'server.setExpRate', data: { rate } });
        showDashboardRuntimeResult(result);
      };
      document.querySelector('[data-page-jump]')?.addEventListener('click', (event) => navigate(event.currentTarget.dataset.pageJump));
    } catch (error) { showError(error); }
  }

  function showDashboardRuntimeResult(result) {
    const message = $('dashboardRuntimeMessage');
    if (!result.success) {
      message.style.display = 'block';
      message.className = 'maintenance-status maintenance-error';
      message.textContent = `${result.code || 'INTERNAL_ERROR'}: ${result.message || 'Không thực hiện được lệnh'}`;
      return;
    }
    message.style.display = 'block';
    message.className = 'maintenance-status maintenance-countdown';
    message.textContent = result.message;
    toast(result.message);
  }

  function renderRows(rows, columns) {
    if (!rows?.length) return '<div class="empty-state">Chưa có dữ liệu.</div>';
    return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${esc(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  async function renderTables() {
    setLoading();
    try {
      const tables = await api.tables();
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Tất cả bảng</h1><p>${tables.length} bảng trong database.</p></div></div><div class="table-catalog">${tables.map((table) => `<button class="catalog-item" data-table="${esc(table.name)}"><span>🗄️</span><strong>${esc(table.name)}</strong><small>${formatNumber(table.count)} dòng</small></button>`).join('')}</div>`;
      document.querySelectorAll('.catalog-item').forEach((item) => item.onclick = () => { state.table = item.dataset.table; renderTable(state.table); });
    } catch (error) { showError(error); }
  }

  async function renderRadar() {
    state.table = 'radar';
    return renderTable('radar');
  }

  async function renderBossRuntime() {
    setLoading('Đang đọc Boss Runtime...');
    const response = await api.serverCommand({ action: 'boss.list', data: {} });
    if (!response.success) return renderRuntimeError(response, 'Boss Runtime');
    const bosses = response.bosses || [];
    const catalog = response.spawnCatalog || [];
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Boss Runtime</h1><p>${formatNumber(bosses.length)} boss trong Java runtime.</p></div><button class="btn btn-outline" id="bossRefresh">↺ Làm mới</button></div>
      <section class="content-section runtime-controls"><h2>Gọi Boss</h2><form id="bossSpawnForm" class="runtime-form"><div class="field-group"><label>Boss</label><select name="bossId">${catalog.map((boss) => `<option value="${boss.id}">${esc(boss.name)}</option>`).join('')}</select></div>${field('Map ID (không bắt buộc)', 'mapId', '', 'number')}${field('Khu (không bắt buộc)', 'zoneId', '', 'number')}<button class="btn btn-primary" id="bossSpawn">Gọi Boss</button></form></section>
      <section class="content-section"><div class="section-heading"><h2>Boss đang quản lý</h2><span>${formatNumber(bosses.length)} boss</span></div>${bosses.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Tên</th><th>Trạng thái</th><th>Map / Khu</th><th>Thao tác</th></tr></thead><tbody>${bosses.map((boss) => `<tr><td>${boss.id}</td><td>${esc(boss.name)}</td><td>${esc(boss.status)}</td><td>${esc(boss.mapName)} ${boss.mapId >= 0 ? `(#${boss.mapId}) · khu ${boss.zoneId}` : ''}</td><td><div class="action-grid"><button class="btn btn-xs btn-outline" data-boss-edit="${boss.index}">Chỉnh sửa sâu</button><button class="btn btn-xs btn-danger" data-boss-remove="${boss.index}">Gỡ Boss</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Không có boss trong danh sách runtime.</div>'}</section>`;
    $('bossRefresh').onclick = renderBossRuntime;
    $('bossSpawnForm').onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const data = { bossId: Number(values.bossId) };
      if (values.mapId !== '' || values.zoneId !== '') { data.mapId = Number(values.mapId); data.zoneId = Number(values.zoneId); }
      const result = await api.serverCommand({ action: 'boss.spawn', data });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); renderBossRuntime();
    };
    document.querySelectorAll('[data-boss-remove]').forEach((button) => button.onclick = async () => {
      const result = await api.serverCommand({ action: 'boss.remove', data: { index: Number(button.dataset.bossRemove) } });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); renderBossRuntime();
    });
    document.querySelectorAll('[data-boss-edit]').forEach((button) => button.onclick = () => toast('Không sửa được boss', 'error'));
  }

  async function renderEvents() {
    setLoading('Đang đọc sự kiện runtime...');
    const response = await api.serverCommand({ action: 'event.status', data: {} });
    if (!response.success) return renderRuntimeError(response, 'Quản lý sự kiện');
    const events = response.events || [];
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Quản lý sự kiện</h1><p>Bật/tắt các sự kiện có runtime handler.</p></div><button class="btn btn-outline" id="eventRefresh">↺ Làm mới</button></div><section class="content-section"><div class="table-wrap"><table><thead><tr><th>Sự kiện</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${events.map((event) => `<tr><td>${esc(event.name)}</td><td>${event.enabled ? 'Đang bật' : 'Đang tắt'}</td><td><button class="btn btn-sm ${event.enabled ? 'btn-warning' : 'btn-success'}" data-event-toggle="${esc(event.id)}" data-enabled="${event.enabled}">${event.enabled ? 'Tắt sự kiện' : 'Bật sự kiện'}</button></td></tr>`).join('')}</tbody></table></div></section><section class="content-section"><div class="section-heading"><h2>Chưa hỗ trợ runtime</h2></div><p>${(response.unsupported || []).map(esc).join(' · ') || 'Không có'}</p></section>`;
    $('eventRefresh').onclick = renderEvents;
    document.querySelectorAll('[data-event-toggle]').forEach((button) => button.onclick = async () => {
      button.disabled = true;
      const result = await api.serverCommand({ action: 'event.set', data: { eventId: button.dataset.eventToggle, enabled: button.dataset.enabled !== 'true' } });
      if (!result.success) { button.disabled = false; return showError(result.message || result.code); }
      toast(result.message); renderEvents();
    });
  }

  function renderRuntimeError(response, title = 'Player Runtime') {
    const messages = {
      SERVER_OFFLINE: 'Java server đang offline.', AUTH_FAILED: 'Bridge authentication failed.',
      TIMEOUT: 'Java server không phản hồi kịp thời.', CONNECTION_ERROR: 'Không thể kết nối tới Admin Bridge.'
    };
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>${esc(title)}</h1><p>Điều khiển trực tiếp instance Java đang chạy.</p></div></div><div class="runtime-warning"><span>!</span><div><strong>${esc(response.code || 'CONNECTION_ERROR')}</strong><p>${esc(response.message || messages[response.code] || 'Không thể tải dữ liệu runtime.')}</p></div></div><button class="btn btn-outline" id="runtimeRetry">↺ Thử lại</button>`;
    $('runtimeRetry').onclick = () => navigate(state.page);
  }

  async function renderPlayerRuntime() {
    setLoading('Đang đọc Player Runtime...');
    const response = await api.serverCommand({ action: 'player.list', data: {} });
    if (!response.success) return renderRuntimeError(response);
    state.runtimePlayers = response.players || [];
    const playerOptions = state.runtimePlayers.map((player) => `<option value="${player.id}" data-power="${esc(player.power)}" data-potential="${esc(player.potential)}">${esc(player.name)} (#${player.id})</option>`).join('');
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Player Runtime</h1><p>${formatNumber(state.runtimePlayers.length)} người chơi đang online.</p></div><button class="btn btn-outline" id="runtimeRefresh">↺ Làm mới</button></div>
      <section class="content-section runtime-controls"><div class="section-heading"><h2>Thay đổi vàng</h2><span>Cập nhật object online, sync client và lưu qua PlayerDAO</span></div><form id="goldForm" class="runtime-form"><div class="field-group"><label>Player</label><select name="playerId" required>${playerOptions}</select></div>${field('Số vàng', 'amount', 1000, 'number')}<button class="btn btn-primary" type="submit">＋ Cộng vàng</button><button class="btn btn-outline" id="removeGold" type="button">− Trừ vàng</button></form></section>
      <section class="content-section runtime-controls"><div class="section-heading"><h2>Tiềm năng / Sức mạnh</h2><span>Đặt giá trị chính xác cho nhân vật đang online; nhập số nguyên không âm.</span></div><form id="progressForm" class="runtime-form"><div class="field-group"><label>Nhân vật</label><select name="playerId" required>${playerOptions}</select></div><div class="field-group"><label>Sức mạnh</label><input name="power" type="text" inputmode="numeric" pattern="[0-9]{1,19}" maxlength="19" required></div><div class="field-group"><label>Tiềm năng</label><input name="potential" type="text" inputmode="numeric" pattern="[0-9]{1,19}" maxlength="19" required></div><button class="btn btn-primary" type="submit">Lưu tiềm năng / sức mạnh</button></form></section>
      <section class="content-section runtime-controls"><div class="section-heading"><h2>Thông báo toàn server</h2></div><form id="broadcastForm" class="runtime-form"><div class="field-group"><label>Nội dung (tối đa 500 ký tự)</label><input name="message" maxlength="500" required></div><button class="btn btn-primary" type="submit">Gửi thông báo</button></form></section>
      <section class="content-section runtime-controls"><div class="section-heading"><h2>Vật phẩm hành trang</h2><span>Thêm hoặc thu hồi theo template và số lượng</span></div><form id="itemForm" class="runtime-form"><div class="field-group"><label>Player</label><select name="playerId" required>${playerOptions}</select></div><div class="field-group"><label>Tìm vật phẩm</label><input id="runtimeItemSearch" type="search" placeholder="Tên hoặc ID"></div><div class="field-group"><label>Vật phẩm</label><select id="runtimeItemId" name="itemId" required><option value="">Tìm để tải danh sách</option></select></div>${field('Số lượng', 'quantity', 1, 'number')}<button class="btn btn-primary" type="submit">＋ Thêm item</button><button class="btn btn-outline" id="removeItem" type="button">Thu hồi vật phẩm</button></form></section>
      <section class="content-section"><div class="section-heading"><h2>Người chơi online</h2><span>${formatNumber(state.runtimePlayers.length)} người</span></div>${state.runtimePlayers.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Tên</th><th>Tiềm năng</th><th>Sức mạnh</th><th>Vàng</th><th>Map / Khu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${state.runtimePlayers.map((player) => `<tr><td>${player.id}</td><td>${esc(player.name)}</td><td>${formatLong(player.potential)}</td><td>${formatLong(player.power)}</td><td>${formatNumber(player.gold)}</td><td>${esc(player.mapName)} ${player.mapId >= 0 ? `(#${player.mapId}) · khu ${player.zoneId}` : ''}</td><td>${esc(player.status)}</td><td><button class="btn btn-xs btn-danger" data-player-kick="${player.id}">Kick</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Không có người chơi online.</div>'}</section>`;
    $('runtimeRefresh').onclick = renderPlayerRuntime;
    const progressForm = $('progressForm');
    const syncProgressValues = () => {
      const selected = progressForm.elements.namedItem('playerId').selectedOptions[0];
      progressForm.elements.namedItem('power').value = selected?.dataset.power || '0';
      progressForm.elements.namedItem('potential').value = selected?.dataset.potential || '0';
    };
    progressForm.elements.namedItem('playerId').onchange = syncProgressValues;
    syncProgressValues();
    progressForm.onsubmit = async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(progressForm).entries());
      const maxLong = 9223372036854775807n;
      for (const key of ['power', 'potential']) {
        if (!/^\d{1,19}$/.test(values[key]) || BigInt(values[key]) > maxLong) {
          return showError(`${key === 'power' ? 'Sức mạnh' : 'Tiềm năng'} phải là số nguyên từ 0 đến 9223372036854775807.`);
        }
      }
      const result = await api.serverCommand({
        action: 'player.setProgress',
        data: { playerId: Number(values.playerId), power: values.power, potential: values.potential },
      });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message);
      renderPlayerRuntime();
    };
    const sendGold = async (action) => {
      const values = Object.fromEntries(new FormData($('goldForm')).entries());
      const amount = Number(values.amount);
      if (!Number.isSafeInteger(amount) || amount <= 0) return showError('Số vàng phải là số nguyên dương.');
      const result = await api.serverCommand({ action, data: { playerId: Number(values.playerId), amount } });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); renderPlayerRuntime();
    };
    $('goldForm').onsubmit = (event) => { event.preventDefault(); sendGold('player.addGold'); };
    $('removeGold').onclick = () => sendGold('player.removeGold');
    $('broadcastForm').onsubmit = async (event) => {
      event.preventDefault();
      const message = new FormData(event.currentTarget).get('message').trim();
      const result = await api.serverCommand({ action: 'server.broadcast', data: { message } });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); event.currentTarget.reset();
    };
    $('runtimeItemSearch').onchange = async () => {
      const catalog = await api.itemTemplates({ search: $('runtimeItemSearch').value.trim() });
      $('runtimeItemId').innerHTML = catalog.map((item) => `<option value="${item.id}">#${item.id} · ${esc(item.name)}</option>`).join('') || '<option value="">Không có kết quả</option>';
    };
    const sendItem = async (action) => {
      const values = Object.fromEntries(new FormData($('itemForm')).entries());
      const itemId = Number(values.itemId);
      const quantity = Number(values.quantity);
      if (!Number.isInteger(itemId) || itemId < 0 || !Number.isInteger(quantity) || quantity <= 0) return showError('Hãy chọn vật phẩm và số lượng hợp lệ.');
      const result = await api.serverCommand({ action, data: { playerId: Number(values.playerId), itemId, quantity } });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); renderPlayerRuntime();
    };
    $('itemForm').onsubmit = (event) => { event.preventDefault(); sendItem('player.addItem'); };
    $('removeItem').onclick = () => sendItem('player.removeItem');
    document.querySelectorAll('[data-player-kick]').forEach((button) => button.onclick = async () => {
      const result = await api.serverCommand({ action: 'player.kick', data: { playerId: Number(button.dataset.playerKick) } });
      if (!result.success) return showError(result.message || result.code);
      toast(result.message); renderPlayerRuntime();
    });
  }

  function formatLong(value) {
    return BigInt(value || 0).toLocaleString('vi-VN');
  }

  async function renderShop() {
    state.table = 'shop';
    return renderTable('shop');
  }

  async function renderMap() {
    state.table = 'map_template';
    return renderTable('map_template');
  }

  function partTypeLabel(type) {
    const t = Number(type);
    if (t === 0) return 'Đầu';
    if (t === 1) return 'Thân';
    if (t === 2) return 'Chân';
    return `Loại ${type}`;
  }

  function getPartInfo(partId, partMap = state.partMap) {
    const id = Number(partId);
    if (!Number.isInteger(id) || id < 0) return null;
    const part = partMap?.get(id);
    if (!part) {
      return { id, type: -1, iconId: null, dx: 0, dy: 0, frameCount: 0, frames: [], exists: false };
    }
    if (part._parsed) return part._parsed;
    let frames = [];
    try {
      frames = parsePartData(part.data);
    } catch (_) {
      frames = [];
    }
    const firstFrame = frames[0] || [];
    const info = {
      id,
      type: Number(part.type),
      iconId: firstFrame[0] !== undefined ? Number(firstFrame[0]) : null,
      dx: firstFrame[1] !== undefined ? Number(firstFrame[1]) : 0,
      dy: firstFrame[2] !== undefined ? Number(firstFrame[2]) : 0,
      frameCount: frames.length,
      frames,
      exists: true
    };
    part._parsed = info;
    return info;
  }

  function resolveCostumeParts(item, partMap = state.partMap) {
    let headId = Number(item.head);
    let bodyId = Number(item.body);
    let legId = Number(item.leg);
    const partId = Number(item.part);

    // Fallback: if head, body, leg are unset (< 0) but item.part >= 0, check if item.part is a known part
    if (headId < 0 && bodyId < 0 && legId < 0 && partId >= 0) {
      const pInfo = getPartInfo(partId, partMap);
      if (pInfo?.exists) {
        if (pInfo.type === 0) headId = partId;
        else if (pInfo.type === 1) bodyId = partId;
        else if (pInfo.type === 2) legId = partId;
      }
    }

    return {
      headId,
      bodyId,
      legId,
      partId,
      headInfo: getPartInfo(headId, partMap),
      bodyInfo: getPartInfo(bodyId, partMap),
      legInfo: getPartInfo(legId, partMap),
      partInfo: getPartInfo(partId, partMap)
    };
  }

  function costumePartPreview(item, size = 'normal', partMap = state.partMap) {
    if (!partMap && state.partCatalog) {
      state.partMap = new Map(state.partCatalog.map((p) => [Number(p.id), p]));
      partMap = state.partMap;
    }
    const { headId, bodyId, legId, partId, headInfo, bodyInfo, legInfo } = resolveCostumeParts(item, partMap);
    const hasAnyPiece = headId >= 0 || bodyId >= 0 || legId >= 0;

    if (!hasAnyPiece) {
      if (item.iconId !== undefined && Number(item.iconId) >= 0) {
        return `<div class="costume-preview-empty costume-preview-icon-fallback" title="Mẫu #${item.id} chưa gán part · Icon vật phẩm #${item.iconId}"><img src="../../data/icon/x1/${item.iconId}.png" alt="${esc(item.name || '')}" onerror="this.style.display='none'"><span>Icon #${item.iconId}</span><small>${partId >= 0 ? `Part #${partId}` : 'Chưa gán part'}</small></div>`;
      }
      return `<div class="costume-preview-empty">${partId >= 0 ? `Dùng bộ part #${esc(partId)}` : 'Chưa gán part tạo hình'}</div>`;
    }

    if (size === 'large') {
      const pieces = [
        ['Đầu', headId, headInfo, 0],
        ['Thân', bodyId, bodyInfo, 1],
        ['Chân', legId, legInfo, 2]
      ];

      const spriteImgs = [];
      if (headInfo?.iconId !== null && headInfo?.iconId !== undefined) {
        spriteImgs.push(`<img src="../../data/icon/x1/${headInfo.iconId}.png" class="costume-sprite-piece costume-sprite-head" alt="Đầu #${headId}" onerror="this.style.display='none'">`);
      }
      if (bodyInfo?.iconId !== null && bodyInfo?.iconId !== undefined) {
        spriteImgs.push(`<img src="../../data/icon/x1/${bodyInfo.iconId}.png" class="costume-sprite-piece costume-sprite-body" alt="Thân #${bodyId}" onerror="this.style.display='none'">`);
      }
      if (legInfo?.iconId !== null && legInfo?.iconId !== undefined) {
        spriteImgs.push(`<img src="../../data/icon/x1/${legInfo.iconId}.png" class="costume-sprite-piece costume-sprite-leg" alt="Chân #${legId}" onerror="this.style.display='none'">`);
      }

      return `<div class="costume-preview-large-wrap">
        <div class="costume-composite-box" title="Tạo hình nhân vật ghép từ các part">
          <div class="costume-composite-label">Tạo hình nhân vật</div>
          <div class="costume-composite-sprite">
            ${spriteImgs.length ? spriteImgs.join('') : '<span class="empty-sprite">Chưa có ảnh</span>'}
          </div>
        </div>
        <div class="costume-piece-list">
          ${pieces.map(([label, pId, pInfo]) => {
        if (pId < 0) {
          return `<div class="costume-piece-row missing"><div class="costume-piece-thumb"><span>—</span></div><div class="costume-piece-meta"><strong>${label}</strong><small>Không dùng (-1)</small></div></div>`;
        }
        if (!pInfo || !pInfo.exists) {
          return `<div class="costume-piece-row warning"><div class="costume-piece-thumb"><span>#${pId}</span></div><div class="costume-piece-meta"><strong>${label} · Part #${pId}</strong><small class="text-danger">Không tìm thấy trong bảng part</small></div></div>`;
        }
        const iconSrc = pInfo.iconId !== null && pInfo.iconId !== undefined ? `../../data/icon/x1/${pInfo.iconId}.png` : '';
        return `<div class="costume-piece-row"><div class="costume-piece-thumb">${iconSrc ? `<img src="${iconSrc}" alt="${label} #${pId}" onerror="this.style.display='none'">` : '<span>#?</span>'}</div><div class="costume-piece-meta"><strong>${label} · Part #${pId}</strong><small>Icon #${pInfo.iconId ?? '?'} · ${pInfo.frameCount} frame (dx: ${pInfo.dx}, dy: ${pInfo.dy})</small></div></div>`;
      }).join('')}
        </div>
      </div>`;
    }

    // Normal size (Wardrobe grid card)
    const isSingleHead = headId >= 0 && bodyId < 0 && legId < 0;
    if (isSingleHead) {
      const iconSrc = headInfo?.iconId !== null && headInfo?.iconId !== undefined ? `../../data/icon/x1/${headInfo.iconId}.png` : '';
      return `<div class="costume-preview-parts single" title="Đầu: Part #${headId}${headInfo?.iconId !== null && headInfo?.iconId !== undefined ? ` (Icon #${headInfo.iconId})` : ''}">
        <div class="costume-preview-piece single-piece">
          ${iconSrc ? `<img src="${iconSrc}" alt="Đầu #${headId}" onerror="this.style.display='none'">` : `<span class="part-fallback">#${headId}</span>`}
        </div>
      </div>`;
    }

    const pieces = [
      ['Đầu', headId, headInfo],
      ['Thân', bodyId, bodyInfo],
      ['Chân', legId, legInfo]
    ];
    const tooltip = pieces.map(([l, id, info]) => `${l}: ${id >= 0 ? `Part #${id}${info?.iconId !== null && info?.iconId !== undefined ? ` (Icon #${info.iconId})` : ''}` : '—'}`).join('\n');

    return `<div class="costume-preview-parts" title="${esc(tooltip)}">
      ${pieces.map(([label, id, info]) => {
      if (id < 0) return '<div class="costume-preview-piece missing"><span>—</span></div>';
      if (info && info.iconId !== null && info.iconId !== undefined) {
        return `<div class="costume-preview-piece"><img src="../../data/icon/x1/${info.iconId}.png" alt="${label} #${id}" onerror="this.style.display='none'"></div>`;
      }
      return `<div class="costume-preview-piece missing" title="Part #${id} chưa có icon"><span class="part-fallback">#${id}</span></div>`;
    }).join('')}
    </div>`;
  }

  function showCostumeEditor(item, partCatalog, redraw) {
    const draft = { ...item };
    const partMap = new Map(partCatalog.map((part) => [Number(part.id), part]));
    state.partMap = partMap;

    // Build current-value label for a slot
    function slotCurLabel(val, expectedType) {
      if (!Number.isInteger(Number(val)) || Number(val) < 0) return '<em class="ppc-none">— Không dùng (-1)</em>';
      const info = getPartInfo(val, partMap);
      if (!info?.exists) return `<span class="costume-part-hint error">⚠️ Part #${val} không tồn tại</span>`;
      let warn = '';
      if (expectedType !== undefined && info.type !== expectedType) {
        warn = ` <strong class="text-warning">(⚠️ Loại ${info.type} · ${partTypeLabel(info.type)})</strong>`;
      }
      const img = info.iconId !== null && info.iconId !== undefined
        ? `<img src="../../data/icon/x1/${info.iconId}.png" style="width:14px;height:14px;vertical-align:middle;image-rendering:pixelated"> ` : '';
      return `<span class="costume-part-hint valid">${img}#${val} · Icon #${info.iconId ?? '?'} · ${info.frameCount}f${warn}</span>`;
    }

    // Build part picker grid for one slot
    function buildPartPicker(slotId, label, typeFilter, currentVal, expectedType) {
      const filtered = typeFilter === null
        ? partCatalog
        : partCatalog.filter((p) => Number(p.type) === typeFilter);

      const grid = filtered.map((p) => {
        const info = getPartInfo(p.id, partMap);
        const isSelected = Number(p.id) === Number(currentVal);
        const iconSrc = (info?.iconId !== null && info?.iconId !== undefined)
          ? `../../data/icon/x1/${info.iconId}.png` : '';
        return `<button type="button"
          class="part-picker-item${isSelected ? ' selected' : ''}"
          data-picker-slot="${slotId}" data-picker-value="${p.id}"
          title="Part #${p.id} · Loại ${p.type} · ${info?.frameCount ?? 0} frame${info?.iconId !== null && info?.iconId !== undefined ? ` · Icon #${info.iconId}` : ''}">
          <span class="ppi-thumb">
            ${iconSrc ? `<img src="${iconSrc}" alt="Part #${p.id}" onerror="this.style.display='none'">` : `<span class="ppi-no-icon">#${p.id}</span>`}
          </span>
          <span class="ppi-id">#${p.id}</span>
        </button>`;
      }).join('');

      return `<div class="part-picker-field" id="picker-field-${slotId}">
        <div class="part-picker-label-row">
          <span class="part-picker-slot-label">${label}</span>
          <span class="part-picker-current" id="picker-cur-${slotId}">${slotCurLabel(currentVal, expectedType)}</span>
          <button type="button" class="btn btn-xs btn-ghost part-picker-clear" data-picker-slot="${slotId}" title="Bỏ chọn (đặt -1)">✕ Bỏ</button>
        </div>
        <div class="part-picker-search-wrap">
          <input type="text" class="part-picker-search" id="picker-search-${slotId}" placeholder="🔍 Lọc ID part…" autocomplete="off">
        </div>
        <div class="part-picker-grid" id="picker-grid-${slotId}">
          ${grid || '<div class="part-picker-empty">Không có part loại này</div>'}
        </div>
        <input type="hidden" id="costume-${slotId}" data-costume-piece="${slotId}" value="${esc(currentVal)}">
      </div>`;
    }

    openModal(`Cải trang #${item.id}`, `<form id="costumeForm" class="costume-editor">
      <div class="costume-preview-panel">
        <h3>Xem tạo hình</h3>
        <div id="costumePreview">${costumePartPreview(draft, 'large', partMap)}</div>
        <p>Tạo hình nhân vật ghép từ Part Đầu / Thân / Chân. Click vào thumbnail bên dưới để chọn.</p>
      </div>
      <div class="field-group full-width">
        <label for="costumeName">Tên cải trang</label>
        <input id="costumeName" name="name" value="${esc(draft.name)}" maxlength="100" required>
      </div>
      <div class="costume-pickers-wrap">
        ${buildPartPicker('head', '🗣 Đầu — Part Loại 0', 0, draft.head, 0)}
        ${buildPartPicker('body', '👕 Thân — Part Loại 1', 1, draft.body, 1)}
        ${buildPartPicker('leg', '👖 Chân — Part Loại 2', 2, draft.leg, 2)}
        ${buildPartPicker('part', '🧩 Part mẫu (item_template.part)', null, draft.part, undefined)}
      </div>
      <small class="costume-part-note">⚠️ Thay đổi tạo hình cần khởi động lại server. Trường "Part mẫu" thường là -1 (cải trang 3 mảnh) hoặc trùng ID Đầu (Avatar/Nón).</small>
    </form>`, '<button type="button" class="btn btn-secondary" id="costumeCancel">Đóng</button><button type="button" class="btn btn-primary" id="costumeSave">Lưu thay đổi</button>');

    $('costumeCancel').onclick = closeModal;

    const refreshPreview = () => {
      draft.head = Number($('costume-head').value);
      draft.body = Number($('costume-body').value);
      draft.leg = Number($('costume-leg').value);
      draft.part = Number($('costume-part').value);
      $('costumePreview').innerHTML = costumePartPreview(draft, 'large', partMap);
    };

    const updateCurLabel = (slotId, expectedType) => {
      const el = $(`picker-cur-${slotId}`);
      if (!el) return;
      el.innerHTML = slotCurLabel(Number($(`costume-${slotId}`).value), expectedType);
    };

    const typeForSlot = { head: 0, body: 1, leg: 2, part: undefined };

    document.querySelectorAll('.part-picker-item').forEach((btn) => {
      btn.onclick = () => {
        const slot = btn.dataset.pickerSlot;
        const val = btn.dataset.pickerValue;
        $(`costume-${slot}`).value = val;
        $(`picker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) => {
          b.classList.toggle('selected', b.dataset.pickerValue === val);
        });
        updateCurLabel(slot, typeForSlot[slot]);
        refreshPreview();
      };
    });

    document.querySelectorAll('.part-picker-clear').forEach((btn) => {
      btn.onclick = () => {
        const slot = btn.dataset.pickerSlot;
        $(`costume-${slot}`).value = '-1';
        $(`picker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) => b.classList.remove('selected'));
        updateCurLabel(slot, typeForSlot[slot]);
        refreshPreview();
      };
    });

    ['head', 'body', 'leg', 'part'].forEach((slot) => {
      const searchEl = $(`picker-search-${slot}`);
      if (!searchEl) return;
      searchEl.oninput = () => {
        const term = searchEl.value.trim().toLowerCase();
        $(`picker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) => {
          b.style.display = (!term || b.dataset.pickerValue.includes(term) || b.title.toLowerCase().includes(term)) ? '' : 'none';
        });
      };
      const sel = $(`picker-grid-${slot}`)?.querySelector('.part-picker-item.selected');
      if (sel) setTimeout(() => sel.scrollIntoView({ block: 'nearest', behavior: 'auto' }), 60);
    });

    $('costumeSave').onclick = async () => {
      const form = $('costumeForm');
      if (!form.reportValidity()) return;
      const nextName = $('costumeName').value.trim();
      const nextPart = Number($('costume-part').value);
      try {
        const result = await api.updateCostume({
          id: item.id, name: nextName, part: nextPart,
          head: Number($('costume-head').value),
          body: Number($('costume-body').value),
          leg: Number($('costume-leg').value)
        });
        Object.assign(item, result);
        closeModal();
        redraw();
        if (result.nameRuntimeChanged && !result.runtimeApplied) {
          toast(`Đã lưu cải trang; tên chưa đồng bộ runtime (${result.runtimeCode || 'SERVER_OFFLINE'}).${result.appearanceRestartRequired ? ' Thay đổi tạo hình áp dụng sau khi khởi động lại.' : ''}`, 'error');
        } else if (result.appearanceRestartRequired) {
          toast('Đã lưu cải trang; thay đổi part/đầu/thân/chân áp dụng sau khi khởi động lại server.');
        } else if (result.nameRuntimeChanged) {
          toastRuntimeSave(result, 'Tên cải trang');
        } else {
          toast('Đã lưu cải trang.');
        }
      } catch (error) { showError(error); }
    };
  }


  function showCreateCostumeModal(partCatalog, onCreated) {
    const partMap = new Map(partCatalog.map((p) => [Number(p.id), p]));
    const draft = { name: '', gender: 0, level: 0, iconId: -1, part: -1, head: -1, body: -1, leg: -1 };

    function slotCurLabel(val, expectedType) {
      if (!Number.isInteger(Number(val)) || Number(val) < 0) return '<em class="ppc-none">— Không dùng (-1)</em>';
      const info = getPartInfo(val, partMap);
      if (!info?.exists) return `<span class="costume-part-hint error">⚠️ Part #${val} không tồn tại</span>`;
      let warn = '';
      if (expectedType !== undefined && info.type !== expectedType) {
        warn = ` <strong class="text-warning">(⚠️ Loại ${info.type})</strong>`;
      }
      const img = info.iconId !== null && info.iconId !== undefined
        ? `<img src="../../data/icon/x1/${info.iconId}.png" style="width:14px;height:14px;vertical-align:middle;image-rendering:pixelated"> ` : '';
      return `<span class="costume-part-hint valid">${img}#${val} · Icon #${info.iconId ?? '?'} · ${info.frameCount}f${warn}</span>`;
    }

    function buildPickerGrid(slotId, typeFilter, currentVal) {
      const filtered = typeFilter === null ? partCatalog : partCatalog.filter((p) => Number(p.type) === typeFilter);
      const grid = filtered.map((p) => {
        const info = getPartInfo(p.id, partMap);
        const sel = Number(p.id) === Number(currentVal);
        const iconSrc = (info?.iconId !== null && info?.iconId !== undefined) ? `../../data/icon/x1/${info.iconId}.png` : '';
        return `<button type="button" class="part-picker-item${sel ? ' selected' : ''}" data-picker-slot="${slotId}" data-picker-value="${p.id}" title="Part #${p.id} · Loại ${p.type} · ${info?.frameCount ?? 0} frame">
          <span class="ppi-thumb">${iconSrc ? `<img src="${iconSrc}" alt="Part #${p.id}" onerror="this.style.display='none'">` : `<span class="ppi-no-icon">#${p.id}</span>`}</span>
          <span class="ppi-id">#${p.id}</span></button>`;
      }).join('');
      return grid || '<div class="part-picker-empty">Không có part loại này</div>';
    }

    function buildSlot(slotId, label, typeFilter, expectedType) {
      const cur = draft[slotId];
      return `<div class="part-picker-field" id="cpicker-field-${slotId}">
        <div class="part-picker-label-row">
          <span class="part-picker-slot-label">${label}</span>
          <span class="part-picker-current" id="cpicker-cur-${slotId}">${slotCurLabel(cur, expectedType)}</span>
          <button type="button" class="btn btn-xs btn-ghost part-picker-clear" data-picker-slot="${slotId}">✕ Bỏ</button>
        </div>
        <div class="part-picker-search-wrap">
          <input type="text" class="part-picker-search" id="cpicker-search-${slotId}" placeholder="🔍 Lọc ID…" autocomplete="off">
        </div>
        <div class="part-picker-grid" id="cpicker-grid-${slotId}">${buildPickerGrid(slotId, typeFilter, cur)}</div>
        <input type="hidden" id="ccostume-${slotId}" value="${esc(cur)}">
      </div>`;
    }

    openModal('Tạo cải trang mới', `<form id="createCostumeForm" class="costume-editor">
      <div id="createPreview" class="costume-preview-panel">
        <h3>Xem trước</h3>
        <div id="createPreviewContent">${costumePartPreview(draft, 'large', partMap)}</div>
        <p>Chọn Part bên dưới để xem trước tạo hình.</p>
      </div>
      <div class="form-grid-2">
        <div class="field-group full-width">
          <label for="createCostumeName">Tên cải trang <span style="color:#ef4444">*</span></label>
          <input id="createCostumeName" placeholder="Ví dụ: Cải trang Ninja" maxlength="100" required>
        </div>
        <div class="field-group">
          <label for="createCostumeGender">Tộc / Giới tính</label>
          <select id="createCostumeGender">
            <option value="0">Trái Đất (0)</option>
            <option value="1">Namek (1)</option>
            <option value="2">Saiyan (2)</option>
            <option value="3">Tất cả tộc (3)</option>
          </select>
        </div>
        <div class="field-group">
          <label for="createCostumeLevel">Cấp yêu cầu</label>
          <input id="createCostumeLevel" type="number" min="0" max="999" value="0">
        </div>
      </div>
      <div class="costume-pickers-wrap">
        ${buildSlot('head', '🗣 Đầu — Part Loại 0', 0, 0)}
        ${buildSlot('body', '👕 Thân — Part Loại 1', 1, 1)}
        ${buildSlot('leg', '👖 Chân — Part Loại 2', 2, 2)}
        ${buildSlot('part', '🧩 Part mẫu (item_template.part)', null, undefined)}
      </div>
      <small class="costume-part-note">⚠️ ID sẽ tự được gán (MAX+1). Thay đổi tạo hình cần khởi động lại server.</small>
    </form>`,
      '<button type="button" class="btn btn-secondary" id="createCostumeCancel">Đóng</button><button type="button" class="btn btn-primary" id="createCostumeSave">➕ Tạo cải trang</button>');

    $('createCostumeCancel').onclick = closeModal;

    const refreshPreview = () => {
      draft.head = Number($('ccostume-head').value);
      draft.body = Number($('ccostume-body').value);
      draft.leg = Number($('ccostume-leg').value);
      draft.part = Number($('ccostume-part').value);
      $('createPreviewContent').innerHTML = costumePartPreview(draft, 'large', partMap);
    };

    const updateCurLabel = (slotId, expectedType) => {
      const el = $(`cpicker-cur-${slotId}`);
      if (el) el.innerHTML = slotCurLabel(Number($(`ccostume-${slotId}`).value), expectedType);
    };

    const typeForSlot = { head: 0, body: 1, leg: 2, part: undefined };

    document.querySelectorAll('#createCostumeForm .part-picker-item').forEach((btn) => {
      btn.onclick = () => {
        const slot = btn.dataset.pickerSlot;
        const val = btn.dataset.pickerValue;
        $(`ccostume-${slot}`).value = val;
        $(`cpicker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) =>
          b.classList.toggle('selected', b.dataset.pickerValue === val));
        updateCurLabel(slot, typeForSlot[slot]);
        refreshPreview();
      };
    });

    document.querySelectorAll('#createCostumeForm .part-picker-clear').forEach((btn) => {
      btn.onclick = () => {
        const slot = btn.dataset.pickerSlot;
        $(`ccostume-${slot}`).value = '-1';
        $(`cpicker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) => b.classList.remove('selected'));
        updateCurLabel(slot, typeForSlot[slot]);
        refreshPreview();
      };
    });

    ['head', 'body', 'leg', 'part'].forEach((slot) => {
      const searchEl = $(`cpicker-search-${slot}`);
      if (!searchEl) return;
      searchEl.oninput = () => {
        const term = searchEl.value.trim().toLowerCase();
        $(`cpicker-grid-${slot}`).querySelectorAll('.part-picker-item').forEach((b) => {
          b.style.display = (!term || b.dataset.pickerValue.includes(term) || b.title.toLowerCase().includes(term)) ? '' : 'none';
        });
      };
    });

    $('createCostumeSave').onclick = async () => {
      const form = $('createCostumeForm');
      if (!form.reportValidity()) return;
      const btn = $('createCostumeSave');
      btn.disabled = true;
      btn.textContent = 'Đang tạo...';
      try {
        const result = await api.createCostume({
          name: $('createCostumeName').value.trim(),
          gender: Number($('createCostumeGender').value),
          level: Number($('createCostumeLevel').value),
          head: Number($('ccostume-head').value),
          body: Number($('ccostume-body').value),
          leg: Number($('ccostume-leg').value),
          part: Number($('ccostume-part').value),
        });
        closeModal();
        toast(`Đã tạo cải trang "${result.name}" (ID #${result.id}).`);
        onCreated(result);
      } catch (error) {
        btn.disabled = false;
        btn.textContent = '✚ Tạo cải trang';
        showError(error);
      }
    };
  }

  function showFusionFormModal(form = null, onSaved = null) {
    const isEdit = form !== null;
    let initialFrames = isEdit && Array.isArray(form.frames) ? [...form.frames] : [965, 978];

    openModal(
      isEdit ? `Sửa ngoại hình hợp thể #${form.id}` : 'Tạo ngoại hình hợp thể mới',
      `<form id="fusionForm" class="fusion-editor-form">
        <div class="form-group">
          <label class="form-label">ID hợp thể</label>
          <input type="text" class="form-control" value="${isEdit ? form.id : '(Tự động cấp ID tiếp theo)'}" disabled />
        </div>
        <div class="form-group">
          <label class="form-label">Danh sách Frame Icon ID (cách nhau bởi dấu phẩy)</label>
          <input type="text" id="fusionFramesInput" class="form-control" value="${esc(initialFrames.join(', '))}" placeholder="Ví dụ: 965, 978" required />
          <small class="form-hint">Nhập các Icon ID đại diện cho các frame icon đầu khi hợp thể Lưỡng Long Nhất Thể / Bông Tai Porata (0 - 32767).</small>
        </div>
        <div class="form-group">
          <label class="form-label">Xem trước các Frame Icon</label>
          <div id="fusionFramesPreview" class="fusion-frames-modal-preview"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="cancelFusionBtn">Hủy</button>
          <button type="submit" class="btn btn-primary" id="saveFusionBtn">${isEdit ? '💾 Lưu thay đổi' : '✚ Tạo hợp thể'}</button>
        </div>
      </form>`
    );

    const updatePreview = () => {
      const inputVal = $('fusionFramesInput').value;
      const parsed = inputVal.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      $('fusionFramesPreview').innerHTML = parsed.length ? parsed.map((iconId, idx) => `
        <div class="fusion-modal-chip">
          <div class="fusion-chip-icon">
            <img src="../../data/icon/x1/${iconId}.png" alt="Icon #${iconId}" onerror="this.style.display='none'">
          </div>
          <div class="fusion-chip-info">
            <span>Frame ${idx + 1}</span>
            <strong>Icon #${isNaN(iconId) ? '?' : iconId}</strong>
          </div>
        </div>
      `).join('') : '<div class="empty-state-sm">Chưa có icon ID nào được nhập</div>';
    };

    updatePreview();
    $('fusionFramesInput').oninput = updatePreview;
    $('cancelFusionBtn').onclick = closeModal;

    $('fusionForm').onsubmit = async (e) => {
      e.preventDefault();
      const raw = $('fusionFramesInput').value;
      const frames = raw.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      if (!frames.length || frames.some((f) => !Number.isInteger(f) || f < 0 || f > 32767)) {
        showError('Vui lòng nhập danh sách Icon ID hợp lệ (các số từ 0 đến 32767).');
        return;
      }
      const saveBtn = $('saveFusionBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';
      try {
        let result;
        if (isEdit) {
          result = await api.updateFusionForm({ id: form.id, frames });
        } else {
          result = await api.createFusionForm({ frames });
        }
        closeModal();
        showToast(isEdit ? `Đã cập nhật hợp thể #${form.id}` : `Đã tạo ngoại hình hợp thể #${result.id}`);
        if (typeof onSaved === 'function') onSaved(result);
      } catch (error) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? '💾 Lưu thay đổi' : '✚ Tạo hợp thể';
        showError(error);
      }
    };
  }

  async function renderFusionForms() {
    setLoading('Đang tải ngoại hình hợp thể...');
    try {
      const fusionForms = await api.fusionForms();
      let search = '';
      $('pageContent').innerHTML = `
        <div class="page-heading">
          <div>
            <h1>Quản lý ngoại hình hợp thể</h1>
            <p>Danh sách bộ frame icon đầu nhân vật khi biến hình / hợp thể Bông tai Porata & Lưỡng Long Nhất Thể (array_head_2_frames).</p>
          </div>
          <div class="heading-actions">
            <button class="btn btn-primary" id="createFusionBtn">✚ Tạo hợp thể mới</button>
            <button class="btn btn-outline" id="openPartManager">🧩 Quản lý Part</button>
          </div>
        </div>
        <div class="wardrobe-toolbar">
          <div class="segmented-control" role="tablist" aria-label="Loại danh mục">
            <button data-wardrobe-view="costumes">Cải trang</button>
            <button data-wardrobe-view="avatars">Avatar</button>
            <button class="active" data-wardrobe-view="fusion">Hợp thể</button>
          </div>
          <input id="fusionSearch" placeholder="Tìm theo ID hợp thể hoặc Frame Icon ID...">
        </div>
        <div class="wardrobe-summary" id="fusionSummary"></div>
        <div class="wardrobe-grid" id="fusionGrid"></div>
      `;

      const draw = () => {
        const term = search.toLowerCase();
        const matches = fusionForms.filter((item) => {
          const haystack = `${item.id} ${item.frames.join(' ')}`;
          return haystack.toLowerCase().includes(term);
        });
        $('fusionSummary').textContent = `${formatNumber(matches.length)} / ${formatNumber(fusionForms.length)} ngoại hình hợp thể`;
        $('fusionGrid').innerHTML = matches.length ? matches.map((item) => `
          <article class="wardrobe-item fusion-wardrobe-item">
            <div class="fusion-frames-preview">
              ${item.frames.map((iconId) => `
                <div class="fusion-frame-chip" title="Frame Icon #${iconId}">
                  <img src="../../data/icon/x1/${iconId}.png" alt="Icon #${iconId}" onerror="this.style.display='none'">
                  <span>#${iconId}</span>
                </div>
              `).join('')}
            </div>
            <div class="wardrobe-item-info">
              <strong>Hợp thể #${item.id}</strong>
              <small>${item.frames.length} frame icon: ${item.frames.map((f) => '#' + f).join(', ')}</small>
            </div>
            <div class="fusion-item-actions">
              <button type="button" class="btn btn-xs btn-outline" data-fusion-edit="${item.id}">Sửa Frame</button>
              <button type="button" class="btn btn-xs btn-danger-outline" data-fusion-delete="${item.id}">Xóa</button>
            </div>
          </article>
        `).join('') : '<div class="empty-state">Không tìm thấy ngoại hình hợp thể phù hợp.</div>';
      };

      $('fusionSearch').oninput = () => { search = $('fusionSearch').value.trim(); draw(); };
      $('openPartManager').onclick = () => navigate('parts');
      $('createFusionBtn').onclick = () => showFusionFormModal(null, (newForm) => {
        fusionForms.push(newForm);
        draw();
      });

      document.querySelectorAll('[data-wardrobe-view]').forEach((button) => button.onclick = () => {
        const v = button.dataset.wardrobeView;
        if (v === 'fusion') return renderFusionForms();
        renderWardrobe(v);
      });

      $('fusionGrid').onclick = async (e) => {
        const editBtn = e.target.closest('[data-fusion-edit]');
        const deleteBtn = e.target.closest('[data-fusion-delete]');
        if (editBtn) {
          const id = Number(editBtn.dataset.fusionEdit);
          const item = fusionForms.find((f) => Number(f.id) === id);
          if (item) {
            showFusionFormModal(item, (updated) => {
              item.frames = updated.frames;
              draw();
            });
          }
        } else if (deleteBtn) {
          const id = Number(deleteBtn.dataset.fusionDelete);
          if (confirm(`Bạn có chắc chắn muốn xóa ngoại hình hợp thể #${id}?`)) {
            try {
              await api.deleteFusionForm({ id });
              const idx = fusionForms.findIndex((f) => Number(f.id) === id);
              if (idx !== -1) fusionForms.splice(idx, 1);
              showToast(`Đã xóa ngoại hình hợp thể #${id}`);
              draw();
            } catch (err) {
              showError(err);
            }
          }
        }
      };

      draw();
    } catch (error) { showError(error); }
  }

  async function renderWardrobe(initialView = 'costumes') {
    if (initialView === 'fusion') return renderFusionForms();
    setLoading();
    try {
      const [catalog, avatars, partCatalog] = await Promise.all([
        api.itemTemplates({ search: '' }),
        api.headAvatars(),
        api.parts()
      ]);
      const costumes = catalog.filter((item) => Number(item.type) === 5);
      const partMap = new Map(partCatalog.map((part) => [Number(part.id), part]));
      state.partMap = partMap;
      state.partCatalog = partCatalog;

      let view = ['costumes', 'avatars', 'fusion'].includes(initialView) ? initialView : 'costumes';
      let search = '';
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Cải trang / Avatar</h1><p>Xem tạo hình, sửa tên và gán part cho cải trang.</p></div><div class="heading-actions"><button class="btn btn-primary" id="createCostumeBtn">✚ Tạo cải trang mới</button><button class="btn btn-outline" id="openPartManager">🧩 Quản lý Part</button></div></div>
        <div class="wardrobe-toolbar"><div class="segmented-control" role="tablist" aria-label="Loại danh mục"><button class="${view === 'costumes' ? 'active' : ''}" data-wardrobe-view="costumes">Cải trang</button><button class="${view === 'avatars' ? 'active' : ''}" data-wardrobe-view="avatars">Avatar</button><button class="${view === 'fusion' ? 'active' : ''}" data-wardrobe-view="fusion">Hợp thể</button></div><input id="wardrobeSearch" placeholder="Tìm theo tên hoặc ID..."></div>
        <div class="wardrobe-summary" id="wardrobeSummary"></div><div class="wardrobe-grid" id="wardrobeGrid"></div>`;

      const draw = () => {
        const source = view === 'costumes' ? costumes : avatars;
        const matches = source.filter((item) => {
          const haystack = view === 'costumes'
            ? `${item.id} ${item.name} ${item.gender} ${item.level} ${item.part} ${item.head} ${item.body} ${item.leg}`
            : `${item.headId} ${item.avatarId}`;
          return haystack.toLowerCase().includes(search.toLowerCase());
        });
        $('wardrobeSummary').textContent = `${formatNumber(matches.length)} / ${formatNumber(source.length)} ${view === 'costumes' ? 'cải trang' : 'avatar'}`;
        $('wardrobeGrid').innerHTML = matches.length ? matches.map((item) => {
          if (view === 'avatars') {
            const icon = { id: item.headId, iconId: item.avatarId };
            return `<article class="wardrobe-item">${itemIcon(icon, [icon], 'wardrobe-icon')}<div class="wardrobe-item-info"><strong>Đầu #${esc(item.headId)}</strong><small>Avatar #${esc(item.avatarId)}</small></div></article>`;
          }
          const gender = Number(item.gender) === 3 ? 'Mọi tộc' : raceLabel(item.gender);
          const partsSummary = [];
          if (item.head >= 0) partsSummary.push(`Đầu #${item.head}`);
          if (item.body >= 0) partsSummary.push(`Thân #${item.body}`);
          if (item.leg >= 0) partsSummary.push(`Chân #${item.leg}`);
          if (item.part >= 0 && item.part !== item.head) partsSummary.push(`Part #${item.part}`);
          const partsDesc = partsSummary.length ? partsSummary.join(' · ') : (item.part >= 0 ? `Part #${item.part}` : 'Chưa gán part');

          return `<article class="wardrobe-item costume-wardrobe-item">
            <button type="button" class="costume-preview-trigger" data-costume-preview="${item.id}" aria-label="Xem tạo hình ${esc(item.name)}">
              ${costumePartPreview(item, 'normal', partMap)}
            </button>
            <div class="wardrobe-item-info">
              <strong>${esc(item.name)}</strong>
              <small>#${esc(item.id)} · ${esc(gender)} · Cấp ${esc(item.level)}</small>
              <small class="costume-parts-badge">${esc(partsDesc)}</small>
            </div>
            <button type="button" class="btn btn-xs btn-outline" data-costume-edit="${item.id}">Sửa / Xem</button>
          </article>`;
        }).join('') : '<div class="empty-state">Không tìm thấy dữ liệu phù hợp.</div>';
      };

      $('wardrobeGrid').onclick = (event) => {
        const button = event.target.closest('[data-costume-edit], [data-costume-preview]');
        if (!button) return;
        const item = costumes.find((costume) => Number(costume.id) === Number(button.dataset.costumeEdit ?? button.dataset.costumePreview));
        if (item) showCostumeEditor(item, partCatalog, draw);
      };
      $('openPartManager').onclick = () => navigate('parts');
      $('createCostumeBtn').onclick = () => showCreateCostumeModal(partCatalog, (newItem) => {
        costumes.push(newItem);
        draw();
      });
      document.querySelectorAll('[data-wardrobe-view]').forEach((button) => button.onclick = () => {
        const v = button.dataset.wardrobeView;
        if (v === 'fusion') return renderFusionForms();
        view = v;
        document.querySelectorAll('[data-wardrobe-view]').forEach((tab) => tab.classList.toggle('active', tab === button));
        draw();
      });
      $('wardrobeSearch').oninput = () => { search = $('wardrobeSearch').value.trim(); draw(); };
      draw();
    } catch (error) { showError(error); }
  }

  async function renderParts() {
    setLoading('Đang đọc danh sách part...');
    try {
      const parts = await api.parts();
      let search = '';
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Quản lý Part</h1><p>${formatNumber(parts.length)} part trong dữ liệu game.</p></div><button class="btn btn-outline" id="partRefresh">↺ Làm mới</button></div>
        <div class="runtime-warning"><span>!</span><div><strong>Không xóa hoặc đổi ID part</strong><p>Server/client dùng ID và số frame cố định. Part không được item_template tham chiếu vẫn có thể là tạo hình mặc định hoặc NPC. Các thay đổi DATA/loại cần khởi động lại server để tải lại.</p></div></div>
        <div class="toolbar"><input id="partSearch" placeholder="Tìm theo ID, loại hoặc trạng thái sử dụng..."></div><div class="part-summary" id="partSummary"></div><div class="part-list" id="partList"></div>`;
      const draw = () => {
        const term = search.toLowerCase();
        const matches = parts.filter((part) => `${part.id} ${part.type} ${part.itemUseCount} ${part.costumeUseCount}`.includes(term));
        $('partSummary').textContent = `${formatNumber(matches.length)} / ${formatNumber(parts.length)} part`;
        $('partList').innerHTML = matches.map((part) => `<article class="part-row"><div class="part-id">#${part.id}</div><div class="part-main"><strong>Part #${part.id} · Loại ${part.type}</strong><small>${parsePartData(part.data).length} frame · ${part.itemUseCount} item tham chiếu · ${part.costumeUseCount} cải trang</small></div>${renderPartThumbnails(part)}<span class="part-use ${Number(part.itemUseCount) ? 'used' : ''}">${Number(part.itemUseCount) ? 'Có item dùng' : 'Không thấy item tham chiếu'}</span><button type="button" class="btn btn-xs btn-outline" data-part-edit="${part.id}">Sửa DATA</button></article>`).join('') || '<div class="empty-state">Không tìm thấy part phù hợp.</div>';
      };
      $('partRefresh').onclick = renderParts;
      $('partSearch').oninput = () => { search = $('partSearch').value.trim(); draw(); };
      $('partList').onclick = (event) => {
        const zoomButton = event.target.closest('[data-part-zoom]');
        if (zoomButton) {
          const part = parts.find((entry) => Number(entry.id) === Number(zoomButton.dataset.partZoom));
          if (part) showPartZoom(part, Number(zoomButton.dataset.frameIndex));
          return;
        }
        const button = event.target.closest('[data-part-edit]');
        if (!button) return;
        const part = parts.find((entry) => Number(entry.id) === Number(button.dataset.partEdit));
        if (part) showPartEditor(part, () => {
          const index = parts.findIndex((entry) => Number(entry.id) === Number(part.id));
          parts[index] = { ...part };
          draw();
        });
      };
      draw();
    } catch (error) { showError(error); }
  }

  function renderPartThumbnails(part) {
    const frames = parsePartData(part.data);
    const previewFrames = frames.slice(0, 4);
    return `<div class="part-thumbnail-strip" aria-label="Xem nhanh các frame">${previewFrames.map(([iconId, dx, dy], index) => `<button type="button" class="part-thumbnail" data-part-zoom="${part.id}" data-frame-index="${index}" title="Phóng to frame ${index + 1} · icon ${iconId} · X ${dx}, Y ${dy}"><img src="../../data/icon/x1/${iconId}.png" alt="Frame ${index + 1}" onerror="this.style.display='none'"><span>#${iconId}</span></button>`).join('')}${frames.length > previewFrames.length ? `<button type="button" class="part-thumbnail-more" data-part-zoom="${part.id}" data-frame-index="4" title="Xem các frame còn lại">+${frames.length - previewFrames.length}</button>` : ''}</div>`;
  }

  function showPartZoom(part, frameIndex) {
    const frames = parsePartData(part.data);
    let selected = Math.max(0, Math.min(frameIndex, frames.length - 1));
    openModal(`Xem Part #${part.id}`, '<div class="part-zoom-viewer" id="partZoomViewer"></div>', '<button type="button" class="btn btn-secondary" id="partZoomClose">Đóng</button>');
    const draw = () => {
      const [iconId, dx, dy] = frames[selected];
      $('partZoomViewer').innerHTML = `<div class="part-zoom-heading"><strong>Frame ${selected + 1} / ${frames.length}</strong><span>Icon #${iconId} · X ${dx} · Y ${dy}</span></div>
        <div class="part-zoom-canvas"><img id="partZoomImage" src="../../data/icon/x1/${iconId}.png" alt="Part ${part.id}, frame ${selected + 1}" onerror="this.style.display='none'"></div>
        <div class="part-zoom-controls"><button type="button" class="btn btn-sm btn-outline" id="partZoomPrev" ${selected === 0 ? 'disabled' : ''}>← Frame trước</button><label>Phóng to <input id="partZoomScale" type="range" min="1" max="6" step="0.5" value="3"><span id="partZoomScaleLabel">3×</span></label><button type="button" class="btn btn-sm btn-outline" id="partZoomNext" ${selected === frames.length - 1 ? 'disabled' : ''}>Frame sau →</button></div>`;
      $('partZoomPrev').onclick = () => { selected -= 1; draw(); };
      $('partZoomNext').onclick = () => { selected += 1; draw(); };
      $('partZoomScale').oninput = (event) => {
        const scale = Number(event.currentTarget.value);
        $('partZoomImage').style.transform = `scale(${scale})`;
        $('partZoomScaleLabel').textContent = `${scale}×`;
      };
    };
    $('partZoomClose').onclick = closeModal;
    draw();
  }

  function showPartEditor(part, onSaved) {
    const frames = parsePartData(part.data);
    openModal(`Sửa Part #${part.id}`, `<form id="partForm" class="part-editor">
      <div class="part-editor-meta"><strong>Loại ${part.type} · ${frames.length} frame · ID cố định #${part.id}</strong><small>Chỉnh icon và tọa độ từng frame. Không thể thêm/xóa frame để giữ tương thích với client.</small></div>
      <div class="part-frame-list">${frames.map(([iconId, dx, dy], index) => `<article class="part-frame-row" data-part-frame="${index}">
        <span class="part-frame-number">Frame ${index + 1}</span>
        <div class="part-frame-preview"><span class="part-frame-fallback">#${iconId}</span><img src="../../data/icon/x1/${iconId}.png" alt="Icon ${iconId}" data-part-icon onerror="this.style.display='none'"></div>
        <div class="part-frame-fields">
          <label>Icon ID<input type="number" min="0" max="32767" value="${iconId}" data-frame-icon required></label>
          <label>X<input type="number" min="-128" max="127" value="${dx}" data-frame-dx required></label>
          <label>Y<input type="number" min="-128" max="127" value="${dy}" data-frame-dy required></label>
        </div>
      </article>`).join('')}</div>
    </form>`, '<button type="button" class="btn btn-secondary" id="partCancel">Hủy</button><button type="button" class="btn btn-primary" id="partSave">Lưu DATA</button>');
    $('partCancel').onclick = closeModal;
    $('partForm').querySelectorAll('[data-part-frame]').forEach((row) => {
      const preview = row.querySelector('.part-frame-preview');
      const iconInput = row.querySelector('[data-frame-icon]');
      const dxInput = row.querySelector('[data-frame-dx]');
      const dyInput = row.querySelector('[data-frame-dy]');
      const refreshPreview = () => {
        const iconId = Number(iconInput.value);
        const image = row.querySelector('[data-part-icon]');
        row.querySelector('.part-frame-fallback').textContent = `#${iconId}`;
        image.src = `../../data/icon/x1/${iconId}.png`;
        image.alt = `Icon ${iconId}`;
        image.style.display = '';
        preview.style.setProperty('--part-dx', `${Number(dxInput.value) * 2}px`);
        preview.style.setProperty('--part-dy', `${Number(dyInput.value) * 2}px`);
      };
      row.oninput = refreshPreview;
      refreshPreview();
    });
    $('partSave').onclick = async () => {
      const form = $('partForm');
      if (!form.reportValidity()) return;
      const data = Array.from(form.querySelectorAll('[data-part-frame]')).map((row) => [
        Number(row.querySelector('[data-frame-icon]').value),
        Number(row.querySelector('[data-frame-dx]').value),
        Number(row.querySelector('[data-frame-dy]').value)
      ]);
      try {
        const result = await api.updatePart({
          id: part.id,
          data
        });
        part.data = JSON.stringify(result.data);
        closeModal();
        onSaved();
        toast('Đã lưu part; khởi động lại server để áp dụng.');
      } catch (error) { showError(error); }
    };
  }

  async function renderTable(table) {
    setLoading();
    try {
      const data = await api.tableData({ table, page: state.pageNo, limit: 25, search: state.search });
      const columns = data.columns.map((column) => column.Field);
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>${esc(table)}</h1><p>${formatNumber(data.total)} dòng dữ liệu</p></div><button class="btn btn-primary" id="addRow">＋ Thêm dòng</button></div>
        <div class="toolbar"><input id="tableSearch" placeholder="Tìm kiếm..." value="${esc(state.search)}"><button class="btn btn-outline" id="searchTable">Tìm</button><button class="btn btn-outline" id="refreshTable">↺</button></div>
        <div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${esc(table === 'player' && c === 'gender' ? 'Tộc / Hành tinh' : c)}</th>`).join('')}<th>Thao tác</th></tr></thead><tbody>${data.rows.map((row) => `<tr data-id="${esc(row[columns[0]])}">${columns.map((c) => { const value = table === 'player' && c === 'gender' ? raceLabel(row[c]) : row[c]; return `<td title="${esc(value)}">${esc(value)}</td>`; }).join('')}<td class="row-actions"><button class="btn btn-xs btn-outline edit-row">Sửa</button><button class="btn btn-xs btn-danger delete-row">Xóa</button>${table === 'account' ? '<button class="btn btn-xs btn-warning account-action">Tài khoản</button>' : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="pagination"><span>Trang ${data.page}/${Math.max(data.pages, 1)}</span><button class="btn btn-sm btn-outline" id="prevPage" ${data.page <= 1 ? 'disabled' : ''}>←</button><button class="btn btn-sm btn-outline" id="nextPage" ${data.page >= data.pages ? 'disabled' : ''}>→</button></div>`;
      $('addRow').onclick = () => {
        if (table === 'giftcode') return showGiftCodeEditor(null);
        if (table === 'radar') return showRadarEditor(null);
        if (table === 'map_template') return showMapEditor(null);
        return showRowForm(table, columns, null);
      };
      $('refreshTable').onclick = () => renderTable(table);
      $('searchTable').onclick = () => { state.search = $('tableSearch').value.trim(); state.pageNo = 1; renderTable(table); };
      $('prevPage').onclick = () => { state.pageNo -= 1; renderTable(table); };
      $('nextPage').onclick = () => { state.pageNo += 1; renderTable(table); };
      document.querySelectorAll('.edit-row').forEach((button) => button.onclick = () => {
        const row = data.rows[button.closest('tr').rowIndex - 1];
        openTableEditor(table, columns, row);
      });
      document.querySelectorAll('tbody tr').forEach((rowElement) => rowElement.ondblclick = () => {
        const row = data.rows[rowElement.rowIndex - 1];
        openTableEditor(table, columns, row);
      });
      document.querySelectorAll('.delete-row').forEach((button) => button.onclick = () => deleteRow(table, button.closest('tr').dataset.id));
      document.querySelectorAll('.account-action').forEach((button) => button.onclick = () => accountActions(button.closest('tr').dataset.id));
    } catch (error) { showError(error); }
  }

  function openTableEditor(table, columns, row) {
    if (table === 'player') showPlayerEditor(row);
    else if (table === 'giftcode') showGiftCodeEditor(row);
    else if (table === 'radar') showRadarEditor(row);
    else if (table === 'map_template') showMapEditor(row);
    else if (table === 'shop') showShopEditor(row);
    else showRowForm(table, columns, row);
  }

  function parseJsonList(value) {
    try { return JSON.parse(value || '[]'); } catch (_) { return []; }
  }

  async function showRadarEditor(row) {
    const draft = { ...(row || {}), isNew: !row, bodyData: parseJsonList(row?.body), optionData: parseJsonList(row?.options), optionCatalog: [] };
    try { draft.optionCatalog = await api.itemOptions({ search: '', limit: 500 }); } catch (error) { return showError(error); }
    const bodyRows = draft.bodyData.map((item) => Object.entries(item).map(([key, value]) => `${key}: ${value}`).join(' · ')).join('\n');
    openModal(draft.isNew ? 'Thêm Radar' : `Radar: ${draft.name || draft.id}`, `<form id="radarForm" class="form-grid-2">
      ${field('ID', 'id', draft.id || '')}${field('Tên Radar', 'name', draft.name || '')}${field('Icon ID', 'iconId', draft.iconId || 0, 'number')}${field('Rank', 'rank', draft.rank || 0, 'number')}${field('Max Amount', 'max', draft.max || 60, 'number')}${field('Type', 'type', draft.type || 0, 'number')}${field('Mob / Template ID', 'mob_id', draft.mob_id ?? -1, 'number')}${field('Require', 'require', draft.require ?? -1, 'number')}${field('Require Level', 'require_level', draft.require_level || 0, 'number')}${field('Aura ID', 'aura_id', draft.aura_id ?? -1, 'number')}<div class="structured-editor-field"><label>Body / Ngoại hình</label><div class="structured-content">${structuredValue(draft.bodyData)}</div><small>Body được giữ nguyên format server hiện tại.</small></div><div class="radar-options-editor"><div class="section-heading"><div><label>Chỉ số Radar</label><small>Chọn tên chỉ số, nhập param và cấp kích hoạt.</small></div><button type="button" class="btn btn-xs btn-primary" id="addRadarOption">＋ Thêm chỉ số</button></div><div id="radarOptionRows">${draft.optionData.map((item, index) => radarOptionRow(draft.optionCatalog, item, index)).join('')}</div></div>${field('Mô tả', 'info', draft.info || '')}</form>`, `<button class="btn btn-secondary" id="cancelModal">Hủy</button><button class="btn btn-primary" id="saveRadar">Lưu Radar</button>`);
    $('cancelModal').onclick = closeModal;
    $('addRadarOption').onclick = () => $('radarOptionRows').insertAdjacentHTML('beforeend', radarOptionRow(draft.optionCatalog, { id: 0, param: 0, activeCard: 0 }, $('radarOptionRows').children.length));
    $('saveRadar').onclick = async () => {
      const values = Object.fromEntries(new FormData($('radarForm')).entries());
      const options = Array.from(document.querySelectorAll('[data-radar-option]')).map((element) => ({ id: Number(element.querySelector('[data-option-id]').value), param: Number(element.querySelector('[data-option-param]').value) || 0, activeCard: Number(element.querySelector('[data-option-active]').value) || 0 }));
      const data = { ...values, iconId: Number(values.iconId), rank: Number(values.rank), max: Number(values.max), type: Number(values.type), mob_id: Number(values.mob_id), require: Number(values.require), require_level: Number(values.require_level), aura_id: Number(values.aura_id), body: row?.body || '[]', options: JSON.stringify(options) };
      delete data.id;
      try { if (draft.isNew) await api.insertRow({ table: 'radar', data }); else await api.updateRow({ table: 'radar', pkValue: row.id, data }); closeModal(); toast('Đã lưu Radar'); renderTable('radar'); } catch (error) { showError(error); }
    };
  }

  function radarOptionRow(catalog, option, index) {
    return `<div class="radar-option-row" data-radar-option="${index}"><select data-option-id>${catalog.map((item) => `<option value="${item.id}" ${Number(item.id) === Number(option.id) ? 'selected' : ''}>#${item.id} · ${esc(item.name)}</option>`).join('')}</select><input data-option-param type="number" value="${Number(option.param) || 0}" placeholder="Param"><select data-option-active><option value="0" ${Number(option.activeCard) === 0 ? 'selected' : ''}>Cấp 0</option><option value="1" ${Number(option.activeCard) === 1 ? 'selected' : ''}>Cấp 1</option><option value="2" ${Number(option.activeCard) === 2 ? 'selected' : ''}>Cấp 2</option></select><button type="button" class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">Xóa</button></div>`;
  }

  function parseMapRows(value, size) {
    try { return JSON.parse(value || '[]').map((raw) => { const values = typeof raw === 'string' ? JSON.parse(raw) : raw; return size === 5 ? { templateId: Number(values[0]), level: Number(values[1]), hp: Number(values[2]), x: Number(values[3]), y: Number(values[4]) } : { templateId: Number(values[0]), x: Number(values[1]), y: Number(values[2]) }; }); } catch (_) { return []; }
  }

  function serializeMapRows(rows, size) {
    return JSON.stringify(rows.map((row) => JSON.stringify(size === 5 ? [Number(row.templateId), Number(row.level), Number(row.hp), Number(row.x), Number(row.y)] : [Number(row.templateId), Number(row.x), Number(row.y)])));
  }

  async function showMapEditor(row) {
    try {
      const [mobCatalog, npcCatalog] = await Promise.all([api.mobTemplates(), api.npcTemplates()]);
      const draft = { ...(row || {}), isNew: !row, mobs: parseMapRows(row?.mobs, 5), npcs: parseMapRows(row?.npcs, 3), mobCatalog, npcCatalog };
      renderMapEditor(draft);
    } catch (error) { showError(error); }
  }

  function renderMapEditor(draft) {
    openModal(draft.isNew ? 'Thêm Map' : `Map: ${draft.NAME || draft.id}`, '<div id="mapEditor"></div>', '<button class="btn btn-secondary" id="mapCancel">Hủy</button><button class="btn btn-primary" id="mapSave">Lưu Map</button>');
    $('mapCancel').onclick = closeModal;
    $('mapEditor').innerHTML = `<form id="mapForm" class="form-grid-2">${field('ID', 'id', draft.id || '', 'number')}${field('Tên Map', 'NAME', draft.NAME || '')}${field('Số Zone', 'zones', draft.zones || 1, 'number')}${field('Max Player', 'max_player', draft.max_player || 15, 'number')}${field('Planet ID', 'planet_id', draft.planet_id || 0, 'number')}${field('Type', 'type', draft.type || 0, 'number')}${field('Background Type', 'bg_type', draft.bg_type || 0, 'number')}${field('Tile ID', 'tile_id', draft.tile_id || 0, 'number')}${field('Background ID', 'bg_id', draft.bg_id || 0, 'number')}${field('Map đôi', 'is_map_double', draft.is_map_double || 0, 'number')}<div class="map-crud-section"><div class="section-heading"><div><h3>Mob Spawn</h3><small>${draft.mobs.length} mob trên map</small></div><button type="button" class="btn btn-xs btn-primary" id="addMapMob">＋ Thêm Mob</button></div><div class="map-spawn-header mob"><span>Mob Template</span><span>Level</span><span>HP</span><span>X</span><span>Y</span><span>Thao tác</span></div><div id="mapMobRows">${draft.mobs.map((mob, index) => mapMobRow(draft.mobCatalog, mob, index)).join('')}</div></div><div class="map-crud-section"><div class="section-heading"><div><h3>NPC</h3><small>${draft.npcs.length} NPC trên map</small></div><button type="button" class="btn btn-xs btn-primary" id="addMapNpc">＋ Thêm NPC</button></div><div class="map-spawn-header npc"><span>NPC Template</span><span>X</span><span>Y</span><span>Thao tác</span></div><div id="mapNpcRows">${draft.npcs.map((npc, index) => mapNpcRow(draft.npcCatalog, npc, index)).join('')}</div></div></form>`;
    $('addMapMob').onclick = () => $('mapMobRows').insertAdjacentHTML('beforeend', mapMobRow(draft.mobCatalog, { templateId: 0, level: 1, hp: 100, x: 0, y: 0 }, $('mapMobRows').children.length));
    $('addMapNpc').onclick = () => $('mapNpcRows').insertAdjacentHTML('beforeend', mapNpcRow(draft.npcCatalog, { templateId: 0, x: 0, y: 0 }, $('mapNpcRows').children.length));
    $('mapSave').onclick = async () => {
      const values = Object.fromEntries(new FormData($('mapForm')).entries());
      const mobs = Array.from(document.querySelectorAll('[data-map-mob]')).map((row) => ({ templateId: Number(row.querySelector('[data-template]').value), level: Number(row.querySelector('[data-level]').value) || 1, hp: Number(row.querySelector('[data-hp]').value) || 0, x: Number(row.querySelector('[data-x]').value) || 0, y: Number(row.querySelector('[data-y]').value) || 0 }));
      const npcs = Array.from(document.querySelectorAll('[data-map-npc]')).map((row) => ({ templateId: Number(row.querySelector('[data-template]').value), x: Number(row.querySelector('[data-x]').value) || 0, y: Number(row.querySelector('[data-y]').value) || 0 }));
      const data = { ...values, mobs: serializeMapRows(mobs, 5), npcs: serializeMapRows(npcs, 3) }; delete data.id;
      Object.keys(data).forEach((key) => { if (/^(zones|max_player|planet_id|type|bg_type|tile_id|bg_id|is_map_double)$/.test(key)) data[key] = Number(data[key]); });
      try { if (draft.isNew) await api.insertRow({ table: 'map_template', data }); else await api.updateRow({ table: 'map_template', pkValue: draft.id, data }); closeModal(); toast('Đã lưu Map'); renderTable('map_template'); } catch (error) { showError(error); }
    };
  }

  function mapMobRow(catalog, mob, index) {
    return `<div class="map-spawn-row" data-map-mob="${index}"><select data-template>${catalog.map((entry) => `<option value="${entry.id}" ${Number(entry.id) === Number(mob.templateId) ? 'selected' : ''}>#${entry.id} · ${esc(entry.name)}</option>`).join('')}</select><input data-level type="number" value="${mob.level}" title="Level"><input data-hp type="number" value="${mob.hp}" title="HP"><input data-x type="number" value="${mob.x}" title="X"><input data-y type="number" value="${mob.y}" title="Y"><button type="button" class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">Xóa</button></div>`;
  }

  function mapNpcRow(catalog, npc, index) {
    return `<div class="map-spawn-row npc" data-map-npc="${index}"><select data-template>${catalog.map((entry) => `<option value="${entry.id}" ${Number(entry.id) === Number(npc.templateId) ? 'selected' : ''}>#${entry.id} · ${esc(entry.name)}</option>`).join('')}</select><input data-x type="number" value="${npc.x}" title="X"><input data-y type="number" value="${npc.y}" title="Y"><button type="button" class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">Xóa</button></div>`;
  }

  async function showShopEditor(row) {
    try {
      const details = await api.shopDetails({ shopId: row.id });
      const [catalog, optionCatalog] = await Promise.all([api.itemTemplates({ search: '' }), api.itemOptions({ search: '', limit: 500 })]);
      openModal(`Shop: ${row.tag_name || row.id}`, '<div id="shopEditor"></div>', '<button class="btn btn-secondary" id="shopClose">Đóng</button>');
      $('shopClose').onclick = closeModal;
      $('shopEditor').innerHTML = `<div class="shop-summary"><div><strong>${esc(details.shop.tag_name)}</strong><span>NPC #${details.shop.npc_id} · Type ${details.shop.type_shop} · ${details.tabs.length} tab</span></div><div class="action-grid"><button class="btn btn-primary" id="addShopTab">＋ Thêm tab</button><button class="btn btn-outline" id="editShopMeta">Sửa thông tin</button></div></div><div class="shop-tabs">${details.tabs.map((tab) => `<section class="shop-tab"><div class="section-heading"><div><h3>${esc(tab.name)}</h3><small>Tab #${tab.id} · ${tab.items.length} vật phẩm</small></div><div class="action-grid"><button class="btn btn-xs btn-primary" data-shop-add="${tab.id}">＋ Item</button><button class="btn btn-xs btn-danger" data-shop-tab-delete="${tab.id}" data-shop-tab-name="${esc(tab.name)}" data-shop-tab-items="${tab.items.length}">Xóa tab</button></div></div><div class="inventory-list">${tab.items.map((item) => `<div class="inventory-row"><span class="item-icon"><img src="../../data/icon/x4/${item.iconId || 0}.png" alt="" onerror="this.style.display='none'"><span class="item-icon-fallback">${item.temp_id}</span></span><div class="item-main"><strong>${esc(item.itemName || `Item #${item.temp_id}`)}</strong><small>ID ${item.temp_id} · ${item.options.length} option · ${item.is_sell ? 'Đang bán' : 'Ẩn'}</small></div><span class="shop-cost">${formatNumber(item.cost)}</span><button class="btn btn-xs btn-outline" data-shop-edit="${item.id}">Sửa</button><button class="btn btn-xs btn-danger" data-shop-item-delete="${item.id}" data-shop-item-name="${esc(item.itemName || `Item #${item.temp_id}`)}">Xóa</button></div>`).join('')}</div></section>`).join('')}</div>`;
      $('addShopTab').onclick = () => showShopTabForm(row, () => showShopEditor(row));
      $('editShopMeta').onclick = () => showRowForm('shop', Object.keys(details.shop), details.shop);
      document.querySelectorAll('[data-shop-edit]').forEach((button) => button.onclick = () => {
        const item = details.tabs.flatMap((tab) => tab.items).find((entry) => Number(entry.id) === Number(button.dataset.shopEdit));
        showShopItemEditor(item, catalog, optionCatalog, () => showShopEditor(row), null);
      });
      document.querySelectorAll('[data-shop-item-delete]').forEach((button) => button.onclick = async () => {
        const name = button.dataset.shopItemName;
        if (!confirm(`Xóa vật phẩm "${name}" khỏi shop?`)) return;
        try {
          const result = await api.deleteShopItem({ itemId: Number(button.dataset.shopItemDelete) });
          toastRuntimeSave(result, 'Vật phẩm Shop');
          await showShopEditor(row);
        } catch (error) { showError(error); }
      });
      document.querySelectorAll('[data-shop-add]').forEach((button) => button.onclick = () => showShopItemEditor(null, catalog, optionCatalog, () => showShopEditor(row), Number(button.dataset.shopAdd)));
      document.querySelectorAll('[data-shop-tab-delete]').forEach((button) => button.onclick = async () => {
        const itemCount = Number(button.dataset.shopTabItems);
        const prompt = `Xóa tab "${button.dataset.shopTabName}" và ${itemCount} vật phẩm bên trong?`;
        if (!confirm(prompt)) return;
        try {
          const result = await api.deleteShopTab({ shopId: Number(row.id), tabId: Number(button.dataset.shopTabDelete) });
          toastRuntimeSave(result, 'Tab Shop');
          await showShopEditor(row);
        } catch (error) { showError(error); }
      });
    } catch (error) { showError(error); }
  }

  function showShopTabForm(shop, restore) {
    openModal('Thêm tab Shop', `<form id="shopTabForm"><div class="field-group"><label for="shopTabName">Tên tab</label><input id="shopTabName" name="name" maxlength="50" required placeholder="Ví dụ: Cửa hàng"></div><small>ID tab sẽ được tạo tự động.</small></form>`, '<button class="btn btn-secondary" id="shopTabCancel">Hủy</button><button class="btn btn-primary" id="shopTabSave">Thêm tab</button>');
    $('shopTabCancel').onclick = restore;
    $('shopTabSave').onclick = async () => {
      const form = $('shopTabForm');
      const name = new FormData(form).get('name').trim().replace(/\r?\n/g, '<>');
      if (!name || name.length > 50) return showError('Tên tab phải có 1–50 ký tự.');
      const button = $('shopTabSave');
      button.disabled = true;
      try {
        const result = await api.addShopTab({ shopId: Number(shop.id), name });
        closeModal();
        toastRuntimeSave(result, 'Tab Shop');
        await restore();
      } catch (error) {
        button.disabled = false;
        showError(error);
      }
    };
  }

  function showShopItemEditor(item, catalog, optionCatalog, restore, tabId) {
    const draft = item || { temp_id: -1, cost: 0, icon_spec: 0, is_new: 1, is_sell: 1, type_sell: 0, options: [] };
    openModal(`${item ? `Vật phẩm shop: ${item.itemName || item.temp_id}` : 'Thêm vật phẩm vào shop'}`, '<div id="shopItemEditor"></div>', `${item ? '<button class="btn btn-danger" id="shopItemDeleteModal" style="margin-right:auto">Xóa vật phẩm</button>' : ''}<button class="btn btn-secondary" id="shopItemCancel">Hủy</button><button class="btn btn-primary" id="shopItemSave">Lưu vật phẩm</button>`);
    $('shopItemCancel').onclick = restore;
    if (item && $('shopItemDeleteModal')) {
      $('shopItemDeleteModal').onclick = async () => {
        const name = item.itemName || `Item #${item.temp_id}`;
        if (!confirm(`Xóa vật phẩm "${name}" khỏi shop?`)) return;
        try {
          const result = await api.deleteShopItem({ itemId: Number(item.id) });
          closeModal();
          toastRuntimeSave(result, 'Vật phẩm Shop');
          if (restore) await restore();
        } catch (error) {
          showError(error);
        }
      };
    }
    const selEntry = catalog.find((e) => Number(e.id) === Number(draft.temp_id));
    const buildShopList = (items) => items.map((entry) => {
      const iconSrc = entry.iconId ? `../../data/icon/x4/${entry.iconId}.png` : '';
      return `<button type="button" class="item-list-row${Number(entry.id) === Number(draft.temp_id) ? ' selected' : ''}" data-item-id="${entry.id}" data-search="${entry.id} ${esc(entry.name).toLowerCase()}" title="#${entry.id} · ${esc(entry.name)} · type ${entry.type}"><span class="item-list-icon">${iconSrc ? `<img src="${iconSrc}" alt="" onerror="this.style.display='none'">` : ''}<span class="item-list-fallback">#${entry.id}</span></span><div class="item-list-meta"><div class="item-list-head"><strong class="item-list-name">${esc(entry.name)}</strong><span class="item-list-badge">#${entry.id}</span></div><div class="item-list-desc">${entry.type !== undefined ? `<span class="item-list-tag">Type ${entry.type}</span>` : ''}${entry.gender !== undefined && entry.gender >= 0 && entry.gender <= 2 ? `<span class="item-list-tag">${raceLabel(entry.gender)}</span>` : ''}${entry.description ? `<span class="item-list-info-text">${esc(entry.description)}</span>` : ''}</div></div></button>`;
    }).join('');
    $('shopItemEditor').innerHTML = `<form id="shopItemForm"><div class="shop-item-picker"><div class="selector-search"><input id="shopItemSearch" placeholder="🔍 Tìm kiếm theo tên hoặc ID..." autocomplete="off"><span id="shopSearchCount">${catalog.length} item</span></div><div class="selected-item-preview" id="shopSelectedPreview">${selEntry && selEntry.iconId ? `<img src="../../data/icon/x4/${selEntry.iconId}.png" alt="" onerror="this.style.display='none'">` : ''}<span>${esc(selEntry?.name || 'Chưa chọn vật phẩm')}${selEntry ? ` (#${selEntry.id})` : ''}</span></div><input type="hidden" id="shopTempId" value="${draft.temp_id}"><div class="item-list-picker" id="shopItemList">${buildShopList(catalog)}</div></div><div class="shop-item-form">${field('Giá bán', 'cost', draft.cost, 'number')}${field('Icon đặc biệt', 'icon_spec', draft.icon_spec || 0, 'number')}<div class="field-group"><label>Trạng thái</label><select id="shopItemSell"><option value="1" ${draft.is_sell ? 'selected' : ''}>Đang bán</option><option value="0" ${!draft.is_sell ? 'selected' : ''}>Ngừng bán</option></select></div><div class="field-group"><label>Loại tiền</label><select id="shopItemType"><option value="0" ${Number(draft.type_sell) === 0 ? 'selected' : ''}>🪙 Vàng</option><option value="1" ${Number(draft.type_sell) === 1 ? 'selected' : ''}>💎 Ngọc</option><option value="2" ${Number(draft.type_sell) === 2 ? 'selected' : ''}>🥇 Thỏi vàng</option><option value="3" ${Number(draft.type_sell) === 3 ? 'selected' : ''}>🔴 Hồng ngọc</option><option value="4" ${Number(draft.type_sell) === 4 ? 'selected' : ''}>🔮 Khác</option></select></div></div><div class="editor-intro"><div><h3>Chỉ số vật phẩm</h3><p>Option sẽ được thay thế trong cùng transaction.</p></div><button type="button" class="btn btn-xs btn-primary" id="addShopOption">＋ Thêm option</button></div><div id="shopOptionRows">${draft.options.map((option, index) => shopOptionRow(optionCatalog, option, index)).join('')}</div></form>`;
    const shopListEl = $('shopItemList');
    const shopSearchCount = $('shopSearchCount');
    $('shopItemSearch').oninput = () => {
      const term = $('shopItemSearch').value.trim().toLowerCase();
      let count = 0;
      shopListEl.querySelectorAll('.item-list-row').forEach((row) => {
        const text = row.dataset.search || '';
        const match = !term || text.includes(term);
        row.style.display = match ? 'flex' : 'none';
        if (match) count++;
      });
      if (shopSearchCount) shopSearchCount.textContent = `${count} / ${catalog.length} item`;
    };
    shopListEl.querySelectorAll('.item-list-row').forEach((row) => {
      row.onclick = () => {
        shopListEl.querySelectorAll('.item-list-row.selected').forEach((c) => c.classList.remove('selected'));
        row.classList.add('selected');
        $('shopTempId').value = row.dataset.itemId;
        const entry = catalog.find((e) => Number(e.id) === Number(row.dataset.itemId));
        $('shopSelectedPreview').innerHTML = (entry && entry.iconId ? `<img src="../../data/icon/x4/${entry.iconId}.png" alt="" onerror="this.style.display='none'">` : '') + `<span>${esc(entry?.name || '')} (#${row.dataset.itemId})</span>`;
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
    });
    $('addShopOption').onclick = () => $('shopOptionRows').insertAdjacentHTML('beforeend', shopOptionRow(optionCatalog, { option_id: 0, param: 0 }, $('shopOptionRows').children.length));
    $('shopItemSave').onclick = async () => {
      const values = Object.fromEntries(new FormData($('shopItemForm')).entries());
      const options = Array.from(document.querySelectorAll('[data-shop-option]')).map((row) => ({ option_id: Number(row.querySelector('[data-opt-select]').value), param: Number(row.querySelector('[data-opt-param]').value) || 0 }));
      try { const data = { temp_id: Number($('shopTempId').value), cost: Number(values.cost), icon_spec: Number(values.icon_spec), is_new: Number(draft.is_new) || 0, is_sell: Number($('shopItemSell').value), type_sell: Number($('shopItemType').value) }; const result = item ? await api.updateShopItem({ itemId: item.id, data, options }) : await api.addShopItem({ tabId, data, options }); closeModal(); toastRuntimeSave(result, 'Vật phẩm Shop'); restore(); } catch (error) { showError(error); }
    };
  }

  function shopOptionRow(catalog, option, index) {
    const uid = `sOpt${index}_${Date.now()}`;
    const html = `<div class="option-row-wrap" data-shop-option="${index}"><div class="opt-search-field"><input type="text" class="opt-search-input" placeholder="🔍 Tìm option..." autocomplete="off" id="${uid}s"><select data-opt-select id="${uid}sel">${catalog.map((entry) => `<option value="${entry.id}" ${Number(entry.id) === Number(option.option_id) ? 'selected' : ''}>#${entry.id} · ${esc(entry.name)}</option>`).join('')}</select></div><input type="number" value="${Number(option.param) || 0}" placeholder="Param" data-opt-param><button type="button" class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">Xóa</button></div>`;
    setTimeout(() => {
      const s = document.getElementById(`${uid}s`);
      const sel = document.getElementById(`${uid}sel`);
      if (s && sel) s.oninput = () => { const t = s.value.toLowerCase(); Array.from(sel.options).forEach((o) => { o.hidden = t && !o.textContent.toLowerCase().includes(t); }); };
    }, 0);
    return html;
  }

  async function showGiftCodeEditor(row) {
    const draft = {
      ...(row || {}), isNew: !row, code: row?.code || '', count_left: row?.count_left ?? 1,
      detail: row?.detail || '[]', expired: row?.expired || '2037-12-31 17:00:00',
      items: parseGiftDetail(row?.detail || '[]'), catalog: [], options: []
    };
    try {
      [draft.catalog, draft.options, draft.skillCatalog] = await Promise.all([api.itemTemplates({ search: '' }), api.itemOptions({ search: '', limit: 500 }), api.skillTemplates()]);
      reopenGiftDraft(draft);
    } catch (error) { showError(error); }
  }

  function reopenGiftDraft(draft) {
    openModal(`${draft.isNew ? 'Thêm giftcode' : `Giftcode: ${draft.code || draft.id}`}`, '<div id="giftcodeEditor"></div>', '<button class="btn btn-secondary" id="giftCancel">Hủy</button><button class="btn btn-primary" id="giftSave">Lưu giftcode</button>');
    $('giftCancel').onclick = closeModal;
    $('giftSave').onclick = async () => {
      try {
        const data = { code: draft.code, count_left: draft.count_left, detail: serializeGiftDetail(draft.items), expired: draft.expired };
        const result = draft.isNew
          ? await api.insertRow({ table: 'giftcode', data })
          : await api.updateRow({ table: 'giftcode', pkValue: draft.id, data });
        closeModal(); toastRuntimeSave(result, 'Giftcode'); renderTable('giftcode');
      } catch (error) { showError(error); }
    };
    renderGiftCodeEditor(draft);
  }

  function renderGiftCodeEditor(draft) {
    $('giftcodeEditor').innerHTML = `<div class="giftcode-fields">${field('Mã giftcode', 'code', draft.code || '')}${field('Số lượt còn lại', 'count_left', draft.count_left || 0, 'number')}${field('Ngày hết hạn', 'expired', draft.expired || '2037-12-31 17:00:00')}</div><div class="editor-intro"><div><h3>Phần thưởng</h3><p>${draft.items.length} vật phẩm, dùng cùng Item Selector và Option Selector.</p></div><button class="btn btn-primary" data-gift-action="add">＋ Thêm vật phẩm</button></div><div class="inventory-toolbar"><input id="giftSearch" placeholder="Tìm vật phẩm theo tên hoặc ID..."></div><div class="inventory-list">${draft.items.map((item, index) => `<div class="inventory-row gift-row">${itemIcon(item, draft.catalog)}<div class="item-main"><strong>${esc(itemTitle(item, draft.catalog))}</strong><small>ID ${item.id} · ${item.options.length} option</small></div><input class="quantity-input" type="number" min="0" value="${item.quantity}" data-gift-quantity="${index}"><button class="btn btn-xs btn-outline" data-gift-action="edit" data-index="${index}">Sửa</button><button class="btn btn-xs btn-danger" data-gift-action="remove" data-index="${index}">Xóa</button></div>`).join('')}</div>`;
    document.querySelectorAll('[data-gift-action]').forEach((button) => button.onclick = () => {
      const action = button.dataset.giftAction;
      const index = Number(button.dataset.index);
      if (action === 'remove') { draft.items.splice(index, 1); renderGiftCodeEditor(draft); }
      else openItemEditor(draft, 'items', action === 'add' ? -1 : index, () => reopenGiftDraft(draft));
    });
    document.querySelectorAll('[data-gift-quantity]').forEach((input) => input.oninput = () => { draft.items[Number(input.dataset.giftQuantity)].quantity = Math.max(0, Number(input.value) || 0); });
    $('giftSearch').oninput = () => { const term = $('giftSearch').value.toLowerCase().trim(); document.querySelectorAll('.gift-row').forEach((row) => { row.hidden = term && !row.textContent.toLowerCase().includes(term); }); };
    document.querySelectorAll('.giftcode-fields input').forEach((input) => input.oninput = () => { draft[input.name] = input.type === 'number' ? Number(input.value) : input.value; });
  }

  async function showPlayerEditor(row) {
    const inv = parseInventory(row.data_inventory);
    const draft = {
      ...row,
      originalRow: row,
      body: parseContainer(row.items_body),
      bag: parseContainer(row.items_bag),
      box: parseContainer(row.items_box),
      pet: parsePet(row.pet),
      catalog: [],
      options: [],
      tab: 'info',
      gold: inv.gold,
      gem: inv.gem,
      ruby: inv.ruby,
      coupon: inv.coupon,
      event: inv.event
    };
    openModal(`Chỉnh sửa nhân vật: ${row.name || row.id}`, '<div id="playerEditor"></div>', '<button class="btn btn-secondary" id="playerCancel">Hủy thay đổi</button><button class="btn btn-primary" id="playerSave">Lưu thay đổi</button>');
    $('playerCancel').onclick = closeModal;
    $('playerSave').onclick = async () => {
      try { await savePlayerDraft(draft); }
      catch (error) { showError(error); }
    };
    try {
      [draft.catalog, draft.options, draft.taskCatalog] = await Promise.all([api.itemTemplates({ search: '' }), api.itemOptions({ search: '', limit: 500 }), api.taskTemplates()]);
      if (draft.pet) draft.pet.catalog = draft.catalog;
      renderPlayerEditor(draft);
    } catch (error) { showError(error); }
  }

  function renderPlayerEditor(draft) {
    const tabs = [['info', 'Thông tin'], ['body', 'Trang bị'], ['bag', 'Hành trang'], ['box', 'Rương'], ['pet', 'PET / Đệ tử'], ['quest', 'Nhiệm vụ'], ['special', 'Item đặc biệt'], ['friends', 'Bạn bè'], ['other', 'Khác']];
    $('playerEditor').innerHTML = `<div class="player-tabs">${tabs.map(([key, label]) => `<button class="player-tab ${draft.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div><div class="player-tab-content">${renderPlayerTab(draft)}</div>`;
    document.querySelectorAll('.player-tab').forEach((button) => button.onclick = () => { draft.tab = button.dataset.tab; renderPlayerEditor(draft); });
    document.querySelectorAll('[data-container-action]').forEach((button) => button.onclick = () => {
      const container = button.dataset.containerAction;
      openItemEditor(draft, container, Number(button.dataset.index));
    });
    document.querySelectorAll('[data-pet-item]').forEach((button) => button.onclick = () => openItemEditor(draft.pet, 'body', Number(button.dataset.petItem), () => reopenDraft(draft)));
    document.querySelectorAll('[data-remove-item]').forEach((button) => button.onclick = () => {
      const list = draft[button.dataset.removeItem];
      list[Number(button.dataset.index)] = { id: -1, quantity: 0, options: [], createTime: Date.now() };
      renderPlayerEditor(draft);
    });
    document.querySelectorAll('[data-info-field]').forEach((input) => input.oninput = () => { draft[input.name] = input.name === 'gender' ? Number(input.value) : input.value; });
    document.querySelectorAll('[data-quantity]').forEach((input) => input.oninput = () => {
      draft[input.dataset.quantity][Number(input.dataset.index)].quantity = Math.max(0, Number(input.value) || 0);
    });
    document.querySelectorAll('[data-pet-field]').forEach((input) => input.oninput = () => { draft.pet[input.name] = input.type === 'number' || input.name === 'gender' ? Number(input.value) : input.value; });
    document.querySelectorAll('[data-pet-skill]').forEach((input) => input.oninput = () => { draft.pet.skills[Number(input.dataset.index)][input.dataset.petSkill] = Number(input.value); });
    $('inventorySearch')?.addEventListener('input', (event) => {
      const term = event.target.value.toLowerCase().trim();
      document.querySelectorAll('.inventory-row').forEach((row) => { row.hidden = term && !row.textContent.toLowerCase().includes(term); });
    });
    if (draft.tab === 'quest') bindQuestTabEvents(draft);
  }

  function renderPlayerTab(draft) {
    if (draft.tab === 'info') {
      const general = playerInfoFields.filter(([name]) => !['gold', 'gem', 'ruby'].includes(name));
      const assets = playerInfoFields.filter(([name]) => ['gold', 'gem', 'ruby'].includes(name));
      const renderInfo = (fields) => fields.map(([name, label, type]) => {
        if (name === 'gender') {
          const raw = Number(draft.gender);
          const known = raw === 0 || raw === 1 || raw === 2;
          return `<div class="field-group"><label>Tộc / Hành tinh</label><select name="gender" data-info-field>${known ? '' : `<option value="${esc(raw)}" selected>Khác</option>`}<option value="0" ${raw === 0 ? 'selected' : ''}>Trái Đất</option><option value="2" ${raw === 2 ? 'selected' : ''}>Saiyan</option><option value="1" ${raw === 1 ? 'selected' : ''}>Namek</option><option value="3">Khác</option></select></div>`;
        }
        return field(label, name, draft[name] ?? '', type).replace('<input ', '<input data-info-field ');
      }).join('');
      return `<div class="runtime-warning"><span>!</span><div><strong>Đồng bộ runtime có giới hạn</strong><p>Vàng được áp dụng trực tiếp nếu nhân vật đang online; nếu offline, dữ liệu sẽ được nạp khi đăng nhập. Thông tin, trang bị, hành trang, PET, nhiệm vụ và tài sản khác chỉ lưu DB; dữ liệu này có thể bị phiên online ghi đè.</p></div></div><section class="detail-section"><h3>Thông tin chung</h3><div class="player-info-grid">${renderInfo(general)}</div></section><section class="detail-section"><h3>Tài sản</h3><div class="player-info-grid">${renderInfo(assets)}</div></section>`;
    }
    if (draft.tab === 'body') return renderEquipment(draft);
    if (draft.tab === 'bag' || draft.tab === 'box') return renderInventory(draft, draft.tab);
    if (draft.tab === 'pet') return renderPetTab(draft);
    if (draft.tab === 'quest') return renderQuestTab(draft);
    if (draft.tab === 'friends') return `<div class="special-grid">${['friends', 'enemies'].map((key) => structuredField(key, draft[key])).join('')}</div>`;
    if (draft.tab === 'special') return `<div class="special-grid">${['items_box_lucky_round', 'items_daban', 'data_item_event', 'data_vip'].map((key) => structuredField(key, draft[key])).join('')}</div>`;
    return `<div class="special-grid">${['skills', 'skills_shortcut', 'pet', 'data_point', 'data_location'].map((key) => structuredField(key, draft[key])).join('')}</div>`;
  }

  function parseQuestData(value) {
    // data_task format from Java server: [taskId, stepIndex, count, lastTime]
    // e.g. [7, 2, 15, 1726800000000]
    // Sanitize: each element must be a plain number (never a nested array like [0])
    try {
      const raw = JSON.parse(value || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map((v) => (Array.isArray(v) ? Number(v[0]) || 0 : Number(v) || 0));
    } catch (_) { return []; }
  }

  function serializeQuestData(quests) {
    // Save back as flat JSON array
    return JSON.stringify(quests);
  }

  function renderQuestTab(draft) {
    const quests = parseQuestData(draft.data_task);
    const catalog = draft.taskCatalog || [];

    function getTaskMeta(taskId) {
      return catalog.find((t) => Number(t.id) === Number(taskId)) || null;
    }

    const questStatusLabel = (status) => {
      if (status === 0) return '<span class="quest-status quest-new">Chưa làm</span>';
      if (status === 1) return '<span class="quest-status quest-doing">Đang làm</span>';
      if (status === 2) return '<span class="quest-status quest-done">Hoàn thành</span>';
      return `<span class="quest-status">${status}</span>`;
    };

    // data_task = [taskId, index, count, lastTime]
    // quest[0]=taskId, quest[1]=index(sub-task step), quest[2]=count, quest[3]=lastTime
    const taskId = quests[0];
    const stepIdx = quests[1] ?? 0;
    const count = quests[2] ?? 0;
    const lastTime = quests[3] ?? 0;
    const meta = getTaskMeta(taskId);
    const currentSub = meta ? (meta.subTasks[stepIdx] || null) : null;
    const maxCount = currentSub ? currentSub.maxCount : 0;
    const pct = maxCount > 0 ? Math.min(100, Math.round(count * 100 / maxCount)) : 0;

    return `
      <div class="editor-intro"><div><h3>🏹 Nhiệm vụ chính (data_task)</h3><p>Cấu trúc: [task_id, sub_index, count, last_time]</p></div></div>

      <div class="quest-main-card">
        <div class="quest-select-row">
          <div class="field-group" style="flex:2">
            <label>📌 Nhiệm vụ hiện tại</label>
            <select id="questTaskSelect">
              ${catalog.map((t) => `<option value="${t.id}" ${Number(t.id) === Number(taskId) ? 'selected' : ''}>#${t.id} · ${esc(t.name)}</option>`).join('')}
              <option value="-1" ${!catalog.find((t) => Number(t.id) === Number(taskId)) ? 'selected' : ''}>-- Chưa chọn --</option>
            </select>
          </div>
          <div class="field-group">
            <label>Bước (index)</label>
            <input type="number" id="questStepInput" min="0" value="${stepIdx}">
          </div>
          <div class="field-group">
            <label>Tiến độ (count)</label>
            <input type="number" id="questCountInput" min="0" value="${count}">
          </div>
        </div>

        ${meta ? `
        <div class="quest-detail-card">
          <div class="quest-detail-header">
            <span class="quest-idx">#${meta.id}</span>
            <strong class="quest-name">${esc(meta.name)}</strong>
            ${questStatusLabel(quests[1] !== undefined ? (count >= maxCount ? 2 : 1) : 0)}
          </div>
          ${meta.detail ? `<p class="quest-detail-text">${esc(meta.detail)}</p>` : ''}
          ${meta.subTasks.length ? `
          <div class="quest-subtasks">
            <div class="quest-subtask-header"><span>Bước</span><span>Nhiệm vụ phụ</span><span>Tối đa</span><span>NPC</span><span>Map</span></div>
            ${meta.subTasks.map((sub, si) => `
              <div class="quest-subtask-row ${si === stepIdx ? 'active-step' : ''} ${si < stepIdx ? 'done-step' : ''}">
                <span class="step-num">${si === stepIdx ? '▶' : si < stepIdx ? '✔' : String(si + 1)}</span>
                <span>${esc(sub.name)}</span>
                <span class="step-max">${si === stepIdx ? `<strong>${count}</strong>/${sub.maxCount}` : sub.maxCount}</span>
                <span class="step-meta">NPC ${sub.npcId}</span>
                <span class="step-meta">Map ${sub.mapId}</span>
              </div>`).join('')}
          </div>
          ${currentSub ? `
          <div class="quest-progress">
            <div class="quest-progress-label"><span>${esc(currentSub.name)}</span><span>${count}/${maxCount} (${pct}%)</span></div>
            <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
          </div>` : ''}
          ` : '<p class="quest-no-sub">Không có nhiệm vụ phụ.</p>'}
        </div>` : '<div class="runtime-warning"><span>⚠️</span><div><strong>Không tìm thấy template</strong><p>Task ID ${taskId} chưa có trong bảng task_main_template.</p></div></div>'}
      </div>

      <div class="quest-raw-section">
        <div class="section-heading"><div><h3>Dữ liệu thô (JSON)</h3><small>Xem hoặc chỉnh sửa trực tiếp.</small></div><button class="btn btn-xs btn-outline" id="questRawToggle">Hiện/Ẩn</button></div>
        <div id="questRawEditor" style="display:none"><textarea id="questRawInput" class="sql-editor" rows="4">${esc(draft.data_task || '[]')}</textarea><button class="btn btn-sm btn-warning" id="questRawApply">Áp dụng JSON thô</button></div>
      </div>`;
  }

  function parsePartData(value) {
    if (!value) return [];
    try {
      const raw = typeof value === 'string' ? JSON.parse(String(value).replace(/\\"/g, '"')) : value;
      if (!Array.isArray(raw)) return [];
      return raw.map((entry) => {
        if (Array.isArray(entry)) return entry;
        if (typeof entry === 'string') {
          try { return JSON.parse(entry); } catch (_) { return null; }
        }
        return entry;
      }).filter((entry) => Array.isArray(entry) && entry.length >= 1);
    } catch (_) {
      return [];
    }
  }

  function bindQuestTabEvents(draft) {
    // Real-time update of data_task from the UI fields
    const applyQuestChanges = (rerender = false) => {
      const tId = Number(document.getElementById('questTaskSelect')?.value ?? -1);
      const step = Number(document.getElementById('questStepInput')?.value ?? 0);
      const cnt = Number(document.getElementById('questCountInput')?.value ?? 0);
      const quests = parseQuestData(draft.data_task);
      // Ensure lastTime is always a plain number — never a nested array
      const rawLast = quests[3];
      const lastTime = (typeof rawLast === 'number' && rawLast > 0) ? rawLast : Date.now();
      draft.data_task = JSON.stringify([tId, step, cnt, lastTime]);
      if (rerender) renderPlayerEditor(draft);
    };

    document.getElementById('questTaskSelect')?.addEventListener('change', () => applyQuestChanges(true));
    document.getElementById('questStepInput')?.addEventListener('input', () => applyQuestChanges(true));
    document.getElementById('questCountInput')?.addEventListener('input', () => applyQuestChanges(false));

    const rawToggle = document.getElementById('questRawToggle');
    if (rawToggle) rawToggle.onclick = () => {
      const el = document.getElementById('questRawEditor');
      el.style.display = el.style.display === 'none' ? '' : 'none';
    };
    const rawApply = document.getElementById('questRawApply');
    if (rawApply) rawApply.onclick = () => {
      try {
        const val = document.getElementById('questRawInput').value;
        JSON.parse(val); // validate
        draft.data_task = val;
        renderPlayerEditor(draft);
        toast('Đã áp dụng JSON thô');
      } catch (error) { showError(new Error('JSON không hợp lệ')); }
    };
  }

  function renderPetTab(draft) {
    if (!draft.pet) return '<div class="empty-state"><div class="empty-icon">🐾</div><h3>Nhân vật chưa có đệ tử</h3><p>Dữ liệu PET đang trống.</p></div>';
    const pet = draft.pet;
    const skillCatalog = draft.skillCatalog || [];
    return `<div class="pet-summary"><div class="pet-info-grid">${field('Tên đệ tử', 'name', pet.name).replace('<input ', '<input data-pet-field ')}${field('Loại', 'type', pet.type, 'number').replace('<input ', '<input data-pet-field ')}${field('Giới tính', 'gender', pet.gender, 'number').replace('<input ', '<input data-pet-field ')}${field('Trạng thái', 'status', pet.status, 'number').replace('<input ', '<input data-pet-field ')}</div><div class="pet-stats editable">${[['power', 'Sức mạnh'], ['tiemNang', 'Tiềm năng'], ['stamina', 'Thể lực'], ['maxStamina', 'Thể lực tối đa'], ['hp', 'HP'], ['hpg', 'HP tối đa'], ['mp', 'MP'], ['mpg', 'MP tối đa'], ['dameg', 'Sát thương'], ['defg', 'Phòng thủ'], ['critg', 'Chí mạng']].map(([key, label]) => `<label><span>${label}</span><input type="number" name="${key}" value="${pet[key]}" data-pet-field></label>`).join('')}</div></div><div class="pet-section"><div class="section-heading"><div><h3>Trang bị đệ tử</h3><small>${pet.body.filter((item) => item.id >= 0).length} vật phẩm</small></div></div><div class="equipment-grid">${pet.body.map((item, index) => `<button class="equipment-slot" data-pet-item="${index}">${itemIcon(item, draft.catalog, 'equipment-icon')}<span class="slot-label">Ô ${index + 1}</span><strong>${esc(itemTitle(item, draft.catalog))}</strong><small>${item.id < 0 ? 'Trống' : `ID ${item.id} · SL ${item.quantity}`}</small></button>`).join('')}</div></div><div class="pet-section"><div class="section-heading"><div><h3>Kỹ năng đệ tử</h3><small>Chọn skill thật từ skill_template và chỉnh cấp/điểm.</small></div></div><div class="skill-list">${pet.skills.map((skill, index) => `<div class="skill-row"><span>#${index + 1}</span><select data-pet-skill="id" data-index="${index}">${skillCatalog.map((entry) => `<option value="${entry.id}" ${Number(entry.id) === skill.id ? 'selected' : ''}>#${entry.id} · ${esc(entry.name)}</option>`).join('')}<option value="-1" ${skill.id < 0 ? 'selected' : ''}>Ô kỹ năng trống</option></select><label>Point<input type="number" min="0" value="${skill.point}" data-pet-skill="point" data-index="${index}"></label><label>Level<input type="number" min="0" value="${skill.level}" data-pet-skill="level" data-index="${index}"></label></div>`).join('')}</div></div>`;
  }

  function parseStructured(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  function structuredValue(value, depth = 0) {
    const parsed = parseStructured(value);
    if (parsed === null || parsed === undefined || parsed === '') return '<span class="structured-empty">Trống</span>';
    if (Array.isArray(parsed)) {
      if (!parsed.length) return '<span class="structured-empty">Danh sách trống</span>';
      return `<div class="structured-list">${parsed.slice(0, 80).map((item, index) => `<div class="structured-row"><span class="structured-index">${index + 1}</span><div>${structuredValue(item, depth + 1)}</div></div>`).join('')}${parsed.length > 80 ? `<span class="structured-more">+ ${parsed.length - 80} mục khác</span>` : ''}</div>`;
    }
    if (typeof parsed === 'object') return `<div class="structured-object">${Object.entries(parsed).map(([key, item]) => `<div class="structured-property"><span>${esc(key)}</span><div>${structuredValue(item, depth + 1)}</div></div>`).join('')}</div>`;
    return `<span class="structured-scalar">${esc(parsed)}</span>`;
  }

  function structuredField(label, value) {
    return `<div class="structured-field"><strong>${esc(label)}</strong><div class="structured-content">${structuredValue(value)}</div></div>`;
  }

  function editorField(label, name, value, type = 'text') {
    const parsed = parseStructured(value);
    if (typeof parsed === 'object' && parsed !== null) return `<div class="structured-editor-field"><label>${esc(label)}</label><input type="hidden" name="${esc(name)}" value="${esc(value ?? '')}"><div class="structured-content">${structuredValue(parsed)}</div><small>Dữ liệu cấu trúc được giữ nguyên khi lưu.</small></div>`;
    return field(label, name, value, type);
  }

  function renderEquipment(draft) {
    return `<div class="editor-intro"><div><h3>Trang bị</h3><p>Chọn item theo tên hoặc ID. Thay đổi chỉ ghi DB khi bấm Lưu.</p></div></div><div class="equipment-grid">${draft.body.map((item, index) => `<button class="equipment-slot" data-container-action="body" data-index="${index}">${itemIcon(item, draft.catalog, 'equipment-icon')}<span class="slot-label">${esc(bodySlots[index] || `Ô ${index + 1}`)}</span><strong>${esc(itemTitle(item, draft.catalog))}</strong><small>${item.id < 0 ? 'Trống' : `ID ${item.id} · SL ${item.quantity}`}</small></button>`).join('')}</div>`;
  }

  function renderInventory(draft, container) {
    const list = draft[container];
    return `<div class="editor-intro"><div><h3>${container === 'bag' ? 'Hành trang' : 'Rương'}</h3><p>${list.filter((item) => item.id >= 0).length} vật phẩm đang sử dụng</p></div><button class="btn btn-primary" data-container-action="${container}" data-index="-1">＋ Thêm vật phẩm</button></div><div class="inventory-toolbar"><input id="inventorySearch" placeholder="Tìm theo tên hoặc ID..."></div><div class="inventory-list">${list.map((item, index) => item.id < 0 ? '' : `<div class="inventory-row">${itemIcon(item, draft.catalog)}<div class="item-main"><strong>${esc(itemTitle(item, draft.catalog))}</strong><small>ID ${item.id} · ${item.options.length} option</small></div><input class="quantity-input" type="number" min="0" value="${item.quantity}" data-quantity="${container}" data-index="${index}"><button class="btn btn-xs btn-outline" data-container-action="${container}" data-index="${index}">Sửa</button><button class="btn btn-xs btn-danger" data-remove-item="${container}" data-index="${index}">Xóa</button></div>`).join('')}</div>`;
  }

  function reopenDraft(draft) {
    openModal(`Chỉnh sửa nhân vật: ${draft.name || draft.id}`, '<div id="playerEditor"></div>', '<button class="btn btn-secondary" id="playerCancel">Hủy thay đổi</button><button class="btn btn-primary" id="playerSave">Lưu thay đổi</button>');
    $('playerCancel').onclick = closeModal;
    $('playerSave').onclick = async () => {
      try {
        await savePlayerDraft(draft);
      } catch (error) { showError(error); }
    };
    renderPlayerEditor(draft);
  }

  function openItemEditor(draft, container, index, restore = () => reopenDraft(draft)) {
    const list = draft[container];
    const current = index >= 0 ? list[index] : { id: -1, quantity: 1, options: [], createTime: Date.now() };
    const optionRows = current.options.length ? current.options : [{ id: 0, param: 0 }];
    const currentMeta = draft.catalog.find((e) => Number(e.id) === current.id);
    const buildItemList = (items) => items.map((item) => {
      const iconSrc = item.iconId ? `../../data/icon/x4/${item.iconId}.png` : '';
      return `<button type="button" class="item-list-row${Number(item.id) === current.id ? ' selected' : ''}" data-item-id="${item.id}" data-search="${item.id} ${esc(item.name).toLowerCase()}" title="#${item.id} · ${esc(item.name)} · type ${item.type}"><span class="item-list-icon">${iconSrc ? `<img src="${iconSrc}" alt="" onerror="this.style.display='none'">` : ''}<span class="item-list-fallback">#${item.id}</span></span><div class="item-list-meta"><div class="item-list-head"><strong class="item-list-name">${esc(item.name)}</strong><span class="item-list-badge">#${item.id}</span></div><div class="item-list-desc">${item.type !== undefined ? `<span class="item-list-tag">Type ${item.type}</span>` : ''}${item.gender !== undefined && item.gender >= 0 && item.gender <= 2 ? `<span class="item-list-tag">${raceLabel(item.gender)}</span>` : ''}${item.description ? `<span class="item-list-info-text">${esc(item.description)}</span>` : ''}</div></div></button>`;
    }).join('');
    openModal('Item Selector', `<div class="item-selector"><div class="selector-search"><input id="itemSearch" placeholder="🔍 Tìm kiếm theo tên hoặc ID..." autocomplete="off"><span id="itemSearchCount">${draft.catalog.length} item</span></div><div class="selected-item-preview" id="selectedItemPreview">${currentMeta && currentMeta.iconId ? `<img src="../../data/icon/x4/${currentMeta.iconId}.png" alt="" onerror="this.style.display='none'">` : ''}<span>${esc(itemTitle(current, draft.catalog))} (#${current.id})</span></div><input type="hidden" id="itemSelect" value="${current.id}"><div class="item-list-picker" id="itemList">${buildItemList(draft.catalog)}</div><div class="item-editor-grid"><div class="field-group"><label>Số lượng</label><div class="quantity-input-wrap"><input id="selectedQuantity" type="number" min="0" step="1" value="${current.quantity}" class="quantity-direct-input" placeholder="Nhập số lượng..."><span class="quantity-hint">Nhập trực tiếp số lượng</span></div></div><div><label class="editor-label">Options</label><div id="optionRows">${optionRows.map((option, optionIndex) => optionEditorRow(draft.options, option, optionIndex)).join('')}</div><button class="btn btn-xs btn-outline" id="addOption">＋ Option</button></div></div></div>`, '<button class="btn btn-secondary" id="itemCancel">Hủy</button><button class="btn btn-primary" id="itemApply">Áp dụng</button>');
    $('itemCancel').onclick = restore;
    const itemListEl = $('itemList');
    const searchCountEl = $('itemSearchCount');
    itemListEl.querySelectorAll('.item-list-row').forEach((row) => {
      row.onclick = () => {
        itemListEl.querySelectorAll('.item-list-row.selected').forEach((c) => c.classList.remove('selected'));
        row.classList.add('selected');
        $('itemSelect').value = row.dataset.itemId;
        const entry = draft.catalog.find((e) => Number(e.id) === Number(row.dataset.itemId));
        if (entry) {
          $('selectedItemPreview').innerHTML = (entry.iconId ? `<img src="../../data/icon/x4/${entry.iconId}.png" alt="" onerror="this.style.display='none'">` : '') + `<span>${esc(entry.name)} (#${entry.id})</span>`;
        }
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
    });
    $('itemSearch').oninput = () => {
      const term = $('itemSearch').value.trim().toLowerCase();
      let count = 0;
      itemListEl.querySelectorAll('.item-list-row').forEach((row) => {
        const text = row.dataset.search || '';
        const match = !term || text.includes(term);
        row.style.display = match ? 'flex' : 'none';
        if (match) count++;
      });
      if (searchCountEl) searchCountEl.textContent = `${count} / ${draft.catalog.length} item`;
    };
    $('addOption').onclick = () => {
      $('optionRows').insertAdjacentHTML('beforeend', optionEditorRow(draft.options, { id: 0, param: 0 }, $('optionRows').children.length));
    };
    $('itemApply').onclick = () => {
      const selected = Number($('itemSelect').value);
      const options = Array.from(document.querySelectorAll('[data-option-row]')).map((row) => ({ id: Number(row.querySelector('[data-opt-select]').value), param: Number(row.querySelector('[data-opt-param]').value) || 0 })).filter((option) => option.id >= 0);
      const updated = { id: Number.isFinite(selected) ? selected : -1, quantity: Number($('selectedQuantity').value) || 0, options, createTime: current.createTime || Date.now() };
      if (index < 0) list.push(updated); else list[index] = updated;
      restore();
    };
  }

  function optionEditorRow(options, selected, index) {
    const uid = `oRow${index}_${Date.now()}`;
    const html = `<div class="option-row-wrap" data-option-row="${index}"><div class="opt-search-field"><input type="text" class="opt-search-input" placeholder="🔍 Tìm option..." autocomplete="off" id="${uid}s"><select data-opt-select id="${uid}sel">${options.map((option) => `<option value="${option.id}" ${Number(option.id) === Number(selected.id) ? 'selected' : ''}>#${option.id} · ${esc(option.name)}</option>`).join('')}</select></div><input type="number" value="${selected.param}" data-opt-param><button type="button" class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">×</button></div>`;
    setTimeout(() => {
      const s = document.getElementById(`${uid}s`);
      const sel = document.getElementById(`${uid}sel`);
      if (s && sel) s.oninput = () => { const t = s.value.toLowerCase(); Array.from(sel.options).forEach((o) => { o.hidden = t && !o.textContent.toLowerCase().includes(t); }); };
    }, 0);
    return html;
  }

  function showRowForm(table, columns, row) {
    let fields;
    if (table === 'account') {
      const groups = [
        ['Thông tin chung', (name) => ['id', 'username', 'name', 'email', 'phone', 'create_time'].includes(name.toLowerCase())],
        ['Thông tin đăng nhập', (name) => /password|login|logout|ip_address|session|token/.test(name.toLowerCase())],
        ['Trạng thái', (name) => /^(ban|active|is_admin|admin|server_login|status|verify|is_verify)$/.test(name.toLowerCase())],
        ['Tài sản', (name) => /^(vnd|vang|thoi_vang|gold|gem|ruby|luotquay|event_point|tongnap|vip)$/.test(name.toLowerCase())],
      ];
      const assigned = new Set();
      fields = groups.map(([title, match]) => {
        const groupColumns = columns.filter((column) => !assigned.has(column) && match(column));
        groupColumns.forEach((column) => assigned.add(column));
        return groupColumns.length ? `<section class="detail-section"><h4>${title}</h4><div class="form-grid-2">${groupColumns.map((column) => editorField(column, column, row?.[column] ?? '', /password/i.test(column) ? 'password' : 'text')).join('')}</div></section>` : '';
      }).join('');
      const otherColumns = columns.filter((column) => !assigned.has(column));
      if (otherColumns.length) fields += `<section class="detail-section"><h4>Mục khác</h4><div class="form-grid-2">${otherColumns.map((column) => editorField(column, column, row?.[column] ?? '')).join('')}</div></section>`;
    } else {
      fields = `<div class="form-grid-2">${columns.map((column) => editorField(column, column, row?.[column] ?? '')).join('')}</div>`;
    }
    const body = `<form id="rowForm">${fields}</form>`;
    openModal(row ? `Sửa ${table}` : `Thêm vào ${table}`, body, `<button class="btn btn-secondary" id="cancelModal">Hủy</button><button class="btn btn-primary" id="saveRow">Lưu</button>`);
    $('cancelModal').onclick = closeModal;
    $('saveRow').onclick = async () => {
      const data = Object.fromEntries(new FormData($('rowForm')).entries());
      try { const result = await (row ? api.updateRow({ table, pkValue: row[columns[0]], data }) : api.insertRow({ table, data })); closeModal(); toastRuntimeSave(result, table === 'shop' ? 'Shop' : 'Thay đổi'); renderTable(table); } catch (error) { showError(error); }
    };
  }

  async function deleteRow(table, id) {
    if (!confirm(`Xóa dòng có khóa ${id}?`)) return;
    try { const result = await api.deleteRow({ table, pkValue: id }); toastRuntimeSave(result, table === 'shop' ? 'Shop' : table === 'giftcode' ? 'Giftcode' : 'Dòng dữ liệu'); renderTable(table); } catch (error) { showError(error); }
  }

  function accountActions(id) {
    openModal('Thao tác tài khoản', `<p class="modal-note">Tài khoản #${esc(id)}</p><div class="action-grid"><button class="btn btn-warning" data-action="ban">🔒 Khóa runtime</button><button class="btn btn-outline" data-action="unban">Mở khóa runtime</button><button class="btn btn-success" data-action="giveVang">＋ Vàng</button><button class="btn btn-primary" data-action="giveVnd">＋ VND</button></div><div id="amountField" style="display:none" class="field-group"><label>Số lượng</label><input id="accountAmount" type="number" value="0"></div>`, '<button class="btn btn-secondary" id="cancelModal">Đóng</button>');
    $('cancelModal').onclick = closeModal;
    document.querySelectorAll('[data-action]').forEach((button) => button.onclick = async () => {
      const action = button.dataset.action;
      if (action === 'ban' || action === 'unban') {
        const result = await api.serverCommand({ action: action === 'ban' ? 'player.ban' : 'player.unban', data: { accountId: Number(id) } });
        if (!result.success) return showError(result.message || result.code);
        toast(result.message); closeModal(); renderTable('account'); return;
      }
      $('amountField').style.display = 'block';
      try { await api.accountAction({ action, accountId: id, amount: Number($('accountAmount')?.value || 0) }); toast('Đã thực hiện thao tác'); closeModal(); renderTable('account'); } catch (error) { showError(error); }
    });
  }

  async function renderTransactions() {
    setLoading();
    try { const rows = await api.transactions({ limit: 50 }); $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Giao dịch</h1><p>Lịch sử trao đổi mới nhất.</p></div></div><section class="content-section">${renderRows(rows, rows.length ? Object.keys(rows[0]) : ['id'])}</section>`; } catch (error) { showError(error); }
  }

  function renderSql() {
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>SQL Console</h1><p>Chạy truy vấn quản trị trên database hiện tại.</p></div></div><div class="sql-layout"><textarea id="sqlInput" class="sql-editor" spellcheck="false" placeholder="SELECT * FROM account LIMIT 20;"></textarea><div class="toolbar"><button class="btn btn-primary" id="runSql">▶ Chạy SQL</button><button class="btn btn-outline" id="loadSql">Mở file</button><button class="btn btn-outline" id="saveSql">Lưu file</button></div><div id="sqlOutput" class="sql-output">Kết quả sẽ hiển thị ở đây.</div></div>`;
    $('runSql').onclick = async () => { try { const result = await api.runSql({ sql: $('sqlInput').value }); $('sqlOutput').innerHTML = result.type === 'select' ? renderRows(result.rows, result.columns) : `Đã ảnh hưởng ${formatNumber(result.affected)} dòng trong ${result.ms}ms.`; } catch (error) { $('sqlOutput').textContent = error.message; } };
    $('loadSql').onclick = async () => { const content = await api.openFile(); if (content !== null) $('sqlInput').value = content; };
    $('saveSql').onclick = () => api.saveFile({ content: $('sqlInput').value, defaultName: 'query.sql' });
  }

  function renderMaintenance() {
    $('pageContent').innerHTML = `
      <div class="page-heading">
        <div><h1>Bảo trì server</h1><p>Gửi lệnh tới cơ chế maintenance đang chạy trong Java server.</p></div>
      </div>
      <div class="maintenance-panel">
        <div class="maintenance-icon">🔧</div>
        <h2>Trạng thái server</h2>
        <form id="maintenanceForm" class="runtime-form"><div class="field-group"><label>Đếm ngược (giây, 5–600)</label><input name="seconds" type="number" min="5" max="600" value="30"></div><button class="btn btn-warning" type="submit">⏸ Bắt đầu bảo trì</button></form>
        <div id="maintenanceStatus" class="maintenance-status" style="display:none"></div>
      </div>`;
    $('maintenanceForm').onsubmit = (event) => { event.preventDefault(); setMaintenance(Number(new FormData(event.currentTarget).get('seconds'))); };
  }

  async function setMaintenance(seconds) {
    const statusEl = $('maintenanceStatus');
    const button = $('maintenanceForm').querySelector('button[type="submit"]');
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600) return showError('Thời gian bảo trì phải từ 5 đến 600 giây.');
    button.disabled = true;
    const result = await api.serverCommand({ action: 'server.maintenance', data: { seconds } });
    button.disabled = false;
    if (!result.success) return showError(result.message || result.code);
    statusEl.style.display = 'block';
    statusEl.className = 'maintenance-status maintenance-countdown';
    statusEl.textContent = result.message;
    toast(result.message);
  }

  function formatUptime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async function refreshServerStatus() {
    const dot = $('statusDot');
    const text = $('statusText');
    if (!dot || !text) return;
    dot.className = 'status-dot connecting';
    text.textContent = 'Connecting';
    const status = await api.serverStatus();
    if (!status.success) {
      dot.className = `status-dot ${status.code === 'SERVER_OFFLINE' ? 'offline' : 'connection-error'}`;
      text.textContent = status.code === 'SERVER_OFFLINE' ? 'Server Offline' : status.code === 'AUTH_FAILED' ? 'Connection Error' : status.code === 'TIMEOUT' ? 'Connection Error' : 'Connection Error';
      return;
    }
    dot.className = `status-dot ${status.maintenance ? 'maintenance' : ''}`;
    text.textContent = `${status.maintenance ? 'Maintenance' : 'Server Online'} · ${formatUptime(status.uptimeMs)} · ${formatNumber(status.playerCount)} players`;
    text.title = `${status.serverName || 'Server'} · port ${status.gamePort}${status.maintenance ? ` · còn ${status.maintenanceSeconds}s` : ''}`;
  }

  function renderSettings() {
    const cfg = state.config || {};
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Cài đặt</h1><p>Cấu hình kết nối database cho ứng dụng.</p></div></div><section class="content-section settings-form"><form id="settingsForm" class="form-grid-2">${field('Host', 'host', cfg.host || '')}${field('Port', 'port', cfg.port || 3306, 'number')}${field('Database', 'database', cfg.database || '')}${field('Username', 'user', cfg.user || '')}${field('Password', 'password', cfg.password || '', 'password')}</form><button class="btn btn-primary" id="saveSettings">Lưu và kết nối</button></section>`;
    $('saveSettings').onclick = async () => { const form = Object.fromEntries(new FormData($('settingsForm')).entries()); const result = await api.connect(form); if (!result.success) return showError(result.error); await api.saveConfig(form); state.config = form; toast('Đã lưu cấu hình'); navigate('dashboard'); };
  }

  function websiteTabs(activePage) {
    return `<div class="website-admin-tabs"><button class="btn btn-outline ${activePage === 'website' ? 'active' : ''}" data-website-destination="website">Trang chủ</button><button class="btn btn-outline ${activePage === 'website-mechanics' ? 'active' : ''}" data-website-destination="website-mechanics">Cơ chế</button><button class="btn btn-outline ${activePage === 'website-items' ? 'active' : ''}" data-website-destination="website-items">Kiếm vật phẩm</button><button class="btn btn-outline ${activePage === 'website-forum' ? 'active' : ''}" data-website-destination="website-forum">Diễn đàn</button></div>`;
  }

  function bindWebsiteTabs() {
    document.querySelectorAll('[data-website-destination]').forEach((button) => {
      button.onclick = () => navigate(button.dataset.websiteDestination);
    });
  }

  async function renderWebsite() {
    setLoading('Đang tải nội dung website...');
    try {
      const { directory, content } = await api.loadWebContent();
      let heroImageUrl = '';
      if (content.heroImage) {
        try { heroImageUrl = await api.websiteImageDataUrl(content.heroImage); }
        catch (error) { showError(error); }
      }
      const download = (index, label) => content.downloads[index] || { label, url: '' };
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Quản lý Website</h1><p>Chỉnh nội dung, hình ảnh trang chủ và liên kết tải game.</p></div></div>${websiteTabs('website')}
        <section class="content-section settings-form website-management">
          <div class="website-directory"><div><strong>Thư mục website đang quản lý</strong><small>Chọn đúng thư mục chứa index.php của website đang chạy.</small><input id="websiteDirectory" value="${esc(directory)}" readonly></div><button class="btn btn-outline" id="chooseWebsiteDirectory">Chọn thư mục</button></div>
          <form id="websiteForm">
            <div class="form-grid-2">${field('Tên website', 'siteName', content.siteName || '')}${field('Dòng giới thiệu', 'tagline', content.tagline || '')}</div>
            <div class="website-home-image"><div><strong>Ảnh trang chủ</strong><small>Ảnh banner hiển thị ở đầu trang. Hỗ trợ JPG, PNG, WebP tối đa 5 MB.</small>${heroImageUrl ? `<img class="website-home-preview" id="websiteHomePreview" src="${esc(heroImageUrl)}" alt="Ảnh trang chủ">` : '<div class="website-home-empty" id="websiteHomePreview">Chưa tải ảnh banner</div>'}</div><button class="btn btn-outline" type="button" id="uploadWebsiteHomeImage">Tải ảnh lên</button></div>
            <input type="hidden" name="heroImage" value="${esc(content.heroImage || '')}">
            <label class="website-registration-toggle"><input type="checkbox" name="registrationEnabled" ${content.registrationEnabled === true ? 'checked' : ''}><span><strong>Mở đăng ký tài khoản mới</strong><small>Mặc định đóng. Khi đóng, người chơi vẫn có thể đăng nhập bằng tài khoản game đã có.</small></span></label>
            <div class="field-group website-text-field"><label>Thông báo nổi bật</label><textarea name="announcement" maxlength="2000" rows="3">${esc(content.announcement || '')}</textarea></div>
            <h3 class="website-subheading">Liên kết tải game</h3>
            <div class="form-grid-2 website-download-grid">${[0, 1, 2].map((index) => {
        const item = download(index, ['Tải bản Windows', 'Tải bản Android', 'Tải bản iOS'][index]);
        return `<div class="website-download-card">${field(`Tên nút ${index + 1}`, `downloadLabel${index}`, item.label)}${field(`URL tải ${index + 1}`, `downloadUrl${index}`, item.url, 'url')}</div>`;
      }).join('')}</div>
            <p class="website-help">Để trống URL nếu chưa có bản tải. Chỉ chấp nhận liên kết http:// hoặc https://.</p>
            <button class="btn btn-primary" type="submit">Lưu nội dung website</button>
          </form>
        </section>`;
      bindWebsiteTabs();
      $('chooseWebsiteDirectory').onclick = async () => {
        try {
          const result = await api.chooseWebsiteDirectory();
          if (!result.canceled) {
            toast('Đã chọn thư mục website');
            renderWebsite();
          }
        } catch (error) { showError(error); }
      };
      $('websiteForm').onsubmit = async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const payload = {
          siteName: String(form.get('siteName') || ''),
          tagline: String(form.get('tagline') || ''),
          heroImage: String(form.get('heroImage') || ''),
          registrationEnabled: form.get('registrationEnabled') === 'on',
          announcement: String(form.get('announcement') || ''),
          mechanics: content.mechanics || '',
          itemGuide: content.itemGuide || '',
          downloads: [0, 1, 2].map((index) => ({
            label: String(form.get(`downloadLabel${index}`) || ''),
            url: String(form.get(`downloadUrl${index}`) || ''),
          })),
        };
        try {
          await api.saveWebContent(payload);
          toast('Đã lưu nội dung website');
        } catch (error) { showError(error); }
      };
      $('uploadWebsiteHomeImage').onclick = async () => {
        try {
          const result = await api.uploadWebsiteImages({ kind: 'home' });
          if (result.canceled || !result.images.length) return;
          const image = result.images[0];
          const imageUrl = await api.websiteImageDataUrl(image);
          $('websiteForm').elements.namedItem('heroImage').value = image;
          $('websiteHomePreview').outerHTML = `<img class="website-home-preview" id="websiteHomePreview" src="${esc(imageUrl)}" alt="Ảnh trang chủ">`;
          toast('Đã tải ảnh lên; hãy lưu nội dung website để áp dụng');
        } catch (error) { showError(error); }
      };
    } catch (error) {
      $('pageContent').innerHTML = `<div class="runtime-warning"><span>!</span><div><strong>Không tải được cấu hình website</strong><p>${esc(error.message || error)}</p></div></div>`;
    }
  }

  async function renderWebsiteGuide(page) {
    const isMechanics = page === 'website-mechanics';
    const key = isMechanics ? 'mechanics' : 'itemGuide';
    const title = isMechanics ? 'Cơ chế game' : 'Cách kiếm vật phẩm';
    setLoading(`Đang tải nội dung ${title.toLowerCase()}...`);
    try {
      const { content } = await api.loadWebContent();
      $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Quản lý Website</h1><p>Chỉnh sửa nội dung từng trang hướng dẫn.</p></div></div>${websiteTabs(page)}
        <section class="content-section settings-form website-management">
          <h2 class="website-subheading">${title}</h2>
          <form id="websiteGuideForm">
            <div class="field-group website-text-field"><label>Nội dung trang</label><textarea name="guideContent" maxlength="10000" rows="18">${esc(content[key] || '')}</textarea></div>
            <p class="website-help">Nội dung hiển thị trên trang riêng của website. Xuống dòng để chia đoạn.</p>
            <button class="btn btn-primary" type="submit">Lưu nội dung</button>
          </form>
        </section>`;
      bindWebsiteTabs();
      $('websiteGuideForm').onsubmit = async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const payload = {
          ...content,
          [key]: String(form.get('guideContent') || ''),
        };
        try {
          await api.saveWebContent(payload);
          toast(`Đã lưu nội dung ${title.toLowerCase()}`);
        } catch (error) { showError(error); }
      };
    } catch (error) {
      $('pageContent').innerHTML = `<div class="runtime-warning"><span>!</span><div><strong>Không tải được nội dung ${esc(title.toLowerCase())}</strong><p>${esc(error.message || error)}</p></div></div>`;
    }
  }

  async function renderWebsiteForumPage() {
    $('pageContent').innerHTML = `<div class="page-heading"><div><h1>Quản lý Website</h1><p>Kiểm duyệt và quản lý nội dung diễn đàn.</p></div></div>${websiteTabs('website-forum')}
      <section class="content-section website-forum-management">
        <div class="website-forum-tabs"><button class="btn btn-outline ${state.websiteForumTab === 'posts' ? 'active' : ''}" data-forum-tab="posts">Bài viết</button><button class="btn btn-outline ${state.websiteForumTab === 'comments' ? 'active' : ''}" data-forum-tab="comments">Bình luận</button></div>
        <div class="toolbar"><input id="websiteForumSearch" placeholder="Tìm tiêu đề, nội dung hoặc người đăng..." value="${esc(state.websiteForumSearch)}"><button class="btn btn-outline" id="websiteForumSearchButton">Tìm</button><button class="btn btn-outline" id="websiteForumRefresh">↺</button></div>
        <div id="websiteForumContent"></div>
      </section>`;
    bindWebsiteTabs();
    document.querySelectorAll('[data-forum-tab]').forEach((button) => {
      button.onclick = () => {
        state.websiteForumTab = button.dataset.forumTab;
        state.websiteForumPage = 1;
        renderWebsiteForum();
      };
    });
    $('websiteForumSearchButton').onclick = () => {
      state.websiteForumSearch = $('websiteForumSearch').value.trim();
      state.websiteForumPage = 1;
      renderWebsiteForum();
    };
    $('websiteForumSearch').onkeydown = (event) => {
      if (event.key === 'Enter') $('websiteForumSearchButton').click();
    };
    $('websiteForumRefresh').onclick = () => renderWebsiteForum();
    await renderWebsiteForum();
  }

  function parseWebsiteForumImages(value) {
    if (!value || value === '0') return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((image) => typeof image === 'string')) return parsed;
    } catch (_) { }
    return [String(value)];
  }

  function isManagedForumImage(image) {
    return /^uploads\/forum\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(image);
  }

  async function showForumImages(post) {
    const images = parseWebsiteForumImages(post.image);
    let imageUrls;
    try {
      imageUrls = await Promise.all(images.map((image) => isManagedForumImage(image) ? api.websiteImageDataUrl(image) : null));
    } catch (error) { showError(error); return; }
    const gallery = images.map((image, index) => imageUrls[index]
      ? `<div class="website-post-image-card"><img src="${esc(imageUrls[index])}" alt="Ảnh đính kèm ${index + 1}"><div><span>Ảnh ${index + 1}</span><button class="btn btn-xs btn-danger" data-remove-post-image="${index}">Xóa</button></div></div>`
      : `<div class="website-post-image-card"><span>Ảnh cũ: ${esc(image.slice(0, 64))}</span><small>Không phải ảnh đã tải lên từ panel.</small></div>`).join('');
    const uploadButton = images.length < 2
      ? '<button class="btn btn-primary" id="uploadForumPostImages" type="button">Tải ảnh lên bài viết</button>'
      : '<p class="website-help">Bài viết đã đủ giới hạn 2 ảnh.</p>';
    openModal(`Ảnh bài viết #${post.id}`, `<div class="website-post-gallery">${gallery || '<p class="muted">Bài viết chưa có ảnh.</p>'}</div>${uploadButton}<p class="website-help">Tối đa 2 ảnh cho mỗi bài viết. Hỗ trợ JPG, PNG, WebP, mỗi ảnh tối đa 5 MB.</p>`, '<button class="btn btn-secondary" id="cancelModal">Đóng</button>');
    $('cancelModal').onclick = closeModal;
    $('uploadForumPostImages')?.addEventListener('click', async () => {
      try {
        const result = await api.uploadWebsiteImages({ kind: 'forum', postId: Number(post.id) });
        if (result.canceled) return;
        toast(`Đã tải lên ${result.images.length} ảnh`);
        closeModal();
        renderWebsiteForum();
      } catch (error) { showError(error); }
    });
    document.querySelectorAll('[data-remove-post-image]').forEach((button) => {
      button.onclick = async () => {
        if (!confirm(`Xóa ảnh ${Number(button.dataset.removePostImage) + 1} khỏi bài viết?`)) return;
        try {
          await api.websiteForumRemoveImage({ postId: Number(post.id), imageIndex: Number(button.dataset.removePostImage) });
          toast('Đã xóa ảnh bài viết');
          closeModal();
          renderWebsiteForum();
        } catch (error) { showError(error); }
      };
    });
  }

  async function renderWebsiteForum() {
    const container = $('websiteForumContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Đang tải diễn đàn...</p></div>';
    try {
      const result = await api.websiteForumList({
        type: state.websiteForumTab,
        page: state.websiteForumPage,
        search: state.websiteForumSearch,
      });
      const isPosts = state.websiteForumTab === 'posts';
      const rows = result.rows.map((row) => {
        const actions = isPosts
          ? `<button class="btn btn-xs btn-outline" data-forum-view="${esc(row.id)}">Xem</button><button class="btn btn-xs btn-outline" data-forum-images="${esc(row.id)}">Ảnh (${parseWebsiteForumImages(row.image).length}/2)</button><button class="btn btn-xs btn-outline" data-forum-pin="${esc(row.id)}" data-pinned="${Number(row.pinned) === 1 ? '1' : '0'}">${Number(row.pinned) === 1 ? 'Bỏ ghim' : 'Ghim'}</button><button class="btn btn-xs btn-danger" data-forum-delete-post="${esc(row.id)}">Xóa</button>`
          : `<button class="btn btn-xs btn-outline" data-forum-view-comment="${esc(row.id)}">Xem</button><button class="btn btn-xs btn-danger" data-forum-delete-comment="${esc(row.id)}">Xóa</button>`;
        const title = isPosts
          ? `<strong>${Number(row.pinned) === 1 ? '📌 ' : ''}${esc(row.title)}</strong><small>${esc(row.author)} · ${esc(row.createdAt)} · ${formatNumber(row.commentCount)} bình luận</small>`
          : `<strong>${esc(row.postTitle || '(Bài viết đã xóa)')}</strong><small>${esc(row.author)} · ${esc(row.createdAt)} · #${esc(row.postId)}</small>`;
        const excerpt = row.body;
        return `<tr><td>${title}<p class="website-forum-excerpt">${esc(String(excerpt || '').slice(0, 220))}${String(excerpt || '').length > 220 ? '…' : ''}</p></td><td class="row-actions">${actions}</td></tr>`;
      }).join('');
      container.innerHTML = result.rows.length
        ? `<div class="table-wrap website-forum-table"><table><thead><tr><th>${isPosts ? 'Chủ đề' : 'Bình luận'}</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div><div class="pagination"><span>${formatNumber(result.total)} mục · Trang ${result.page}/${Math.max(result.pages, 1)}</span><button class="btn btn-sm btn-outline" id="websiteForumPrev" ${result.page <= 1 ? 'disabled' : ''}>←</button><button class="btn btn-sm btn-outline" id="websiteForumNext" ${result.page >= result.pages ? 'disabled' : ''}>→</button></div>`
        : '<div class="empty-state">Không tìm thấy nội dung diễn đàn.</div>';
      $('websiteForumPrev')?.addEventListener('click', () => { state.websiteForumPage -= 1; renderWebsiteForum(); });
      $('websiteForumNext')?.addEventListener('click', () => { state.websiteForumPage += 1; renderWebsiteForum(); });
      document.querySelectorAll('[data-forum-view]').forEach((button) => {
        button.onclick = () => {
          const post = result.rows.find((row) => Number(row.id) === Number(button.dataset.forumView));
          if (post) openModal(`Bài viết #${post.id}`, `<div class="website-forum-detail"><strong>${esc(post.title)}</strong><p class="muted">${esc(post.author)} · ${esc(post.createdAt)}</p><div>${esc(post.body).replace(/\n/g, '<br>')}</div></div>`, '<button class="btn btn-secondary" id="cancelModal">Đóng</button>');
          $('cancelModal').onclick = closeModal;
        };
      });
      document.querySelectorAll('[data-forum-images]').forEach((button) => {
        button.onclick = () => {
          const post = result.rows.find((row) => Number(row.id) === Number(button.dataset.forumImages));
          if (post) showForumImages(post);
        };
      });
      document.querySelectorAll('[data-forum-view-comment]').forEach((button) => {
        button.onclick = () => {
          const comment = result.rows.find((row) => Number(row.id) === Number(button.dataset.forumViewComment));
          if (comment) openModal(`Bình luận #${comment.id}`, `<div class="website-forum-detail"><strong>${esc(comment.postTitle || '(Bài viết đã xóa)')}</strong><p class="muted">${esc(comment.author)} · ${esc(comment.createdAt)}</p><div>${esc(comment.body).replace(/\n/g, '<br>')}</div></div>`, '<button class="btn btn-secondary" id="cancelModal">Đóng</button>');
          $('cancelModal').onclick = closeModal;
        };
      });
      document.querySelectorAll('[data-forum-pin]').forEach((button) => {
        button.onclick = async () => {
          const pinned = button.dataset.pinned !== '1';
          try {
            await api.websiteForumPin({ postId: Number(button.dataset.forumPin), pinned });
            toast(pinned ? 'Đã ghim bài viết' : 'Đã bỏ ghim bài viết');
            renderWebsiteForum();
          } catch (error) { showError(error); }
        };
      });
      document.querySelectorAll('[data-forum-delete-post]').forEach((button) => {
        button.onclick = async () => {
          const post = result.rows.find((row) => Number(row.id) === Number(button.dataset.forumDeletePost));
          if (!confirm(`Xóa bài viết "${post?.title || button.dataset.forumDeletePost}" và toàn bộ bình luận của bài?`)) return;
          try {
            await api.websiteForumDeletePost({ postId: Number(button.dataset.forumDeletePost) });
            toast('Đã xóa bài viết và các bình luận');
            renderWebsiteForum();
          } catch (error) { showError(error); }
        };
      });
      document.querySelectorAll('[data-forum-delete-comment]').forEach((button) => {
        button.onclick = async () => {
          if (!confirm(`Xóa bình luận #${button.dataset.forumDeleteComment}?`)) return;
          try {
            await api.websiteForumDeleteComment({ commentId: Number(button.dataset.forumDeleteComment) });
            toast('Đã xóa bình luận');
            renderWebsiteForum();
          } catch (error) { showError(error); }
        };
      });
    } catch (error) {
      container.innerHTML = `<div class="runtime-warning"><span>!</span><div><strong>Không tải được diễn đàn</strong><p>${esc(error.message || error)}</p></div></div>`;
    }
  }

  function bindEvents() {
    $('btnMinimize').onclick = api.minimize;
    $('btnMaximize').onclick = api.maximize;
    $('btnClose').onclick = api.close;
    $('btnConnect').onclick = connect;
    $('modalClose').onclick = closeModal;
    $('modalOverlay').onclick = (event) => { if (event.target === $('modalOverlay')) closeModal(); };
    $('btnRefresh').onclick = () => navigate(state.page);
    $('btnDisconnect').onclick = () => { $('appLayout').style.display = 'none'; $('connectScreen').style.display = 'flex'; };
    document.querySelectorAll('.nav-item').forEach((item) => item.onclick = () => navigate(item.dataset.page));
    $('sidebarToggle').onclick = () => $('sidebar').classList.toggle('collapsed');
    setInterval(() => { $('topbarTime').textContent = new Date().toLocaleString('vi-VN'); }, 1000);
    refreshServerStatus();
    state.serverStatusTimer = setInterval(refreshServerStatus, 5000);
  }

  async function init() {
    bindEvents();
    try {
      state.config = await api.loadConfig();
      ['Host', 'Port', 'Database', 'User', 'Password'].forEach((name) => { const el = $(`cfg${name}`); if (el && state.config[name.toLowerCase()]) el.value = state.config[name.toLowerCase()]; });
      if (await api.isConnected()) { $('connectScreen').style.display = 'none'; $('appLayout').style.display = 'flex'; $('dbName').textContent = `${state.config.database}@${state.config.host}`; await navigate('dashboard'); }
    } catch (error) { showError(error); }
  }
  init();
})();
