package nro.models.admin;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nro.models.boss.Boss;
import nro.models.boss.BossID;
import nro.models.boss.Boss_Manager.BossManager;
import nro.models.boss.Boss_Manager.BrolyManager;
import nro.models.boss.Boss_Manager.ChristmasEventManager;
import nro.models.boss.Boss_Manager.FinalBossManager;
import nro.models.boss.Boss_Manager.GasDestroyManager;
import nro.models.boss.Boss_Manager.HalloweenEventManager;
import nro.models.boss.Boss_Manager.HungVuongEventManager;
import nro.models.boss.Boss_Manager.LunarNewYearEventManager;
import nro.models.boss.Boss_Manager.OtherBossManager;
import nro.models.boss.Boss_Manager.RedRibbonHQManager;
import nro.models.boss.Boss_Manager.SkillSummonedManager;
import nro.models.boss.Boss_Manager.SnakeWayManager;
import nro.models.boss.Boss_Manager.TreasureUnderSeaManager;
import nro.models.boss.Boss_Manager.TrungThuEventManager;
import nro.models.boss.Boss_Manager.YardartManager;
import nro.models.consts.BossStatus;
import nro.models.map.Zone;
import nro.models.map.service.MapService;
import nro.models.player.Inventory;
import nro.models.player.Player;
import nro.models.database.MrBlue;
import nro.models.data.LocalManager;
import nro.models.server.Client;
import nro.models.server.Maintenance;
import nro.models.server.Manager;
import nro.models.server.ServerManager;
import nro.models.database.PlayerDAO;
import nro.models.data.ItemData;
import nro.models.event.EventManager;
import nro.models.network.MySession;
import nro.models.network.SessionManager;
import nro.models.services.InventoryService;
import nro.models.services.ItemService;
import nro.models.services.Service;
import nro.models.utils.SystemMetrics;

public final class AdminCommandService {

	private static final int[] SPAWNABLE_BOSS_IDS = {
		BossID.TIEU_DOI_TRUONG, BossID.TIEU_DOI_TRUONG_NM, BossID.BOJACK,
		BossID.SUPER_BOJACK, BossID.KING_KONG, BossID.XEN_BO_HUNG,
		BossID.SIEU_BO_HUNG, BossID.KUKU, BossID.MAP_DAU_DINH, BossID.RAMBO,
		BossID.FIDE, BossID.ANDROID_14, BossID.DR_KORE, BossID.CUMBER,
		BossID.COOLER, BossID.BLACK_GOKU, BossID.GOLDEN_FRIEZA,
		BossID.SOI_HEC_QUYN1, BossID.AN_TROM, BossID.O_DO1, BossID.BABY,
		BossID.MAT_TROI, BossID.SO_4, BossID.SO_3, BossID.SO_2, BossID.SO_1,
		BossID.ANDROID_13, BossID.ANDROID_15, BossID.ANDROID_19, BossID.PIC,
		BossID.POC
	};

