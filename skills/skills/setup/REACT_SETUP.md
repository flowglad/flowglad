# React Setup (Other Frameworks)

For React apps not using Next.js (Create React App, Vite, etc.), you need both frontend and backend setup.

## Package Installation

```bash
bun add @flowglad/react
```

## FlowgladProvider Setup

In non-Next.js apps, you must specify your backend URL since there are no built-in API routes.

```tsx
// App.tsx
import { FlowgladProvider } from '@flowglad/react'

function App() {
  return (
    <FlowgladProvider baseURL="https://api.yourapp.com">
      <MyApp />
    </FlowgladProvider>
  )
}
```

## Backend Requirements

The `@flowglad/react` package makes API calls to your backend. You must have a backend that:

1. Handles Flowglad API routes (use `@flowglad/server` with Express, Fastify, etc.)
2. Authenticates requests and extracts customer IDs
3. Forwards requests to Flowglad's API

> **Security:** Never call Flowglad's API directly from the browser. API keys must stay server-side.

Architecture overview:

```text
Browser (React)  ->  Your Backend (Express/etc)  ->  Flowglad API
     ^                        ^                         ^
 @flowglad/react        @flowglad/server         Flowglad servers
```
