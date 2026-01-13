import {
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import type { FieldOption } from "../../api"
import type { EditableField } from "./field-selector"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#0D1117"
const JIRA_BLUE = "#0052CC"
const JIRA_DARK = "#172B4D"
const GREEN = "#3fb950"

export interface FieldEditorResult {
  value: string
  optionIndex?: number
  cancelled: boolean
}

const isMac = process.platform === "darwin"
const pasteHint = isMac ? "⌘V Paste" : "Ctrl+V Paste"

export function createFieldEditor(
  renderer: CliRenderer,
  parent: BoxRenderable,
  field: EditableField,
  currentValue: string,
  currentOptionIndex: number | undefined,
  onComplete: (result: FieldEditorResult) => void
): { destroy: () => void } {
  let textInput: InputRenderable | null = null
  let optionIndex = currentOptionIndex ?? 0
  const options: FieldOption[] = field.options ?? []

  const container = new BoxRenderable(renderer, {
    id: "field-editor-container",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_BG,
  })
  parent.add(container)

  // Header
  const headerBox = new BoxRenderable(renderer, {
    id: "editor-header",
    width: "100%",
    height: 3,
    backgroundColor: JIRA_BLUE,
    alignItems: "center",
    justifyContent: "center",
  })
  container.add(headerBox)

  const headerText = new TextRenderable(renderer, {
    id: "editor-header-text",
    content: `Edit Field: ${field.label}`,
    fg: WHITE,
  })
  headerBox.add(headerText)

  // Main content area
  const contentBox = new BoxRenderable(renderer, {
    id: "editor-content",
    width: 70,
    height: 12,
    marginTop: 3,
    flexDirection: "column",
    backgroundColor: JIRA_DARK,
    border: true,
    borderStyle: "rounded",
    borderColor: JIRA_BLUE,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 3,
    paddingRight: 3,
  })
  container.add(contentBox)

  if (field.type === "text") {
    const label = new TextRenderable(renderer, {
      id: "editor-label",
      content: `Enter value for "${field.label}":`,
      fg: WHITE,
    })
    contentBox.add(label)

    textInput = new InputRenderable(renderer, {
      id: "editor-input",
      width: 60,
      placeholder: `Type ${field.label}...`,
      focusedBackgroundColor: "#2d333b",
      marginTop: 2,
    })
    textInput.value = currentValue
    contentBox.add(textInput)
    textInput.focus()

    const hintText = new TextRenderable(renderer, {
      id: "editor-hint",
      content: "Start typing to edit the value",
      fg: GRAY,
      marginTop: 2,
    })
    contentBox.add(hintText)
  } else {
    const label = new TextRenderable(renderer, {
      id: "editor-label",
      content: `Select value for "${field.label}":`,
      fg: WHITE,
    })
    contentBox.add(label)

    renderChoiceDisplay()
  }

  function renderChoiceDisplay() {
    contentBox.remove("choice-display-box")
    contentBox.remove("choice-hint")

    const choiceBox = new BoxRenderable(renderer, {
      id: "choice-display-box",
      width: "100%",
      height: 3,
      marginTop: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    })
    contentBox.add(choiceBox)

    const leftArrow = new TextRenderable(renderer, {
      id: "choice-left",
      content: optionIndex > 0 ? "  ◀◀  " : "      ",
      fg: optionIndex > 0 ? JIRA_BLUE : GRAY,
    })
    choiceBox.add(leftArrow)

    const valueBox = new BoxRenderable(renderer, {
      id: "choice-value-box",
      width: 40,
      height: 3,
      border: true,
      borderStyle: "rounded",
      borderColor: JIRA_BLUE,
      backgroundColor: "#22272e",
      alignItems: "center",
      justifyContent: "center",
    })
    choiceBox.add(valueBox)

    const valueText = new TextRenderable(renderer, {
      id: "choice-value-text",
      content: options[optionIndex]?.value ?? "(none)",
      fg: GREEN,
    })
    valueBox.add(valueText)

    const rightArrow = new TextRenderable(renderer, {
      id: "choice-right",
      content: optionIndex < options.length - 1 ? "  ▶▶  " : "      ",
      fg: optionIndex < options.length - 1 ? JIRA_BLUE : GRAY,
    })
    choiceBox.add(rightArrow)

    const hintText = new TextRenderable(renderer, {
      id: "choice-hint",
      content: `Option ${optionIndex + 1} of ${options.length}`,
      fg: GRAY,
      marginTop: 1,
    })
    contentBox.add(hintText)
  }

  // Help bar at bottom
  const helpBox = new BoxRenderable(renderer, {
    id: "editor-help-box",
    width: "100%",
    height: 1,
    marginTop: 3,
    alignItems: "center",
    justifyContent: "center",
  })
  container.add(helpBox)

  const helpContent = field.type === "text"
    ? `Enter Confirm  •  ${pasteHint}  •  Esc Cancel`
    : "←/h Previous  •  →/l Next  •  Enter Confirm  •  Esc Cancel"

  const helpText = new TextRenderable(renderer, {
    id: "editor-help-text",
    content: helpContent,
    fg: GRAY,
  })
  helpBox.add(helpText)

  function cleanup() {
    renderer.keyInput.off("keypress", keyHandler)
    if (textInput) {
      textInput.blur()
    }
    parent.remove("field-editor-container")
  }

  function confirm() {
    if (field.type === "text") {
      const value = textInput?.value ?? currentValue
      cleanup()
      onComplete({ value, cancelled: false })
    } else {
      const value = options[optionIndex]?.value ?? ""
      cleanup()
      onComplete({ value, optionIndex, cancelled: false })
    }
  }

  function cancel() {
    cleanup()
    onComplete({ value: currentValue, optionIndex: currentOptionIndex, cancelled: true })
  }

  const keyHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      cancel()
      return
    }

    if (key.name === "return") {
      confirm()
      return
    }

    // Choice navigation
    if (field.type === "choice") {
      if (key.name === "left" || (key.name === "h" && !key.ctrl && !key.meta)) {
        if (optionIndex > 0) {
          optionIndex--
          renderChoiceDisplay()
        }
        return
      }

      if (key.name === "right" || (key.name === "l" && !key.ctrl && !key.meta)) {
        if (optionIndex < options.length - 1) {
          optionIndex++
          renderChoiceDisplay()
        }
        return
      }
    }

    // Text input handles typing/paste automatically when focused
  }

  renderer.keyInput.on("keypress", keyHandler)

  return {
    destroy: cleanup,
  }
}
