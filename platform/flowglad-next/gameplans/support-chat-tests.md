# Support Chat Test Cases Plan

## Overview

This document outlines test cases for the AI Support Chatbot feature across backend (tRPC router) and frontend (React components).

---

## Backend: `supportChatRouter.ts`

### `sendMessage` mutation

#### Scenario 1: Successful message with RAG results

**Setup:**
- Mock `queryTurbopuffer` to return an array of docs with `id`, `$dist`, `path`, `title`, `text` fields
- Mock `generateText` to return a response string

**Expectations:**
- Response contains the generated text
- Sources array contains up to 3 items from docs that had `text` field
- Each source has `path` and optionally `title`

#### Scenario 2: Successful message when some docs lack text field

**Setup:**
- Mock `queryTurbopuffer` to return 5 docs where 2 have no `text` field
- Mock `generateText` to return a response

**Expectations:**
- Only docs with `text` are used in context building
- Sources array only includes docs that had `text` (max 3)

#### Scenario 3: Successful message when no docs have text field

**Setup:**
- Mock `queryTurbopuffer` to return docs where none have `text` field
- Mock `generateText` to return a response

**Expectations:**
- Context is empty string (no docs to include)
- Sources array is empty
- Response is still returned from AI

#### Scenario 4: Empty response from AI returns fallback message

**Setup:**
- Mock `queryTurbopuffer` to return docs
- Mock `generateText` to return empty string or undefined for `result.text`

**Expectations:**
- Response equals `'I apologize, but I was unable to generate a response.'`

#### Scenario 5: Turbopuffer query failure propagates error

**Setup:**
- Mock `queryTurbopuffer` to throw an error

**Expectations:**
- Mutation throws/rejects with the error
- No AI call is made

#### Scenario 6: AI generation failure propagates error

**Setup:**
- Mock `queryTurbopuffer` to return docs
- Mock `generateText` to throw an error

**Expectations:**
- Mutation throws/rejects with the error

#### Scenario 7: Input validation - message too short

**Setup:**
- Call with `message: ''` (empty string)

**Expectations:**
- Zod validation fails with appropriate error
- No calls to `queryTurbopuffer` or `generateText`

#### Scenario 8: Input validation - message too long

**Setup:**
- Call with `message` that exceeds 2000 characters

**Expectations:**
- Zod validation fails with appropriate error
- No calls to `queryTurbopuffer` or `generateText`

#### Scenario 9: Input validation - history exceeds 50 messages

**Setup:**
- Call with `history` array containing 51 messages

**Expectations:**
- Zod validation fails with appropriate error

#### Scenario 10: Input validation - history message content too long

**Setup:**
- Call with `history` containing a message where `content` exceeds 2000 characters

**Expectations:**
- Zod validation fails with appropriate error

#### Scenario 11: History is correctly passed to AI model

**Setup:**
- Mock `queryTurbopuffer` to return docs
- Mock `generateText` and capture the arguments
- Call with `history` containing 3 user/assistant message pairs

**Expectations:**
- `generateText` is called with messages array containing all history items plus the new user message
- History messages maintain their role and content

---

## Frontend: `SupportChatMessage.tsx`

### `getSourceUrl` function

#### Scenario 1: Path with .mdx extension is converted correctly

**Setup:**
- Source path: `'sdks/nextjs.mdx'`

**Expectations:**
- Returns `'https://docs.flowglad.com/sdks/nextjs'`

#### Scenario 2: Path without .mdx extension is passed through

**Setup:**
- Source path: `'guides/getting-started'`

**Expectations:**
- Returns `'https://docs.flowglad.com/guides/getting-started'`

#### Scenario 3: Path already starting with slash is handled

**Setup:**
- Source path: `'/concepts/products.mdx'`

**Expectations:**
- Returns `'https://docs.flowglad.com/concepts/products'` (no double slash)

### `getSourceDisplayName` function

#### Scenario 1: Returns title when provided

**Setup:**
- Source: `{ title: 'Getting Started Guide', path: 'guides/getting-started' }`

**Expectations:**
- Returns `'Getting Started Guide'`

#### Scenario 2: Converts kebab-case path to Title Case when no title

**Setup:**
- Source: `{ path: 'guides/getting-started.mdx' }`

**Expectations:**
- Returns `'Getting Started'`

#### Scenario 3: Handles path with multiple segments

**Setup:**
- Source: `{ path: 'sdks/react/use-customer-portal.mdx' }`

