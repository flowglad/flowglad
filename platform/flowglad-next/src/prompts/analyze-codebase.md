We are trying to add payments and billing to our product using Flowglad.

**Your task**: Analyze this codebase and create a comprehensive markdown document that describes how the application works. This document will be used as context to generate a Flowglad integration guide.

**Output**: Your response should be a complete, well-structured markdown file that can be saved directly to a `.md` file. Include all relevant information about the codebase structure, patterns, and code examples.

**Important**: 
- Include **complete, working code examples** from the codebase (not snippets or pseudocode)
- All code samples must be actual code from the codebase
- All paths should be relative from the project root (no leading slashes)
- If information is missing or unknown, note that it's unavailable rather than guessing

---

## 1. Framework & Language Detection

What framework does the application use? (e.g., Next.js, Express, FastAPI, Flask, Django, Rails, etc.)
- If Next.js: Is it using App Router (`src/app`) or Pages Router (`pages`)?
- If Express: What version and routing pattern?
- Include specific version numbers if detectable.

What language is the server written in? (TypeScript, JavaScript, Python, Ruby, Go, etc.)

What package manager is used? (npm, yarn, bun, pip, cargo, bundle, etc.)

What is the name and location of the dependency file? (e.g., `package.json`, `requirements.txt`, `Cargo.toml`, `Gemfile`)

---

## 2. File Structure & Paths

Provide relative paths from the project root:

- Where should API routes be mounted? (e.g., `src/app/api`, `routes`, `app/controllers`, `api`)
- Where are utility functions and shared code located? (e.g., `src/lib`, `lib`, `utils`, `app/utils`)
- Where are UI components located? (e.g., `src/components`, `components`, `app/components`)
- Where is the main server file? (e.g., `src/server.ts`, `app.js`, `main.py`, `server.rb`)

---

## 3. Authentication System

What authentication library/system is used? (e.g., BetterAuth, Clerk, Supabase Auth, Auth0, custom JWT, session-based, etc.)

Where is the server-side auth configuration? (e.g., `src/lib/auth.ts`, `lib/auth.js`, `auth.py`)

Where is the client-side auth configuration? (e.g., `src/lib/auth-client.ts`, `lib/auth-client.js`)

**Session Extraction Pattern**: How do you extract the authenticated user from a request? Include **complete code samples** showing:
- How to get the current user/session on the server (complete function/pattern)
- How to get the current user/session on the client (if applicable)
- The structure of the user object (what fields are available: `id`, `email`, `name`, etc.)

---

## 4. Customer Model (B2C vs B2B)

Are customers for this product:
- **B2C**: Individual users (each user is a customer)
- **B2B**: Businesses/teams/organizations (each organization is a customer)

**Customer ID Source**: 
- For B2C: What field identifies a user? (e.g., `user.id`, `user.userId`, `session.user.id`)
- For B2B: What field identifies an organization? (e.g., `organization.id`, `team.id`, `org.id`)

**Organization Derivation** (B2B only): If B2B, how does the server derive which organization a request belongs to? Include:
- Function/method name that gets the organization from a request
- Complete code sample showing the pattern
- Where this function is located

---

## 5. Frontend Framework

What frontend framework is used? (React, Vue, Svelte, server-only/SSR, etc.)

Include version if detectable.

**Provider Pattern**: If using React:
- Where are providers typically mounted? (e.g., `src/app/layout.tsx`, `src/components/providers.tsx`, `App.tsx`)
- What state management is used? (React Query, Zustand, Redux, etc.)
- Include **complete code sample** showing the provider structure

**Client-Side Auth Hook**: If using React, how do you access auth state on the client? (e.g., `authClient.useSession()`, `useAuth()`, `useUser()`)

---

## 6. Route Handler Pattern

How are API routes defined in this framework?
- Next.js App Router: `export async function GET/POST(request: Request)`
- Next.js Pages Router: `export default function handler(req, res)`
- Express: `app.post('/route', handler)`
- FastAPI: `@app.post('/route')`
- Flask: `@app.route('/route', methods=['POST'])`
- Rails: `def create` in controller

How are JSON responses returned?
- Next.js: `NextResponse.json()`
- Express: `res.json()`
- FastAPI: `JSONResponse()` or `return {...}`
- Flask: `jsonify()`
- Rails: `render json:`

Include a **complete code sample** showing a typical API route handler from the codebase. This should include:
- Full function implementation
- Request parsing
- Error handling
- Response formatting
- Any validation patterns used

