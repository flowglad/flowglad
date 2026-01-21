# AI Support Chatbot Widget

## Project Name
`ai-support-chat`

## Problem Statement
Users visiting the Flowglad site need a way to get quick help understanding and integrating the platform. Currently there's no self-service support option on the site. An AI-powered chatbot that can answer questions using the existing documentation would reduce support burden and improve user experience.

## Solution Summary
Add a floating chat widget in the bottom-right corner of all pages. The widget displays as a circular button with the Flowglad logomark that morphs into a chat popup using motion.dev animations. The backend uses RAG (Retrieval-Augmented Generation) by querying the existing Turbopuffer docs database, then generating responses with the Vercel AI SDK (`@ai-sdk/openai` + `generateText`). After the first user message, a subtle Discord support link appears for escalation.

## Current State Analysis
- **Logo**: `FlowgladLogomark` component exists at `src/components/icons/FlowgladLogomark.tsx` (uses LucideIcon interface, supports size prop)
- **RAG Infrastructure**: `queryTurbopuffer` function at `src/utils/turbopuffer.ts:111-138` queries the `flowglad-docs` namespace
- **Vercel AI SDK**: Already installed and used in `src/server/mutations/generateDescription.ts` with `@ai-sdk/openai` and `generateText` from `ai` package
- **tRPC**: `publicProcedure` at `src/server/trpc.ts:28` supports unauthenticated requests
- **appRouter**: `src/server/index.ts:40-80` - new routers added here
- **Root Layout**: `src/app/layout.tsx:98-116` - site-wide components go inside `<Providers>` wrapper
- **Animation**: No motion library installed (only `tailwindcss-animate`)
- **shadcn components**: Card, ScrollArea, Avatar, Button, Input available in `src/components/ui/`

## Required Changes

### 1. Install motion.dev
```bash
cd platform/flowglad-next && bun add motion
```

### 2. Create tRPC Router
**File**: `src/server/routers/supportChatRouter.ts`

```ts
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { publicProcedure, router } from '@/server/trpc'
import { queryTurbopuffer } from '@/utils/turbopuffer'

const SUPPORT_CHAT_SYSTEM_PROMPT = `You are Flowglad's helpful AI support assistant. Your role is to help developers understand and integrate Flowglad's billing and payments platform into their applications.

## Flowglad SDKs
When providing code examples, use the appropriate SDK for the user's framework:

- **@flowglad/nextjs**: For Next.js applications (App Router and Pages Router)
  - Install: \`bun add @flowglad/nextjs\`
  - Server-side utilities for API routes, client-side React context for billing state

- **@flowglad/react + @flowglad/server**: For non-Next.js React applications
  - Install: \`bun add @flowglad/react @flowglad/server\`
  - React components/hooks for client-side, server SDK for backend

- **@flowglad/server**: For Node.js/Express backends
  - Install: \`bun add @flowglad/server\`
  - Use \`@flowglad/server/express\` subpath for Express router

## Core Concepts
- **Products**: Offerings you sell to customers
- **Prices**: Individual pricing schemes attached to products
- **Pricing Models**: Frameworks for flexible monetization (subscription, usage-based, one-time)
- **Subscriptions**: Recurring payment relationships
- **Customers**: Entities with billing relationships
- **Payments**: Transactions including refunds and history
- **Usage-Based Billing**: Charges based on consumption (usage limits, pay-as-you-go)
- **Features**: Capabilities gated behind subscription tiers
- **Entitlements**: Access rights including features, usage quotas, and claimable resources
- **Checkout Sessions**: Customer transaction flows
- **Discounts**: Promotional incentives

## Guidelines
- Be concise (under 300 words unless more detail needed)
- Base answers on provided documentation context
- Provide TypeScript code examples using the appropriate SDK for the user's stack
- If you cannot answer, suggest docs.flowglad.com or Discord support
- Never make up features or APIs that don't exist
- Be professional, friendly, and supportive`

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const sendMessageInputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(chatMessageSchema).max(50),
})

