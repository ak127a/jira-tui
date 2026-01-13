import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  type KeyEvent,
} from "@opentui/core"
import { exec } from "child_process"
import { promisify } from "util"
import type { AppContext } from "../context"
import { createHeader } from "../components"
import { createJiraClient } from "../../api"
import { loadCachedCredentials, saveCachedCredentials } from "../../config"
import { logger } from "../../logging/logger"

const execAsync = promisify(exec)

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const GREEN = "#2da44e"
const RED = "#f85149"

export function createOnPremLoginScreen(ctx: AppContext): void {
  const { renderer } = ctx
  const cachedCreds = loadCachedCredentials()

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
    height: 16,
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
    content: "🏢 On-Premise Login",
    fg: WHITE,
    marginBottom: 1,
  })
  loginBox.add(loginTitle)

  const baseUrlLabel = new TextRenderable(renderer, {
    id: "baseurl-label",
    content: "Base URL (e.g., https://jira.company.com):",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(baseUrlLabel)

  const baseUrlInput = new InputRenderable(renderer, {
    id: "baseurl-input",
    width: 45,
    placeholder: "https://jira.company.com",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
    value: cachedCreds.baseUrl || "",
  })
  loginBox.add(baseUrlInput)

  const usernameLabel = new TextRenderable(renderer, {
    id: "username-label",
    content: "Username:",
    fg: GRAY,
    marginTop: 1,
  })
  loginBox.add(usernameLabel)

  const usernameInput = new InputRenderable(renderer, {
    id: "username-input",
    width: 45,
    placeholder: "Enter username...",
    focusedBackgroundColor: "#1a1a1a",
    marginTop: 1,
    value: cachedCreds.username || "",
  })
  loginBox.add(usernameInput)

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

  let currentField: "baseurl" | "username" = "baseurl"

  async function attemptLogin() {
    const baseUrl = baseUrlInput.value.trim()
    const username = usernameInput.value.trim()

    if (!baseUrl || !username) {
      statusText.fg = RED
      statusText.content = "Please fill in all fields"
      return
    }

    statusText.fg = GRAY
    statusText.content = "Generating password..."

    try {
      logger.info("onprem_password_generate")
      const { stdout } = await execAsync("COMMAND_FOR_PASSWORD_GEN")
      const password = stdout.trim()

      if (!password) {
        statusText.fg = RED
        statusText.content = "Password generation failed!"
        logger.error("onprem_password_generate_failed")
        return
      }

      ctx.config.baseUrl = baseUrl
      ctx.config.username = username
      ctx.config.password = password

      statusText.fg = GRAY
      statusText.content = "Connecting to JIRA..."

      ctx.client = createJiraClient(ctx.config)

      logger.info("onprem_login_attempt", { baseUrl, username })
      await ctx.client.validateConnection()

      saveCachedCredentials({ baseUrl, username })

      statusText.fg = GREEN
      statusText.content = "✓ Connected successfully!"
      logger.info("onprem_login_success", { baseUrl, username })

      setTimeout(() => {
        ctx.navigate("main_menu")
      }, 500)
    } catch (error) {
      statusText.fg = RED
      const errMsg = error instanceof Error ? error.message : "Connection failed"
      statusText.content = `Error: ${errMsg}`
      logger.error("onprem_login_failure", { baseUrl, username, error: errMsg })
    }
  }

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "login_onprem") return

    if (key.name === "escape") {
      ctx.navigate("landing")
    } else if (key.name === "tab") {
      if (currentField === "baseurl") {
        currentField = "username"
        usernameInput.focus()
      } else {
        currentField = "baseurl"
        baseUrlInput.focus()
      }
    } else if (key.name === "return") {
      attemptLogin()
    }
  }

  ctx.registerKeyHandler(keyHandler)
  baseUrlInput.focus()
}