	public Map<String, Object> execute(String action, JsonObject data) throws AdminCommandException {
		if (action == null || action.isBlank()) {
			throw new AdminCommandException("INVALID_COMMAND", "Action is required");
		}
		JsonObject args = data == null ? new JsonObject() : data;
		return switch (action) {
			case "server.status" -> status();
			case "server.broadcast" -> broadcast(requiredString(args, "message", 500));
			case "server.maintenance" -> maintenance(requiredInt(args, "seconds", 5, 600));
			case "server.setExpRate" -> setExpRate(requiredInt(args, "rate", 1, 100));
			case "shop.reload" -> reloadShop();
			case "giftcode.reload" -> reloadGiftCodes();
			case "item.renameCostume" -> renameCostume(requiredInt(args, "itemId", 0, Short.MAX_VALUE), requiredString(args, "name", 100));
			case "event.status" -> eventStatus();
			case "event.set" -> setEvent(requiredString(args, "eventId", 40), requiredBoolean(args, "enabled"));
			case "player.list" -> players();
			case "player.get" -> player(playerId(args));
			case "player.kick" -> kick(playerId(args));
			case "player.ban" -> setAccountBan(requiredInt(args, "accountId", 1, Integer.MAX_VALUE), true);
			case "player.unban" -> setAccountBan(requiredInt(args, "accountId", 1, Integer.MAX_VALUE), false);
			case "player.addGold" -> adjustGold(playerId(args), requiredLong(args, "amount", 1, Integer.MAX_VALUE));
			case "player.removeGold" -> adjustGold(playerId(args), -requiredLong(args, "amount", 1, Integer.MAX_VALUE));
			case "player.applyGold" -> applyGold(playerId(args), requiredNonNegativeLong(args, "gold"));
			case "player.setProgress" -> setProgress(playerId(args), requiredNonNegativeLong(args, "power"), requiredNonNegativeLong(args, "potential"));
			case "player.addItem" -> addItem(playerId(args), requiredInt(args, "itemId", 0, Short.MAX_VALUE), requiredInt(args, "quantity", 1, 100000));
			case "player.removeItem" -> removeItem(playerId(args), requiredInt(args, "itemId", 0, Short.MAX_VALUE), requiredInt(args, "quantity", 1, 100000));
			case "boss.list" -> bosses();
			case "boss.spawn" -> spawnBoss(args);
			case "boss.remove" -> removeBoss(requiredInt(args, "index", 0, Integer.MAX_VALUE));
			default -> throw new AdminCommandException("INVALID_COMMAND", "Command không được hỗ trợ");
		};
	}

	private Map<String, Object> status() {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("state", Maintenance.isRunning ? "maintenance" : "online");
		out.put("success", true);
		out.put("running", ServerManager.isRunning);
		out.put("maintenance", Maintenance.isRunning);
		out.put("maintenanceSeconds", Maintenance.gI().getRemainingSeconds());
		out.put("playerCount", Client.gI().getPlayers().size());
		out.put("uptimeMs", ServerManager.startedAtMillis > 0 ? System.currentTimeMillis() - ServerManager.startedAtMillis : 0);
		out.put("serverName", ServerManager.NAME);
		out.put("gamePort", ServerManager.PORT);
		out.put("expRate", Manager.RATE_EXP_SERVER);
		out.put("metrics", SystemMetrics.snapshot());
		return out;
	}

	private Map<String, Object> players() {
		List<Map<String, Object>> rows = new ArrayList<>();
		for (Player player : new ArrayList<>(Client.gI().getPlayers())) {
			if (player != null && !player.isBot) {
				rows.add(playerSnapshot(player));
			}
		}
		return result("players", rows);
	}

	private Map<String, Object> player(long id) throws AdminCommandException {
		PlayerTarget target = loadPlayer(id);
		try {
			return result("player", playerSnapshot(target.player));
		} finally {
			target.disposeIfOffline();
		}
	}

	private Map<String, Object> kick(long id) throws AdminCommandException {
		Player player = Client.gI().getPlayer(id);
		if (player == null) {
			throw new AdminCommandException("PLAYER_OFFLINE", "Player không online");
		}
		Client.gI().kickSession(player.getSession());
		return ok("Đã kick " + player.name);
	}

	private Map<String, Object> setAccountBan(int accountId, boolean banned) throws AdminCommandException {
		try {
			var account = LocalManager.executeQuery("SELECT id FROM account WHERE id = ?", accountId);
			boolean exists;
			try {
				exists = account.first();
			} finally {
				account.dispose();
			}
			if (!exists) {
				throw new AdminCommandException("PLAYER_NOT_FOUND", "Không tìm thấy tài khoản");
			}
			LocalManager.executeUpdate("UPDATE account SET ban = ? WHERE id = ?", banned ? 1 : 0, accountId);
		} catch (AdminCommandException e) {
			throw e;
		} catch (Exception e) {
			throw new AdminCommandException("INTERNAL_ERROR", "Không thể cập nhật trạng thái tài khoản");
		}
		Player online = Client.gI().getPlayerByUser(accountId);
		if (banned && online != null) {
			Service.gI().sendThongBao(online, "Tài khoản của bạn đã bị khóa.");
			Client.gI().kickSession(online.getSession());
		}
		return ok(banned ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
	}

	private Map<String, Object> adjustGold(long id, long delta) throws AdminCommandException {
		PlayerTarget target = loadPlayer(id);
		try {
			Player player = target.player;
			long next = player.inventory.gold + delta;
			if (next < 0 || next > Inventory.LIMIT_GOLD) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Vàng vượt giới hạn cho phép");
			}
			player.inventory.gold = next;
			if (!target.offline) {
				Service.gI().sendMoney(player);
			}
			PlayerDAO.updatePlayer(player);
			return ok("Đã cập nhật vàng cho " + player.name);
		} finally {
			target.disposeIfOffline();
		}
	}

