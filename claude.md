## Package Manager
**IMPORTANT**: This project uses `bun` as its package manager. ALWAYS use `bun` for all package management operations. Never use `npm` or `yarn`.

Examples:
- Install dependencies: `bun install`
- Add a package: `bun add <package-name>`
- Run scripts: `bun run <script-name>`
- Build: `bun run build`

## Init
Run the following script EVERY TIME you are in a new context:
```bash
init_claude_code_flowglad_next
```

## Resources

### ast-grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang <language> -p '<pattern>'` (e.g., `--lang typescript` for TypeScript files) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.
