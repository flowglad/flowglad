import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryDocsResult } from '@/utils/turbopuffer'
import { supportChatRouter } from './supportChatRouter'

// Mock queryTurbopuffer - this makes network calls to Turbopuffer and OpenAI
const mockQueryTurbopuffer =
  vi.fn<
    (
      queryText: string,
      topK: number,
      namespaceName?: string
    ) => Promise<QueryDocsResult[]>
  >()

vi.mock('@/utils/turbopuffer', () => ({
  queryTurbopuffer: (
    ...args: Parameters<typeof mockQueryTurbopuffer>
  ) => mockQueryTurbopuffer(...args),
}))

// Mock generateText from Vercel AI SDK - this makes network calls to OpenAI
const mockGenerateText =
  vi.fn<() => Promise<{ text: string; [key: string]: unknown }>>()

vi.mock('ai', () => ({
  generateText: () => mockGenerateText(),
}))

// Create a minimal caller for the public procedure
const createCaller = () => {
  return supportChatRouter.createCaller({} as never)
}

describe('supportChatRouter', () => {
  // Default mock docs with all required fields including text
  let mockDocsWithText: QueryDocsResult[]

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock docs that have text field
    mockDocsWithText = [
      {
        id: 1,
        $dist: 0.1,
        path: 'sdks/nextjs.mdx',
        title: 'Next.js SDK',
        text: 'Install the SDK using bun add @flowglad/nextjs',
      },
      {
        id: 2,
        $dist: 0.2,
        path: 'sdks/react.mdx',
        title: 'React SDK',
        text: 'For non-Next.js React apps, use @flowglad/react',
      },
      {
        id: 3,
        $dist: 0.3,
        path: 'concepts/customers.mdx',
        title: 'Customers',
        text: 'Customers represent your end users',
      },
      {
        id: 4,
        $dist: 0.4,
        path: 'concepts/subscriptions.mdx',
        title: 'Subscriptions',
        text: 'Subscriptions handle recurring billing',
      },
      {
        id: 5,
        $dist: 0.5,
        path: 'guides/getting-started.mdx',
        title: 'Getting Started',
        text: 'Follow this guide to get started with Flowglad',
      },
    ]

    // Default: return docs with text
    mockQueryTurbopuffer.mockResolvedValue(mockDocsWithText)

    // Default: return a successful AI response
    mockGenerateText.mockResolvedValue({
      text: 'Here is how to integrate Flowglad...',
    })
  })

  describe('sendMessage', () => {
    it('returns AI response with sources when RAG retrieval succeeds and docs have text', async () => {
      const caller = createCaller()

      const result = await caller.sendMessage({
        message: 'How do I install Flowglad?',
        history: [],
      })

      // Response should equal the mocked AI text
      expect(result.response).toBe(
        'Here is how to integrate Flowglad...'
      )

      // Sources should have 3 items (top 3 docs with text)
      expect(result.sources).toHaveLength(3)

      // Verify each source has the expected path and title from the mock docs
      expect(result.sources).toEqual([
        { path: 'sdks/nextjs.mdx', title: 'Next.js SDK' },
        { path: 'sdks/react.mdx', title: 'React SDK' },
        { path: 'concepts/customers.mdx', title: 'Customers' },
      ])
    })

    it('filters out docs without text field when building context and sources', async () => {
      // Override mock to return docs where some are missing text field
      const docsWithSomeMissingText: QueryDocsResult[] = [
        {
          id: 1,
          $dist: 0.1,
          path: 'doc1.mdx',
          title: 'Doc 1',
          text: 'Content 1',
        },
        { id: 2, $dist: 0.2, path: 'doc2.mdx', title: 'Doc 2' }, // no text
        {
          id: 3,
          $dist: 0.3,
          path: 'doc3.mdx',
          title: 'Doc 3',
          text: 'Content 3',
        },
        { id: 4, $dist: 0.4, path: 'doc4.mdx', title: 'Doc 4' }, // no text
        {
          id: 5,
          $dist: 0.5,
          path: 'doc5.mdx',
          title: 'Doc 5',
          text: 'Content 5',
        },
      ]
      mockQueryTurbopuffer.mockResolvedValue(docsWithSomeMissingText)

      const caller = createCaller()
      const result = await caller.sendMessage({
        message: 'test message',
        history: [],
      })

      // Sources should only include docs that had text (Doc 1, Doc 3, Doc 5)
      expect(result.sources).toHaveLength(3)
      expect(result.sources?.map((s) => s.path)).toEqual([
        'doc1.mdx',
        'doc3.mdx',
        'doc5.mdx',
      ])
    })

    it('returns empty sources array when no docs have text field', async () => {
      // Override mock to return docs without text field
      const docsWithoutText: QueryDocsResult[] = [
        { id: 1, $dist: 0.1, path: 'doc1.mdx', title: 'Doc 1' },
        { id: 2, $dist: 0.2, path: 'doc2.mdx', title: 'Doc 2' },
        { id: 3, $dist: 0.3, path: 'doc3.mdx', title: 'Doc 3' },
      ]
      mockQueryTurbopuffer.mockResolvedValue(docsWithoutText)

      const caller = createCaller()
      const result = await caller.sendMessage({
        message: 'test message',
        history: [],
      })

      // Response should still be returned
      expect(result.response).toBe(
        'Here is how to integrate Flowglad...'
      )

      // Sources should be empty since no docs had text
      expect(result.sources).toHaveLength(0)
    })

    it('returns fallback message when AI returns empty text', async () => {
      // Override mock to return empty text
      mockGenerateText.mockResolvedValue({ text: '' })

      const caller = createCaller()
      const result = await caller.sendMessage({
        message: 'test message',
        history: [],
      })

      // Should return the fallback message
      expect(result.response).toBe(
        'I apologize, but I was unable to generate a response.'
      )
    })

    it('propagates error when turbopuffer query fails', async () => {
      // Override mock to throw error
      mockQueryTurbopuffer.mockRejectedValue(
        new Error('Turbopuffer connection failed')
      )

      const caller = createCaller()

      // Mutation should reject with the error
      await expect(
        caller.sendMessage({
          message: 'test message',
          history: [],
        })
      ).rejects.toThrow('Turbopuffer connection failed')

      // generateText should never have been called
      expect(mockGenerateText).not.toHaveBeenCalled()
    })

    it('propagates error when AI generation fails', async () => {
      // Override mock to throw error
      mockGenerateText.mockRejectedValue(
        new Error('OpenAI rate limit exceeded')
      )

      const caller = createCaller()

      // Mutation should reject with the error
      await expect(
        caller.sendMessage({
          message: 'test message',
          history: [],
        })
      ).rejects.toThrow('OpenAI rate limit exceeded')
    })

    it('rejects with validation error when message is empty string', async () => {
      const caller = createCaller()

      // Empty message should fail Zod validation
      await expect(
        caller.sendMessage({
          message: '',
          history: [],
        })
      ).rejects.toThrow(TRPCError)

      // queryTurbopuffer should never have been called due to validation failure
      expect(mockQueryTurbopuffer).not.toHaveBeenCalled()
    })

    it('rejects with validation error when message exceeds 2000 characters', async () => {
      const caller = createCaller()
      const tooLongMessage = 'a'.repeat(2001)

      // Message exceeding 2000 chars should fail Zod validation
      await expect(
        caller.sendMessage({
          message: tooLongMessage,
          history: [],
        })
      ).rejects.toThrow(TRPCError)

      // queryTurbopuffer should never have been called
      expect(mockQueryTurbopuffer).not.toHaveBeenCalled()
    })

    it('rejects with validation error when history exceeds 50 messages', async () => {
      const caller = createCaller()

      // Create an array of 51 messages (exceeds max of 50)
      const oversizedHistory = Array.from({ length: 51 }, (_, i) => ({
        role: 'user' as const,
        content: `message ${i}`,
      }))

      // History exceeding 50 messages should fail Zod validation
      await expect(
        caller.sendMessage({
          message: 'valid message',
          history: oversizedHistory,
        })
      ).rejects.toThrow(TRPCError)

      // queryTurbopuffer should never have been called
      expect(mockQueryTurbopuffer).not.toHaveBeenCalled()
    })

    it('rejects with validation error when history message content exceeds 2000 characters', async () => {
      const caller = createCaller()

      // Create history with one message having content > 2000 chars
      const historyWithTooLongContent = [
        {
          role: 'user' as const,
          content: 'a'.repeat(2001),
        },
      ]

      // History message exceeding 2000 chars should fail Zod validation
      await expect(
        caller.sendMessage({
          message: 'valid message',
          history: historyWithTooLongContent,
        })
      ).rejects.toThrow(TRPCError)

      // queryTurbopuffer should never have been called
      expect(mockQueryTurbopuffer).not.toHaveBeenCalled()
    })

    it('passes conversation history to AI model in correct format', async () => {
      const caller = createCaller()

      // Create a conversation history with alternating user/assistant messages
      const history = [
        { role: 'user' as const, content: 'What is Flowglad?' },
        {
          role: 'assistant' as const,
          content: 'Flowglad is a billing platform.',
        },
        { role: 'user' as const, content: 'How do I set it up?' },
      ]

      const result = await caller.sendMessage({
        message: 'What about pricing?',
        history,
      })

      // generateText should have been called once
      expect(mockGenerateText).toHaveBeenCalledOnce()

      // Response should be returned successfully
      expect(result.response).toBe(
        'Here is how to integrate Flowglad...'
      )

      // queryTurbopuffer should have been called with the new message
      expect(mockQueryTurbopuffer).toHaveBeenCalledWith(
        'What about pricing?',
        5,
        'flowglad-docs'
      )
    })
  })
})
