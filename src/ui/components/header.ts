import {
  BoxRenderable,
  ASCIIFontRenderable,
  TextRenderable,
  RGBA,
  type CliRenderer,
} from "@opentui/core"

const JIRA_BLUE_LIGHT = "#0065FF"
const GRAY = "#7A869A"

export function createHeader(
  renderer: CliRenderer,
  parent: BoxRenderable,
  subtitle?: string
): void {
  const logoText = new ASCIIFontRenderable(renderer, {
    id: "logo",
    text: "JIRA-TUI",
    font: "tiny",
    color: RGBA.fromHex(JIRA_BLUE_LIGHT),
  })
  parent.add(logoText)

  const subtitleText = new TextRenderable(renderer, {
    id: "subtitle",
    content: subtitle ?? "Terminal User Interface for JIRA",
    fg: GRAY,
    marginTop: 1,
  })
  parent.add(subtitleText)
}
