# ast-grep Pattern Library

Common ast-grep patterns for TypeScript refactoring. All examples use `--lang typescript`.

## Metavariable Reference

ast-grep uses metavariables to capture parts of the code:

| Syntax | Matches | Example |
|--------|---------|---------|
| `$VAR` | Single AST node | `$FUNC()` matches `foo()` |
| `$$VAR` | Zero or more nodes (non-greedy) | `f($$ARGS)` matches `f()` or `f(a)` |
| `$$$VAR` | Zero or more nodes (greedy) | `f($$$ARGS)` matches `f(a, b, c)` |
| `$_` | Anonymous single node | `$_()` matches any function call |

### Examples

```bash
# Match any function call
ast-grep --lang typescript -p '$FUNC($$$ARGS)'

# Match method call on any object
ast-grep --lang typescript -p '$OBJ.$METHOD($$$ARGS)'

# Match any assignment
ast-grep --lang typescript -p '$VAR = $VALUE'

# Match specific method call
ast-grep --lang typescript -p '$OBJ.map($$$ARGS)'
```

## Function Patterns

### Function Declarations

```bash
# Named function
ast-grep --lang typescript -p 'function $NAME($$$PARAMS) { $$$BODY }'

# Arrow function assigned to const
ast-grep --lang typescript -p 'const $NAME = ($$$PARAMS) => $BODY'

# Arrow function with explicit return type
ast-grep --lang typescript -p 'const $NAME = ($$$PARAMS): $RET => $BODY'

# Async function
ast-grep --lang typescript -p 'async function $NAME($$$PARAMS) { $$$BODY }'

# Async arrow function
ast-grep --lang typescript -p 'const $NAME = async ($$$PARAMS) => $BODY'
```

### Function Calls

```bash
# Simple call
ast-grep --lang typescript -p 'myFunction($$$ARGS)'

# Method call
ast-grep --lang typescript -p '$OBJ.myMethod($$$ARGS)'

# Chained calls
ast-grep --lang typescript -p '$OBJ.method1().method2($$$ARGS)'

# Await call
ast-grep --lang typescript -p 'await $FUNC($$$ARGS)'

# Call with specific first argument
ast-grep --lang typescript -p 'myFunc($FIRST, $$$REST)'
```

### Transformations

```bash
# Rename function
ast-grep --lang typescript -p 'oldFunc($$$ARGS)' -r 'newFunc($$$ARGS)' --update-all

# Add parameter
ast-grep --lang typescript -p 'myFunc($ARG1, $ARG2)' -r 'myFunc($ARG1, $ARG2, {})' --update-all

# Wrap in another call
ast-grep --lang typescript -p 'rawQuery($$$ARGS)' -r 'withLogging(rawQuery($$$ARGS))' --update-all

# Remove a call (replace with its result)
ast-grep --lang typescript -p 'wrapper($INNER)' -r '$INNER' --update-all
```

## Import/Export Patterns

### Import Statements

```bash
# Default import
ast-grep --lang typescript -p "import $NAME from '$MODULE'"

# Named imports
ast-grep --lang typescript -p "import { $$$NAMES } from '$MODULE'"

# Specific module
ast-grep --lang typescript -p "import { $$$NAMES } from '@/utils/helpers'"

# Import with alias
ast-grep --lang typescript -p "import { $NAME as $ALIAS } from '$MODULE'"

# Side-effect import
ast-grep --lang typescript -p "import '$MODULE'"
```

### Export Statements

```bash
# Named export
ast-grep --lang typescript -p 'export const $NAME = $VALUE'

# Export function
ast-grep --lang typescript -p 'export function $NAME($$$PARAMS) { $$$BODY }'

# Default export
ast-grep --lang typescript -p 'export default $EXPR'

# Re-export
ast-grep --lang typescript -p "export { $$$NAMES } from '$MODULE'"
```

### Transformations

```bash
# Update import path
ast-grep --lang typescript -p "import { \$\$\$NAMES } from '@/old/path'" -r "import { \$\$\$NAMES } from '@/new/path'" --update-all

# Add to existing import (manual step needed)
# First find: import { existingImport } from '@/module'
# Then add new import manually

# Convert default to named import
ast-grep --lang typescript -p "import $NAME from '@/module'" -r "import { $NAME } from '@/module'" --update-all
```

