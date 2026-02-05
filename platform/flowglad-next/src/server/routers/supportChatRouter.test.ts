/**
 * Tests for Support Chat Router
 *
 * Tests the sendMessage procedure which queries Turbopuffer for relevant docs
 * and generates AI responses using OpenAI.
 *
 * External network calls (Turbopuffer, AI SDK) are mocked since they make network
 * calls whose responses need to be controlled for testing.
 *
 * Note: Since sendMessage only interacts with external APIs (not the database),
 * we use a mock user object instead of database setup for faster tests.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'

// Mock modules BEFORE importing them
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

// Mock data for turbopuffer responses
const mockDocsWithText = [
  {
    id: 'doc1',
    $dist: 0.1,
    path: '/docs/install',
    title: 'Installation',
    text: 'Run bun add @flowglad/nextjs to install.',
  },
  {
    id: 'doc2',
    $dist: 0.2,
    path: '/docs/api',
    title: 'API Reference',
    text: 'The API provides methods for billing.',
  },
]

// Type for turbopuffer doc results - text is optional since some docs may not have it
type TurbopufferDoc = {
  id: string
  $dist: number
  path: string
  title?: string
  text?: string
}

// Type for AI response
type AIResponse = { text: string | undefined }

// Mutable mock functions that tests can configure
let mockQueryTurbopuffer: () => Promise<TurbopufferDoc[]> = () =>
  Promise.resolve(mockDocsWithText)
let mockGenerateText: (args: unknown) => Promise<AIResponse> = () =>
  Promise.resolve({ text: 'Here is how to install the SDK...' })

mock.module('@/utils/turbopuffer', () => ({
  queryTurbopuffer: (...args: unknown[]) => mockQueryTurbopuffer(),
}))

mock.module('ai', () => ({
  generateText: (args: unknown) => mockGenerateText(args),
}))

import type { User } from '@db-core/schema/users'
import { supportChatRouter } from '@/server/routers/supportChatRouter'
import type { TRPCContext } from '@/server/trpcContext'

// Mock user for authentication context
// Since sendMessage doesn't interact with the database, we don't need a real user
const mockUser: User.Record = {
  id: 'usr_test123',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdByCommit: null,
  updatedByCommit: null,
  position: 1,
  name: 'Test User',
  email: 'test@example.com',
  clerkId: null,
  betterAuthId: 'ba_test123',
  stackAuthId: null,
}

// Helper to create a caller with a user context
const createAuthenticatedCaller = (testUser: User.Record) => {
  const ctx: TRPCContext = {
    user: testUser,
    path: '/supportChat',
    environment: 'test',
    livemode: false,
    organizationId: undefined,
    organization: undefined,
    isApi: false,
    apiKey: undefined,
    session: null,
    focusedPricingModelId: undefined,
    authScope: 'merchant',
  }
  return supportChatRouter.createCaller(ctx)
}

beforeEach(() => {
  globalThis.__mockedAuthSession = null

  // Reset mock functions to default behavior
  mockQueryTurbopuffer = () => Promise.resolve(mockDocsWithText)
  mockGenerateText = () =>
    Promise.resolve({ text: 'Here is how to install the SDK...' })
})

afterEach(() => {
  globalThis.__mockedAuthSession = null
})

describe('sendMessage', () => {
  describe('when Turbopuffer returns docs with text content', () => {
    it('returns the AI-generated response and sources when docs are successfully retrieved', async () => {
      // Default mocks return 2 docs with text and AI response
      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'How do I install the SDK?',
        history: [],
      })

      expect(result.response).toBe(
        'Here is how to install the SDK...'
      )
      expect(result.sources).toHaveLength(2)
      expect(result.sources![0].title).toBe('Installation')
      expect(result.sources![0].path).toBe('/docs/install')
      expect(result.sources![1].title).toBe('API Reference')
      expect(result.sources![1].path).toBe('/docs/api')
    })

    it('includes conversation history in the AI request', async () => {
      // Capture the arguments passed to generateText
      let capturedArgs: unknown = null
      mockGenerateText = (args: unknown) => {
        capturedArgs = args
        return Promise.resolve({ text: 'Follow up response' })
      }

      const caller = createAuthenticatedCaller(mockUser)

      await caller.sendMessage({
        message: 'Follow up question',
        history: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
      })

      // Verify generateText was called with the correct messages structure
      const args = capturedArgs as {
        messages: Array<{ role: string; content: string }>
      }
      expect(args.messages).toHaveLength(3)
      expect(args.messages[0]).toEqual({
        role: 'user',
        content: 'First question',
      })
      expect(args.messages[1]).toEqual({
        role: 'assistant',
        content: 'First answer',
      })
      expect(args.messages[2]).toEqual({
        role: 'user',
        content: 'Follow up question',
      })
    })
  })

  describe('when Turbopuffer returns docs without text content', () => {
    it('filters out docs without text and returns empty sources', async () => {
      // Configure mock to return docs without text property
      mockQueryTurbopuffer = () =>
        Promise.resolve([
          { id: 'doc1', $dist: 0.1, path: '/a', title: 'A' },
          { id: 'doc2', $dist: 0.2, path: '/b', title: 'B' },
          { id: 'doc3', $dist: 0.3, path: '/c', title: 'C' },
        ])
      mockGenerateText = () =>
        Promise.resolve({ text: 'Response without context' })

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.response).toBe('Response without context')
      expect(result.sources).toHaveLength(0)
    })
  })

  describe('when Turbopuffer returns mixed docs (some with text, some without)', () => {
    it('only includes docs with text in sources', async () => {
      // Configure mock to return mixed docs - some with text, some without
      mockQueryTurbopuffer = () =>
        Promise.resolve([
          {
            id: 'doc1',
            $dist: 0.1,
            path: '/docs/install',
            title: 'Installation',
            text: 'Install content',
          },
          {
            id: 'doc2',
            $dist: 0.2,
            path: '/docs/overview',
            title: 'Overview',
          }, // no text
          {
            id: 'doc3',
            $dist: 0.3,
            path: '/docs/api',
            title: 'API Reference',
            text: 'API content',
          },
          { id: 'doc4', $dist: 0.4, path: '/docs/faq', title: 'FAQ' }, // no text
        ])

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      // Only docs with text should be in sources
      expect(result.sources).toHaveLength(2)
      expect(result.sources![0].title).toBe('Installation')
      expect(result.sources![0].path).toBe('/docs/install')
      expect(result.sources![1].title).toBe('API Reference')
      expect(result.sources![1].path).toBe('/docs/api')
    })
  })

  describe('when Turbopuffer query fails', () => {
    it('gracefully degrades and returns response without sources when Turbopuffer fails', async () => {
      // Configure mock to throw an error (simulating network failure)
      mockQueryTurbopuffer = () =>
        Promise.reject(new Error('Network error'))
      mockGenerateText = () =>
        Promise.resolve({ text: 'I can help with that' })

      const caller = createAuthenticatedCaller(mockUser)

      // Should not throw - graceful degradation
      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.response).toBe('I can help with that')
      expect(result.sources).toHaveLength(0)
    })
  })

  describe('when AI returns empty or undefined text', () => {
    it('returns fallback message when AI response text is empty string', async () => {
      mockGenerateText = () => Promise.resolve({ text: '' })

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.response).toBe(
        'I apologize, but I was unable to generate a response.'
      )
    })

    it('returns fallback message when AI response text is undefined', async () => {
      mockGenerateText = () => Promise.resolve({ text: undefined })

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.response).toBe(
        'I apologize, but I was unable to generate a response.'
      )
    })
  })

  describe('when more than 3 docs have text', () => {
    it('limits sources to first 3 docs', async () => {
      // Configure mock to return 5 docs, all with text
      mockQueryTurbopuffer = () =>
        Promise.resolve([
          {
            id: 'doc1',
            $dist: 0.1,
            path: '/a',
            title: 'Doc A',
            text: 'Content A',
          },
          {
            id: 'doc2',
            $dist: 0.2,
            path: '/b',
            title: 'Doc B',
            text: 'Content B',
          },
          {
            id: 'doc3',
            $dist: 0.3,
            path: '/c',
            title: 'Doc C',
            text: 'Content C',
          },
          {
            id: 'doc4',
            $dist: 0.4,
            path: '/d',
            title: 'Doc D',
            text: 'Content D',
          },
          {
            id: 'doc5',
            $dist: 0.5,
            path: '/e',
            title: 'Doc E',
            text: 'Content E',
          },
        ])

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      // Should limit to first 3 sources
      expect(result.sources).toHaveLength(3)
      expect(result.sources![0].title).toBe('Doc A')
      expect(result.sources![1].title).toBe('Doc B')
      expect(result.sources![2].title).toBe('Doc C')

      // Verify docs D and E are not included
      const titles = result.sources!.map((s) => s.title)
      expect(titles).not.toContain('Doc D')
      expect(titles).not.toContain('Doc E')
    })
  })

  describe('when Turbopuffer returns no docs', () => {
    it('returns response with empty sources when no docs are found', async () => {
      mockQueryTurbopuffer = () => Promise.resolve([])
      mockGenerateText = () =>
        Promise.resolve({ text: 'I can still help' })

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.response).toBe('I can still help')
      expect(result.sources).toHaveLength(0)
    })
  })

  describe('when docs have optional title field', () => {
    it('includes title in source when present, omits when absent', async () => {
      // Configure mock to return docs with and without titles
      mockQueryTurbopuffer = () =>
        Promise.resolve([
          {
            id: 'doc1',
            $dist: 0.1,
            path: '/docs/start',
            title: 'Getting Started',
            text: 'Start here',
          },
          {
            id: 'doc2',
            $dist: 0.2,
            path: '/docs/other',
            title: undefined,
            text: 'Other content',
          },
        ])

      const caller = createAuthenticatedCaller(mockUser)

      const result = await caller.sendMessage({
        message: 'Test message',
        history: [],
      })

      expect(result.sources).toHaveLength(2)

      // First source has title
      expect(result.sources![0].title).toBe('Getting Started')
      expect(result.sources![0].path).toBe('/docs/start')

      // Second source has undefined title
      expect(result.sources![1].title).toBeUndefined()
      expect(result.sources![1].path).toBe('/docs/other')
    })
  })
})
