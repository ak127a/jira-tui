import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  type KeyEvent,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"

export function createJqlSearchScreen(ctx: AppContext): void {
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

  createHeader(renderer, mainContainer, "JQL Search")

  const searchBox = new BoxRenderable(renderer, {
    id: "search-box",
    width: 70,
    height: 10,
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
  mainContainer.add(searchBox)

  const searchTitle = new TextRenderable(renderer, {
    id: "search-title",
    content: "🔍 Enter JQL Query",
    fg: WHITE,
    marginBottom: 1,
  })
  searchBox.add(searchTitle)

  const queryLabel = new TextRenderable(renderer, {
    id: "query-label",
    content: "e.g., project = MYPROJ AND status = 'In Progress'",
    fg: GRAY,
    marginTop: 1,
  })
  searchBox.add(queryLabel)

  const queryInput = new InputRenderable(renderer, {
    id: "query-input",
    width: 60,
    placeholder: "Enter JQL query...",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
  })
  searchBox.add(queryInput)

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "Enter Search  •  Esc Back  •  q Quit",
    fg: GRAY,
    marginTop: 2,
  })
  mainContainer.add(helpText)

  queryInput.focus()

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "jql_search") return

    if (key.name === "escape") {
      ctx.navigate("main_menu")
    } else if (key.name === "q" && !queryInput.focused) {
      renderer.stop()
      process.exit(0)
    } else if (key.name === "return") {
      const query = queryInput.value.trim()
      if (query) {
        ctx.jqlQuery = query
        ctx.navigate("jql_results")
      }
    }
  }

  renderer.keyInput.on("keypress", keyHandler)
}
