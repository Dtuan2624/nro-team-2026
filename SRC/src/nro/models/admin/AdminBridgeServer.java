package nro.models.admin;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import nro.models.utils.Logger;

public final class AdminBridgeServer {

	private static AdminBridgeServer instance;
	private HttpServer httpServer;
	private ExecutorService executor;
	private final Gson gson = new Gson();
	private final AdminCommandService commands = new AdminCommandService();

	public static synchronized AdminBridgeServer gI() {
		if (instance == null) {
			instance = new AdminBridgeServer();
		}
		return instance;
	}

	public synchronized void start() {
		if (httpServer != null) {
			return;
		}
		try {
			AdminAuth.token();
			httpServer = HttpServer.create(new InetSocketAddress(AdminAuth.BIND_HOST, AdminAuth.PORT), 0);
			httpServer.createContext("/command", this::handleCommand);
			executor = Executors.newSingleThreadExecutor(runnable -> {
				Thread thread = new Thread(runnable, "AdminBridge");
				thread.setDaemon(true);
				return thread;
			});
			httpServer.setExecutor(executor);
			httpServer.start();
			Logger.success("[ADMIN] CONNECTED " + AdminAuth.BIND_HOST + ":" + AdminAuth.PORT + "\n");
		} catch (Exception e) {
			httpServer = null;
			if (executor != null) {
				executor.shutdownNow();
				executor = null;
			}
			Logger.error("[ADMIN] ERROR bridge start: " + e.getMessage() + "\n");
		}
	}

	public synchronized void stop() {
		if (httpServer != null) {
			httpServer.stop(0);
			httpServer = null;
		}
		if (executor != null) {
			executor.shutdownNow();
			executor = null;
		}
	}

	private void handleCommand(HttpExchange exchange) throws IOException {
		String requestId = exchange.getRequestHeaders().getFirst("X-Request-Id");
		if (requestId == null || !requestId.matches("[A-Za-z0-9-]{1,80}")) {
			requestId = "REQ-INVALID";
		}
		if (!"POST".equals(exchange.getRequestMethod())) {
			send(exchange, 405, error(requestId, "INVALID_COMMAND", "Method không hợp lệ"));
			return;
		}
		String providedToken = exchange.getRequestHeaders().getFirst(AdminAuth.TOKEN_HEADER);
		if (!AdminAuth.matches(providedToken)) {
			Logger.error("[ADMIN][" + requestId + "] ERROR AUTH_FAILED\n");
			send(exchange, 401, error(requestId, "AUTH_FAILED", "Không có quyền thực hiện thao tác này"));
			return;
		}
		JsonObject body;
		try {
			byte[] raw = exchange.getRequestBody().readNBytes(65537);
			if (raw.length > 65536) {
				send(exchange, 413, error(requestId, "INVALID_ARGUMENT", "Request quá lớn"));
				return;
			}
			body = new JsonParser().parse(new String(raw, StandardCharsets.UTF_8)).getAsJsonObject();
		} catch (Exception e) {
			send(exchange, 400, error(requestId, "INVALID_ARGUMENT", "Payload không hợp lệ"));
			return;
		}

		String bodyRequestId = body.has("requestId") && body.get("requestId").isJsonPrimitive()
				? body.get("requestId").getAsString() : requestId;
		if (!bodyRequestId.matches("[A-Za-z0-9-]{1,80}")) {
			send(exchange, 400, error(requestId, "INVALID_ARGUMENT", "requestId không hợp lệ"));
			return;
		}
		String action = body.has("action") && body.get("action").isJsonPrimitive()
				? body.get("action").getAsString() : "";
		JsonObject data = body.has("data") && body.get("data").isJsonObject()
				? body.getAsJsonObject("data") : new JsonObject();
		Logger.log("[ADMIN][" + bodyRequestId + "] " + action + "\n");
		try {
			Map<String, Object> response = new LinkedHashMap<>(commands.execute(action, data));
			response.put("requestId", bodyRequestId);
			Logger.success("[ADMIN][" + bodyRequestId + "] SUCCESS " + action + "\n");
			send(exchange, 200, response);
		} catch (AdminCommandException e) {
			Logger.error("[ADMIN][" + bodyRequestId + "] ERROR " + action + " " + e.code + "\n");
			send(exchange, statusCode(e.code), error(bodyRequestId, e.code, e.getMessage()));
		} catch (Exception e) {
			Logger.logException(AdminBridgeServer.class, e);
			Logger.error("[ADMIN][" + bodyRequestId + "] ERROR " + action + " INTERNAL_ERROR\n");
			send(exchange, 500, error(bodyRequestId, "INTERNAL_ERROR", "Không thể thực hiện thao tác"));
		}
	}

	private int statusCode(String code) {
		return switch (code) {
			case "AUTH_FAILED" -> 401;
			case "PLAYER_NOT_FOUND", "PLAYER_OFFLINE", "BOSS_NOT_FOUND" -> 404;
			case "BUSY" -> 409;
			case "INVALID_COMMAND", "INVALID_ARGUMENT" -> 400;
			default -> 500;
		};
	}

	private Map<String, Object> error(String requestId, String code, String message) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("success", false);
		out.put("requestId", requestId);
		out.put("code", code);
		out.put("message", message);
		return out;
	}

	private void send(HttpExchange exchange, int status, Object body) throws IOException {
		byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		exchange.sendResponseHeaders(status, bytes.length);
		try (var output = exchange.getResponseBody()) {
			output.write(bytes);
		}
	}
}
