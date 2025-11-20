We are trying to add payments and billing to our product using Flowglad.
**Your task**: Analyze this codebase and create a markdown document describing how the application works. This will be used to generate a Flowglad integration guide.
**Output**: A complete markdown file with codebase structure, patterns, and code examples.
**Important**: 
- Include **complete, working code examples** from the codebase (actual code, not snippets or pseudocode)
- All paths should be relative from the project root (no leading slashes)
- If information is missing note that it's unavailable rather than guessing

## 1. Framework & Language Detection
What framework does the application use? (e.g., Next.js, Express, FastAPI, etc.)
- If Next.js: Is it using App Router (`src/app`) or Pages Router (`pages`)?
- If Express: What version and routing pattern?
What language is the server written in? (TypeScript, JavaScript, Python, etc.)
What package manager is used? (npm, yarn, bun, etc.)
What is the name and location of the dependency file? (e.g., `package.json`, `requirements.txt`, `Cargo.toml`, `Gemfile`)

## 2. File Structure & Paths
Provide relative paths from the project root:
- Where should API routes be mounted? (e.g., `src/app/api`, `routes`, `app/controllers`, `api`)
- Where are utility functions and shared code located? (e.g., `src/lib`, `lib`, `utils`, `app/utils`)
- Where are UI components located? (e.g., `src/components`, `components`, `app/components`)
- Where is the main server file? (e.g., `src/server.ts`, `app.js`, `main.py`, `server.rb`)

## 3. Authentication System
What authentication library/system is used? (e.g., BetterAuth, Clerk, Supabase Auth, Auth0, custom JWT, session-based, etc.)
Where is the server-side / client-side auth configuration? (e.g., `src/lib/auth.ts`, `lib/auth.js`, `auth.py`, `src/lib/auth-client.ts`)
**Session Extraction**: How to extract the authenticated user from a request. Include **complete code samples** showing:
- How to get the current user/session on the server
- How to get the current user/session on the client (if applicable)
- The structure of the user object (fields: `id`, `email`, `name`, etc.)

## 4. Customer Model (B2C vs B2B)
Are customers for this product:
- **B2C**: Individual users
- **B2B**: Businesses/teams/organizations
**Customer ID Source**: 
- For B2C: What field identifies a user? (e.g., `user.id`, `user.userId`, `session.user.id`)
- For B2B: What field identifies an organization? (e.g., `organization.id`, `team.id`, `org.id`)
**Organization Derivation** (B2B only): How does the server derive which organization a request belongs to? Include:
- Function/method name that gets the organization from a request
- Complete code sample showing the pattern
- Where this function is located

## 5. Frontend Framework
What frontend framework is used? (React, Vue, Svelte, server-only/SSR, etc.)
Include version if detectable.
**Provider Pattern**: If using React:
- Where are providers typically mounted? (e.g., `src/app/layout.tsx`, `src/components/providers.tsx`, `App.tsx`)
- What state management is used? (React Query, Zustand, Redux, etc.)
- Include **complete code sample** showing the provider structure
**Client-Side Auth Hook**: If using React, how do you access auth state on the client? (e.g., `authClient.useSession()`, `useAuth()`, `useUser()`)

## 6. Route Handler Pattern
How are API routes defined (e.g., Next.js App or Pages Router handlers, Express routes, FastAPI/Flask decorators, Rails controllers)?
How are JSON responses returned (e.g., `NextResponse.json`, `res.json`, framework helpers)?
Include a **complete code sample** of a typical API route handler showing:
- Full function implementation
- Request parsing, error handling, response formatting
- Validation patterns

## 7. Validation & Error Handling Patterns
**Validation Library**: What validation library is used for request validation? (e.g., `zod`, `yup`, `joi`, `class-validator`, `pydantic`, custom validation, none)
**Validation Pattern**: Show a **complete example** of validation in API routes:
- How are request bodies validated?
- How are validation errors formatted and returned?
**Error Handling Pattern**: Show a **complete example** of error handling in API routes:
- How are errors caught? (try/catch, middleware, decorators, etc.)
- How are error responses formatted?
- What HTTP status codes are used?

## 8. Type System
Does the project use:
- TypeScript with types/interfaces
- JavaScript with JSDoc comments
- Python with type hints
- Ruby (no types or RBS)
- Go with structs

## 9. Helper Function Patterns
Where are utility/helper functions typically located? (e.g., `src/lib/billing-helpers.ts`, `utils/helpers.ts`, `lib/helpers.py`)
If there are existing helper functions, show **complete examples** of:
- Function structure (signatures, return types, error handling)
- Patterns used (JSDoc, try/catch, early returns, etc.)
- Edge case and null/undefined handling
- Include 2-3 complete helper function examples
**Code Organization Style**: 
- Are helpers organized in a single file or multiple files?
- What naming conventions are used?
- How are imports structured?

## 10. Provider Composition Pattern
If using React (or similar), show the **complete code** for:
- How providers are structured (single file vs multiple files)
- How providers are composed (nested, wrapper functions, etc.)
- Any singleton patterns or client-side only patterns used
- Include the complete code from the existing provider file(s)
Show how providers are mounted in the root layout/component:
- Complete code example from the root layout or app entry point
- How providers wrap the application

## 11. Environment Variables
What is the name of the environment file?
How are environment variables accessed?

## 12. Existing Billing Code (If Any)
If there's existing mock billing code, where is it located? (e.g., `src/lib/billing.ts`, `lib/billing.js`)
How is the mock billing hook/utility imported?
**Usage Meter References**: Scan the codebase for usage meter references:
- What usage meter slugs are referenced, and where are they used?
**Feature Toggle References**: Scan for feature toggle references:
- What feature slugs are referenced, and where are they used?
**Product/Price References**: Scan for product or price references:
- What price slugs are referenced, and where are they used?

## 13. Component Locations
- Where is the pricing page/component? (e.g., `src/components/pricing-cards-grid.tsx`, `app/pricing/page.tsx`)
- Where is the navbar/account menu component? (e.g., `src/components/navbar.tsx`)
- Where is the main dashboard/home page component? (e.g., `src/app/home-client.tsx`, `app/dashboard/page.tsx`)

## Output Instructions
Produce one markdown document covering every section above with complete, working code from the repository (no snippets or pseudocode). Use headers, code fences, relative paths, and mark unavailable information.