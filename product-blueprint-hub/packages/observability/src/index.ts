// ============================================
// Structured Logger — no sensitive data
// ============================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private level: LogLevel = "INFO";
  private entries: LogEntry[] = [];

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("ERROR", message, context);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
    if (levels.indexOf(level) < levels.indexOf(this.level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
    this.entries.push(entry);

    if (typeof console !== "undefined") {
      const method = level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
      console[method](`[${level}] ${message}`, context ?? "");
    }
  }
}

export const logger = new Logger();
