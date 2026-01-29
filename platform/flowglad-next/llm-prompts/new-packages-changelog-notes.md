You are creating a new changelog announcement. These changelog notes will be used to also generate a github release as well. Please generate a new changelog file in the following format.

**CRITICAL - Do not modify the frontmatter:** Preserve the existing package declarations in the changeset frontmatter exactly as they are. We release all Flowglad packages in lockstep (same version number across all packages), so even if a package has no code changes in this release, it must still be included in the frontmatter. Only write the release notes content below the frontmatter—never add or remove packages from the YAML block.

Use the git log to determine what changes in packages/* have happened since the last changelog (search the git log for the last time we had a commit "chore: version packages"). Group the notes thematically into sections. They may be grouped around new features, improvements, bug fixes, etc.

**To get the full context of package changes, run this git command:**

```bash
LAST_VERSION_COMMIT=$(git log --all --grep="chore: version packages" --format="%H" -1) && \
git log $LAST_VERSION_COMMIT..HEAD -- packages/ --stat --format="%H%n%an <%ae>%n%ad%n%s%n%b%n---"
```

This command will:
1. Find the last commit with "chore: version packages" in the message
2. Show all commits after that commit that touched files in `packages/`
3. Include commit hash, author, date, subject, full body, and file changes

Use this output to understand all the changes that need to be synthesized into changelog notes.

Include links to commits for each individual change item (bullet points), but NOT for section headings. Section headings (###) are organizational and should not have commit links or commit hashes.

Put your release notes in the markdown file found in the .changeset directory in project root.

**Important formatting rules:**
- Section headings (starting with `###`) should be plain text without commit links or hashes
- Only individual change items (bullet points) should include commit links in the format `[commit-hash](url): description`
- Never put commit hashes or links before section headings

Here's an example:
---
### Better Auth Plugin Support

  - [27e64bb6](https://github.com/flowglad/flowglad/commit/27e64bb6): Add Better Auth plugin integration for FlowgladServer and Next.js
    - New `flowgladBetterAuthPlugin` available in `@flowglad/server/better-auth` and `@flowglad/nextjs/better-auth`
    - Supports both user and organization-based customer types
    - Customizable customer extraction via `getCustomer` function
    - Automatic session management and customer creation
    - Works seamlessly with Better Auth's plugin system

  ### React Native Compatibility

  - [a0c7f482](https://github.com/flowglad/flowglad/commit/a0c7f482): Improve React Native compatibility in `@flowglad/react`
    - Updated `FlowgladContext` and `FlowgladProvider` for React Native environments
    - Removed browser-specific exports that don't work in React Native
    - Improved cross-platform compatibility

  ### Express Integration Migration

  - [2c212876](https://github.com/flowglad/flowglad/commit/2c212876): Move Express logic from `@flowglad/express` to `@flowglad/server/express`
    - Express functionality now available via `@flowglad/server/express` subpath export
    - New exports: `createExpressRouteHandler` and `createFlowgladExpressRouter`
    - `@flowglad/express` package deprecated (see below)
    - Migration: `import { createFlowgladExpressRouter } from '@flowglad/server/express'`

  ### Create Subscription doNotCharge Support

  - [2fb21a4d](https://github.com/flowglad/flowglad/commit/2fb21a4d): Add `doNotCharge` parameter support for creating subscriptions
    - Allows creating subscriptions without immediately charging the customer
    - Useful for trial periods, free plans, or deferred billing scenarios
    - Added comprehensive test coverage

  ### Express Package Deprecation

  - [731a91eb](https://github.com/flowglad/flowglad/commit/731a91eb): Mark `@flowglad/express` package as deprecated
    - Package continues to work but is no longer actively maintained
    - Users should migrate to `@flowglad/server/express`
    - Deprecation notice added to README and CHANGELOG

  ### Type Resolution Improvements

  - [704ea9e5](https://github.com/flowglad/flowglad/commit/704ea9e5): Add `typesVersions` for Node module resolution compatibility

    - Enables proper TypeScript resolution for subpath exports (express, better-auth)
    - Ensures Node.js module resolution works correctly with TypeScript

  - [e27365b8](https://github.com/flowglad/flowglad/commit/e27365b8): Add express to tsconfig.declarations.json for type generation
    - Ensures TypeScript declaration files are properly generated for Express exports

  ### Documentation Updates

  - [16448962](https://github.com/flowglad/flowglad/commit/16448962): Update Express integration docs for deprecation
    - Updated documentation to reflect Express migration
    - Added migration guide references
    - Updated examples to use new `@flowglad/server/express` import path

  ## Updated Dependencies

  - `@flowglad/server`: Added `better-auth` and `express` as optional peer dependencies
  - All packages remain at version 0.15.1 in their CHANGELOGs

  ## Breaking Changes

  ⚠️ **None** - All changes are additive or deprecation notices. The deprecated `@flowglad/express` package continues to work, but users are encouraged to migrate to `@flowglad/server/express`.

  ## Migration Guide

  ### Express Users

  **Before:**

  ```typescript
  import { createFlowgladExpressRouter } from "@flowglad/express";
  ```

  **After:**

  ```typescript
  import { createFlowgladExpressRouter } from "@flowglad/server/express";
  ```

  ### Better Auth Users

  **New Feature:**

  ```typescript
  import { flowgladBetterAuthPlugin } from "@flowglad/server/better-auth";
  // or for Next.js
  import { flowgladBetterAuthPlugin } from "@flowglad/nextjs/better-auth";
  ```