const sendMessageOutputSchema = z.object({
  response: z.string(),
  sources: z.array(z.object({
    title: z.string().optional(),
    path: z.string(),
  })).optional(),
})

export const sendMessage = publicProcedure
  .input(sendMessageInputSchema)
  .output(sendMessageOutputSchema)
  .mutation(async ({ input }): Promise<{
    response: string
    sources?: Array<{ title?: string; path: string }>
  }> => {
    // 1. Query turbopuffer for relevant docs
    const docResults = await queryTurbopuffer(
      input.message,
      5, // topK
      'flowglad-docs'
    )

    // 2. Build context from retrieved docs
    const context = docResults
      .map((doc) => `[${doc.title || doc.path}]\n${doc.text}`)
      .join('\n\n---\n\n')

    // 3. Generate response with Vercel AI SDK
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SUPPORT_CHAT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'system',
          content: `Relevant documentation:\n\n${context}`,
        },
        ...input.history.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: input.message },
      ],
      maxTokens: 1000,
      temperature: 0.7,
    })

    return {
      response:
        result.text ||
        'I apologize, but I was unable to generate a response.',
      sources: docResults.slice(0, 3).map((doc) => ({
        title: doc.title,
        path: doc.path,
      })),
    }
  })

export const supportChatRouter = router({
  sendMessage,
})
```

### 3. Register Router in appRouter
**File**: `src/server/index.ts`
- Add import: `import { supportChatRouter } from './routers/supportChatRouter'`
- Add to router object at ~line 79: `supportChat: supportChatRouter,`

### 4. Create Support Chat Components
**Directory**: `src/components/support-chat/`

| File | Purpose |
|------|---------|
| `SupportChatWidget.tsx` | Main container, manages open/closed state and message history |
| `SupportChatTrigger.tsx` | Floating circle button with FlowgladLogomark |
| `SupportChatPopup.tsx` | Expanded chat interface with header, messages, input |
| `SupportChatMessage.tsx` | Individual message bubble (user/assistant) |
| `SupportChatInput.tsx` | Text input with send button |
| `index.ts` | Barrel export |

**Key Component Props**:
```ts
// SupportChatWidget - no props, manages all state internally
// Renders SupportChatTrigger when closed, SupportChatPopup when open

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// SupportChatTrigger
interface SupportChatTriggerProps {
  onClick: () => void
}

// SupportChatPopup
interface SupportChatPopupProps {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  onClose: () => void
  showDiscordLink: boolean
}

// SupportChatMessage
interface SupportChatMessageProps {
  message: ChatMessage
  isLatest: boolean
}

