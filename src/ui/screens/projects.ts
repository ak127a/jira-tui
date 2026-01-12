import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type KeyEvent,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"
import type { JiraProject } from "../../api"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const RED = "#f85149"

export async function createProjectsScreen(ctx: AppContext): Promise<void> {
  const { renderer, client } = ctx

  if (!client) {
    ctx.navigate("landing")
    return
  }

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

  createHeader(renderer, mainContainer, "Select a Project")

  const projectsBox = new BoxRenderable(renderer, {
    id: "projects-box",
    width: 60,
    height: 20,
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
  mainContainer.add(projectsBox)

  const loadingText = new TextRenderable(renderer, {
    id: "loading",
    content: "Loading projects...",
    fg: GRAY,
  })
  projectsBox.add(loadingText)

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "↑/↓ Navigate  •  Enter Select  •  Esc Back  •  q Quit",
    fg: GRAY,
    marginTop: 2,
  })
  mainContainer.add(helpText)

  let projects: JiraProject[] = []

  try {
    projects = await client.getProjects()
    projectsBox.remove("loading")

    if (projects.length === 0) {
      const noProjects = new TextRenderable(renderer, {
        id: "no-projects",
        content: "No projects found",
        fg: GRAY,
      })
      projectsBox.add(noProjects)
      return
    }

    const projectSelect = new SelectRenderable(renderer, {
      id: "project-select",
      width: 54,
      height: 16,
      options: projects.map((p) => ({
        name: `${p.key}`,
        description: p.name,
      })),
      selectedBackgroundColor: JIRA_BLUE,
      selectedTextColor: WHITE,
    })
    projectsBox.add(projectSelect)

    projectSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      ctx.selectedProject = projects[index].key
      ctx.navigate("issues")
    })

    projectSelect.focus()
  } catch (error) {
    projectsBox.remove("loading")
    const errorText = new TextRenderable(renderer, {
      id: "error",
      content: `Error: ${error instanceof Error ? error.message : "Failed to load projects"}`,
      fg: RED,
    })
    projectsBox.add(errorText)
  }

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "projects") return

    if (key.name === "escape") {
      ctx.navigate("main_menu")
    } else if (key.name === "q") {
      renderer.destroy()
      process.exit(0)
    }
  }

  ctx.registerKeyHandler(keyHandler)
}
