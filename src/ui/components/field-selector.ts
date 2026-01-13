import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { JiraClient, JiraField, FieldOption } from "../../api"
import type { ProjectIssueTypeKey } from "../../config/fields-cache"
import { getFields as getCachedFields, putEditMeta } from "../../config/fields-cache"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#1a1a1a"
const JIRA_BLUE = "#0052CC"
const SELECTED_COLOR = "#00d4aa"

export interface EditableField {
  key: string
  label: string
  type: "text" | "choice"
  fieldId?: string
  options?: FieldOption[]
}

export interface FieldSelectorResult {
  selectedFields: EditableField[]
  cancelled: boolean
}

function mapFieldToEditable(field: JiraField): EditableField | null {
  const name = field.name
  const schema = field.schema
  if (!schema) return null

  const customKey = schema.custom || ""
  const type = schema.type || ""

  // Text-like fields
  if (type === "string") {
    return { key: name, label: name, type: "text" }
  }

  // Common choice-like custom field types
  const isSelect =
    customKey.includes(":select") ||
    customKey.includes(":multiselect") ||
    customKey.includes(":radiobuttons") ||
    customKey.includes(":multicheckboxes") ||
    customKey.includes(":cascadingselect")

  if (isSelect) {
    return { key: name, label: name, type: "choice" }
  }

  return null
}

export interface FieldSelectorSeed {
  issueKey: string
  projectKey: string
  issueType: string
}

export function createFieldSelector(
  renderer: CliRenderer,
  parent: BoxRenderable,
  client: JiraClient,
  seed: FieldSelectorSeed,
  onComplete: (result: FieldSelectorResult) => void
): { destroy: () => void } {
  let searchText = ""
  let cursorIndex = 0
  const selectedFields = new Set<string>()
  let fieldListChildIds: string[] = []
  let selectedListChildIds: string[] = []

  let AVAILABLE_FIELDS: EditableField[] = [
    { key: "summary", label: "Summary", type: "text" },
  ]

  const container = new BoxRenderable(renderer, {
    id: "field-selector-container",
    width: "90%",
    height: "80%",
    flexDirection: "row",
    backgroundColor: DARK_BG,
    border: true,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
  })
  parent.add(container)

  const leftPanel = new BoxRenderable(renderer, {
    id: "left-panel",
    width: "50%",
    height: "100%",
    flexDirection: "column",
  })
  container.add(leftPanel)

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
    content: "",
    fg: WHITE,
  })
  searchBox.add(searchInput)

  const fieldListLabel = new TextRenderable(renderer, {
    id: "field-list-label",
    content: "Available Fields (Space to select):",
    fg: GRAY,
    marginTop: 1,
  })
  leftPanel.add(fieldListLabel)

  const fieldListBox = new BoxRenderable(renderer, {
    id: "field-list-box",
    width: "90%",
    height: 10,
    flexDirection: "column",
    marginTop: 1,
  })
  leftPanel.add(fieldListBox)

  const rightPanel = new BoxRenderable(renderer, {
    id: "right-panel",
    width: "45%",
    height: "100%",
    flexDirection: "column",
    marginLeft: 2,
  })
  container.add(rightPanel)

  const selectedLabel = new TextRenderable(renderer, {
    id: "selected-label",
    content: "Selected Fields:",
    fg: WHITE,
  })
  rightPanel.add(selectedLabel)

  const selectedListBox = new BoxRenderable(renderer, {
    id: "selected-list-box",
    width: "90%",
    height: 10,
    flexDirection: "column",
    marginTop: 1,
    backgroundColor: "#22272e",
    border: true,
    borderStyle: "single",
    borderColor: GRAY,
    paddingLeft: 1,
  })
  rightPanel.add(selectedListBox)

  const helpText = new TextRenderable(renderer, {
    id: "selector-help",
    content: "Enter: Confirm  •  Esc: Cancel  •  Space: Toggle",
    fg: GRAY,
    marginTop: 2,
  })
  leftPanel.add(helpText)

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
      let editmeta: import("../../api").JiraEditMetaResponse | null = null
      const cached = getCachedFields(key)
      const mapped: EditableField[] = []

      if (!cached) {
        editmeta = await client.getIssueEditMeta(seed.issueKey)
        putEditMeta(key, editmeta)
        for (const [fid, f] of Object.entries(editmeta.fields)) {
          const schema = f.schema
          const name = f.name
          if (!schema) continue
          if (schema.type === "string") {
            mapped.push({ key: name, label: name, type: "text", fieldId: fid })
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
        for (const [fid, f] of Object.entries(cached)) {
          const options = normalizeAllowedValues(f.allowedValues)
          if (options.length > 0) {
            mapped.push({ key: f.name, label: f.name, type: "choice", fieldId: fid, options })
          } else {
            mapped.push({ key: f.name, label: f.name, type: "text", fieldId: fid })
          }
        }
      }

      const hasSummary = mapped.some((m) => m.key.toLowerCase() === "summary")
      AVAILABLE_FIELDS = [
        { key: "summary", label: "Summary", type: "text" },
        ...mapped.filter((m) => m.key.toLowerCase() !== "summary"),
      ]
      render()
    } catch (err) {
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
    for (let i = 0; i < filtered.length; i++) {
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

      const marker = new TextRenderable(renderer, {
        id: `field-marker-${i}`,
        content: isSelected ? "◆ " : "  ",
        fg: SELECTED_COLOR,
        width: 3,
      })
      fieldRow.add(marker)

      const label = new TextRenderable(renderer, {
        id: `field-label-${i}`,
        content: field.label,
        fg: isCursor ? WHITE : isSelected ? SELECTED_COLOR : GRAY,
      })
      fieldRow.add(label)
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
        content: "(none)",
        fg: GRAY,
      })
      selectedListBox.add(empty)
      selectedListChildIds.push(emptyId)
    } else {
      for (let i = 0; i < selected.length; i++) {
        const field = selected[i]
        const itemId = `selected-item-${i}`
        const item = new TextRenderable(renderer, {
          id: itemId,
          content: `• ${field.label}`,
          fg: SELECTED_COLOR,
        })
        selectedListBox.add(item)
        selectedListChildIds.push(itemId)
      }
    }
  }

  function updateSearchDisplay() {
    searchInput.content = searchText + "_"
  }

  function render() {
    updateSearchDisplay()
    renderFieldList()
    renderSelectedList()
  }

  // initial render with default fields
  render()
  // load dynamic fields asynchronously
  void loadFields()

  const keyHandler = (key: KeyEvent) => {
    const filtered = getFilteredFields()

    if (key.name === "escape") {
      renderer.keyInput.off("keypress", keyHandler)
      parent.remove("field-selector-container")
      onComplete({ selectedFields: [], cancelled: true })
      return
    }

    if (key.name === "return") {
      renderer.keyInput.off("keypress", keyHandler)
      parent.remove("field-selector-container")
      const selected = AVAILABLE_FIELDS.filter((f) => selectedFields.has(f.key))
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

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", keyHandler)
      parent.remove("field-selector-container")
    },
  }
}
