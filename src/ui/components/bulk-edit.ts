import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { JiraClient, FieldOption } from "../../api"
import type { EditableField } from "./field-selector"
import { createFieldEditor } from "./field-editor"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#1a1a1a"
const JIRA_BLUE = "#0052CC"
const RED = "#f85149"
const GREEN = "#3fb950"
const SELECTED_BG = "#22272e"

export interface BulkEditResult {
  success: boolean
  cancelled: boolean
}

interface FieldValue {
  field: EditableField
  value: string
  options?: FieldOption[]
  optionIndex?: number
  fieldId?: string
}

export async function createBulkEditScreen(
  renderer: CliRenderer,
  parent: BoxRenderable,
  issueKeys: string[],
  fields: EditableField[],
  client: JiraClient,
  onComplete: (result: BulkEditResult) => void
): Promise<{ destroy: () => void }> {
  let currentFieldIndex = 0
  let isInEditor = false
  const fieldValues: FieldValue[] = []
  let fieldRowIds: string[] = []

  for (const field of fields) {
    const fv: FieldValue = { field, value: "" }
    if (field.type === "choice") {
      const options = field.options ?? []
      fv.options = options
      fv.optionIndex = options.length > 0 ? 0 : undefined
      fv.value = options[0]?.value ?? ""
      fv.fieldId = field.fieldId
    }
    fieldValues.push(fv)
  }

  const container = new BoxRenderable(renderer, {
    id: "bulk-edit-container",
    width: "90%",
    height: "80%",
    flexDirection: "column",
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

  const title = new TextRenderable(renderer, {
    id: "bulk-edit-title",
    content: `Bulk Edit ${issueKeys.length} Issue${issueKeys.length > 1 ? "s" : ""}`,
    fg: WHITE,
  })
  container.add(title)

  const issueList = new TextRenderable(renderer, {
    id: "bulk-edit-issues",
    content: `Issues: ${issueKeys.slice(0, 5).join(", ")}${issueKeys.length > 5 ? ` (+${issueKeys.length - 5} more)` : ""}`,
    fg: GRAY,
    marginTop: 1,
  })
  container.add(issueList)

  const fieldsContainer = new BoxRenderable(renderer, {
    id: "fields-container",
    width: "100%",
    height: 15,
    flexDirection: "column",
    marginTop: 2,
  })
  container.add(fieldsContainer)

  const statusText = new TextRenderable(renderer, {
    id: "bulk-edit-status",
    content: "",
    fg: GRAY,
    marginTop: 1,
  })
  container.add(statusText)

  const helpText = new TextRenderable(renderer, {
    id: "bulk-edit-help",
    content: "↑↓/jk Navigate  •  Enter Edit Field  •  Ctrl+S Save All  •  Esc Cancel",
    fg: GRAY,
    marginTop: 1,
  })
  container.add(helpText)

  function renderFields() {
    for (const id of fieldRowIds) {
      fieldsContainer.remove(id)
    }
    fieldRowIds = []

    for (let i = 0; i < fieldValues.length; i++) {
      const fv = fieldValues[i]
      const isCurrent = i === currentFieldIndex

      const rowId = `edit-field-row-${i}`
      const fieldRow = new BoxRenderable(renderer, {
        id: rowId,
        width: "100%",
        height: 2,
        flexDirection: "row",
        backgroundColor: isCurrent ? SELECTED_BG : "transparent",
        border: isCurrent,
        borderStyle: "single",
        borderColor: isCurrent ? JIRA_BLUE : GRAY,
        paddingLeft: 1,
      })
      fieldsContainer.add(fieldRow)
      fieldRowIds.push(rowId)

      const typeIcon = fv.field.type === "text" ? "✎" : "◆"
      const marker = new TextRenderable(renderer, {
        id: `edit-field-marker-${i}`,
        content: isCurrent ? `▸ ${typeIcon} ` : `  ${typeIcon} `,
        fg: isCurrent ? JIRA_BLUE : GRAY,
        width: 5,
      })
      fieldRow.add(marker)

      const label = new TextRenderable(renderer, {
        id: `edit-field-label-${i}`,
        content: `${fv.field.label}:`,
        fg: isCurrent ? WHITE : GRAY,
        width: 20,
      })
      fieldRow.add(label)

      const displayValue = fv.value || "(not set)"
      const valueText = new TextRenderable(renderer, {
        id: `edit-field-value-${i}`,
        content: displayValue,
        fg: fv.value ? GREEN : GRAY,
      })
      fieldRow.add(valueText)
    }
  }

  function openFieldEditor(fv: FieldValue) {
    isInEditor = true

    // Hide the bulk edit container while editing
    parent.remove("bulk-edit-container")

    createFieldEditor(
      renderer,
      parent,
      fv.field,
      fv.value,
      fv.optionIndex,
      (result) => {
        isInEditor = false

        if (!result.cancelled) {
          fv.value = result.value
          if (result.optionIndex !== undefined) {
            fv.optionIndex = result.optionIndex
          }
        }

        // Restore the bulk edit container
        parent.add(container)
        renderFields()
      }
    )
  }

  async function saveChanges() {
    let isSaving = true
    helpText.content = "Saving in progress..."

    // Collect fields to update
    const fieldsToUpdate: Record<string, unknown> = {}
    for (const fv of fieldValues) {
      if (fv.field.type === "text") {
        if (fv.field.key === "summary" && fv.value) {
          fieldsToUpdate.summary = fv.value
        } else if (fv.fieldId && fv.value) {
          fieldsToUpdate[fv.fieldId] = fv.value
        }
      } else if (
        fv.field.type === "choice" &&
        fv.fieldId &&
        fv.options &&
        fv.optionIndex !== undefined
      ) {
        const sel = fv.options[fv.optionIndex]
        if (sel && sel.id) {
          fieldsToUpdate[fv.fieldId] = { id: sel.id }
        }
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      statusText.content = "⚠ No changes to save"
      statusText.fg = GRAY
      helpText.content = "↑↓/jk Navigate  •  Enter Edit Field  •  Ctrl+S Save All  •  Esc Cancel"
      return
    }

    // Spinner animation
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    let spinnerIdx = 0
    const spinnerInterval = setInterval(() => {
      if (!isSaving) return
      spinnerIdx = (spinnerIdx + 1) % spinnerFrames.length
      const current = issueKeys.length > 1 ? ` (${savedCount + 1}/${issueKeys.length})` : ""
      statusText.content = `${spinnerFrames[spinnerIdx]} Saving${current}...`
      statusText.fg = JIRA_BLUE
    }, 80)

    let savedCount = 0

    try {
      for (const issueKey of issueKeys) {
        statusText.content = `⠋ Saving ${issueKey}... (${savedCount + 1}/${issueKeys.length})`
        statusText.fg = JIRA_BLUE

        await client.updateIssue(issueKey, fieldsToUpdate)
        savedCount++
      }

      isSaving = false
      clearInterval(spinnerInterval)

      statusText.content = `✓ Successfully updated ${issueKeys.length} issue${issueKeys.length > 1 ? "s" : ""}!`
      statusText.fg = GREEN
      helpText.content = "Closing..."

      setTimeout(() => {
        cleanup()
        onComplete({ success: true, cancelled: false })
      }, 1500)
    } catch (error) {
      isSaving = false
      clearInterval(spinnerInterval)

      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      statusText.content = `✗ Failed after ${savedCount}/${issueKeys.length}: ${errorMsg}`
      statusText.fg = RED
      helpText.content = "Esc to go back  •  Ctrl+S to retry"
    }
  }

  function cleanup() {
    renderer.keyInput.off("keypress", keyHandler)
    parent.remove("bulk-edit-container")
  }

  const keyHandler = (key: KeyEvent) => {
    if (isInEditor) return

    const currentFv = fieldValues[currentFieldIndex]

    // Global shortcuts
    if (key.ctrl && key.name === "s") {
      saveChanges()
      return
    }

    if (key.name === "escape") {
      cleanup()
      onComplete({ success: false, cancelled: true })
      return
    }

    if (key.name === "return") {
      openFieldEditor(currentFv)
      return
    }

    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      if (currentFieldIndex > 0) {
        currentFieldIndex--
        renderFields()
      }
      return
    }

    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      if (currentFieldIndex < fieldValues.length - 1) {
        currentFieldIndex++
        renderFields()
      }
      return
    }
  }

  renderer.keyInput.on("keypress", keyHandler)

  // Initial render
  renderFields()

  return {
    destroy: () => {
      cleanup()
    },
  }
}
