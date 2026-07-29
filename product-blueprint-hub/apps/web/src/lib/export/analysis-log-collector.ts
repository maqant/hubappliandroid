export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogCategory =
  | "WORKSHOP"
  | "GENERATION"
  | "PROVIDER"
  | "PROMPT"
  | "PARSING"
  | "VALIDATION"
  | "PERSISTENCE"
  | "EXPERIENCE_PATH"
  | "CARTOGRAPHY"
  | "DEEPEN"
  | "ALTERNATIVES"
  | "EXPORT"
  | "UI"
  | "UNHANDLED_ERROR";

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  operation?: string;
  operationId?: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  promptId?: string;
  promptVersion?: number;
  layer?: string;
  proposalId?: string;
  canonicalNodeId?: string;
  pathId?: string;
  pipelineStep?: string;
  message: string;
  context?: Record<string, any>;
  durationMs?: number | null;
  error?: {
    name?: string;
    message?: string;
    code?: string;
    stack?: string;
  };
}

const MAX_ENTRIES = 2000;
const MAX_CONTEXT_LENGTH = 20000;

class AnalysisLogCollector {
  private entries: LogEvent[] = [];
  private isInitialized = false;
  private isTruncated = false;
  private sessionId = "";
  private sessionStartedAt = "";
  private originalConsole: {
    log?: typeof console.log;
    info?: typeof console.info;
    warn?: typeof console.warn;
    error?: typeof console.error;
    debug?: typeof console.debug;
  } = {};

  init() {
    if (this.isInitialized || typeof window === "undefined") return;
    this.isInitialized = true;
    this.sessionId = "sess-" + Math.random().toString(36).substring(2, 9);
    this.sessionStartedAt = new Date().toISOString();

    // Hook uncaught errors
    window.addEventListener("error", (event) => {
      this.addEntry({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        category: "UNHANDLED_ERROR",
        message: event.message || "Unhandled Window Error",
        error: {
          name: event.error?.name || "Error",
          message: event.message,
          stack: event.error?.stack,
        },
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      this.addEntry({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        category: "UNHANDLED_ERROR",
        message: typeof reason === "string" ? reason : reason?.message || "Unhandled Promise Rejection",
        error: {
          name: reason?.name || "UnhandledRejection",
          message: typeof reason === "string" ? reason : reason?.message,
          stack: reason?.stack,
        },
      });
    });

    // Intercept console safely
    this.originalConsole.log = console.log;
    this.originalConsole.info = console.info;
    this.originalConsole.warn = console.warn;
    this.originalConsole.error = console.error;
    this.originalConsole.debug = console.debug;

    const self = this;

    const wrapMethod = (level: LogLevel, origFn: Function | undefined) => {
      return function (...args: any[]) {
        if (origFn) {
          origFn.apply(console, args);
        }
        try {
          self.captureConsoleCall(level, args);
        } catch {
          // Prevent any log collector exception from crashing application
        }
      };
    };

    console.log = wrapMethod("INFO", this.originalConsole.log);
    console.info = wrapMethod("INFO", this.originalConsole.info);
    console.warn = wrapMethod("WARN", this.originalConsole.warn);
    console.error = wrapMethod("ERROR", this.originalConsole.error);
    console.debug = wrapMethod("DEBUG", this.originalConsole.debug);

    this.addEntry({
      timestamp: this.sessionStartedAt,
      level: "INFO",
      category: "EXPORT",
      message: "Analysis log collector initialized.",
      sessionId: this.sessionId,
    });
  }

  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      sessionStartedAt: this.sessionStartedAt,
      isTruncated: this.isTruncated,
      entryCount: this.entries.length,
    };
  }

  addEntry(entry: Partial<LogEvent> & { message: string; level: LogLevel }) {
    const sanitizedMsg = this.sanitizeText(entry.message);
    const sanitizedContext = entry.context ? this.sanitizeObject(entry.context) : undefined;

    const fullEntry: LogEvent = {
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      category: entry.category || "UI",
      operation: entry.operation,
      operationId: entry.operationId,
      sessionId: entry.sessionId || this.sessionId,
      projectId: entry.projectId,
      agentId: entry.agentId,
      promptId: entry.promptId,
      promptVersion: entry.promptVersion,
      layer: entry.layer,
      proposalId: entry.proposalId,
      canonicalNodeId: entry.canonicalNodeId,
      pathId: entry.pathId,
      pipelineStep: entry.pipelineStep,
      message: sanitizedMsg,
      context: sanitizedContext,
      durationMs: entry.durationMs,
      error: entry.error
        ? {
            name: entry.error.name,
            message: this.sanitizeText(entry.error.message || ""),
            code: entry.error.code,
            stack: this.sanitizeText(entry.error.stack || ""),
          }
        : undefined,
    };

    this.entries.push(fullEntry);
    this.enforceLimits();
  }

