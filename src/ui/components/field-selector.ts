import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { JiraClient, FieldOption } from "../../api"
import type { ProjectIssueTypeKey } from "../../config/fields-cache"
import { getFields as getCachedFields, putEditMeta } from "../../config/fields-cache"
import { logger } from "../../logging/logger"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#0D1117"
const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const SELECTED_COLOR = "#00d4aa"

export interface EditableField {
  key: string
  label: string
  type: "text" | "choice" | "array-text"
  fieldId?: string
  options?: FieldOption[]
}

export interface FieldSelectorResult {
  selectedFields: EditableField[]
  cancelled: boolean
}

export interface FieldSelectorSeed {
  issueKey: string
  projectKey: string
  issueType: string
}

export function createFieldSelector(
  renderer: CliRenderer,
  _parent: BoxRenderable,
  client: JiraClient,
  seed: FieldSelectorSeed,
  onComplete: (result: FieldSelectorResult) => void
): { destroy: () => void } {
  logger.info("Opening field selector", { seed })

  let searchText = ""
  let cursorIndex = 0
  const selectedFields = new Set<string>()
  let fieldListChildIds: string[] = []
  let selectedListChildIds: string[] = []

  let AVAILABLE_FIELDS: EditableField[] = [
    { key: "summary", label: "Summary", type: "text" },
  ]

  // Remove the parent container (jql results) to show full screen
  renderer.root.remove("main-container")

  // Full screen container
  const mainContainer = new BoxRenderable(renderer, {
    id: "field-selector-main",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: DARK_BG,
  })
  renderer.root.add(mainContainer)

  // Header
  const headerBox = new BoxRenderable(renderer, {
    id: "field-selector-header",
    width: "100%",
    height: 3,
    backgroundColor: JIRA_BLUE,
    alignItems: "center",
    justifyContent: "center",
  })
  mainContainer.add(headerBox)

  const headerText = new TextRenderable(renderer, {
    id: "field-selector-header-text",
    content: "Select Fields to Edit",
    fg: WHITE,
  })
  headerBox.add(headerText)

  // Content area
  const contentBox = new BoxRenderable(renderer, {
    id: "field-selector-content",
    width: "95%",
    height: "70%",
    marginTop: 1,
    marginLeft: 2,
    flexDirection: "row",
    backgroundColor: JIRA_DARK,
    border: true,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
  })
  mainContainer.add(contentBox)

  // Left panel - available fields
  const leftPanel = new BoxRenderable(renderer, {
    id: "left-panel",
    width: "50%",
    height: "100%",
    flexDirection: "column",
  })
  contentBox.add(leftPanel)

  const searchLabel = new TextRenderable(renderer, {
    id: "search-label",
    content: "Search Fields:",
    fg: WHITE,
  })
  leftPanel.add(searchLabel)

  const searchBox = new BoxRenderable(renderer, {
    id: "search-box",
    width: "90%",
    height: 1,
    backgroundColor: "#2d333b",
    marginTop: 1,
  })
  leftPanel.add(searchBox)

  const searchInput = new TextRenderable(renderer, {
    id: "search-input",
    content: "_",
    fg: WHITE,
  })
  searchBox.add(searchInput)

  const fieldListLabel = new TextRenderable(renderer, {
    id: "field-list-label",
    content: "Available Fields:",
    fg: GRAY,
    marginTop: 1,
  })
  leftPanel.add(fieldListLabel)

  const fieldListBox = new BoxRenderable(renderer, {
    id: "field-list-box",
    width: "90%",
    height: 12,
    flexDirection: "column",
    marginTop: 1,
  })
  leftPanel.add(fieldListBox)

  // Right panel - selected fields
  const rightPanel = new BoxRenderable(renderer, {
    id: "right-panel",
    width: "45%",
    height: "100%",
    flexDirection: "column",
    marginLeft: 2,
  })
  contentBox.add(rightPanel)

  const selectedLabel = new TextRenderable(renderer, {
    id: "selected-label",
    content: "Selected Fields:",
    fg: WHITE,
  })
  rightPanel.add(selectedLabel)

  const selectedListBox = new BoxRenderable(renderer, {
    id: "selected-list-box",
    width: "90%",
    height: 12,
    flexDirection: "column",
    marginTop: 1,
    backgroundColor: "#22272e",
    border: true,
    borderStyle: "single",
    borderColor: GRAY,
    paddingLeft: 1,
  })
  rightPanel.add(selectedListBox)

  // Help bar
  const helpBox = new BoxRenderable(renderer, {
    id: "field-selector-help-box",
    width: "100%",
    height: 1,
    marginTop: 1,
    marginLeft: 2,
  })
  mainContainer.add(helpBox)

  const helpText = new TextRenderable(renderer, {
    id: "field-selector-help",
    content: "↑↓/jk Navigate  •  Space Select  •  Enter Confirm  •  Esc Cancel",
    fg: GRAY,
  })
  helpBox.add(helpText)

  // Loading indicator
  const statusText = new TextRenderable(renderer, {
    id: "field-selector-status",
    content: "Loading fields...",
    fg: GRAY,
    marginTop: 1,
    marginLeft: 2,
  })
  mainContainer.add(statusText)

  function normalizeAllowedValues(values: Array<{ id?: string; name?: string; value?: string; key?: string }> | undefined): FieldOption[] {
    if (!values) return []
    return values.map((v) => ({
      id: String(v.id ?? v.key ?? v.value ?? v.name ?? ""),
      value: String(v.name ?? v.value ?? v.key ?? v.id ?? ""),
      name: v.name,
    }))
  }

  async function loadFields() {
    try {
      const key: ProjectIssueTypeKey = {
        baseUrl: client.config.baseUrl,
        mode: client.isCloud ? "cloud" : "onprem",
        projectKey: seed.projectKey,
        issueType: seed.issueType,
      }

      logger.debug("Loading fields for", { key })

      const cached = getCachedFields(key)
      const mapped: EditableField[] = []

      if (!cached) {
        logger.info("Fetching edit meta from API", { issueKey: seed.issueKey })
        const editmeta = await client.getIssueEditMeta(seed.issueKey)
        putEditMeta(key, editmeta)
        logger.info("Edit meta received", { fieldCount: Object.keys(editmeta.fields).length })

        for (const [fid, f] of Object.entries(editmeta.fields)) {
          const schema = f.schema
          const name = f.name
          if (!schema) continue
          // Normalize schema.items which can be string or { type: string }
          const schemaItems = typeof schema.items === "string" ? schema.items : schema.items?.type
          if (schema.type === "string") {
            mapped.push({ key: name, label: name, type: "text", fieldId: fid })
          } else if (schema.type === "array" && schemaItems === "string") {
            mapped.push({ key: name, label: name, type: "array-text", fieldId: fid })
          } else {
            const customKey = schema.custom || ""
            const isSelect =
              customKey.includes(":select") ||
              customKey.includes(":multiselect") ||
              customKey.includes(":radiobuttons") ||
              customKey.includes(":multicheckboxes") ||
              customKey.includes(":cascadingselect")
            if (isSelect || f.allowedValues) {
              mapped.push({ key: name, label: name, type: "choice", fieldId: fid, options: normalizeAllowedValues(f.allowedValues) })
            }
          }
        }
      } else {
        logger.debug("Using cached fields", { fieldCount: Object.keys(cached).length })
        for (const [fid, f] of Object.entries(cached)) {
          const options = normalizeAllowedValues(f.allowedValues)
          if (f.schemaType === "array" && f.schemaItems === "string") {
            mapped.push({ key: f.name, label: f.name, type: "array-text", fieldId: fid })
          } else if (options.length > 0) {
            mapped.push({ key: f.name, label: f.name, type: "choice", fieldId: fid, options })
          } else {
            mapped.push({ key: f.name, label: f.name, type: "text", fieldId: fid })
          }
        }
      }

      AVAILABLE_FIELDS = [
        { key: "summary", label: "Summary", type: "text" },
        ...mapped.filter((m) => m.key.toLowerCase() !== "summary"),
      ]

      statusText.content = `${AVAILABLE_FIELDS.length} fields available`
      statusText.fg = SELECTED_COLOR
      render()
    } catch (err) {
      logger.error("Failed to load fields", { error: err instanceof Error ? err.message : String(err) })
      statusText.content = `Error loading fields: ${err instanceof Error ? err.message : "Unknown error"}`
      statusText.fg = "#f85149"
      render()
    }
  }

  function getFilteredFields(): EditableField[] {
    const search = searchText.toLowerCase()
    return AVAILABLE_FIELDS.filter(
      (f) =>
        f.label.toLowerCase().includes(search) ||
        f.key.toLowerCase().includes(search)
    )
  }

  function renderFieldList() {
    for (const id of fieldListChildIds) {
      fieldListBox.remove(id)
    }
    fieldListChildIds = []

    const filtered = getFilteredFields()
    const maxVisible = 10
    const startIdx = Math.max(0, cursorIndex - maxVisible + 1)
    const endIdx = Math.min(filtered.length, startIdx + maxVisible)

    for (let i = startIdx; i < endIdx; i++) {
      const field = filtered[i]
      const isSelected = selectedFields.has(field.key)
      const isCursor = i === cursorIndex

      const rowId = `field-row-${i}`
      const fieldRow = new BoxRenderable(renderer, {
        id: rowId,
        width: "100%",
        height: 1,
        flexDirection: "row",
        backgroundColor: isCursor ? JIRA_BLUE : "transparent",
      })
      fieldListBox.add(fieldRow)
      fieldListChildIds.push(rowId)

      const typeIcon = field.type === "text" ? "✎" : "◆"
      const marker = new TextRenderable(renderer, {
        id: `field-marker-${i}`,
        content: isSelected ? `✓ ${typeIcon} ` : `  ${typeIcon} `,
        fg: isSelected ? SELECTED_COLOR : GRAY,
        width: 5,
      })
      fieldRow.add(marker)

      const label = new TextRenderable(renderer, {
        id: `field-label-${i}`,
        content: field.label,
        fg: isCursor ? WHITE : isSelected ? SELECTED_COLOR : GRAY,
      })
      fieldRow.add(label)
    }

    // Show scroll indicator if needed
    if (filtered.length > maxVisible) {
      fieldListLabel.content = `Available Fields (${cursorIndex + 1}/${filtered.length}):`
    } else {
      fieldListLabel.content = "Available Fields:"
    }
  }

  function renderSelectedList() {
    for (const id of selectedListChildIds) {
      selectedListBox.remove(id)
    }
    selectedListChildIds = []

    const selected = AVAILABLE_FIELDS.filter((f) => selectedFields.has(f.key))
    if (selected.length === 0) {
      const emptyId = "selected-empty"
      const empty = new TextRenderable(renderer, {
        id: emptyId,
        content: "(none selected)",
        fg: GRAY,
      })
      selectedListBox.add(empty)
      selectedListChildIds.push(emptyId)
    } else {
      for (let i = 0; i < selected.length; i++) {
        const field = selected[i]
        const typeIcon = field.type === "text" ? "✎" : "◆"
        const itemId = `selected-item-${i}`
        const item = new TextRenderable(renderer, {
          id: itemId,
          content: `${typeIcon} ${field.label}`,
          fg: SELECTED_COLOR,
        })
        selectedListBox.add(item)
        selectedListChildIds.push(itemId)
      }
    }

    selectedLabel.content = `Selected Fields (${selected.length}):`
  }

  function updateSearchDisplay() {
    searchInput.content = searchText + "_"
  }

  function render() {
    updateSearchDisplay()
    renderFieldList()
    renderSelectedList()
  }

  function cleanup() {
    logger.debug("Cleaning up field selector")
    renderer.keyInput.off("keypress", keyHandler)
    renderer.root.remove("field-selector-main")
  }

  // Initial render
  render()
  // Load dynamic fields asynchronously
  void loadFields()

  function keyHandler(key: KeyEvent) {
    logger.debug("Key pressed in field-selector", { name: key.name, ctrl: key.ctrl })

    const filtered = getFilteredFields()

    if (key.name === "escape") {
      logger.info("Field selector cancelled")
      cleanup()
      onComplete({ selectedFields: [], cancelled: true })
      return
    }

    if (key.name === "return") {
      const selected = AVAILABLE_FIELDS.filter((f) => selectedFields.has(f.key))
      logger.info("Field selector confirmed", { selectedCount: selected.length, fields: selected.map(f => f.label) })
      cleanup()
      onComplete({ selectedFields: selected, cancelled: false })
      return
    }

    if (key.name === "space") {
      if (filtered.length > 0 && cursorIndex < filtered.length) {
        const field = filtered[cursorIndex]
        if (selectedFields.has(field.key)) {
          selectedFields.delete(field.key)
        } else {
          selectedFields.add(field.key)
        }
        render()
      }
      return
    }

    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      if (cursorIndex > 0) {
        cursorIndex--
        render()
      }
      return
    }

    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      if (cursorIndex < filtered.length - 1) {
        cursorIndex++
        render()
      }
      return
    }

    if (key.name === "backspace") {
      if (searchText.length > 0) {
        searchText = searchText.slice(0, -1)
        cursorIndex = 0
        render()
      }
      return
    }

    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      searchText += key.sequence
      cursorIndex = 0
      render()
    }
  }

  renderer.keyInput.on("keypress", keyHandler)
  logger.debug("Key handler registered for field-selector")

  return {
    destroy: cleanup,
  }
}