	private Map<String, Object> applyGold(long id, long gold) throws AdminCommandException {
		if (gold > Inventory.LIMIT_GOLD) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Vàng vượt giới hạn cho phép");
		}
		PlayerTarget target = loadPlayer(id);
		try {
			Player player = target.player;
			player.inventory.gold = gold;
			if (!target.offline) {
				Service.gI().sendMoney(player);
			}
			return ok("Đã cập nhật vàng cho " + player.name);
		} finally {
			target.disposeIfOffline();
		}
	}

	private Map<String, Object> setProgress(long id, long power, long potential) throws AdminCommandException {
		PlayerTarget target = loadPlayer(id);
		try {
			Player player = target.player;
			player.nPoint.power = power;
			player.nPoint.tiemNang = potential;
			player.setClanMember();
			PlayerDAO.updatePlayer(player);
			verifySavedProgress(player.id, power, potential);
			if (!target.offline) {
				Service.gI().point(player);
			}
			return ok("Đã cập nhật tiềm năng và sức mạnh của " + player.name);
		} finally {
			target.disposeIfOffline();
		}
	}

	private void verifySavedProgress(long id, long power, long potential) throws AdminCommandException {
		nro.models.data.LocalResultSet result = null;
		try {
			result = LocalManager.executeQuery("SELECT data_point FROM player WHERE id = ?", id);
			if (!result.first()) {
				throw new AdminCommandException("PLAYER_NOT_FOUND", "Không tìm thấy dữ liệu nhân vật sau khi lưu");
			}
			var points = new JsonParser().parse(result.getString("data_point")).getAsJsonArray();
			if (points.size() < 3 || points.get(1).getAsLong() != power || points.get(2).getAsLong() != potential) {
				throw new AdminCommandException("SAVE_FAILED", "Không thể xác nhận dữ liệu tiềm năng / sức mạnh đã được lưu");
			}
		} catch (AdminCommandException e) {
			throw e;
		} catch (Exception e) {
			throw new AdminCommandException("SAVE_FAILED", "Không thể xác nhận dữ liệu tiềm năng / sức mạnh đã được lưu");
		} finally {
			if (result != null) {
				result.dispose();
			}
		}
	}

	private Map<String, Object> addItem(long playerId, int itemId, int quantity) throws AdminCommandException {
		PlayerTarget target = loadPlayer(playerId);
		try {
			Player player = target.player;
			var item = ItemService.gI().createNewItem((short) itemId, quantity);
			if (item.template == null || item.template.type == 9 || item.template.type == 10 || item.template.type == 34) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Template không phải vật phẩm hành trang; dùng command tiền tệ tương ứng");
			}
			if (!InventoryService.gI().addItemBag(player, item)) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Không thể thêm item vào hành trang");
			}
			if (!target.offline) {
				InventoryService.gI().sendItemBags(player);
			}
			PlayerDAO.updatePlayer(player);
			return ok("Đã thêm item vào hành trang của " + player.name);
		} finally {
			target.disposeIfOffline();
		}
	}

	private Map<String, Object> removeItem(long playerId, int itemId, int quantity) throws AdminCommandException {
		PlayerTarget target = loadPlayer(playerId);
		try {
			Player player = target.player;
			var item = InventoryService.gI().findItemBag(player, itemId);
			if (item == null || item.quantity < quantity) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Item không có đủ số lượng trong hành trang");
			}
			InventoryService.gI().subQuantityItemsBag(player, item, quantity);
			InventoryService.gI().sortItems(player.inventory.itemsBag);
			if (!target.offline) {
				InventoryService.gI().sendItemBags(player);
			}
			PlayerDAO.updatePlayer(player);
			return ok("Đã xóa item khỏi hành trang của " + player.name);
		} finally {
			target.disposeIfOffline();
		}
	}

	private Map<String, Object> bosses() {
		List<BossEntry> snapshot = bossSnapshot();
		List<Map<String, Object>> rows = new ArrayList<>();
		for (int index = 0; index < snapshot.size(); index++) {
			Boss boss = snapshot.get(index).boss;
			if (boss != null) {
				Map<String, Object> row = new LinkedHashMap<>();
				row.put("index", index);
				row.put("id", boss.id);
				row.put("name", safeBossName(boss));
				row.put("status", boss.bossStatus == null ? "UNKNOWN" : boss.bossStatus.name());
				row.put("mapId", boss.zone == null ? -1 : boss.zone.map.mapId);
				row.put("mapName", boss.zone == null ? "" : boss.zone.map.mapName);
				row.put("zoneId", boss.zone == null ? -1 : boss.zone.zoneId);
				rows.add(row);
			}
		}
		Map<String, Object> out = result("bosses", rows);
		out.put("spawnCatalog", spawnCatalog());
		return out;
	}

	private Map<String, Object> spawnBoss(JsonObject data) throws AdminCommandException {
		int bossId = requiredInt(data, "bossId", Integer.MIN_VALUE, Integer.MAX_VALUE);
		Zone spawnZone = null;
		if (data.has("mapId") || data.has("zoneId")) {
			int mapId = requiredInt(data, "mapId", 0, Integer.MAX_VALUE);
			int zoneId = requiredInt(data, "zoneId", 0, Byte.MAX_VALUE);
			spawnZone = MapService.gI().getZoneByMapIDAndZoneID(mapId, zoneId);
			if (spawnZone == null) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Map hoặc khu không tồn tại");
			}
		}
		Boss boss = BossManager.gI().createBoss(bossId);
		if (boss == null) {
			throw new AdminCommandException("BOSS_NOT_FOUND", "Boss ID không được hỗ trợ");
		}
		boss.zoneFinal = spawnZone;
		boss.changeStatus(BossStatus.RESPAWN);
		return ok("Đã gọi spawn " + safeBossName(boss));
	}

	private Map<String, Object> removeBoss(int index) throws AdminCommandException {
		List<BossEntry> snapshot = bossSnapshot();
		if (index >= snapshot.size()) {
			throw new AdminCommandException("BOSS_NOT_FOUND", "Không tìm thấy boss");
		}
		BossEntry entry = snapshot.get(index);
		Boss boss = entry.boss;
		boss.leaveMapNew();
		entry.manager.removeBoss(boss);
		return ok("Đã gỡ " + safeBossName(boss));
	}

	private Map<String, Object> maintenance(int seconds) throws AdminCommandException {
		if (Maintenance.isRunning) {
			throw new AdminCommandException("BUSY", "Server đang trong quá trình bảo trì");
		}
		Maintenance.gI().startSeconds(seconds);
		return ok("Đã bắt đầu đếm ngược bảo trì " + seconds + " giây");
	}

	private Map<String, Object> setExpRate(int rate) {
		Manager.RATE_EXP_SERVER = (byte) rate;
		Map<String, Object> out = ok("Đã cập nhật hệ số tiềm năng toàn server");
		out.put("expRate", rate);
		return out;
	}

	private Map<String, Object> reloadShop() throws AdminCommandException {
		try {
			return reloadResult("shops", nro.models.server.Manager.reloadAdminShop(), "Đã nạp lại Shop runtime");
		} catch (Exception e) {
			throw new AdminCommandException("INTERNAL_ERROR", "Không thể nạp lại Shop runtime");
		}
	}

	private Map<String, Object> reloadGiftCodes() throws AdminCommandException {
		try {
			return reloadResult("giftcodes", nro.models.server.Manager.reloadAdminGiftCodes(), "Đã nạp lại Giftcode runtime");
		} catch (Exception e) {
			throw new AdminCommandException("INTERNAL_ERROR", "Không thể nạp lại Giftcode runtime");
		}
	}

	private Map<String, Object> renameCostume(int itemId, String name) throws AdminCommandException {
		if (itemId >= Manager.ITEM_TEMPLATES.size()) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Không tìm thấy cải trang");
		}
		var template = Manager.ITEM_TEMPLATES.get(itemId);
		if (template.id != itemId || template.type != 5) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Không tìm thấy cải trang");
		}
		template.name = name;

		int updatedClients = 0;
		for (var session : SessionManager.gI().getSessions()) {
			if (session instanceof MySession mySession && mySession.player != null && mySession.isConnected()) {
				ItemData.updateItemTemplate(mySession);
				updatedClients++;
			}
		}
		Map<String, Object> out = ok("Đã cập nhật tên cải trang trong runtime");
		out.put("updatedClients", updatedClients);
		return out;
	}

	private Map<String, Object> reloadResult(String key, int count, String message) {
		Map<String, Object> out = ok(message);
		out.put(key, count);
		return out;
	}

	private Map<String, Object> eventStatus() {
		Map<String, Object> out = ok("Event runtime status");
		List<Map<String, Object>> events = new ArrayList<>();
		for (String[] event : new String[][]{
			{"lunar_new_year", "Tết"}, {"halloween", "Halloween"}, {"christmas", "Noel"},
			{"hung_vuong", "Hùng Vương"}, {"trung_thu", "Trung Thu"}
		}) {
			events.add(Map.of("id", event[0], "name", event[1], "enabled", EventManager.gI().isEnabled(event[0]), "supported", true));
		}
		out.put("events", events);
		out.put("unsupported", List.of("Quốc tế phụ nữ", "Top-up"));
		return out;
	}

	private Map<String, Object> setEvent(String eventId, boolean enabled) throws AdminCommandException {
		if (!List.of("lunar_new_year", "halloween", "christmas", "hung_vuong", "trung_thu").contains(eventId)) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Event này chưa được hỗ trợ runtime");
		}
		boolean active = EventManager.gI().setEnabled(eventId, enabled);
		Map<String, Object> out = ok((active ? "Đã bật event " : "Đã tắt event ") + eventName(eventId));
		out.put("enabled", active);
		return out;
	}

	private String eventName(String eventId) {
		return switch (eventId) {
			case "lunar_new_year" -> "Tết";
			case "halloween" -> "Halloween";
			case "christmas" -> "Noel";
			case "hung_vuong" -> "Hùng Vương";
			case "trung_thu" -> "Trung Thu";
			default -> eventId;
		};
	}

	private Map<String, Object> broadcast(String message) {
		Service.gI().sendThongBaoAllPlayer(message);
		return ok("Đã gửi thông báo tới toàn server");
	}

	private PlayerTarget loadPlayer(long id) throws AdminCommandException {
		Player online = Client.gI().getPlayer(id);
		if (online != null) {
			return new PlayerTarget(online, false);
		}
		Player offline = MrBlue.loadById(id);
		if (offline == null) {
			throw new AdminCommandException("PLAYER_NOT_FOUND", "Không tìm thấy player");
		}
		return new PlayerTarget(offline, true);
	}

	private Map<String, Object> playerSnapshot(Player player) {
		Map<String, Object> row = new LinkedHashMap<>();
		row.put("id", player.id);
		row.put("name", player.name);
		row.put("gold", player.inventory.gold);
		row.put("power", Long.toString(player.nPoint.power));
		row.put("potential", Long.toString(player.nPoint.tiemNang));
		row.put("mapId", player.zone == null ? -1 : player.zone.map.mapId);
		row.put("mapName", player.zone == null ? "" : player.zone.map.mapName);
		row.put("zoneId", player.zone == null ? -1 : player.zone.zoneId);
		row.put("status", player.isOffline ? "offline" : player.isDie() ? "dead" : "online");
		return row;
	}

	private List<Map<String, Object>> spawnCatalog() {
		List<Map<String, Object>> catalog = new ArrayList<>();
		for (int bossId : SPAWNABLE_BOSS_IDS) {
			String name = "Boss #" + bossId;
			for (Field field : BossID.class.getDeclaredFields()) {
				try {
					if (Modifier.isStatic(field.getModifiers()) && field.getType() == int.class && field.getInt(null) == bossId) {
						name = field.getName();
						break;
					}
				} catch (IllegalAccessException ignored) {
				}
			}
			Map<String, Object> row = new LinkedHashMap<>();
			row.put("id", bossId);
			row.put("name", name);
			catalog.add(row);
		}
		return catalog;
	}

	private List<BossEntry> bossSnapshot() {
		List<BossEntry> entries = new ArrayList<>();
		for (BossManager manager : List.of(BossManager.gI(), OtherBossManager.gI(), BrolyManager.gI(),
				FinalBossManager.gI(), YardartManager.gI(), SkillSummonedManager.gI(),
				RedRibbonHQManager.gI(), TreasureUnderSeaManager.gI(), SnakeWayManager.gI(),
				GasDestroyManager.gI(), LunarNewYearEventManager.gI(), HalloweenEventManager.gI(),
				ChristmasEventManager.gI(), HungVuongEventManager.gI(), TrungThuEventManager.gI())) {
			for (Boss boss : new ArrayList<>(manager.getBosses())) {
				if (boss != null) {
					entries.add(new BossEntry(manager, boss));
				}
			}
		}
		return entries;
	}

	private record BossEntry(BossManager manager, Boss boss) {
	}

	private record PlayerTarget(Player player, boolean offline) {
		private void disposeIfOffline() {
			if (offline) {
				player.dispose();
			}
		}
	}

	private String safeBossName(Boss boss) {
		if (boss.name != null && !boss.name.isBlank()) {
			return boss.name;
		}
		return boss.data != null && boss.data.length > 0 ? boss.data[0].getName() : "Boss #" + boss.id;
	}

	private static long playerId(JsonObject data) throws AdminCommandException {
		return requiredLong(data, "playerId", 1, Long.MAX_VALUE);
	}

	private static int requiredInt(JsonObject data, String key, int min, int max) throws AdminCommandException {
		long value = requiredLong(data, key, min, max);
		return (int) value;
	}

	private static long requiredLong(JsonObject data, String key, long min, long max) throws AdminCommandException {
		JsonElement value = data.get(key);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " phải là số");
		}
		try {
			long number = value.getAsLong();
			if (number < min || number > max) {
				throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " ngoài giới hạn");
			}
			return number;
		} catch (NumberFormatException e) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " không hợp lệ");
		}
	}

	private static long requiredNonNegativeLong(JsonObject data, String key) throws AdminCommandException {
		JsonElement value = data.get(key);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " phải là số nguyên");
		}
		String text = value.getAsString();
		if (!text.matches("[0-9]{1,19}")) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " không hợp lệ");
		}
		try {
			return Long.parseLong(text);
		} catch (NumberFormatException e) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " ngoài giới hạn");
		}
	}

	private static String requiredString(JsonObject data, String key, int maxLength) throws AdminCommandException {
		JsonElement value = data.get(key);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " là bắt buộc");
		}
		String text = value.getAsString().trim();
		if (text.isEmpty() || text.length() > maxLength) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " không hợp lệ");
		}
		return text;
	}

	private static boolean requiredBoolean(JsonObject data, String key) throws AdminCommandException {
		JsonElement value = data.get(key);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean()) {
			throw new AdminCommandException("INVALID_ARGUMENT", "Trường " + key + " phải là true/false");
		}
		return value.getAsBoolean();
	}

	private static Map<String, Object> result(String key, Object value) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("success", true);
		out.put(key, value);
		return out;
	}

	private static Map<String, Object> ok(String message) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("success", true);
		out.put("message", message);
		return out;
	}
}
