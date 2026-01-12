import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  type KeyEvent,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"
import { createJiraClient } from "../../api"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const GREEN = "#2da44e"
const RED = "#f85149"

export function createCloudLoginScreen(ctx: AppContext): void {
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

  const loginBox = new BoxRenderable(renderer, {
    id: "login-box",
    width: 55,
    height: 18,
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
  mainContainer.add(loginBox)

  const loginTitle = new TextRenderable(renderer, {
    id: "login-title",
    content: "☁️ Cloud Login",
    fg: WHITE,
    marginBottom: 1,
  })
  loginBox.add(loginTitle)

  const baseUrlLabel = new TextRenderable(renderer, {
    id: "baseurl-label",
    content: "Atlassian URL (e.g., company.atlassian.net):",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(baseUrlLabel)

  const baseUrlInput = new InputRenderable(renderer, {
    id: "baseurl-input",
    width: 45,
    placeholder: "company.atlassian.net",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
  })
  loginBox.add(baseUrlInput)

  const emailLabel = new TextRenderable(renderer, {
    id: "email-label",
    content: "Email:",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(emailLabel)

  const emailInput = new InputRenderable(renderer, {
    id: "email-input",
    width: 45,
    placeholder: "you@company.com",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
  })
  loginBox.add(emailInput)

  const tokenLabel = new TextRenderable(renderer, {
    id: "token-label",
    content: "API Token:",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(tokenLabel)

  const tokenInput = new InputRenderable(renderer, {
    id: "token-input",
    width: 45,
    placeholder: "Paste your API token...",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
  })
  loginBox.add(tokenInput)

  const statusText = new TextRenderable(renderer, {
    id: "status",
    content: "",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(statusText)

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "Tab Switch Field  •  Enter Submit  •  Esc Back",
    fg: GRAY,
    marginTop: 2,
  })
  mainContainer.add(helpText)

  const fields = [baseUrlInput, emailInput, tokenInput] as const
  let currentFieldIndex = 0

  async function attemptLogin() {
    let baseUrl = baseUrlInput.value.trim()
    const email = emailInput.value.trim()
    const token = tokenInput.value.trim()

    if (!baseUrl || !email || !token) {
      statusText.fg = RED
      statusText.content = "Please fill in all fields"
      return
    }

    if (!baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`
    }

    statusText.fg = GRAY
    statusText.content = "Connecting to JIRA Cloud..."

    try {
      ctx.config.baseUrl = baseUrl
      ctx.config.username = email
      ctx.config.password = token

      ctx.client = createJiraClient(ctx.config)

      await ctx.client.getProjects()

      statusText.fg = GREEN
      statusText.content = "✓ Connected successfully!"

      setTimeout(() => {
        ctx.navigate("projects")
      }, 500)
    } catch (error) {
      statusText.fg = RED
      statusText.content = `Error: ${error instanceof Error ? error.message : "Connection failed"}`
    }
  }

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "login_cloud") return

    if (key.name === "escape") {
      ctx.navigate("landing")
    } else if (key.name === "tab") {
      currentFieldIndex = (currentFieldIndex + 1) % fields.length
      fields[currentFieldIndex].focus()
    } else if (key.name === "return") {
      attemptLogin()
    }
  }

  renderer.keyInput.on("keypress", keyHandler)
  baseUrlInput.focus()
}