## Type Patterns

### Type Annotations

```bash
# Variable with type
ast-grep --lang typescript -p 'const $NAME: $TYPE = $VALUE'

# Function parameter type
ast-grep --lang typescript -p '($NAME: $TYPE)'

# Return type annotation
ast-grep --lang typescript -p '): $TYPE {'

# Generic type
ast-grep --lang typescript -p '$TYPE<$GENERIC>'

# Union type
ast-grep --lang typescript -p '$TYPE1 | $TYPE2'
```

### Type Definitions

```bash
# Interface
ast-grep --lang typescript -p 'interface $NAME { $$$MEMBERS }'

# Type alias
ast-grep --lang typescript -p 'type $NAME = $DEF'

# Generic interface
ast-grep --lang typescript -p 'interface $NAME<$$$GENERICS> { $$$MEMBERS }'

# Enum
ast-grep --lang typescript -p 'enum $NAME { $$$MEMBERS }'
```

### Transformations

```bash
# Rename type
ast-grep --lang typescript -p ': OldType' -r ': NewType' --update-all
ast-grep --lang typescript -p 'OldType<$T>' -r 'NewType<$T>' --update-all

# Change generic constraint
ast-grep --lang typescript -p '<$T extends OldBase>' -r '<$T extends NewBase>' --update-all
```

## React Patterns

### Components

```bash
# Function component
ast-grep --lang tsx -p 'function $NAME($PROPS) { $$$BODY return $JSX }'

# Arrow component
ast-grep --lang tsx -p 'const $NAME = ($PROPS) => { $$$BODY return $JSX }'

# Component with explicit type
ast-grep --lang tsx -p 'const $NAME: React.FC<$PROPS> = $BODY'

# forwardRef component
ast-grep --lang tsx -p 'forwardRef<$REF, $PROPS>(($$$PARAMS) => $BODY)'
```

### Hooks

```bash
# useState
ast-grep --lang tsx -p 'const [$STATE, $SETTER] = useState($INITIAL)'

# useEffect
ast-grep --lang tsx -p 'useEffect(() => { $$$BODY }, [$$$DEPS])'

# Custom hook call
ast-grep --lang tsx -p 'const $RESULT = use$HOOK($$$ARGS)'

# useMemo
ast-grep --lang tsx -p 'useMemo(() => $BODY, [$$$DEPS])'
```

### JSX

```bash
# Element with prop
ast-grep --lang tsx -p '<$COMP $PROP={$VALUE} />'

# Element with children
ast-grep --lang tsx -p '<$COMP>$$$CHILDREN</$COMP>'

# Specific component
ast-grep --lang tsx -p '<Button $$$PROPS />'

# className prop
ast-grep --lang tsx -p 'className="$CLASS"'
```

### Transformations

```bash
# Rename component
ast-grep --lang tsx -p '<OldComponent $$$PROPS />' -r '<NewComponent $$$PROPS />' --update-all
ast-grep --lang tsx -p '<OldComponent $$$PROPS>$$$CHILDREN</OldComponent>' -r '<NewComponent $$$PROPS>$$$CHILDREN</NewComponent>' --update-all

# Rename prop
ast-grep --lang tsx -p '<$COMP oldProp={$VALUE} $$$REST />' -r '<$COMP newProp={$VALUE} $$$REST />' --update-all

# Rename hook
ast-grep --lang tsx -p 'useOldHook($$$ARGS)' -r 'useNewHook($$$ARGS)' --update-all
```

## Object Patterns

### Object Literals

```bash
# Object property
ast-grep --lang typescript -p '{ $KEY: $VALUE }'

# Object with specific key
ast-grep --lang typescript -p '{ status: $VALUE, $$$REST }'

# Shorthand property
ast-grep --lang typescript -p '{ $NAME }'

# Spread
ast-grep --lang typescript -p '{ ...$OBJ }'
```

### Destructuring

