# Refactoring Tools Reference

Detailed reference for each refactoring tool, including usage patterns, strengths, and when to prefer one over another.

## Tool Comparison Matrix

| Tool | AST-Aware | Type-Aware | Speed | Learning Curve | Best For |
|------|-----------|------------|-------|----------------|----------|
| ast-grep | Yes | No | Fast | Low | Most refactoring tasks |
| ts-morph | Yes | Yes | Medium | Medium | Type-dependent transforms |
| jscodeshift | Yes | No | Medium | Medium | Existing codemods |
| comby | Structural | No | Fast | Low | Simple patterns |
| ESLint --fix | Yes | Partial | Medium | Low | Enforcing standards |
| sed/awk | No | No | Fast | Low | Text-only changes |

## ast-grep

**Primary tool for TypeScript refactoring.** Provides syntax-aware search and replace with a simple pattern syntax.

### Installation

```bash
# Already available in this environment
ast-grep --version
```

### Basic Usage

```bash
# Search for pattern
ast-grep --lang typescript -p 'PATTERN'

# Search with context
ast-grep --lang typescript -p 'PATTERN' -C 3

# Replace pattern
ast-grep --lang typescript -p 'PATTERN' -r 'REPLACEMENT' --update-all

# Interactive mode (preview before applying)
ast-grep --lang typescript -p 'PATTERN' -r 'REPLACEMENT' --interactive

# Output as JSON for processing
ast-grep --lang typescript -p 'PATTERN' --json
```

### Strictness Modes

Control how strictly patterns match:

```bash
# Default - flexible matching
ast-grep --lang typescript -p 'foo()'

# Strict algorithm - exact structure matching
ast-grep --lang typescript -p 'foo()' --strictness cst

# Signature matching - match function signatures
ast-grep --lang typescript -p 'foo()' --strictness signature
```

### Rule-Based Scanning

For complex multi-pattern rules, use YAML rule files:

```yaml
# rules/rename-deprecated.yml
id: rename-deprecated-api
language: typescript
rule:
  pattern: oldApiCall($$$ARGS)
fix: newApiCall($$$ARGS)
```

```bash
ast-grep scan --rule rules/rename-deprecated.yml
ast-grep scan --rule rules/rename-deprecated.yml --update-all
```

### When to Use ast-grep

- Renaming functions, variables, types
- Updating function call patterns
- Changing import statements
- Any structural code transformation
- When you need speed and simplicity

### Limitations

