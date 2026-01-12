import type { JiraConfig } from "../config/types"
import type {
  JiraIssue,
  JiraProject,
  JiraSearchResponse,
  SearchOptions,
} from "./types"

export interface JiraClient {
  readonly config: JiraConfig
  readonly isCloud: boolean

  getProjects(): Promise<JiraProject[]>
  searchIssues(options: SearchOptions): Promise<JiraSearchResponse>
  getProjectIssues(projectKey: string, options?: Omit<SearchOptions, "jql">): Promise<JiraSearchResponse>
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
