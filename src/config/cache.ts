import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"

export interface CachedCredentials {
  baseUrl?: string
  username?: string
}

const CONFIG_DIR = join(homedir(), ".config", "jiratui")
const CACHE_FILE = join(CONFIG_DIR, "credentials.json")

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function loadCachedCredentials(): CachedCredentials {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = readFileSync(CACHE_FILE, "utf-8")
      return JSON.parse(data) as CachedCredentials
    }
  } catch {
    // Ignore errors, return empty
  }
  return {}
}

export function saveCachedCredentials(creds: CachedCredentials): void {
  try {
    ensureConfigDir()
    writeFileSync(CACHE_FILE, JSON.stringify(creds, null, 2), "utf-8")
  } catch {
    // Ignore errors silently
  }
}