  getEntries(includeDebug = false): LogEvent[] {
    if (includeDebug) return [...this.entries];
    return this.entries.filter((e) => e.level !== "DEBUG");
  }

  getStatistics() {
    let debug = 0, info = 0, warn = 0, error = 0;
    let unhandledErrors = 0, unhandledRejections = 0;

    for (const e of this.entries) {
      if (e.level === "DEBUG") debug++;
      if (e.level === "INFO") info++;
      if (e.level === "WARN") warn++;
      if (e.level === "ERROR") {
        error++;
        if (e.category === "UNHANDLED_ERROR") unhandledErrors++;
      }
    }

    return { debug, info, warn, error, unhandledErrors, unhandledRejections };
  }

  clear() {
    this.entries = [];
    this.isTruncated = false;
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: "INFO",
      category: "EXPORT",
      message: "Console logs cleared by user.",
    });
  }

  private captureConsoleCall(level: LogLevel, args: any[]) {
    if (!args || args.length === 0) return;
    const first = args[0];
    let msg = typeof first === "string" ? first : "";
    if (!msg) {
      try {
        msg = JSON.stringify(first);
      } catch {
        msg = String(first);
      }
    }

    let category: LogCategory = "UI";
    if (msg.includes("[WORKSHOP]")) category = "WORKSHOP";
    else if (msg.includes("[GENERATION]")) category = "GENERATION";
    else if (msg.includes("[PROVIDER]")) category = "PROVIDER";
    else if (msg.includes("[EXPERIENCE_PATH]")) category = "EXPERIENCE_PATH";
    else if (msg.includes("[CARTOGRAPHY]")) category = "CARTOGRAPHY";
    else if (msg.includes("[EXPORT]")) category = "EXPORT";

    let context: Record<string, any> | undefined = undefined;
    if (args.length > 1) {
      context = {};
      args.slice(1).forEach((arg, i) => {
        if (arg instanceof Error) {
          context![`arg_${i}`] = { name: arg.name, message: arg.message, stack: arg.stack };
        } else if (typeof arg === "object" && arg !== null) {
          context![`arg_${i}`] = arg;
        } else {
          context![`arg_${i}`] = String(arg);
        }
      });
    }

    this.addEntry({
      timestamp: new Date().toISOString(),
      level,
      category,
      message: msg,
      context,
    });
  }

  private enforceLimits() {
    if (this.entries.length > MAX_ENTRIES) {
      this.isTruncated = true;
      // Preserve WARN and ERROR entries if possible
      const preserved = this.entries.filter((e) => e.level === "WARN" || e.level === "ERROR");
      const others = this.entries.filter((e) => e.level !== "WARN" && e.level !== "ERROR");
      
      const removeCount = this.entries.length - MAX_ENTRIES;
      others.splice(0, removeCount);
      
      this.entries = [...others, ...preserved].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
  }

  private sanitizeText(text: string): string {
    if (!text) return "";
    let str = text;
    // Redact secret patterns
    str = str.replace(/sk-[a-zA-Z0-9_-]{20,}/gi, "[REDACTED_API_KEY]");
    str = str.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_TOKEN]");
    str = str.replace(/(api_?key|token|auth|password|secret)=([^& \n]+)/gi, "$1=[REDACTED]");
    if (str.length > MAX_CONTEXT_LENGTH) {
      str = str.substring(0, MAX_CONTEXT_LENGTH) + " ... [TRUNCATED]";
    }
    return str;
  }

  private sanitizeObject(obj: any, seen = new WeakSet()): any {
    if (!obj || typeof obj !== "object") {
      if (typeof obj === "string") return this.sanitizeText(obj);
      return obj;
    }
    if (seen.has(obj)) {
      if (obj.id && typeof obj.id === "string") return { $ref: obj.id };
      return undefined;
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.slice(0, 50).map((item) => this.sanitizeObject(item, seen)).filter(item => item !== undefined);
    }


    const res: Record<string, any> = {};
    const secretKeysRegex = /apiKey|token|accessToken|refreshToken|sessionToken|authorization|bearer|password|secret|credential|privateKey|clientSecret|cookie|set-cookie|databaseUrl|connectionString/i;

    for (const [key, val] of Object.entries(obj)) {
      if (secretKeysRegex.test(key)) {
        res[key] = "[REDACTED]";
      } else if (typeof val === "function") {
        continue;
      } else if (typeof val === "object" && val !== null) {
        res[key] = this.sanitizeObject(val, seen);
      } else if (typeof val === "string") {
        res[key] = this.sanitizeText(val);
      } else {
        res[key] = val;
      }
    }
    return res;
  }
}

export const analysisLogCollector = new AnalysisLogCollector();
