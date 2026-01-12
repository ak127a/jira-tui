import type { CliRenderer, KeyEvent } from "@opentui/core"
import type { JiraConfig } from "../config"
import type { JiraClient } from "../api"

export type AppScreen =
  | "landing"
  | "login_cloud"
  | "login_onprem"
  | "main_menu"
  | "projects"
  | "issues"
  | "jql_search"
  | "jql_results"

export type KeyHandler = (key: KeyEvent) => void

export interface AppContext {
  renderer: CliRenderer
  currentScreen: AppScreen
  config: JiraConfig
  client: JiraClient | null
  selectedProject: string | null
  jqlQuery: string | null
  navigate: (screen: AppScreen) => void
  registerKeyHandler: (handler: KeyHandler) => void
  clearKeyHandlers: () => void
}
