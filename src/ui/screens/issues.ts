import {
  BoxRenderable,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core"
import type { AppContext } from "../context"
import { createHeader } from "../components"
import { createTable, type TableColumn, type TableRow } from "../components/table"
import { formatDateTime, type JiraIssue } from "../../api"

const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const GRAY = "#7A869A"
const RED = "#f85149"

const COLUMNS: TableColumn[] = [
  { key: "key", label: "Issue Key", width: 12 },
  { key: "created", label: "Created", width: 18 },
  { key: "summary", label: "Summary", width: 40 },
  { key: "status", label: "Status", width: 12 },
]

function issueToRow(issue: JiraIssue): TableRow {
  return {
    key: issue.key,
    created: formatDateTime(issue.fields.created),
    summary: issue.fields.summary,
    status: issue.fields.status.name,
  }
}

export async function createIssuesScreen(ctx: AppContext): Promise<void> {
  const { renderer, client, selectedProject } = ctx

  if (!client || !selectedProject) {
    ctx.navigate("projects")
    return
  }

  const mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: 1,
    backgroundColor: "#0D1117",
  })
  renderer.root.add(mainContainer)

  createHeader(renderer, mainContainer, `Issues in ${selectedProject}`)

  const contentBox = new BoxRenderable(renderer, {
    id: "content-box",
    width: "95%",
    height: "60%",
    marginTop: 2,
    flexDirection: "column",
    backgroundColor: JIRA_DARK,
    border: true,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 1,
    paddingRight: 1,
  })
  mainContainer.add(contentBox)

  const loadingText = new TextRenderable(renderer, {
    id: "loading",
    content: "Loading issues...",
    fg: GRAY,
  })
  contentBox.add(loadingText)

  const statusBar = new BoxRenderable(renderer, {
    id: "status-bar",
    width: "95%",
    height: 1,
    marginTop: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  })
  mainContainer.add(statusBar)

  const statusText = new TextRenderable(renderer, {
    id: "status",
    content: "",
    fg: GRAY,
  })
  statusBar.add(statusText)

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "↑/↓/j/k Nav  •  Ctrl+j Next Page  •  Ctrl+k Prev Page  •  Esc Back  •  q Quit",
    fg: GRAY,
  })
  statusBar.add(helpText)

  let issues: JiraIssue[] = []
  let selectedIndex = 0
  let currentPage = 0
  let totalIssues = 0
  let tableBox: BoxRenderable | null = null

  const PAGE_SIZE = 15

  function getVisibleIssues(): JiraIssue[] {
    const start = currentPage * PAGE_SIZE
    return issues.slice(start, start + PAGE_SIZE)
  }

  function getTotalPages(): number {
    return Math.ceil(issues.length / PAGE_SIZE)
  }

  function updateStatus() {
    const totalPages = getTotalPages()
    const pageInfo = totalPages > 1 ? ` • Page ${currentPage + 1}/${totalPages}` : ""
    statusText.content = `Showing ${issues.length} of ${totalIssues} issues${pageInfo}`
  }

  function renderTable() {
    if (tableBox) {
      contentBox.remove(tableBox.id)
    }

    const visibleIssues = getVisibleIssues()
    const rows = visibleIssues.map(issueToRow)

    tableBox = createTable(renderer, contentBox, {
      id: "issues-table",
      columns: COLUMNS,
      rows,
      selectedIndex: selectedIndex % PAGE_SIZE,
      maxHeight: PAGE_SIZE + 3,
    })

    updateStatus()
  }

  try {
    const response = await client.getProjectIssues(selectedProject, {
      maxResults: 100,
    })

    issues = response.issues
    totalIssues = response.total
    contentBox.remove("loading")

    if (issues.length === 0) {
      const noIssues = new TextRenderable(renderer, {
        id: "no-issues",
        content: "No issues found in this project",
        fg: GRAY,
      })
      contentBox.add(noIssues)
    } else {
      renderTable()
    }
  } catch (error) {
    contentBox.remove("loading")
    const errorText = new TextRenderable(renderer, {
      id: "error",
      content: `Error: ${error instanceof Error ? error.message : "Failed to load issues"}`,
      fg: RED,
    })
    contentBox.add(errorText)
  }

  const keyHandler = (key: KeyEvent) => {
    if (ctx.currentScreen !== "issues") return

    if (key.name === "escape") {
      ctx.navigate("main_menu")
    } else if (key.name === "q") {
      renderer.destroy()
      process.exit(0)
    } else if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      if (selectedIndex > 0) {
        selectedIndex--
        const newPage = Math.floor(selectedIndex / PAGE_SIZE)
        if (newPage !== currentPage) {
          currentPage = newPage
        }
        renderTable()
      }
    } else if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      if (selectedIndex < issues.length - 1) {
        selectedIndex++
        const newPage = Math.floor(selectedIndex / PAGE_SIZE)
        if (newPage !== currentPage) {
          currentPage = newPage
        }
        renderTable()
      }
    } else if (key.name === "j" && key.ctrl) {
      const totalPages = getTotalPages()
      if (currentPage < totalPages - 1) {
        currentPage++
        selectedIndex = currentPage * PAGE_SIZE
        renderTable()
      }
    } else if (key.name === "k" && key.ctrl) {
      if (currentPage > 0) {
        currentPage--
        selectedIndex = currentPage * PAGE_SIZE
        renderTable()
      }
    }
  }

  renderer.keyInput.on("keypress", keyHandler)
}
