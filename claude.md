## Package Manager
**IMPORTANT**: This project uses `pnpm` as its package manager. ALWAYS use `pnpm` for all package management operations. Never use `npm` or `yarn`.

Examples:
- Install dependencies: `pnpm install`
- Add a package: `pnpm add <package-name>`
- Run scripts: `pnpm run <script-name>`
- Build: `pnpm build` or `pnpm -r build`

## Init
Run the following script EVERY TIME you are in a new context:
```bash
init_claude_code_flowglad_next
```

## Resources

### ast-grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang rust -p '<pattern>'` (or set `--lang` appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.