```bash
# Object destructuring
ast-grep --lang typescript -p 'const { $$$PROPS } = $OBJ'

# Array destructuring
ast-grep --lang typescript -p 'const [$$$ITEMS] = $ARR'

# With default
ast-grep --lang typescript -p 'const { $PROP = $DEFAULT } = $OBJ'

# Rename during destructure
ast-grep --lang typescript -p 'const { $OLD: $NEW } = $OBJ'
```

## Class Patterns

```bash
# Class declaration
ast-grep --lang typescript -p 'class $NAME { $$$MEMBERS }'

# Class extending another
ast-grep --lang typescript -p 'class $NAME extends $PARENT { $$$MEMBERS }'

# Class method
ast-grep --lang typescript -p '$NAME($$$PARAMS) { $$$BODY }'

# Static method
ast-grep --lang typescript -p 'static $NAME($$$PARAMS) { $$$BODY }'

# Constructor
ast-grep --lang typescript -p 'constructor($$$PARAMS) { $$$BODY }'
```

## Async Patterns

```bash
# Async function
ast-grep --lang typescript -p 'async $NAME($$$PARAMS) { $$$BODY }'

# Await expression
ast-grep --lang typescript -p 'await $EXPR'

# Promise.all
ast-grep --lang typescript -p 'Promise.all([$$$PROMISES])'

# .then chain
ast-grep --lang typescript -p '$PROMISE.then($CALLBACK)'

# Try/catch with await
ast-grep --lang typescript -p 'try { $$$TRY } catch ($E) { $$$CATCH }'
```

## Debugging Patterns

When a pattern doesn't match:

### 1. Start Simple

```bash
# Start with the most basic pattern
ast-grep --lang typescript -p 'functionName'

# Then add structure
ast-grep --lang typescript -p 'functionName()'

# Then add captures
ast-grep --lang typescript -p 'functionName($$$ARGS)'
```

### 2. Use Interactive Mode

```bash
# Preview matches before applying
ast-grep --lang typescript -p 'pattern' -r 'replacement' --interactive
```

### 3. Check JSON Output

```bash
# See exactly what's matching
ast-grep --lang typescript -p 'pattern' --json | jq
```

### 4. Try Different Strictness

```bash
# Default
ast-grep --lang typescript -p 'pattern'

# More strict
ast-grep --lang typescript -p 'pattern' --strictness cst

# Less strict
ast-grep --lang typescript -p 'pattern' --strictness relaxed
```

### 5. Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| No matches | Pattern too specific | Remove type annotations, simplify |
| Too many matches | Pattern too broad | Add more context, use `$$` instead of `$$$` |
| Syntax error | Invalid pattern | Check for unbalanced braces, quotes |
| Partial replacement | Missing metavariable | Ensure all `$VAR` in pattern appear in replacement |

## Real-World Refactoring Examples

### Rename API Function

```bash
# 1. Find all usages
ast-grep --lang typescript -p 'selectUserById($$$ARGS)' --json | jq length

# 2. Rename call sites
ast-grep --lang typescript -p 'selectUserById($$$ARGS)' -r 'getUserById($$$ARGS)' --update-all

# 3. Rename definition
ast-grep --lang typescript -p 'const selectUserById = $BODY' -r 'const getUserById = $BODY' --update-all
ast-grep --lang typescript -p 'export const selectUserById = $BODY' -r 'export const getUserById = $BODY' --update-all
```

### Migrate from Old to New API

```bash
# Old: fetch('/api/users', { method: 'POST', body: JSON.stringify(data) })
# New: apiClient.post('/api/users', data)

ast-grep --lang typescript -p "fetch(\$URL, { method: 'POST', body: JSON.stringify(\$DATA) })" -r 'apiClient.post($URL, $DATA)' --update-all
```

### Add Error Handling

```bash
# Wrap all database calls
ast-grep --lang typescript -p 'await db.$METHOD($$$ARGS)' -r 'await withRetry(() => db.$METHOD($$$ARGS))' --update-all
```

### Remove Deprecated Options

```bash
# Old: createClient({ legacyMode: true, ...rest })
# New: createClient({ ...rest })

ast-grep --lang typescript -p 'createClient({ legacyMode: $_, $$$REST })' -r 'createClient({ $$$REST })' --update-all
```
