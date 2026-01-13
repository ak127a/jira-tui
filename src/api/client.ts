import type { JiraConfig } from "../config/types"
import type {
  JiraIssue,
  JiraProject,
  JiraSearchResponse,
  SearchOptions,
  JiraField,
} from "./types"
import { logger } from "../logging/logger"

export interface FieldOption {
  id: string
  value: string
  name?: string
}

export interface JiraClient {
  readonly config: JiraConfig
  readonly isCloud: boolean

  validateConnection(): Promise<void>
  getProjects(): Promise<JiraProject[]>
  searchIssues(options: SearchOptions): Promise<JiraSearchResponse>
  getProjectIssues(projectKey: string, options?: Omit<SearchOptions, "jql">): Promise<JiraSearchResponse>
  updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void>
  getFieldOptions(fieldName: string, projectKey?: string): Promise<FieldOption[]>
  getFieldId(fieldName: string): Promise<string | null>
  getFields(): Promise<JiraField[]>
  getIssueEditMeta(issueKey: string): Promise<import("./types").JiraEditMetaResponse>
}

abstract class BaseJiraClient implements JiraClient {
  constructor(public readonly config: JiraConfig) {}

  get isCloud(): boolean {
    return this.config.mode === "cloud"
  }

  protected get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, "")
  }

  protected get authHeader(): string {
    const credentials = Buffer.from(
      `${this.config.username}:${this.config.password}`
    ).toString("base64")
    return `Basic ${credentials}`
  }

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const method = (options.method ?? "GET").toString()
    const start = Date.now()
    logger.debug("HTTP request", { url, method })

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
      })
      clearTimeout(timeoutId)

      const durationMs = Date.now() - start
      if (!response.ok) {
        const errorText = await response.text()
        logger.warn("HTTP non-OK response", { url, method, status: response.status, durationMs })
        throw new JiraApiError(
          `JIRA API Error: ${response.status} ${response.statusText}`,
          response.status,
          errorText
        )
      }

      logger.debug("HTTP response", { url, method, status: response.status, durationMs })
      return response.json() as Promise<T>
    } catch (err) {
      clearTimeout(timeoutId)
      const durationMs = Date.now() - start
      if (err instanceof Error && err.name === "AbortError") {
        logger.error("HTTP request aborted/timeout", { url, method, durationMs })
        throw new JiraApiError("Request timed out", 408, "")
      }
      logger.error("HTTP request failed", { url, method, durationMs, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  abstract validateConnection(): Promise<void>
  abstract getProjects(): Promise<JiraProject[]>
  abstract searchIssues(options: SearchOptions): Promise<JiraSearchResponse>
  abstract updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void>
  abstract getFieldOptions(fieldKey: string, projectKey?: string): Promise<FieldOption[]>
  abstract getFieldId(fieldName: string): Promise<string | null>
  abstract getFields(): Promise<JiraField[]>
  abstract getIssueEditMeta(issueKey: string): Promise<import("./types").JiraEditMetaResponse>

  async getProjectIssues(
    projectKey: string,
    options: Omit<SearchOptions, "jql"> = {}
  ): Promise<JiraSearchResponse> {
    logger.info("Fetching project issues", { projectKey, options: { ...options, fields: options.fields } })
    return this.searchIssues({
      ...options,
      jql: `project = ${projectKey} ORDER BY created DESC`,
      fields: options.fields ?? ["summary", "status", "created"],
    })
  }
}

class CloudJiraClient extends BaseJiraClient {
  private readonly apiVersion = "3"

  private get apiBase(): string {
    return `/rest/api/${this.apiVersion}`
  }

  async validateConnection(): Promise<void> {
    logger.info("Validating connection (cloud)")
    await this.request<unknown>(`${this.apiBase}/myself`)
  }

  async getProjects(): Promise<JiraProject[]> {
    logger.info("Fetching projects (cloud)")
    const response = await this.request<{ values: JiraProject[] }>(
      `${this.apiBase}/project/search?maxResults=100`
    )
    logger.info("Fetched projects (cloud)", { count: response.values.length })
    return response.values
  }

  async searchIssues(options: SearchOptions): Promise<JiraSearchResponse> {
    const params = new URLSearchParams()
    if (options.jql) params.set("jql", options.jql)
    if (options.startAt !== undefined) params.set("startAt", String(options.startAt))
    if (options.maxResults !== undefined) params.set("maxResults", String(options.maxResults))
    if (options.fields?.length) {
      params.set("fields", options.fields.join(","))
    } else {
      params.set("fields", ["summary","status","created"].join(","))
    }

    logger.debug("Searching issues (cloud)", { jql: options.jql, startAt: options.startAt, maxResults: options.maxResults })
    return this.request<JiraSearchResponse>(`${this.apiBase}/search?${params}`)
  }

  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
    logger.info("Updating issue (cloud)", { issueKey })
    await this.request<void>(`${this.apiBase}/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    })
  }

  async getFieldId(fieldName: string): Promise<string | null> {
    try {
      const fields = await this.request<Array<{ id: string; name: string }>>(
        `${this.apiBase}/field`
      )
      const field = fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase())
      return field?.id ?? null
    } catch {
      return null
    }
  }

  async getFieldOptions(fieldName: string, _projectKey?: string): Promise<FieldOption[]> {
    if (fieldName.toLowerCase() === "severity") {
      const fieldId = await this.getFieldId("Severity")
      if (fieldId) {
        try {
          const response = await this.request<{ values: Array<{ id: string; value: string }> }>(
            `${this.apiBase}/field/${fieldId}/context/default/option`
          )
          return response.values.map((v) => ({ id: v.id, value: v.value }))
        } catch {}
      }
      return [
        { id: "1", value: "1 - Critical" },
        { id: "2", value: "2 - High" },
        { id: "3", value: "3 - Medium" },
        { id: "4", value: "4 - Low" },
        { id: "5", value: "5 - Trivial" },
      ]
    }
    return []
  }

  async getFields(): Promise<JiraField[]> {
    return this.request<JiraField[]>(`${this.apiBase}/field`)
  }

  async getIssueEditMeta(issueKey: string): Promise<import("./types").JiraEditMetaResponse> {
    return this.request<import("./types").JiraEditMetaResponse>(`${this.apiBase}/issue/${issueKey}/editmeta`)
  }
}
 
 class DataCenterJiraClient extends BaseJiraClient {

  private readonly apiVersion = "2"

  private get apiBase(): string {
    return `/rest/api/${this.apiVersion}`
  }

  async validateConnection(): Promise<void> {
    logger.info("Validating connection (onprem)")
    await this.request<unknown>(`${this.apiBase}/myself`)
  }

  async getProjects(): Promise<JiraProject[]> {
    logger.info("Fetching projects (onprem)")
    const projects = await this.request<JiraProject[]>(`${this.apiBase}/project`)
    logger.info("Fetched projects (onprem)", { count: projects.length })
    return projects
  }

  async searchIssues(options: SearchOptions): Promise<JiraSearchResponse> {
    const body: Record<string, unknown> = {
      jql: options.jql ?? "",
      startAt: options.startAt ?? 0,
      maxResults: options.maxResults ?? 50,
    }

    if (options.fields?.length) {
      body.fields = options.fields
    }

    logger.debug("Searching issues (onprem)", { jql: options.jql, startAt: options.startAt, maxResults: options.maxResults })
    return this.request<JiraSearchResponse>(`${this.apiBase}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  }

  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
    logger.info("Updating issue (onprem)", { issueKey })
    await this.request<void>(`${this.apiBase}/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    })
  }

  async getFieldId(fieldName: string): Promise<string | null> {
    try {
      const fields = await this.request<Array<{ id: string; name: string }>>(
        `${this.apiBase}/field`
      )
      const field = fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase())
      return field?.id ?? null
    } catch {
      return null
    }
  }

  async getFieldOptions(fieldName: string, _projectKey?: string): Promise<FieldOption[]> {
    if (fieldName.toLowerCase() === "severity") {
      return [
        { id: "1", value: "1 - Critical" },
        { id: "2", value: "2 - High" },
        { id: "3", value: "3 - Medium" },
        { id: "4", value: "4 - Low" },
        { id: "5", value: "5 - Trivial" },
      ]
    }
    return []
  }

  async getFields(): Promise<JiraField[]> {
    return this.request<JiraField[]>(`${this.apiBase}/field`)
  }

  async getIssueEditMeta(issueKey: string): Promise<import("./types").JiraEditMetaResponse> {
    return this.request<import("./types").JiraEditMetaResponse>(`${this.apiBase}/issue/${issueKey}/editmeta`)
  }
}
 
 export class JiraApiError extends Error {

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message)
    this.name = "JiraApiError"
  }
}

export function createJiraClient(config: JiraConfig): JiraClient {
  if (config.mode === "cloud") {
    return new CloudJiraClient(config)
  }
  return new DataCenterJiraClient(config)
}