**Expectations:**
- Returns `'Use Customer Portal'` (uses last segment)

#### Scenario 4: Handles empty path parts

**Setup:**
- Source: `{ path: '/' }`

**Expectations:**
- Returns `'Documentation'` (fallback)

---

## Frontend: `SupportChatInput.tsx`

### `handleSubmit` function

#### Scenario 1: Calls onSend with trimmed message and clears input

**Setup:**
- Render component with `onSend` mock
- Set input value to `'  hello world  '`
- Trigger submit

**Expectations:**
- `onSend` called with `'hello world'` (trimmed)
- Input value is cleared to empty string

#### Scenario 2: Does not call onSend when input is only whitespace

**Setup:**
- Render component with `onSend` mock
- Set input value to `'   '` (only spaces)
- Trigger submit

**Expectations:**
- `onSend` is NOT called
- Input value remains unchanged

#### Scenario 3: Does not call onSend when input is empty

**Setup:**
- Render component with `onSend` mock
- Input value is empty
- Trigger submit

**Expectations:**
- `onSend` is NOT called

#### Scenario 4: Enter key triggers submit

**Setup:**
- Render component with `onSend` mock
- Set input value to `'test message'`
- Simulate Enter keydown

**Expectations:**
- `onSend` called with `'test message'`

#### Scenario 5: Shift+Enter does NOT trigger submit

**Setup:**
- Render component with `onSend` mock
- Set input value to `'test message'`
- Simulate Shift+Enter keydown

**Expectations:**
- `onSend` is NOT called

#### Scenario 6: Button is disabled when disabled prop is true

**Setup:**
- Render component with `disabled={true}`

**Expectations:**
- Input element has disabled attribute
- Button element has disabled attribute

#### Scenario 7: Button is disabled when input is empty or whitespace

**Setup:**
- Render component with `disabled={false}` and empty input

**Expectations:**
- Input is NOT disabled
- Button IS disabled

---

## Frontend: `SupportChatWidget.tsx`

### Session storage persistence

#### Scenario 1: Loads messages from sessionStorage on mount

**Setup:**
- Set sessionStorage with valid messages JSON
- Render component

**Expectations:**
- Component displays the stored messages

#### Scenario 2: Clears corrupted JSON from sessionStorage

**Setup:**
- Set sessionStorage with invalid JSON (not parseable)
- Render component

**Expectations:**
- sessionStorage item is removed
- Component renders with empty messages

#### Scenario 3: Clears invalid schema data from sessionStorage

**Setup:**
- Set sessionStorage with valid JSON but wrong schema (e.g., missing required fields)
- Render component

**Expectations:**
- sessionStorage item is removed
- Component renders with empty messages

#### Scenario 4: Saves messages to sessionStorage when messages change

**Setup:**
- Render component
- Add a message via the send flow

**Expectations:**
- sessionStorage contains the updated messages array

#### Scenario 5: Removes sessionStorage key when messages become empty

**Setup:**
- Render component with messages
- Clear all messages

**Expectations:**
- sessionStorage key is removed

### showDiscordLink logic

#### Scenario 1: Discord link not shown when no assistant messages

**Setup:**
- Render component with only user messages or no messages

**Expectations:**
- Discord link section is NOT rendered

#### Scenario 2: Discord link shown after first assistant message

**Setup:**
- Render component with at least one assistant message

**Expectations:**
- Discord link section IS rendered

---

## Frontend: `SupportChatPopup.tsx`

### Error handling

#### Scenario 1: Displays error message when mutation fails

**Setup:**
- Mock tRPC mutation to trigger onError callback
- Send a message

**Expectations:**
- Error message is added to messages: `'Sorry, I encountered an error processing your request. Please try again, or reach out on Discord if the issue persists.'`

### Race condition handling

#### Scenario 1: Multiple rapid messages are all captured

**Setup:**
- Render component
- Send 3 messages rapidly without waiting for responses

**Expectations:**
- All 3 user messages appear in the message list
- Each mutation call includes all previous messages in history

---

## Test File Structure

```
src/
├── server/routers/__tests__/
│   └── supportChatRouter.test.ts      # Backend integration tests
├── components/support-chat/__tests__/
│   ├── SupportChatMessage.test.ts     # Unit tests for helper functions
│   └── SupportChatInput.test.tsx      # Unit tests for input component
```

Note: `SupportChatWidget.tsx` and `SupportChatPopup.tsx` tests would require mocking tRPC client and sessionStorage, making them integration tests that may need additional setup.
