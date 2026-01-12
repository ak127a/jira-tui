import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core"

const WHITE = "#FFFFFF"
const GRAY = "#7A869A"
const DARK_BG = "#1a1a1a"
const HEADER_BG = "#2d333b"

export interface TableColumn {
  key: string
  label: string
  width: number
}

export interface TableRow {
  [key: string]: string
}

export interface TableOptions {
  id: string
  columns: TableColumn[]
  rows: TableRow[]
  width?: number | `${number}%`
  maxHeight?: number
  selectedIndex?: number
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str.padEnd(maxLen)
  return str.slice(0, maxLen - 1) + "…"
}

export function createTable(
  renderer: CliRenderer,
  parent: BoxRenderable,
  options: TableOptions
): BoxRenderable {
  const { id, columns, rows, width = "100%", maxHeight = 20 } = options

  const tableBox = new BoxRenderable(renderer, {
    id,
    width,
    maxHeight,
    flexDirection: "column",
    backgroundColor: DARK_BG,
    border: true,
    borderStyle: "single",
    borderColor: GRAY,
  })
  parent.add(tableBox)

  const headerRow = new BoxRenderable(renderer, {
    id: `${id}-header`,
    width: "100%",
    height: 1,
    flexDirection: "row",
    backgroundColor: HEADER_BG,
  })
  tableBox.add(headerRow)

  for (const col of columns) {
    const headerCell = new TextRenderable(renderer, {
      id: `${id}-header-${col.key}`,
      content: truncate(col.label, col.width),
      fg: WHITE,
      width: col.width,
      marginRight: 1,
    })
    headerRow.add(headerCell)
  }

  const separator = new TextRenderable(renderer, {
    id: `${id}-separator`,
    content: "─".repeat(columns.reduce((sum, c) => sum + c.width + 1, 0)),
    fg: GRAY,
    width: "100%",
  })
  tableBox.add(separator)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isSelected = i === options.selectedIndex

    const rowBox = new BoxRenderable(renderer, {
      id: `${id}-row-${i}`,
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: isSelected ? "#0052CC" : (i % 2 === 0 ? DARK_BG : "#22272e"),
    })
    tableBox.add(rowBox)

    for (const col of columns) {
      const cellValue = row[col.key] ?? ""
      const cell = new TextRenderable(renderer, {
        id: `${id}-cell-${i}-${col.key}`,
        content: truncate(cellValue, col.width),
        fg: isSelected ? WHITE : GRAY,
        width: col.width,
        marginRight: 1,
      })
      rowBox.add(cell)
    }
  }

  return tableBox
}
