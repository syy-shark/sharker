---
name: code-review
description: Use when reviewing code changes, PRs, or diffs. Focus on bugs, regressions, missing tests, and clear improvement suggestions.
---

# Code Review

Review like a senior engineer:

1. **Correctness** — logic bugs, edge cases, error handling
2. **Security** — injection, secrets, unsafe defaults
3. **Maintainability** — naming, duplication, scope of change
4. **Tests** — what's missing for the diff

Output: grouped findings (critical / suggestion / nit), each with file reference when possible.