// SupportChatInput
interface SupportChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}
```

### 5. Integrate into Root Layout
**File**: `src/app/layout.tsx`
- Add import: `import { SupportChatWidget } from '@/components/support-chat'`
- Add component after `<Toaster />` (around line 111): `<SupportChatWidget />`

## Acceptance Criteria
- [ ] Floating circle button (56x56px) appears in bottom-right corner on all pages
- [ ] Button displays FlowgladLogomark icon
- [ ] Clicking button morphs into chat popup (380x500px) with spring animation
- [ ] Popup contains: header with title and close button, scrollable message area, text input with send button
- [ ] User can type message and submit via Enter or click
- [ ] Message is sent to backend, loading state shown, response appears
- [ ] After first assistant response, Discord support link appears: "Need more help? [Join our Discord](https://discord.com/channels/1273695198639161364/1415806514085498880)"
- [ ] Close button morphs popup back to circle
- [ ] Chat history persists in sessionStorage (survives page navigation, cleared when tab closes)
- [ ] Works for unauthenticated users (public endpoint)
- [ ] Uses shadcn/ui components and follows codebase styling conventions
- [ ] `bun run check` passes

## Open Questions
None - all design decisions clarified with user.

## Explicit Opinions
1. **Use motion.dev over framer-motion**: User preference, provides clean API for morphing animations
2. **Use Vercel AI SDK**: Consistent with existing `generateDescription.ts` pattern using `@ai-sdk/openai` and `generateText`
3. **Public endpoint with no rate limiting (for now)**: Keeps implementation simple; can add rate limiting later if needed
4. **sessionStorage for chat history**: Messages persist across page navigations within the same tab, cleared when tab closes. No database schema changes required.
5. **Use existing RAG infrastructure**: Leverage `queryTurbopuffer` rather than creating new vector search
6. **System prompt baked into backend**: Not configurable via UI; keeps things simple and secure
7. **Discord link appears after first exchange**: Provides human escalation path without being intrusive upfront

## Patches

### Patch 1: Install motion.dev
**Dependencies**: None

**Changes**:
```bash
cd platform/flowglad-next && bun add motion
```

**Tests**: None (dependency installation)

---

### Patch 2: Create tRPC Router
**Dependencies**: None (can run parallel with Patch 1)

**Files to create**:
- `src/server/routers/supportChatRouter.ts`

**Files to modify**:
- `src/server/index.ts` - add import and register router

**Implementation details**:
- Use `publicProcedure` for unauthenticated access
- Query turbopuffer with `topK: 5` for relevant docs
- Build context string from doc results
- Use Vercel AI SDK: `import { openai } from '@ai-sdk/openai'` and `import { generateText } from 'ai'`
- Call `generateText()` with `openai('gpt-4o-mini')` model
- Return response and optional sources

**Tests**:
```ts
describe('supportChatRouter', () => {
  describe('sendMessage', () => {
    it('returns a response for a valid user question about Flowglad', async () => {
      // Setup: call sendMessage with a question about billing
      // Expect: response is non-empty string, no error thrown
    })

    it('includes relevant documentation sources in the response', async () => {
      // Setup: call sendMessage with question that should match docs
      // Expect: sources array is present and contains paths
    })

    it('handles conversation history correctly', async () => {
      // Setup: send message with history of previous exchange
      // Expect: response acknowledges context from history
    })

    it('enforces message length limits', async () => {
      // Setup: send message exceeding 2000 chars
      // Expect: validation error
    })

    it('enforces history length limits', async () => {
      // Setup: send with history exceeding 50 messages
      // Expect: validation error
    })
  })
})
```

---

### Patch 3: Create Support Chat Components
**Dependencies**: Patch 1 (motion.dev must be installed)

**Files to create**:
- `src/components/support-chat/SupportChatWidget.tsx`
- `src/components/support-chat/SupportChatTrigger.tsx`
- `src/components/support-chat/SupportChatPopup.tsx`
- `src/components/support-chat/SupportChatMessage.tsx`
- `src/components/support-chat/SupportChatInput.tsx`
- `src/components/support-chat/index.ts`

**Implementation details**:

**SupportChatWidget.tsx**:
- Client component (`'use client'`)
- State: `isOpen: boolean`, `messages: ChatMessage[]`
- **sessionStorage persistence**: Messages persist across page navigations within the same tab
  - Key: `'flowglad-support-chat-messages'`
  - Initialize state from sessionStorage on mount (inside useEffect to avoid SSR issues)
  - Sync state to sessionStorage whenever messages change
  - Messages cleared when tab/window closes
- Uses `AnimatePresence` from `motion/react` for enter/exit animations
- `layoutId="support-chat"` for shared element morphing
- Position: `fixed bottom-6 right-6 z-50`

```ts
// sessionStorage persistence pattern
const STORAGE_KEY = 'flowglad-support-chat-messages'

const [messages, setMessages] = useState<ChatMessage[]>([])

