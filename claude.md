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

## After Finishing Edits

It is extremely recommended to run the following command(s) and examine the output to ensure everything is working as expected:
<finishing-edits-commands>
1. `bun run check` - this is our linting/formatting and typechecking command, make sure to carefully examine the output and make any changes to fix the errors. Keep in mind that you may need to run it a few times to fix all the errors.
</finishing-edits-commands>
