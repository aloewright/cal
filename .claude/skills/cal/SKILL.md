```markdown
# cal Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `cal` TypeScript codebase. It covers file naming, import/export styles, commit message conventions, and testing patterns. While no frameworks or automated workflows are detected, this guide provides best practices and suggested commands to streamline development and collaboration.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `dateUtils.ts`, `calendarView.ts`

### Import Style
- Use **relative imports** for referencing local modules.
  - Example:
    ```typescript
    import { addDays } from './dateUtils';
    ```

### Export Style
- Mixed usage of **named** and **default exports**.
  - Named export example:
    ```typescript
    export function addDays(date: Date, days: number): Date {
      // ...
    }
    ```
  - Default export example:
    ```typescript
    export default CalendarView;
    ```

### Commit Message Conventions
- Use the `feat` prefix for new features.
- Commit messages are concise, averaging 37 characters.
  - Example: `feat: add support for recurring events`

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new functionality.
**Command:** `/add-feature`

1. Create a new file using camelCase naming.
2. Implement the feature using TypeScript.
3. Use relative imports for any dependencies.
4. Export your module (named or default as appropriate).
5. Write a commit message starting with `feat:`.
6. If applicable, add or update corresponding test files.

### Writing Tests
**Trigger:** When adding or updating tests.
**Command:** `/write-test`

1. Create a test file with the pattern `*.test.*` (e.g., `dateUtils.test.ts`).
2. Write test cases for your module.
3. Use the project's preferred (unknown) testing framework.
4. Run tests to ensure correctness.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `calendarView.test.ts`
- The specific testing framework is not detected.
- Place test files alongside the modules they test or in a dedicated test directory.

## Commands
| Command        | Purpose                                 |
|----------------|-----------------------------------------|
| /add-feature   | Scaffold and commit a new feature       |
| /write-test    | Create and run tests for a module       |
```
