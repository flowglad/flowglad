---
"flowglad": minor
"@flowglad/nextjs": minor
"@flowglad/server": minor
"@flowglad/shared": minor
"@flowglad/react": minor
---

### New Flowglad CLI Package

- [be039709](https://github.com/flowglad/flowglad/commit/be039709): Initial release of the Flowglad CLI package
  - Install globally with `npm install -g flowglad` or run directly with `npx flowglad`
  - Built with `cac` CLI framework for lightweight, TypeScript-first command handling
  - Requires Node.js 18.0.0 or higher
  - Dual ESM/CJS output with TypeScript declarations

- [95d77db4](https://github.com/flowglad/flowglad/commit/95d77db4): CLI framework and help command implementation
  - `flowglad help` command displays available commands and roadmap
  - Extensible command registration pattern for future commands
  - Foundation for pricing-as-code workflow (login, link, pull, push, deploy coming soon)

### Documentation

Full CLI documentation available at [flowglad.com/docs/cli](https://flowglad.com/docs/cli)

## Breaking Changes

⚠️ **None** - This is an additive release introducing the new CLI package.
