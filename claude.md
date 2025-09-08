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
Remember that you have `ast-grep` CLI at your disposal.

ast-grep is a code tool for structural search and replace. It is like syntax-aware grep/sed! You can write code patterns to locate and modify code, based on AST, in thousands of files, interactively.