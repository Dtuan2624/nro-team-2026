const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = 14446;
const BRIDGE_TOKEN_FILES = [
  path.resolve(__dirname, '..', '..', '..', 'admin-bridge.token'),
  path.resolve(process.cwd(), 'admin-bridge.token'),
  path.resolve(process.cwd(), '..', 'admin-bridge.token'),
  path.resolve(process.cwd(), '..', '..', 'admin-bridge.token'),
];
const COMMANDS = new Set([
  'server.status', 'server.broadcast', 'server.maintenance', 'server.setExpRate', 'shop.reload', 'giftcode.reload', 'event.status', 'event.set',
  'item.renameCostume',
  'player.list', 'player.get', 'player.kick', 'player.ban', 'player.unban', 'player.addGold', 'player.removeGold',
  'player.applyGold', 'player.setProgress', 'player.addItem', 'player.removeItem', 'boss.list', 'boss.spawn', 'boss.remove',
]);

function failure(code, message, requestId) {
  return { success: false, code, message, requestId };
}

function send(payload) {
  let token;
  for (const tokenPath of BRIDGE_TOKEN_FILES) {
    try {
      token = fs.readFileSync(tokenPath, 'utf8').trim();
      if (token) break;
    } catch (_) { }
  }
  if (!token) return Promise.resolve(failure('BRIDGE_TOKEN_MISSING', 'Không tìm thấy admin-bridge.token trong thư mục server hoặc thư mục chạy Panel'));

  const body = Buffer.from(JSON.stringify(payload));
  return new Promise((resolve) => {
    const request = http.request({
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: '/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'X-Admin-Token': token,
        'X-Request-Id': payload.requestId,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode === 401) result.code = 'AUTH_FAILED';
          resolve(result);
        } catch (_) {
          resolve(failure('INTERNAL_ERROR', 'Phản hồi bridge không hợp lệ', payload.requestId));
        }
      });
    });

    request.setTimeout(4000, () => {
      request.destroy(Object.assign(new Error('Bridge request timed out'), { code: 'TIMEOUT' }));
    });
    request.on('error', (error) => {
      const offline = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND'].includes(error.code);
      resolve(failure(offline ? 'SERVER_OFFLINE' : error.code === 'TIMEOUT' ? 'TIMEOUT' : 'CONNECTION_ERROR',
        offline ? 'Java server đang offline' : error.code === 'TIMEOUT' ? 'Java server phản hồi quá thời gian' : 'Không thể kết nối Admin Bridge',
        payload.requestId));
    });
    request.end(body);
  });
}

async function command(action, data = {}) {
  if (typeof action !== 'string' || !COMMANDS.has(action)) {
    return failure('INVALID_COMMAND', 'Command không được hỗ trợ');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return failure('INVALID_ARGUMENT', 'Dữ liệu command không hợp lệ');
  }
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch (_) {
    return failure('INVALID_ARGUMENT', 'Dữ liệu command không hợp lệ');
  }
  if (Buffer.byteLength(serialized, 'utf8') > 60000) {
    return failure('INVALID_ARGUMENT', 'Dữ liệu command quá lớn');
  }
  return send({ action, requestId: `REQ-${crypto.randomUUID()}`, data });
}

module.exports = { command };
