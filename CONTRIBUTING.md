### Contributing to Flowglad Docs

Thanks for your interest in contributing to Flowglad’s documentation. This guide focuses exclusively on the docs site in `platform/docs`.

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
- Use component names literally in code: `FlowgladProvider`, `BillingPage`
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

Thanks again for improving the docs!



