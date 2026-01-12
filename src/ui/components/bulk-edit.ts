import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { JiraClient, FieldOption } from "../../api"
import type { EditableField } from "./field-selector"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#1a1a1a"
const JIRA_BLUE = "#0052CC"
const RED = "#f85149"
const GREEN = "#3fb950"

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
  Bun.write("/tmp/jiratui-debug.log", `createBulkEditScreen called with ${issueKeys.length} issues, ${fields.length} fields\n`, { append: true })
  let currentFieldIndex = 0
  let isEditing = false
  const fieldValues: FieldValue[] = []
  let fieldRowIds: string[] = []

  for (const field of fields) {
    Bun.write("/tmp/jiratui-debug.log", `Processing field: ${field.key}, type: ${field.type}\n`, { append: true })
    const fv: FieldValue = { field, value: "" }
    if (field.type === "choice") {
      Bun.write("/tmp/jiratui-debug.log", `Fetching options for ${field.key}...\n`, { append: true })
      const options = await client.getFieldOptions(field.key)
      Bun.write("/tmp/jiratui-debug.log", `Got ${options.length} options\n`, { append: true })
      fv.options = options
      fv.optionIndex = 0
      fv.value = options[0]?.value ?? ""
      fv.fieldId = await client.getFieldId(field.key) ?? undefined
    }
    fieldValues.push(fv)
  }
  Bun.write("/tmp/jiratui-debug.log", `Done processing fields, creating UI...\n`, { append: true })

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
    content: "↑/↓ Nav  •  Enter: Edit/Confirm  •  Esc: Cancel  •  Ctrl+S: Save All",
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
        height: 3,
        flexDirection: "column",
        backgroundColor: isCurrent ? "#22272e" : "transparent",
        border: isCurrent,
        borderStyle: "single",
        borderColor: isCurrent ? JIRA_BLUE : GRAY,
        paddingLeft: 1,
        marginBottom: 1,
      })
      fieldsContainer.add(fieldRow)
      fieldRowIds.push(rowId)

      const label = new TextRenderable(renderer, {
        id: `edit-field-label-${i}`,
        content: fv.field.label + ":",
        fg: isCurrent ? WHITE : GRAY,
      })
      fieldRow.add(label)

      if (fv.field.type === "text") {
        const valueDisplay = new TextRenderable(renderer, {
          id: `edit-field-value-${i}`,
          content: isEditing && isCurrent ? fv.value + "_" : fv.value || "(empty)",
          fg: fv.value ? WHITE : GRAY,
        })
        fieldRow.add(valueDisplay)
      } else if (fv.field.type === "choice") {
        const options = fv.options ?? []
        const optIdx = fv.optionIndex ?? 0

        const choiceRow = new BoxRenderable(renderer, {
          id: `edit-choice-row-${i}`,
          width: "100%",
          height: 1,
          flexDirection: "row",
        })
        fieldRow.add(choiceRow)

        const leftArrow = new TextRenderable(renderer, {
          id: `edit-choice-left-${i}`,
          content: isCurrent ? "◀ " : "  ",
          fg: isCurrent ? JIRA_BLUE : GRAY,
          width: 3,
        })
        choiceRow.add(leftArrow)

        const valueText = new TextRenderable(renderer, {
          id: `edit-choice-value-${i}`,
          content: options[optIdx]?.value ?? "(none)",
          fg: WHITE,
        })
        choiceRow.add(valueText)

        const rightArrow = new TextRenderable(renderer, {
          id: `edit-choice-right-${i}`,
          content: isCurrent ? " ▶" : "",
          fg: isCurrent ? JIRA_BLUE : GRAY,
          marginLeft: 1,
        })
        choiceRow.add(rightArrow)
      }
    }
  }

  renderFields()

  async function saveChanges() {
    statusText.content = "Saving changes..."
    statusText.fg = GRAY

    try {
      for (const issueKey of issueKeys) {
        const fieldsToUpdate: Record<string, unknown> = {}

        for (const fv of fieldValues) {
          if (fv.value) {
            if (fv.field.key === "summary") {
              fieldsToUpdate.summary = fv.value
            } else if (fv.field.key === "severity" && fv.options && fv.optionIndex !== undefined && fv.fieldId) {
              fieldsToUpdate[fv.fieldId] = { id: fv.options[fv.optionIndex].id }
            }
          }
        }

        if (Object.keys(fieldsToUpdate).length > 0) {
          await client.updateIssue(issueKey, fieldsToUpdate)
        }
      }

      statusText.content = `Successfully updated ${issueKeys.length} issue(s)!`
      statusText.fg = GREEN

      setTimeout(() => {
        renderer.keyInput.off("keypress", keyHandler)
        parent.remove("bulk-edit-container")
        onComplete({ success: true, cancelled: false })
      }, 1000)
    } catch (error) {
      statusText.content = `Error: ${error instanceof Error ? error.message : "Failed to update"}`
      statusText.fg = RED
    }
  }

  const keyHandler = (key: KeyEvent) => {
    const currentFv = fieldValues[currentFieldIndex]

    if (key.ctrl && key.name === "s") {
      saveChanges()
      return
    }

    if (key.name === "escape") {
      if (isEditing) {
        isEditing = false
        renderFields()
      } else {
        renderer.keyInput.off("keypress", keyHandler)
        parent.remove("bulk-edit-container")
        onComplete({ success: false, cancelled: true })
      }
      return
    }

    if (key.name === "return") {
      if (currentFv.field.type === "text") {
        isEditing = !isEditing
        renderFields()
      }
      return
    }

    if (isEditing && currentFv.field.type === "text") {
      if (key.name === "backspace") {
        currentFv.value = currentFv.value.slice(0, -1)
        renderFields()
        return
      }

      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        currentFv.value += key.sequence
        renderFields()
        return
      }
    }

    if (!isEditing) {
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

      if (currentFv.field.type === "choice" && currentFv.options) {
        if (key.name === "left" || (key.name === "h" && !key.ctrl)) {
          if ((currentFv.optionIndex ?? 0) > 0) {
            currentFv.optionIndex = (currentFv.optionIndex ?? 0) - 1
            currentFv.value = currentFv.options[currentFv.optionIndex].value
            renderFields()
          }
          return
        }

        if (key.name === "right" || (key.name === "l" && !key.ctrl)) {
          if ((currentFv.optionIndex ?? 0) < currentFv.options.length - 1) {
            currentFv.optionIndex = (currentFv.optionIndex ?? 0) + 1
            currentFv.value = currentFv.options[currentFv.optionIndex].value
            renderFields()
          }
          return
        }
      }
    }
  }

  renderer.keyInput.on("keypress", keyHandler)

  return {
    destroy: () => {
      renderer.keyInput.off("keypress", keyHandler)
      parent.remove("bulk-edit-container")
    },
  }
}