// Load from sessionStorage on mount
useEffect(() => {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      setMessages(JSON.parse(stored))
    } catch {
      // Invalid JSON, ignore
    }
  }
}, [])

// Sync to sessionStorage when messages change
useEffect(() => {
  if (messages.length > 0) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
  }
}, [messages])
```

**SupportChatTrigger.tsx**:
- 56x56px rounded-full button
- `bg-primary text-primary-foreground` styling
- `whileHover={{ scale: 1.05 }}` and `whileTap={{ scale: 0.95 }}`
- Renders `FlowgladLogomark` with `size={28}`

**SupportChatPopup.tsx**:
- 380px wide, ~500px tall Card
- Header: "Flowglad Support" title + X close button
- ScrollArea for messages
- Discord link (conditional on `showDiscordLink` prop)
- SupportChatInput at bottom
- Uses tRPC mutation `trpc.supportChat.sendMessage.useMutation()`
- Loading state: show typing indicator

**SupportChatMessage.tsx**:
- Avatar (user: "U", assistant: FlowgladLogomark)
- Message bubble with appropriate bg color
- `motion.div` with entrance animation when `isLatest`

**SupportChatInput.tsx**:
- shadcn Input component
- Send button with lucide-react Send icon
- Submit on Enter key

**Tests**:
```ts
/**
 * @vitest-environment jsdom
 */
describe('SupportChatWidget', () => {
  it('renders trigger button when closed', () => {
    // Setup: render SupportChatWidget
    // Expect: trigger button visible, popup not visible
  })

  it('opens popup when trigger is clicked', () => {
    // Setup: render, click trigger
    // Expect: popup visible, trigger hidden
  })

  it('closes popup when close button is clicked', () => {
    // Setup: render, open popup, click close
    // Expect: trigger visible, popup hidden
  })
})

describe('SupportChatInput', () => {
  it('calls onSend with trimmed message when submitted', () => {
    // Setup: render with mock onSend, type message, submit
    // Expect: onSend called with trimmed value, input cleared
  })

  it('submits on Enter key press', () => {
    // Setup: render with mock onSend, type message, press Enter
    // Expect: onSend called
  })

  it('does not submit empty messages', () => {
    // Setup: render with mock onSend, try to submit empty
    // Expect: onSend not called
  })

  it('disables input when disabled prop is true', () => {
    // Setup: render with disabled=true
    // Expect: input and button disabled
  })
})

describe('SupportChatMessage', () => {
  it('renders user message with correct styling', () => {
    // Setup: render with role='user'
    // Expect: message aligned right, primary background
  })

  it('renders assistant message with FlowgladLogomark', () => {
    // Setup: render with role='assistant'
    // Expect: message aligned left, muted background, logo avatar
  })
})
```

---

### Patch 4: Integrate into Layout
**Dependencies**: Patches 2 and 3

**Files to modify**:
- `src/app/layout.tsx`
  - Add import: `import { SupportChatWidget } from '@/components/support-chat'`
  - Add `<SupportChatWidget />` after `<Toaster />` (line ~111)

**Tests**: Manual verification - widget should appear on all pages

---

### Patch 5: Verification
**Dependencies**: Patch 4

**Steps**:
1. Run `bun run check` - must pass with no errors
2. Manual testing:
   - Navigate to site, verify widget appears
   - Click to open, verify animation
   - Send a message about Flowglad
   - Verify response appears
   - Verify Discord link appears after response
   - Close and reopen, verify history persists
   - Refresh page, verify history cleared

---

## Dependency Graph
```
- Patch 1 -> []
- Patch 2 -> []
- Patch 3 -> [1]
- Patch 4 -> [2, 3]
- Patch 5 -> [4]
```

## Verification
1. Run `bun run check` to verify linting and types pass
2. Run tests: `bun run test src/server/routers/supportChatRouter.test.ts` and `bun run test src/components/support-chat/`
3. Manual testing: Start dev server, navigate to any page, interact with chat widget