---

## 7. Validation & Error Handling Patterns

**Validation Library**: What validation library is used for request validation? (e.g., `zod`, `yup`, `joi`, `class-validator`, `pydantic`, custom validation, none)

**Validation Pattern**: Show a **complete example** of how validation is typically done in API routes:
- How are request bodies validated?
- How are validation errors formatted and returned?
- Include a complete code example from an existing API route showing the validation pattern

**Error Handling Pattern**: Show a **complete example** of how errors are typically handled in API routes:
- How are errors caught? (try/catch, middleware, decorators, etc.)
- How are error responses formatted?
- What HTTP status codes are used for different error types?
- Include a complete code example from an existing API route showing the error handling pattern

---

## 8. Type System

Does the project use:
- TypeScript with types/interfaces
- JavaScript with JSDoc comments
- Python with type hints
- Ruby (no types or RBS)
- Go with structs

If TypeScript, show how types are typically imported (e.g., `import type { ... }`)

---

## 9. Helper Function Patterns

Where are utility/helper functions typically located? (e.g., `src/lib/billing-helpers.ts`, `utils/helpers.ts`, `lib/helpers.py`)

If there are existing helper functions in the codebase, show **complete examples** of:
- How helper functions are structured (function signatures, return types, error handling)
- What patterns they follow (JSDoc comments, try/catch blocks, early returns, etc.)
- How they handle edge cases and null/undefined values
- Include 2-3 complete helper function examples from the codebase

**Code Organization Style**: 
- Are helpers organized in a single file or multiple files?
- What naming conventions are used?
- How are imports structured?

---

## 10. Provider Composition Pattern

If using React (or similar frontend framework with providers), show the **complete code** for:
- How providers are structured (single file vs multiple files)
- How providers are composed (nested, wrapper functions, etc.)
- Any singleton patterns or client-side only patterns used
- Include the complete code from the existing provider file(s)

Show how providers are mounted in the root layout/component:
- Complete code example from the root layout or app entry point
- How providers wrap the application

---

## 11. Environment Variables

What is the name of the environment file? (e.g., `.env.local`, `.env`, `.env.development`)

How are environment variables accessed?
- Node.js: `process.env.VAR_NAME`
- Python: `os.getenv('VAR_NAME')` or `os.environ['VAR_NAME']`
- Ruby: `ENV['VAR_NAME']`

---

## 12. Existing Billing Code (If Any)

If there's existing mock billing code, where is it located? (e.g., `src/lib/billing.ts`, `lib/billing.js`)

How is the mock billing hook/utility imported? (e.g., `import { useBilling } from '@/lib/billing'`)

**Usage Meter References**: Scan the codebase for usage meter references:
- What usage meter slugs are referenced? (e.g., `checkUsageBalance('fast_generations')`)
- Where are they used? (file paths)

**Feature Toggle References**: Scan for feature toggle references:
- What feature slugs are referenced? (e.g., `checkFeatureAccess('unlimited_relaxed_images')`)
- Where are they used? (file paths)

**Product/Price References**: Scan for product or price references:
- What price slugs are referenced? (e.g., `getPrice('pro_monthly')`)
- Where are they used? (file paths)

---

## 13. Component Locations

- Where is the pricing page/component? (e.g., `src/components/pricing-cards-grid.tsx`, `app/pricing/page.tsx`)
- Where is the navbar/account menu component? (e.g., `src/components/navbar.tsx`)
- Where is the main dashboard/home page component? (e.g., `src/app/home-client.tsx`, `app/dashboard/page.tsx`)

---

## Output Instructions

Create a comprehensive markdown document that covers all of the above sections. For each section:

1. **Provide clear, descriptive information** about how the codebase works
2. **Include complete code examples** - not snippets, but full, working code from the codebase
3. **Use proper markdown formatting** - headers, code blocks with language tags, lists, etc.
4. **Be thorough** - include all relevant details that would help someone understand the codebase patterns
5. **Note missing information** - if something doesn't exist or can't be determined, clearly state that

The goal is to create a document that provides complete context about:
- How the application is structured
- What patterns and conventions it follows
- How authentication works
- How API routes are structured
- How validation and error handling work
- How helper functions are organized
- How providers are composed
- What billing-related code already exists

This document will be used to generate a tailored Flowglad integration guide that matches the codebase's existing patterns and conventions.
