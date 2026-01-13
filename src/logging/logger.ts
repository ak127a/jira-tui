import { mkdirSync, existsSync, appendFileSync } from "fs"
import { dirname, join } from "path"

export type LogLevel = "debug" | "info" | "warn" | "error"

interface LoggerOptions {
  readonly logDir?: string
  readonly filePath?: string
  readonly level?: LogLevel
}

function redact(input: unknown): string {
  const str = typeof input === "string" ? input : JSON.stringify(input)
  if (!str) return ""
  return str
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>")
    .replace(/("?(token|password|authorization|auth|pwd|secret)"?\s*[:=]\s*)("[^"]+"|[^\s"']+)/gi, (_m, g1) => `${g1}<redacted>`)
}

// UTC timestamp for log lines
function timestamp(): string {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mi = String(d.getUTCMinutes()).padStart(2, "0")
  const ss = String(d.getUTCSeconds()).padStart(2, "0")
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}Z`
}

// UTC timestamp for filename: YYYY-MM-DDTHH_MMZ.log
function filenameTimestamp(): string {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mi = String(d.getUTCMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}_${mi}Z.log`
}

export class Logger {
  private readonly level: LogLevel
  private readonly logFile: string

  constructor(options: LoggerOptions = {}) {
    const logDir = options.logDir ?? join(process.cwd(), "logs")
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    const defaultFile = join(logDir, filenameTimestamp())
    this.logFile = options.filePath ?? defaultFile
    const dir = dirname(this.logFile)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.level = options.level ?? "info"
  }

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
    return order[level] >= order[this.level]
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    if (!this.shouldLog(level)) return
    const safeMeta = meta === undefined ? "" : ` ${redact(meta)}`
    const line = `[${timestamp()}] ${level.toUpperCase()} ${message}${safeMeta}\n`
    try {
      appendFileSync(this.logFile, line, { encoding: "utf8" })
    } catch (e) {
      try { (process.stderr as unknown as { write: (s: string) => void }).write(line) } catch (_e) { const _unused = _e }
    }
  }

  debug(message: string, meta?: unknown): void { this.write("debug", message, meta) }
  info(message: string, meta?: unknown): void { this.write("info", message, meta) }
  warn(message: string, meta?: unknown): void { this.write("warn", message, meta) }
  error(message: string, meta?: unknown): void { this.write("error", message, meta) }
}

export const logger = new Logger()
