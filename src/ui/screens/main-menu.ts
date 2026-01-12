import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type KeyEvent,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"

const MENU_OPTIONS = [
  { name: "📂 List Issues by Project", description: "Browse issues in a specific project" },
  { name: "🔍 List Issues by Query (JQL)", description: "Search using Jira Query Language" },
]

export function createMainMenuScreen(ctx: AppContext): void {
  const { renderer } = ctx

  const mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D1117",
  })
  renderer.root.add(mainContainer)

  createHeader(renderer, mainContainer, "Main Menu")

  const menuBox = new BoxRenderable(renderer, {
    id: "menu-box",
    width: 60,
    height: 12,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    backgroundColor: JIRA_DARK,
    marginTop: 2,
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    border: true,
  })
  mainContainer.add(menuBox)

  const menuTitle = new TextRenderable(renderer, {
    id: "menu-title",
    content: "Choose an action:",
    fg: WHITE,
    marginBottom: 1,
  })
  menuBox.add(menuTitle)

  const menuSelect = new SelectRenderable(renderer, {
    id: "menu-select",
    width: 54,
    height: 6,
    options: MENU_OPTIONS,
    selectedBackgroundColor: JIRA_BLUE,
    selectedTextColor: WHITE,
  })
  menuBox.add(menuSelect)

  menuSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    if (index === 0) {
      ctx.navigate("projects")
    } else if (index === 1) {
      ctx.navigate("jql_search")
    }
  })

  menuSelect.focus()

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "↑/↓ Navigate  •  Enter Select  •  Esc Back  •  q Quit",
    fg: GRAY,
    marginTop: 2,
  })
  mainContainer.add(helpText)

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "main_menu") return

    if (key.name === "escape") {
      ctx.navigate("landing")
    } else if (key.name === "q") {
      renderer.stop()
      process.exit(0)
    }
  }

  renderer.keyInput.on("keypress", keyHandler)
}
