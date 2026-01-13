import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import type { JiraEditMetaResponse, JiraEditMetaField } from "../api/types"

export interface CachedEditableField {
  id: string
  name: string
  allowedValues?: Array<{ id?: string; name?: string; value?: string; key?: string }>
}

export interface ProjectIssueTypeKey {
  baseUrl: string
  mode: "cloud" | "onprem"
  projectKey: string
  issueType: string
}

export interface FieldsCacheData {
  version: 1
  entries: Record<string, Record<string, CachedEditableField>>
}

const CONFIG_DIR = join(homedir(), ".config", "jiratui")
const CACHE_FILE = join(CONFIG_DIR, "fields-cache.json")

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadRaw(): FieldsCacheData {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as FieldsCacheData
      if (data && typeof data === "object" && data.entries) return data
    }
  } catch {}
  return { version: 1, entries: {} }
}

function saveRaw(data: FieldsCacheData): void {
  try {
    ensureDir()
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8")
  } catch {}
}

export function makeKey(k: ProjectIssueTypeKey): string {
  return `${k.baseUrl}|${k.mode}|${k.projectKey}|${k.issueType}`
}

export function putEditMeta(key: ProjectIssueTypeKey, editmeta: JiraEditMetaResponse): void {
  const data = loadRaw()
  const k = makeKey(key)
  const fields: Record<string, CachedEditableField> = {}
  for (const [fid, f] of Object.entries(editmeta.fields)) {
    fields[fid] = {
      id: fid,
      name: f.name,
      allowedValues: f.allowedValues,
    }
  }
  data.entries[k] = fields
  saveRaw(data)
}

export function getFields(key: ProjectIssueTypeKey): Record<string, CachedEditableField> | null {
  const data = loadRaw()
  const k = makeKey(key)
  return data.entries[k] ?? null
}

export function findFieldIdByName(
  key: ProjectIssueTypeKey,
  name: string
): string | null {
  const fields = getFields(key)
  if (!fields) return null
  const lower = name.toLowerCase()
  for (const [fid, f] of Object.entries(fields)) {
    if (f.name.toLowerCase() === lower) return fid
  }
  return null
}

export function getAllowedValues(
  key: ProjectIssueTypeKey,
  fieldNameOrId: string
): Array<{ id?: string; name?: string; value?: string; key?: string }> | null {
  const fields = getFields(key)
  if (!fields) return null
  if (fields[fieldNameOrId]) return fields[fieldNameOrId].allowedValues ?? null
  const lower = fieldNameOrId.toLowerCase()
  for (const f of Object.values(fields)) {
    if (f.name.toLowerCase() === lower) return f.allowedValues ?? null
  }
  return null
}
