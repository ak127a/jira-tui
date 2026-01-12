import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"

export function createLandingScreen(ctx: AppContext): void {
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

  createHeader(renderer, mainContainer)

  const modeSelectBox = new BoxRenderable(renderer, {
    id: "mode-select-box",
    width: 50,
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
  mainContainer.add(modeSelectBox)

  const selectLabel = new TextRenderable(renderer, {
    id: "select-label",
    content: "Select JIRA Instance Type",
    fg: WHITE,
    marginBottom: 1,
  })
  modeSelectBox.add(selectLabel)

  const modeSelect = new SelectRenderable(renderer, {
    id: "mode-select",
    width: 40,
    height: 6,
    options: [
      { name: "☁️  JIRA Cloud", description: "Connect to *.atlassian.net" },
      { name: "🏢  JIRA On-Premise", description: "Connect to self-hosted Data Center" },
    ],
    selectedBackgroundColor: JIRA_BLUE,
    selectedTextColor: WHITE,
  })
  modeSelectBox.add(modeSelect)

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "↑/↓ Navigate  •  Enter Select  •  q Quit",
    fg: GRAY,
    marginTop: 2,
  })
  mainContainer.add(helpText)

  modeSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    if (index === 0) {
      ctx.config.mode = "cloud"
      ctx.navigate("login_cloud")
    } else if (index === 1) {
      ctx.config.mode = "onprem"
      ctx.navigate("login_onprem")
    }
  })

  modeSelect.focus()
}
