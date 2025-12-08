# @flowglad packages
This directory contains the SDKs for Flowglad

## Local Development

All packages and playgrounds live in a single Bun workspace, so the workflow is just watch → build → run.

1. **Install dependencies & wire workspaces**
   ```bash
   bun install # from repo root
   ```

2. **Start the package watchers** (builds every package with `tsup --watch`; playgrounds are filtered out by default)
   ```bash
   bun run dev # from repo root
   ```
   Need a playground to run under Turbo as well? Override the filter, e.g.
   ```bash
   bunx turbo run dev --parallel --no-cache --filter=@flowglad/playground-supabase-auth
   ```

3. **Run whichever app you’re working on**
   - Platform example: `bun dev` inside `platform/flowglad-next`
   - Supabase playground: `bun dev` inside `playground/supabase-auth`

With the workspace symlinks in place, changes under `packages/*` instantly flow into whichever app you have running—no `yalc` linking or manual copying required.
