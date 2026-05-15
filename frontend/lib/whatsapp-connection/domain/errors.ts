export class WhatsAppConnectionError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WhatsAppConnectionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toSafeErrorResponse(error: unknown) {
  if (error instanceof WhatsAppConnectionError) {
    return {
      status: error.status,
      body: {
        success: false,
        code: error.code,
        error: error.message,
        details: error.details,
      },
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    status: 500,
    body: {
      success: false,
      code: "WHATSAPP_CONNECTION_ERROR",
      error: message,
    },
  };
}
