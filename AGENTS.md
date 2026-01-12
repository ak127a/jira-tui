# AGENTS.md - jiratui Development Guide

## Overview

**jiratui** is a Terminal User Interface (TUI) application for interacting with JIRA (Cloud and On-Premise). Built with TypeScript and Bun runtime using @opentui/core for CLI rendering.

## Build Commands

```bash
# Run the application
bun run src/main.ts

# Development mode (watch mode)
bun run --watch src/main.ts

# Type checking only (strict mode)
npm run typecheck   # or: bun run typecheck
```

## Code Style Guidelines

### Imports

- Use `import { ... } from "..."` for values
- Use `import type { ... } from "..."` for type-only imports
- Organize imports at the top of files, grouped by:
  1. External libraries (e.g., @opentui/core)
  2. Internal modules (e.g., ./config, ./api)
- Use relative paths (`../`, `./`) consistently with directory structure

```typescript
import { createCliRenderer, type KeyEvent } from "@opentui/core"
import type { JiraConfig } from "../config/types"
import type { JiraIssue, JiraProject } from "./types"
```

### Formatting & TypeScript

- **Strict mode enabled**: All types must be explicit
- Use `interface` for object shapes and class contracts
- Use `type` for union types and primitives only
- All function parameters and return types must be typed
- Use `async/await` for all async operations
- Prefer `null` over `undefined` for optional values
- Use `unknown` for external input, narrow with type guards

```typescript
interface JiraClient {
  readonly config: JiraConfig
  readonly isCloud: boolean
  getProjects(): Promise<JiraProject[]>
}

type JiraMode = "cloud" | "onprem"
```

### Naming Conventions

- **camelCase**: Variables, functions, properties (`selectedProject`, `createTable`)
- **PascalCase**: Classes, interfaces, types (`JiraApiError`, `AppContext`)
- **UPPER_CASE**: Constants (`JIRA_BLUE`, `PAGE_SIZE`)
- **Prefix boolean getters with `is`/`has`**: `isCloud`, `hasError`
- **Use descriptive names**: `getProjectIssues` not `getIssues`

### Error Handling

- Use `try-catch` for async operations with `instanceof Error` checks
- Throw custom error classes for domain-specific errors
- Handle errors at the appropriate level (UI screens catch and display; main catches fatal errors)
- Never silently swallow errors

```typescript
try {
  await client.getProjects()
} catch (err) {
  if (err instanceof JiraApiError) {
    console.error(`API Error ${err.statusCode}: ${err.message}`)
  }
  throw err
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
```

### File Organization

```
src/
├── api/           # API clients, types, utilities
├── config/        # Configuration and caching logic
├── ui/
│   ├── components/   # Reusable UI components
│   ├── screens/      # Screen implementations
│   ├── context.ts    # App context and state
│   └── index.ts      # UI exports
└── main.ts        # Entry point
```

### Component Patterns

- **Screens**: Factory functions named `create*Screen` (e.g., `createProjectsScreen`)
- **Components**: Classes or factory functions in `src/ui/components/`
- **Context**: Single `AppContext` object passed through navigation

```typescript
async function createProjectsScreen(ctx: AppContext): Promise<void> {
  // Render screen, attach event handlers
}
```

### Async Patterns

- All async functions return `Promise<T>`
- Use `async/await` with proper error handling
- Avoid Promise chains; use `await` for readability

## Project-Specific Conventions

- **JIRA Cloud vs On-Premise**: Abstract common interface (`JiraClient`) with implementation variants (`CloudJiraClient`, `DataCenterJiraClient`)
- **API Versioning**: Cloud uses API v3, Data Center uses API v2
- **Auth**: Basic auth with base64-encoded `username:password`
- **Comments**: Brief `//` comments explaining "why", not "what"

## Testing

- No test framework currently implemented
- When adding tests, use Bun's built-in test runner: `bun test`
