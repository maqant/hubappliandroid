// ============================================
// Security utilities
// ============================================

/** Redact sensitive values from log output */
export function redactForLogs(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ["apiKey", "api_key", "secret", "password", "token", "authorization"];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = redactForLogs(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/** Sanitize user input to prevent prompt injection */
export function sanitizeInput(input: string): string {
  // Remove potential system prompt overrides
  return input
    .replace(/\[SYSTEM\]/gi, "[INPUT]")
    .replace(/\[INST\]/gi, "[INPUT]")
    .replace(/<\|im_start\|>/gi, "")
    .replace(/<\|im_end\|>/gi, "")
    .trim();
}

/** Validate that a string doesn't contain executable patterns */
export function isCleanContent(content: string): boolean {
  const dangerousPatterns = [/javascript:/i, /data:text\/html/i, /<script/i, /on\w+\s*=/i];
  return !dangerousPatterns.some((p) => p.test(content));
}

/** Create a safe error response without stack traces */
export function safeError(code: string, message: string, details?: Record<string, unknown>) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
