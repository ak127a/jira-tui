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
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
