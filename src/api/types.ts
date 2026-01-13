export interface JiraUser {
  self: string
  displayName: string
  emailAddress?: string
  // Cloud uses accountId, on-prem uses name
  accountId?: string
  name?: string
}

export interface JiraStatus {
  self: string
  name: string
  id: string
  statusCategory?: {
    id: number
    key: string
    name: string
    colorName: string
  }
}

export interface JiraProject {
  self: string
  id: string
  key: string
  name: string
  projectTypeKey?: string
}

export interface JiraFieldSchema {
  type?: string
  custom?: string
  customId?: number
}

export interface JiraField {
  id: string
  name: string
  custom?: boolean
  orderable?: boolean
  navigable?: boolean
  searchable?: boolean
  schema?: JiraFieldSchema
}

export interface JiraIssueFields {
  summary: string
  status: JiraStatus
  created: string
  updated: string
  assignee?: JiraUser | null
  reporter?: JiraUser | null
  priority?: {
    id: string
    name: string
  }
  issuetype?: {
    id: string
    name: string
    iconUrl?: string
  }
  project?: {
    id?: string
    key: string
    name?: string
  }
}

export interface JiraIssue {
  id: string
  key: string
  self: string
  fields: JiraIssueFields
}

export interface JiraSearchResponse {
  startAt: number
  maxResults: number
  total: number
  issues: JiraIssue[]
}

export interface JiraProjectsResponse {
  values?: JiraProject[] // Cloud paginated response
  // On-prem returns array directly
}

export interface JiraEditMetaFieldOperation {
  readonly set?: boolean
}

export interface JiraEditMetaAllowedValue {
  readonly id?: string
  readonly name?: string
  readonly value?: string
  readonly key?: string
}

export interface JiraEditMetaField {
  readonly required: boolean
  readonly name: string
  readonly operations?: string[]
  readonly allowedValues?: JiraEditMetaAllowedValue[]
  readonly schema?: JiraFieldSchema
}

export interface JiraEditMetaResponse {
  readonly fields: Record<string, JiraEditMetaField>
}

export interface SearchOptions {
  jql?: string
  startAt?: number
  maxResults?: number
  fields?: string[]
}

export function getUserIdentifier(user: JiraUser, isCloud: boolean): string {
  if (isCloud) {
    return user.accountId || ""
  }
  return user.name || ""
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}Z`
}
