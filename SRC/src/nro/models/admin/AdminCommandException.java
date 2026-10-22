package nro.models.admin;

public final class AdminCommandException extends Exception {

	public final String code;

	public AdminCommandException(String code, String message) {
		super(message);
		this.code = code;
	}
}
