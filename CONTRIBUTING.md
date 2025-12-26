# Contributing to Flowglad

Thanks for your interest in contributing to Flowglad! A good place to start is by checking out our GitHub [Issues](https://github.com/flowglad/flowglad/issues). Here you can find open issues.

## Issue Tags
| Tag                 | Meaning                                                        |
|---------------------|----------------------------------------------------------------|
| help wanted         | Issues that are open for public contributions                  |
| good first issue    | Issues that are simple and scoped for a first-time contributor |
| enhancement         | New feature or improvement                                     |
| needs test coverage | A file or feature that needs better test coverage              |
| bug                 | A bug in the code that needs to be fixed                       |

## Working on Issues
If you would like to pick up an issue to work on, please indicate that by commenting on the Issue! Issues that are not yet open for public contributions (missing the help wanted tag) act as open discussion threads for said Issues.


# Contributing to Flowglad Docs

Thanks for your interest in contributing to Flowglad’s documentation. This section focuses exclusively on the docs site in `platform/docs`.

Links:
- Website: [flowglad.com](https://www.flowglad.com/)
- Docs: https://docs.flowglad.com/quickstart
- GitHub: [flowglad/flowglad](https://github.com/flowglad/flowglad)

---

### Where the docs live

- Root: `platform/docs`
- Content: MDX files under topic directories (e.g., `features/*.mdx`, `essentials/*.mdx`)
- Navigation/config: `platform/docs/docs.json` (Mintlify config, tabs, groups, pages, OpenAPI source)
- Assets: `platform/docs/images`, `platform/docs/logo`, `platform/docs/favicon.svg`
- API Reference: sourced from `https://app.flowglad.com/api/openapi` into `platform/docs/api-reference`

---

### Local preview

Install the Mintlify CLI once:

```
npm i -g mintlify
```

Then change directory to `platform/docs`:

```
cd platform/docs
```

Then run:

```
mintlify dev
```

---

### Adding or editing pages

1) Create or edit an `.mdx` file under the appropriate directory, e.g. `features/checkout-sessions.mdx`.
2) Add frontmatter where appropriate:

```mdx
---
title: "Checkout Sessions"
description: "Create and manage payment flows with one component"
---
```

3) Register your page in `platform/docs/docs.json` so it shows in the sidebar:
   - Pick the correct tab (e.g., "Documentation"), then the correct group (e.g., "Features").
   - Append your page slug (path without `.mdx`) to the `pages` array, e.g., `"features/checkout-sessions"`.

```json
{
  "navigation": {
    "tabs": [
      {
        "tab": "Documentation",
        "groups": [
          {
            "group": "Features",
            "pages": [
              "features/checkout-sessions",
              "features/your-new-page"
            ]
          }
        ]
      }
    ]
  }
}
```

---

### Code examples and snippets

- Prefer succinct, copy-pasteable examples
- Use fenced blocks with a language tag and optional label where helpful
- If content is reused across pages, author a snippet in `platform/docs/snippets` and include it where needed to avoid duplication

---

### Style guidelines

- Keep intros short; lead with the outcome or the API surface
- Use headings consistently (## for major sections, ### for subsections)
- Favor active voice and imperative tone
- Include minimal context links to repo or website when it aids comprehension
- When mentioning files or directories, wrap names in backticks (e.g., `app/flowglad.ts`)

Terminology:
- Use component names literally in code: `FlowgladProvider`
- Use "server route" for the `/api/flowglad/[...path]` handler

---

### Images and assets

- Place images in `platform/docs/images` and reference with relative paths
- Prefer SVG where possible; fall back to PNG for screenshots
- Optimize images for small sizes

---

### API Reference

The API Reference is sourced from `https://app.flowglad.com/api/openapi` into `platform/docs/api-reference`. If you are documenting new endpoints, ensure the OpenAPI source is updated upstream; do not hand-edit generated files.

---

### Linking and cross-references

- Prefer relative links to other docs pages
- For external links, include protocol and ensure they resolve
- When linking to GitHub files or directories, use permalinks where stability matters

---

### Docs PR checklist

- Run `mintlify dev` and verify your page renders
- Ensure `platform/docs/docs.json` navigation includes your new page
- Check for typos and broken links
- Keep examples runnable or clearly marked as pseudo-code
- Add or update images if UI changed

---

### Getting help

- Open an issue or discussion on GitHub: https://github.com/flowglad/flowglad

---

# Contributing to the backend (platform/flowglad-next)

Thanks for your interest in contributing to Flowglad’s backend. This section focuses on the Next.js app in `platform/flowglad-next`.

Prerequisites:
- bun installed
- Docker running (used for the test database via docker-compose)

Setup steps:
1) Change directory to the backend app
```
cd platform/flowglad-next
```

2) Install dependencies
```
bun run install-packages
```

3) Create your local env file from the example
```
cp .env.example .env.local
```

### Environment variables

Add these values to your `.env.local`:

- **STRIPE_SECRET_KEY** — get it from  
  https://dashboard.stripe.com/apikeys  

- **STRIPE_TEST_MODE_SECRET_KEY** — get it from the same Stripe API keys page (test key)

- **UNKEY_ROOT_KEY** — grab it in Unkey Dashboard → **Root Keys**  
  https://app.unkey.dev

- **UNKEY_API_ID** — find it in Unkey Dashboard → **APIs**

- **NEXT_PUBLIC_APP_URL** — usually your local URL (e.g. `http://localhost:3000`)

- **SVIX_API_KEY** — create/find it in Svix Dashboard  
  https://dashboard.svix.com

- **DEV_EMAIL_REDIRECT** — set an email you want all local emails forwarded to

- **DATABASE_URL** — your Postgres connection string  
  (example: `postgres://test:test@localhost:5432/test_db`)

4) Start the test database and run migrations
```
bun run test:setup
```

5) Seed the countries table
```
bun run seed:countries
```
6) Run the application
```
bun dev
```
7) Run the test suite
```
bun run test
```
### Adding tests (backend)

Follow this sequence when introducing new tests:
- Plan: `.conductor/fix-new-org-default-plan/platform/flowglad-next/llm-prompts/new-test-1-outline-test-cases.md`
- Stub: `.conductor/fix-new-org-default-plan/platform/flowglad-next/llm-prompts/new-test-2-planning-stubs.md`
- Global setup: `.conductor/fix-new-org-default-plan/platform/flowglad-next/llm-prompts/new-test-3-before-each-setup.md`
- Implement: `.conductor/fix-new-org-default-plan/platform/flowglad-next/llm-prompts/new-test-4-implementation.md`

Guidelines:
- Do not mock the database. Tests use the local Postgres test instance (Docker) with real reads/writes.
- Use the seeding helpers in `platform/flowglad-next/seedDatabase.ts` to create state; avoid ad‑hoc inserts.
- When asserting existence or absence, fetch and compare primary keys (ids) rather than relying solely on list lengths.
- Useful commands: `bun run test` (CI run), `bun run test:watch` (local TDD), `bun run test:setup` (reset DB), `bun run test:teardown` (stop DB).
