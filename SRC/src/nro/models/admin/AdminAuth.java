package nro.models.admin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;

public final class AdminAuth {

	public static final String BIND_HOST = "127.0.0.1";
	public static final int PORT = nro.models.server.ServerManager.ADMIN_BRIDGE_PORT;
	public static final String TOKEN_HEADER = "X-Admin-Token";
	private static final Path TOKEN_FILE = Path.of("admin-bridge.token");
	private static String token;

	private AdminAuth() {
	}

	public static synchronized String token() {
		if (token == null || token.isBlank()) {
			token = loadOrCreateToken();
		}
		return token;
	}

	public static boolean matches(String provided) {
		if (provided == null || provided.isBlank()) {
			return false;
		}
		String expected = token();
		if (expected.length() != provided.length()) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < expected.length(); i++) {
			diff |= expected.charAt(i) ^ provided.charAt(i);
		}
		return diff == 0;
	}

	private static String loadOrCreateToken() {
		try {
			if (Files.exists(TOKEN_FILE)) {
				String existing = Files.readString(TOKEN_FILE, StandardCharsets.UTF_8).trim();
				if (!existing.isBlank()) {
					return existing;
				}
			}
			String generated = randomToken();
			Files.writeString(TOKEN_FILE, generated, StandardCharsets.UTF_8);
			return generated;
		} catch (IOException e) {
			throw new IllegalStateException("Cannot create admin bridge token", e);
		}
	}

	private static String randomToken() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		StringBuilder result = new StringBuilder(bytes.length * 2);
		for (byte value : bytes) {
			result.append(String.format("%02x", value));
		}
		return result.toString();
	}
}
