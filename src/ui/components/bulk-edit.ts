import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { JiraClient, FieldOption } from "../../api"
import type { EditableField } from "./field-selector"
import { logger } from "../../logging/logger"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#0D1117"
const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const RED = "#f85149"
const GREEN = "#3fb950"
const SELECTED_BG = "#22272e"
const YELLOW = "#d29922"

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

type EditMode = "navigate" | "edit-text" | "edit-choice"

const isMac = process.platform === "darwin"
const pasteHint = isMac ? "⌘V Paste" : "Ctrl+V Paste"
const saveHint = isMac ? "⌘S Save" : "Ctrl+S Save"

export async function createBulkEditScreen(
  renderer: CliRenderer,
  _parent: BoxRenderable,
  issueKeys: string[],
  fields: EditableField[],
  client: JiraClient,
  onComplete: (result: BulkEditResult) => void
): Promise<{ destroy: () => void }> {
  logger.info("Opening bulk edit screen", { issueCount: issueKeys.length, fieldCount: fields.length, issueKeys })

  let currentFieldIndex = 0
  let editMode: EditMode = "navigate"
  const fieldValues: FieldValue[] = []
  let fieldRowIds: string[] = []
  let textInput: InputRenderable | null = null
  let isSaving = false

  for (const field of fields) {
    const fv: FieldValue = { field, value: "", fieldId: field.fieldId }
    if (field.type === "choice") {
      const options = field.options ?? []
      fv.options = options
      fv.optionIndex = options.length > 0 ? 0 : undefined
      fv.value = options[0]?.value ?? ""
    }
    fieldValues.push(fv)
  }

  // Remove the parent container from root to clear the screen
  renderer.root.remove("main-container")
  // Also remove field-selector if it exists
  renderer.root.remove("field-selector-container")

  // Full screen container
  const mainContainer = new BoxRenderable(renderer, {
    id: "bulk-edit-main",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: DARK_BG,
  })
  renderer.root.add(mainContainer)

  // Header
  const headerBox = new BoxRenderable(renderer, {
    id: "bulk-edit-header",
    width: "100%",
    height: 3,
    backgroundColor: JIRA_BLUE,
    alignItems: "center",
    justifyContent: "center",
  })
  mainContainer.add(headerBox)

  const headerText = new TextRenderable(renderer, {
    id: "bulk-edit-header-text",
    content: `Bulk Edit: ${issueKeys.length} Issue${issueKeys.length > 1 ? "s" : ""}`,
    fg: WHITE,
  })
  headerBox.add(headerText)

  // Issue list display
  const issueDisplay = new TextRenderable(renderer, {
    id: "bulk-edit-issues",
    content: `Issues: ${issueKeys.slice(0, 5).join(", ")}${issueKeys.length > 5 ? ` (+${issueKeys.length - 5} more)` : ""}`,
    fg: GRAY,
    marginTop: 1,
    marginLeft: 2,
  })
  mainContainer.add(issueDisplay)

  // Fields container
  const fieldsBox = new BoxRenderable(renderer, {
    id: "bulk-edit-fields-box",
    width: "95%",
    height: "55%",
    marginTop: 1,
    marginLeft: 2,
    flexDirection: "column",
    backgroundColor: JIRA_DARK,
    border: true,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
  })
  mainContainer.add(fieldsBox)

  const fieldsTitle = new TextRenderable(renderer, {
    id: "fields-title",
    content: "Fields to Edit (press Enter or Tab to edit):",
    fg: WHITE,
    marginBottom: 1,
  })
  fieldsBox.add(fieldsTitle)

  const fieldsContainer = new BoxRenderable(renderer, {
    id: "fields-container",
    width: "100%",
    height: 10,
    flexDirection: "column",
  })
  fieldsBox.add(fieldsContainer)

  // Edit area (shown when editing a field)
  const editArea = new BoxRenderable(renderer, {
    id: "edit-area",
    width: "100%",
    height: 4,
    marginTop: 1,
    flexDirection: "column",
    backgroundColor: SELECTED_BG,
    border: true,
    borderStyle: "single",
    borderColor: JIRA_BLUE,
    paddingLeft: 1,
    paddingRight: 1,
  })
  fieldsBox.add(editArea)

  const editLabel = new TextRenderable(renderer, {
    id: "edit-label",
    content: "Select a field and press Enter to edit",
    fg: GRAY,
  })
  editArea.add(editLabel)

  // Status bar
  const statusText = new TextRenderable(renderer, {
    id: "bulk-edit-status",
    content: "",
    fg: GRAY,
    marginTop: 1,
    marginLeft: 2,
  })
  mainContainer.add(statusText)

  // Help bar at bottom
  const helpBox = new BoxRenderable(renderer, {
    id: "bulk-edit-help-box",
    width: "100%",
    height: 1,
    marginTop: 1,
    marginLeft: 2,
  })
  mainContainer.add(helpBox)

  const helpText = new TextRenderable(renderer, {
    id: "bulk-edit-help",
    content: "",
    fg: GRAY,
  })
  helpBox.add(helpText)

  function updateHelpText() {
    if (editMode === "navigate") {
      helpText.content = `↑↓/jk Navigate  •  Tab/Enter Edit  •  ${saveHint}  •  Esc Cancel`
    } else if (editMode === "edit-text") {
      helpText.content = `Type to edit  •  ${pasteHint}  •  Enter/Tab Next  •  Esc Cancel Edit`
    } else if (editMode === "edit-choice") {
      helpText.content = "←→/hl Cycle  •  Enter/Tab Next  •  Esc Cancel Edit"
    }
  }

  function renderFields() {
    for (const id of fieldRowIds) {
      fieldsContainer.remove(id)
    }
    fieldRowIds = []

    for (let i = 0; i < fieldValues.length; i++) {
      const fv = fieldValues[i]
      const isCurrent = i === currentFieldIndex
      const isEditing = isCurrent && editMode !== "navigate"

      const rowId = `field-row-${i}`
      const fieldRow = new BoxRenderable(renderer, {
        id: rowId,
        width: "100%",
        height: 2,
        flexDirection: "row",
        backgroundColor: isCurrent ? SELECTED_BG : "transparent",
        paddingLeft: 1,
      })
      fieldsContainer.add(fieldRow)
      fieldRowIds.push(rowId)

      const typeIcon = fv.field.type === "text" ? "✎" : "◆"
      const marker = new TextRenderable(renderer, {
        id: `field-marker-${i}`,
        content: isCurrent ? `▸ ${typeIcon} ` : `  ${typeIcon} `,
        fg: isEditing ? YELLOW : isCurrent ? JIRA_BLUE : GRAY,
        width: 5,
      })
      fieldRow.add(marker)

      const label = new TextRenderable(renderer, {
        id: `field-label-${i}`,
        content: `${fv.field.label}:`,
        fg: isCurrent ? WHITE : GRAY,
        width: 25,
      })
      fieldRow.add(label)

      const displayValue = fv.value || "(not set)"
      const valueText = new TextRenderable(renderer, {
        id: `field-value-${i}`,
        content: displayValue,
        fg: fv.value ? GREEN : GRAY,
      })
      fieldRow.add(valueText)
    }
  }

  function showEditArea() {
    const fv = fieldValues[currentFieldIndex]
    logger.debug("Opening field editor", { field: fv.field.label, type: fv.field.type })

    // Clear previous edit content
    editArea.remove("edit-input")
    editArea.remove("choice-row")

    if (fv.field.type === "text") {
      editMode = "edit-text"
      editLabel.content = `Edit "${fv.field.label}":`
      editLabel.fg = WHITE

      textInput = new InputRenderable(renderer, {
        id: "edit-input",
        width: 50,
        placeholder: `Enter ${fv.field.label}...`,
        focusedBackgroundColor: "#2d333b",
        marginTop: 1,
      })
      textInput.value = fv.value
      editArea.add(textInput)
      textInput.focus()
    } else {
      editMode = "edit-choice"
      editLabel.content = `Select "${fv.field.label}":`
      editLabel.fg = WHITE
      renderChoiceRow(fv)
    }

    updateHelpText()
    renderFields()
  }

  function renderChoiceRow(fv: FieldValue) {
    editArea.remove("choice-row")

    const options = fv.options ?? []
    const currentIdx = fv.optionIndex ?? 0

    const choiceRow = new BoxRenderable(renderer, {
      id: "choice-row",
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginTop: 1,
    })
    editArea.add(choiceRow)

    const leftArrow = new TextRenderable(renderer, {
      id: "choice-left",
      content: currentIdx > 0 ? "◀ " : "  ",
      fg: currentIdx > 0 ? JIRA_BLUE : GRAY,
      width: 3,
    })
    choiceRow.add(leftArrow)

    const valueText = new TextRenderable(renderer, {
      id: "choice-value",
      content: `[ ${options[currentIdx]?.value ?? "(none)"} ]`,
      fg: GREEN,
    })
    choiceRow.add(valueText)

    const rightArrow = new TextRenderable(renderer, {
      id: "choice-right",
      content: currentIdx < options.length - 1 ? " ▶" : "",
      fg: currentIdx < options.length - 1 ? JIRA_BLUE : GRAY,
      marginLeft: 1,
    })
    choiceRow.add(rightArrow)

    const counter = new TextRenderable(renderer, {
      id: "choice-counter",
      content: `  (${currentIdx + 1}/${options.length})`,
      fg: GRAY,
      marginLeft: 1,
    })
    choiceRow.add(counter)
  }

  function hideEditArea() {
    editArea.remove("edit-input")
    editArea.remove("choice-row")
    editLabel.content = "Select a field and press Enter to edit"
    editLabel.fg = GRAY
    if (textInput) {
      textInput.blur()
      textInput = null
    }
    editMode = "navigate"
    updateHelpText()
    renderFields()
  }

  function confirmCurrentEdit() {
    const fv = fieldValues[currentFieldIndex]
    if (editMode === "edit-text" && textInput) {
      fv.value = textInput.value
      logger.debug("Field value updated", { field: fv.field.label, value: fv.value })
    }
    hideEditArea()
  }

  function moveToNextField() {
    const fv = fieldValues[currentFieldIndex]
    if (editMode === "edit-text" && textInput) {
      fv.value = textInput.value
      logger.debug("Field value updated", { field: fv.field.label, value: fv.value })
    }

    if (currentFieldIndex < fieldValues.length - 1) {
      currentFieldIndex++
      showEditArea()
    } else {
      hideEditArea()
    }
  }

  async function saveChanges() {
    if (isSaving) {
      logger.debug("Save already in progress, ignoring")
      return
    }

    logger.info("Starting bulk save", { issueCount: issueKeys.length })

    if (editMode !== "navigate") {
      confirmCurrentEdit()
    }

    isSaving = true
    helpText.content = "Saving in progress..."

    // Collect fields to update
    const fieldsToUpdate: Record<string, unknown> = {}
    for (const fv of fieldValues) {
      if (fv.field.type === "text") {
        if (fv.value) {
          if (fv.field.key.toLowerCase() === "summary") {
            fieldsToUpdate.summary = fv.value
          } else if (fv.fieldId) {
            fieldsToUpdate[fv.fieldId] = fv.value
          }
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

    logger.info("Fields to update", { fieldsToUpdate })

    if (Object.keys(fieldsToUpdate).length === 0) {
      statusText.content = "⚠ No changes to save - edit some fields first"
      statusText.fg = YELLOW
      isSaving = false
      updateHelpText()
      logger.warn("No fields to update")
      return
    }

    // Spinner animation
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    let spinnerIdx = 0
    let savedCount = 0
    const spinnerInterval = setInterval(() => {
      if (!isSaving) return
      spinnerIdx = (spinnerIdx + 1) % spinnerFrames.length
      const current = issueKeys.length > 1 ? ` (${savedCount + 1}/${issueKeys.length})` : ""
      statusText.content = `${spinnerFrames[spinnerIdx]} Saving${current}...`
      statusText.fg = JIRA_BLUE
    }, 80)

    try {
      for (const issueKey of issueKeys) {
        statusText.content = `⠋ Updating ${issueKey}... (${savedCount + 1}/${issueKeys.length})`
        statusText.fg = JIRA_BLUE
        logger.info("Updating issue", { issueKey, fields: fieldsToUpdate })

        await client.updateIssue(issueKey, fieldsToUpdate)
        savedCount++
        logger.info("Issue updated successfully", { issueKey, savedCount, total: issueKeys.length })
      }

      isSaving = false
      clearInterval(spinnerInterval)

      statusText.content = `✓ Successfully updated ${issueKeys.length} issue${issueKeys.length > 1 ? "s" : ""}!`
      statusText.fg = GREEN
      helpText.content = "Closing in 2 seconds..."
      logger.info("Bulk update completed successfully", { issueCount: issueKeys.length })

      setTimeout(() => {
        cleanup()
        onComplete({ success: true, cancelled: false })
      }, 2000)
    } catch (error) {
      isSaving = false
      clearInterval(spinnerInterval)

      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      statusText.content = `✗ Failed after ${savedCount}/${issueKeys.length}: ${errorMsg}`
      statusText.fg = RED
      helpText.content = `Esc to go back  •  ${saveHint} to retry`
      logger.error("Bulk update failed", { savedCount, total: issueKeys.length, error: errorMsg })
    }
  }

  function cleanup() {
    logger.debug("Cleaning up bulk edit screen")
    renderer.keyInput.off("keypress", keyHandler)
    renderer.root.remove("bulk-edit-main")
  }

  function keyHandler(key: KeyEvent) {
    logger.debug("Key pressed in bulk-edit", { name: key.name, ctrl: key.ctrl, meta: key.meta, sequence: key.sequence })

    const currentFv = fieldValues[currentFieldIndex]

    // Global save shortcut - check for both ctrl and meta (cmd on mac)
    if ((key.ctrl || key.meta) && key.name === "s") {
      logger.info("Save shortcut triggered")
      saveChanges()
      return
    }

    // Edit text mode
    if (editMode === "edit-text") {
      if (key.name === "escape") {
        hideEditArea()
        return
      }
      if (key.name === "return" || key.name === "tab") {
        moveToNextField()
        return
      }
      // InputRenderable handles typing
      return
    }

    // Edit choice mode
    if (editMode === "edit-choice") {
      if (key.name === "escape") {
        hideEditArea()
        return
      }
      if (key.name === "return" || key.name === "tab") {
        moveToNextField()
        return
      }
      if (key.name === "left" || (key.name === "h" && !key.ctrl && !key.meta)) {
        if (currentFv.options && (currentFv.optionIndex ?? 0) > 0) {
          currentFv.optionIndex = (currentFv.optionIndex ?? 0) - 1
          currentFv.value = currentFv.options[currentFv.optionIndex].value
          renderChoiceRow(currentFv)
          renderFields()
        }
        return
      }
      if (key.name === "right" || (key.name === "l" && !key.ctrl && !key.meta)) {
        if (currentFv.options && (currentFv.optionIndex ?? 0) < currentFv.options.length - 1) {
          currentFv.optionIndex = (currentFv.optionIndex ?? 0) + 1
          currentFv.value = currentFv.options[currentFv.optionIndex].value
          renderChoiceRow(currentFv)
          renderFields()
        }
        return
      }
      return
    }

    // Navigate mode
    if (key.name === "escape") {
      logger.info("Bulk edit cancelled by user")
      cleanup()
      onComplete({ success: false, cancelled: true })
      return
    }

    if (key.name === "return" || key.name === "tab") {
      showEditArea()
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
  logger.debug("Key handler registered for bulk-edit")

  // Initial render
  updateHelpText()
  renderFields()

  return {
    destroy: cleanup,
  }
}