- No type information (can't distinguish `user.name` on different types)
- Pattern must match AST structure exactly
- Complex conditional transformations need rule files

See [ast-grep-patterns.md](ast-grep-patterns.md) for pattern syntax and examples.

## ts-morph

**TypeScript compiler API wrapper.** Use when you need type information or complex programmatic transformations.

### Installation

```bash
bun add -d ts-morph
```

### Script Template

```typescript
// scripts/refactor-example.ts
import { Project, SyntaxKind } from 'ts-morph'

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
})

// Add source files
project.addSourceFilesAtPaths('src/**/*.ts')

// Process each file
for (const sourceFile of project.getSourceFiles()) {
  // Find specific nodes
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of calls) {
    const name = call.getExpression().getText()
    if (name === 'oldFunction') {
      // Get type information
      const type = call.getReturnType()

      // Transform based on type
      if (type.getText() === 'Promise<User>') {
        call.replaceWithText(`newFunction(${call.getArguments().map(a => a.getText()).join(', ')})`)
      }
    }
  }
}

// Save changes
await project.save()
```

### Running ts-morph Scripts

```bash
bun run scripts/refactor-example.ts
```

### Common Operations

```typescript
// Rename a symbol (follows references)
const func = sourceFile.getFunction('oldName')
func?.rename('newName')

// Add parameter to function
const func = sourceFile.getFunction('myFunc')
func?.addParameter({ name: 'options', type: 'Options', hasQuestionToken: true })

// Change return type
const func = sourceFile.getFunction('myFunc')
func?.setReturnType('Promise<Result>')

// Add import
sourceFile.addImportDeclaration({
  moduleSpecifier: '@/utils',
  namedImports: ['helper'],
})

// Remove unused imports
sourceFile.fixUnusedIdentifiers()

// Get all references to a symbol
const refs = func?.findReferences()
```

### When to Use ts-morph

- Need to distinguish calls based on their type
- Complex conditional transformations
- Need to follow type references
- Adding/removing function parameters
- Refactoring that requires understanding type relationships
- Generating code based on existing types

### Limitations

- Slower than ast-grep (loads full TypeScript compiler)
- Requires writing a script
- Overkill for simple renames

## jscodeshift

**Facebook's codemod toolkit.** Best when leveraging existing codemods or building reusable transforms.

### Installation

```bash
bun add -d jscodeshift @types/jscodeshift
```

### Finding Existing Codemods

Many libraries provide codemods for migrations:

```bash
# React codemods
npx react-codemod <transform> <path>

# Next.js codemods
npx @next/codemod <transform> <path>
```

### Writing a Codemod

```typescript
// codemods/rename-function.ts
import { Transform } from 'jscodeshift'

const transform: Transform = (file, api) => {
  const j = api.jscodeshift

  return j(file.source)
    .find(j.CallExpression, {
      callee: { name: 'oldFunction' }
    })
    .replaceWith(path => {
      return j.callExpression(
        j.identifier('newFunction'),
        path.node.arguments
      )
    })
    .toSource()
}

export default transform
```

### Running jscodeshift

```bash
# Run a codemod
npx jscodeshift -t codemods/rename-function.ts src/**/*.ts

# Dry run (preview changes)
npx jscodeshift -t codemods/rename-function.ts src/**/*.ts --dry

# With TypeScript parser
npx jscodeshift -t codemods/rename-function.ts src/**/*.ts --parser ts
```

### When to Use jscodeshift

- Migrating between library versions (often codemods exist)
- Building reusable codemods for team use
- Complex transformations with many edge cases
- When you need the jscodeshift ecosystem of existing codemods

### Limitations

- More verbose than ast-grep
- Requires understanding jscodeshift API
- Slower for simple transformations

## comby

**Structural search tool.** Simpler than AST tools, but more powerful than regex.

### Installation

```bash
# Install via homebrew
brew install comby
```

### Basic Usage

```bash
# Search
comby 'oldFunc(:[args])' '' .ts

# Replace
comby 'oldFunc(:[args])' 'newFunc(:[args])' .ts

# Preview
comby 'oldFunc(:[args])' 'newFunc(:[args])' .ts -diff

# Apply changes
comby 'oldFunc(:[args])' 'newFunc(:[args])' .ts -in-place
```

### Pattern Syntax

```
:[hole]     - Match any code (non-greedy)
:[hole:e]   - Match balanced expressions
:[hole:s]   - Match strings
:[[hole]]   - Match identifier characters
```

### When to Use comby

- Quick structural patterns
- When ast-grep pattern syntax is too strict
- Cross-language refactoring (comby works on any language)

### Limitations

- Less precise than AST-based tools
- Can match unintended patterns
- No type information

## ESLint --fix

**Enforce patterns via lint rules.** Good for ongoing enforcement, not one-time refactors.

### Using Auto-Fix Rules

```bash
# Fix all auto-fixable issues
bunx eslint --fix 'src/**/*.ts'

# Fix specific rule
bunx eslint --fix --rule 'prefer-const: error' 'src/**/*.ts'
```

### Custom Rule for Enforcement

```typescript
// eslint-rules/no-old-api.js
module.exports = {
  meta: {
    fixable: 'code',
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === 'oldApi') {
          context.report({
            node,
            message: 'Use newApi instead',
            fix(fixer) {
              return fixer.replaceText(node.callee, 'newApi')
            }
          })
        }
      }
    }
  }
}
```

### When to Use ESLint --fix

- Enforcing patterns after a refactor
- Gradual migration (fail CI on old patterns)
- Style transformations (already have rules)

### Limitations

- Not meant for one-time bulk refactoring
- Requires rule configuration
- Can be slow on large codebases

## sed/awk

**Text-based replacement.** Use only for simple, unambiguous text patterns.

### Basic sed Usage

```bash
# Replace text in files
sed -i '' 's/oldText/newText/g' src/**/*.ts

# Preview changes
sed 's/oldText/newText/g' src/file.ts

# With regex
sed -i '' 's/old\(Pattern\)/new\1/g' src/**/*.ts
```

### When to Use sed/awk

- Simple string literals (not code patterns)
- Comments and documentation
- Configuration files
- When pattern is unambiguous text, not code

### Limitations

- No syntax awareness (will match inside strings, comments)
- Easy to create invalid code
- Difficult to match multi-line patterns

## Decision Flowchart

```
Need to refactor TypeScript code?
│
├─ Is it a simple rename or pattern replacement?
│  │
│  ├─ Yes → Use ast-grep
│  │
│  └─ No, need type information?
│     │
│     ├─ Yes → Use ts-morph
│     │
│     └─ No, is there an existing codemod?
│        │
│        ├─ Yes → Use jscodeshift
│        │
│        └─ No, is it text-only (not code)?
│           │
│           ├─ Yes → Use sed/awk
│           │
│           └─ No → Use ast-grep with rules
```

## Performance Comparison

On a typical ~500 file TypeScript project:

| Tool | Simple Rename | Complex Transform |
|------|---------------|-------------------|
| ast-grep | ~2s | ~5s |
| ts-morph | ~15s | ~30s |
| jscodeshift | ~20s | ~45s |
| sed | ~1s | N/A |

**Recommendation**: Start with ast-grep. Only reach for ts-morph when you need type information.
