---
id: dips-turn1-intake
title: "DIPS Turn 1 - Project Facts Intake"
turn: 1
audience: "Coding Agent"
output_format: "JSON only"
---

Copy-paste this to your coding agent. The agent must statically analyze the repository and return ONLY the JSON object specified. No prose. If uncertain, use explicit "unknown" or false. Do not make code changes.

Agent instructions:
- Perform static analysis of the codebase to detect the project’s setup.
- Do not install packages or run code; inspect config files, package manifests, and source.
- Return exactly the following JSON shape. Unknowns must be represented as "unknown" or null where appropriate. Booleans must be literal true/false.

Required JSON shape:

```json
{
  "language": "ts|js|unknown",
  "packageManager": "pnpm|npm|yarn|unknown",
  "framework": "next|react|express|other|unknown",
  "router": "app|pages|react-router|custom|none|unknown",
  "runtime": "serverless|node-server|edge|other|unknown",
  "auth": {
    "provider": "clerk|supabase|nextauth|betterauth|custom|none|unknown",
    "serverUserRetrieval": {
      "kind": "function|import|none|unknown",
      "identifier": "string|unknown",
      "importPath": "string|unknown"
    },
    "tenancy": "user|organization|unknown"
  },
  "database": {
    "present": true,
    "type": "postgres|mysql|sqlite|mongo|nosql|unknown"
  },
  "capabilities": {
    "canInstallPackages": true,
    "canSetEnvVars": true,
    "canAddApiRoute": true,
    "canAddPage": true
  },
  "project": {
    "monorepo": false,
    "pathAliases": false
  }
}
```

Rules:
- Output must be valid JSON. No comments, no markdown, no explanations.
- Use "unknown" when not determinable from static analysis.
- For Next.js, set `router` to `app` if `/app` directory exists, otherwise `pages` if `/pages` exists.
- For auth detection, prefer imports and config (e.g., `@clerk/nextjs`, `@supabase/*`, `next-auth`). If none detected, set `provider` to `none`.
- For database, infer from dependencies/config (e.g., `prisma`, `drizzle-orm`, `pg`, `mongodb`). If no clear signal, set `present` false and `type` "unknown".

Example (illustrative only):

```json
{
  "language": "ts",
  "packageManager": "pnpm",
  "framework": "next",
  "router": "app",
  "runtime": "serverless",
  "auth": {
    "provider": "clerk",
    "serverUserRetrieval": {
      "kind": "import",
      "identifier": "currentUser",
      "importPath": "@clerk/nextjs/server"
    },
    "tenancy": "user"
  },
  "database": { "present": true, "type": "postgres" },
  "capabilities": {
    "canInstallPackages": true,
    "canSetEnvVars": true,
    "canAddApiRoute": true,
    "canAddPage": true
  },
  "project": { "monorepo": false, "pathAliases": true }
}
```


