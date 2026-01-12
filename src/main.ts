import { createCliRenderer, type KeyEvent } from "@opentui/core"
import { createDefaultConfig } from "./config"
import type { JiraClient } from "./api"
import type { AppContext, AppScreen } from "./ui/context"
import {
  createLandingScreen,
  createCloudLoginScreen,
  createOnPremLoginScreen,
  createProjectsScreen,
  createIssuesScreen,
} from "./ui/screens"

function clearRoot(ctx: AppContext): void {
  const children = ctx.renderer.root.getChildren()
  for (const child of children) {
    ctx.renderer.root.remove(child.id)
  }
}

async function navigateTo(ctx: AppContext, screen: AppScreen): Promise<void> {
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
    case "projects":
      await createProjectsScreen(ctx)
      break
    case "issues":
      await createIssuesScreen(ctx)
      break
  }
}

async function main(): Promise<void> {
  const renderer = await createCliRenderer()

  const ctx: AppContext = {
    renderer,
    currentScreen: "landing",
    config: createDefaultConfig(),
    client: null as JiraClient | null,
    selectedProject: null,
    navigate: (screen: AppScreen) => {
      navigateTo(ctx, screen)
    },
  }

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q" && ctx.currentScreen === "landing") {
      renderer.stop()
      process.exit(0)
    }
  })

  await navigateTo(ctx, "landing")
  renderer.start()
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
