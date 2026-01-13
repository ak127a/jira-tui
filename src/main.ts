import { createCliRenderer, type KeyEvent } from "@opentui/core"
import { createDefaultConfig } from "./config"
import type { JiraClient } from "./api"
import type { AppContext, AppScreen, KeyHandler } from "./ui/context"
import {
  createLandingScreen,
  createCloudLoginScreen,
  createOnPremLoginScreen,
  createMainMenuScreen,
  createProjectsScreen,
  createIssuesScreen,
  createJqlSearchScreen,
  createJqlResultsScreen,
} from "./ui/screens"
import { logger } from "./logging/logger"

function clearRoot(ctx: AppContext): void {
  const children = ctx.renderer.root.getChildren()
  for (const child of children) {
    ctx.renderer.root.remove(child.id)
  }
}

async function navigateTo(ctx: AppContext, screen: AppScreen): Promise<void> {
  logger.info("navigate", { from: ctx.currentScreen, to: screen })
  ctx.clearKeyHandlers()
  ctx.currentScreen = screen
  clearRoot(ctx)

  switch (screen) {
    case "landing":
      createLandingScreen(ctx)
      break
    case "login_cloud":
      createCloudLoginScreen(ctx)
      break
    case "login_onprem":
      createOnPremLoginScreen(ctx)
      break
    case "main_menu":
      createMainMenuScreen(ctx)
      break
    case "projects":
      await createProjectsScreen(ctx)
      break
    case "issues":
      await createIssuesScreen(ctx)
      break
    case "jql_search":
      createJqlSearchScreen(ctx)
      break
    case "jql_results":
      await createJqlResultsScreen(ctx)
      break
  }
}

async function main(): Promise<void> {
  logger.info("app_start")
  const renderer = await createCliRenderer()
  logger.info("renderer_created")

  const keyHandlers: KeyHandler[] = []

  const ctx: AppContext = {
    renderer,
    currentScreen: "landing",
    config: createDefaultConfig(),
    client: null as JiraClient | null,
    selectedProject: null,
    jqlQuery: null,
    navigate: (screen: AppScreen) => {
      navigateTo(ctx, screen)
    },
    registerKeyHandler: (handler: KeyHandler) => {
      keyHandlers.push(handler)
      logger.debug("key_handler_registered", { count: keyHandlers.length })
      renderer.keyInput.on("keypress", handler)
    },
    clearKeyHandlers: () => {
      for (const handler of keyHandlers) {
        renderer.keyInput.off("keypress", handler)
      }
      logger.debug("key_handlers_cleared", { count: keyHandlers.length })
      keyHandlers.length = 0
    },
  }

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q" && ctx.currentScreen === "landing") {
      logger.info("app_exit", { reason: "quit_on_landing" })
      renderer.destroy()
      process.exit(0)
    }
  })

  await navigateTo(ctx, "landing")
  renderer.start()
}

main().catch((err) => {
  logger.error("fatal_error", { error: err instanceof Error ? err.message : String(err) })
  console.error("Fatal error:", err)
  process.exit(1)
})
