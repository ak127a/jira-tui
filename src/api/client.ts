import type { JiraConfig } from "../config/types"
import type {
  JiraIssue,
  JiraProject,
  JiraSearchResponse,
  SearchOptions,
} from "./types"

export interface FieldOption {
  id: string
  value: string
  name?: string
}

export interface JiraClient {
  readonly config: JiraConfig
  readonly isCloud: boolean

  getProjects(): Promise<JiraProject[]>
  searchIssues(options: SearchOptions): Promise<JiraSearchResponse>
  getProjectIssues(projectKey: string, options?: Omit<SearchOptions, "jql">): Promise<JiraSearchResponse>
  updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void>
  getFieldOptions(fieldName: string, projectKey?: string): Promise<FieldOption[]>
  getFieldId(fieldName: string): Promise<string | null>
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

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new JiraApiError(
        `JIRA API Error: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      )
    }

    return response.json() as Promise<T>
  }

  abstract getProjects(): Promise<JiraProject[]>
  abstract searchIssues(options: SearchOptions): Promise<JiraSearchResponse>
  abstract updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void>
  abstract getFieldOptions(fieldName: string, projectKey?: string): Promise<FieldOption[]>
  abstract getFieldId(fieldName: string): Promise<string | null>

  async getProjectIssues(
    projectKey: string,
    options: Omit<SearchOptions, "jql"> = {}
  ): Promise<JiraSearchResponse> {
    return this.searchIssues({
      ...options,
      jql: `project = ${projectKey} ORDER BY created DESC`,
      fields: options.fields ?? ["summary", "status", "created", "updated", "assignee", "priority", "issuetype"],
    })
  }
}

class CloudJiraClient extends BaseJiraClient {
  private readonly apiVersion = "3"

  private get apiBase(): string {
    return `/rest/api/${this.apiVersion}`
  }

  async getProjects(): Promise<JiraProject[]> {
    const response = await this.request<{ values: JiraProject[] }>(
      `${this.apiBase}/project/search?maxResults=100`
    )
    return response.values
  }

  async searchIssues(options: SearchOptions): Promise<JiraSearchResponse> {
    const params = new URLSearchParams()
    if (options.jql) params.set("jql", options.jql)
    if (options.startAt !== undefined) params.set("startAt", String(options.startAt))
    if (options.maxResults !== undefined) params.set("maxResults", String(options.maxResults))
    if (options.fields?.length) params.set("fields", options.fields.join(","))

    return this.request<JiraSearchResponse>(`${this.apiBase}/search?${params}`)
  }

  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
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
        } catch {
          // Fall through to defaults
        }
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
}

class DataCenterJiraClient extends BaseJiraClient {
  private readonly apiVersion = "2"

  private get apiBase(): string {
    return `/rest/api/${this.apiVersion}`
  }

  async getProjects(): Promise<JiraProject[]> {
    return this.request<JiraProject[]>(`${this.apiBase}/project`)
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

    return this.request<JiraSearchResponse>(`${this.apiBase}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  }

  async updateIssue(issueKey: string, fields: Record<string, unknown>): Promise<void> {
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
          const response = await this.request<{ allowedValues: Array<{ id: string; value: string; name?: string }> }>(
            `${this.apiBase}/issue/createmeta?expand=projects.issuetypes.fields`
          )
          if (response.allowedValues) {
            return response.allowedValues.map((v) => ({ id: v.id, value: v.name || v.value }))
          }
        } catch {
          // Fall through to defaults
        }
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
