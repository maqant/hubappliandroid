const SECRET_KEYS_REGEX = /apiKey|token|accessToken|refreshToken|sessionToken|authorization|bearer|password|secret|credential|privateKey|clientSecret|cookie|set-cookie|databaseUrl|connectionString/i;

export function sanitizeText(text: string): string {
  if (!text) return "";
  let str = String(text);
  // Redact API Key formats & headers
  str = str.replace(/sk-[a-zA-Z0-9_-]{20,}/gi, "[REDACTED_API_KEY]");
  str = str.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_TOKEN]");
  str = str.replace(/(api_?key|token|auth|password|secret|credential)=([^& \n]+)/gi, "$1=[REDACTED]");
  str = str.replace(/(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}/gi, "[REDACTED_GITHUB_TOKEN]");
  return str;
}

export function sanitizeAnalysisExport<T>(data: T, seen = new WeakSet()): T {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") return sanitizeText(data) as any;
  if (typeof data !== "object") return data;

  if (seen.has(data as object)) return "[Circular]" as any;
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAnalysisExport(item, seen)) as any;
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    if (SECRET_KEYS_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "function") {
      continue;
    } else {
      result[key] = sanitizeAnalysisExport(val, seen);
    }
  }

  return result as T;
}
