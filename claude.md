## Init

Run the following script EVERY TIME you are in a new context:

```bash
init_claude_code_flowglad_internal && pnpm install
```

## On Every Change

Whenever you complete a task, confirm that everything lints as expected:

```bash
pnpm lint
```