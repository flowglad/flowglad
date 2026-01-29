---
name: contextual-review
description: Review pull requests for code quality, security vulnerabilities, best practices, and potential issues. Use when reviewing PRs, examining diffs, or providing code review feedback.
---

# Contextual Review

Perform comprehensive reviews of code changes, implementation plans, and architecture decisions. Analyzes for quality, correctness, security, and adherence to project standards.

## First: Read the Base Guidelines

**Before reviewing any code, read [base-review.md](base-review.md).** It establishes:
- Reviewer philosophy (respect existing patterns, burden of proof on changes)
- Core quality standards (type safety, transaction integrity, data access, caching)
- Severity calibration with codebase-specific examples
- Common blind spots that reviewers unfamiliar with this codebase miss

The base guidelines apply to ALL reviews. Area-specific guides add targeted checklists.

## When to Use

- Reviewing pull request changes
- Examining workspace diffs before creating a PR
- Getting feedback on code changes
- Identifying potential issues before merging
- Reviewing gameplans and implementation plans before execution
- Validating data model and API design decisions

## Area-Specific Guidelines

Based on what files changed, consult the appropriate reference:

| Changed Files | Reference |
|---------------|-----------|
| `platform/docs/` | [docs-review.md](docs-review.md) - Documentation review guidelines |
| `platform/flowglad-next/src/db/schema/`, `openapi.json`, `api-contract/` | [api-review.md](api-review.md) - Data model and API review |
| `packages/` | [packages-review.md](packages-review.md) - SDK package review |
| `playground/` | [playground-review.md](playground-review.md) - Example project review |
| `platform/flowglad-next/` | [platform-review.md](platform-review.md) - Main platform review |

For reviewing implementation plans before code is written:

| Review Type | Reference |
|-------------|-----------|
| Gameplans / Implementation Plans | [gameplan-review.md](gameplan-review.md) - Pre-implementation plan review |

Read the relevant reference file(s) based on the diff to get area-specific checklists and guidelines.

## Review Process

### 0. Checkout PR

Run `gh pr checkout <PR>` to get the PR code locally. If it fails, continue with the review.

### 1. Gather Context

First, understand the scope of changes:

```
# Get the diff statistics to understand what files changed
GetWorkspaceDiff with stat: true

# Then examine individual file changes
GetWorkspaceDiff with file: 'path/to/file'
```

### 2. Review Categories

Analyze changes across these dimensions:

| Category | Focus Areas |
|----------|-------------|
| Correctness | Logic errors, edge cases, null handling, off-by-one errors |
| Security | Input validation, injection risks, auth/authz, secrets exposure |
| Performance | N+1 queries, unnecessary loops, missing indexes, memory leaks |
| Maintainability | Code clarity, naming, DRY violations, complexity |
| Testing | Test coverage, edge cases tested, test quality |
| Types | Type safety, proper typing, avoiding `any` |

### 3. Project-Specific Checks

For this codebase, also verify:

- **Bun**: Using `bun` instead of `npm` or `yarn`
- **Drizzle ORM**: Schema changes use `migrations:generate`, never manual migrations
- **Testing Guidelines**:
  - No mocking unless for network calls
  - No `.spyOn` or dynamic imports
  - No `any` types in tests
  - Each `it` block should have specific assertions, not `toBeDefined`
  - One scenario per `it` with exhaustive assertions
- **Security**: Check OWASP top 10 vulnerabilities (XSS, injection, etc.)

### 4. Provide Feedback

Use the DiffComment tool to leave targeted feedback:

```typescript
DiffComment({
  comments: [
    {
      file: "path/to/file.ts",
      lineNumber: 42,
      body: "Potential SQL injection vulnerability. Consider using parameterized queries."
    }
  ]
})
```

## Review Checklist

### Code Quality
- [ ] Clear, descriptive variable and function names
- [ ] Functions are focused and not too long
- [ ] No dead code or commented-out code
- [ ] Error handling is appropriate
- [ ] Edge cases are handled

### Security
- [ ] No hardcoded secrets or credentials
- [ ] Input is validated and sanitized
- [ ] No SQL injection vectors
- [ ] No XSS vulnerabilities
- [ ] Authentication/authorization is correct
- [ ] Sensitive data is not logged

### Performance
- [ ] No unnecessary database queries
- [ ] Appropriate use of indexes
- [ ] No obvious memory leaks
- [ ] Pagination for large datasets
- [ ] Caching where appropriate

### Testing
- [ ] New code has tests
- [ ] Tests cover happy path and error cases
- [ ] Tests are meaningful, not just for coverage
- [ ] No flaky test patterns

### TypeScript
- [ ] Proper types used (no `any` without justification)
- [ ] Type narrowing is correct
- [ ] Generic types are appropriate
- [ ] Null/undefined handled properly

## Output Format

Provide a structured review with:

1. **Summary**: Brief overview of what the PR does
2. **Findings**: Categorized issues (Critical, High, Medium, Low, Suggestions)
3. **Positive Notes**: Good patterns or improvements noticed
4. **Recommendation**: Approve, Request Changes, or Comment

### Severity Levels

- **Critical**: Security vulnerabilities, data loss risks, breaking changes
- **High**: Bugs, significant performance issues, missing error handling
- **Medium**: Code quality issues, missing tests, unclear logic
- **Low**: Style issues, minor improvements, nitpicks
- **Suggestion**: Optional improvements, alternative approaches

## Example Review

```markdown
## Summary
This PR adds user authentication using JWT tokens with refresh token support.

## Findings

### Critical
- **src/auth/token.ts:45**: JWT secret is hardcoded. Move to environment variable.

### High
- **src/auth/login.ts:23**: Missing rate limiting on login endpoint.

### Medium
- **src/auth/validate.ts:12**: Token expiration check should use `<=` not `<` to handle exact expiration time.

### Suggestions
- Consider adding request ID to auth logs for debugging.

## Positive Notes
- Good separation of concerns between token generation and validation
- Comprehensive error types for different auth failures

## Recommendation
**Request Changes** - Address the critical security issue before merging.
```

## Workflow

1. Attempt to checkout the PR with `gh pr checkout <PR>` (continue if it fails)
2. Get diff statistics with `GetWorkspaceDiff(stat: true)`
3. Review changed files systematically
4. Use `DiffComment` for inline feedback
5. Provide overall summary and recommendation
6. Offer to help fix any critical issues
