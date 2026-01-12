import type { CliRenderer } from "@opentui/core"
import type { JiraConfig } from "../config"
import type { JiraClient } from "../api"

export type AppScreen =
  | "landing"
  | "login_cloud"
  | "login_onprem"
  | "projects"
  | "issues"

export interface AppContext {
  renderer: CliRenderer
  currentScreen: AppScreen
  config: JiraConfig
  client: JiraClient | null
  selectedProject: string | null
  navigate: (screen: AppScreen) => void
}
