export type JiraMode = "cloud" | "onprem"

export interface JiraConfig {
  mode: JiraMode
  baseUrl: string
  username: string
  password: string // API token for cloud, password/PAT for on-prem
}

export function createDefaultConfig(): JiraConfig {
  return {
    mode: "cloud",
    baseUrl: "",
    username: "",
    password: "",
  }
}
