import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import { queryTurbopuffer } from '@/utils/turbopuffer'

const SUPPORT_CHAT_SYSTEM_PROMPT = `You are Flowglad's support assistant helping developers integrate Flowglad's billing platform.

FORMATTING RULES (MANDATORY):
You MUST write in plain conversational text. Do NOT use any of these:
- No numbered lists like "1." or "2."
- No bullet points like "-" or "*"
- No bold using ** or __
- No italics using * or _
- No backticks for code
- No headers using #
- No code blocks using triple backticks

Instead of lists, write in flowing paragraphs or sentences separated by line breaks.

WRONG: "1. **Install**: Run \`bun add @flowglad/nextjs\`"
RIGHT: "First, install the SDK by running bun add @flowglad/nextjs in your terminal."

WRONG: "- Create a customer\n- Set up billing"
RIGHT: "You'll want to create a customer first, then set up billing for them."

CONTENT RULES:
Only answer using information from the provided documentation. If the docs don't cover it, say you don't have that information and suggest checking docs.flowglad.com or Discord. Never invent features or APIs.

CONTEXT:
Flowglad offers SDKs: @flowglad/nextjs for Next.js apps, @flowglad/react plus @flowglad/server for other React apps, and @flowglad/server alone for Node.js backends.

Keep responses concise, friendly, and conversational.`

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
})

const sendMessageInputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(chatMessageSchema).max(50),
})

const sendMessageOutputSchema = z.object({
  response: z.string(),
  sources: z
    .array(
      z.object({
        title: z.string().optional(),
        path: z.string(),
      })
    )
    .optional(),
})

export const sendMessage = protectedProcedure
  .input(sendMessageInputSchema)
  .output(sendMessageOutputSchema)
  .mutation(
    async ({
      input,
    }): Promise<{
      response: string
      sources?: Array<{ title?: string; path: string }>
    }> => {
      // 1. Query turbopuffer for relevant docs (gracefully degrade on failure)
      let docResults: Awaited<ReturnType<typeof queryTurbopuffer>> =
        []
      try {
        docResults = await queryTurbopuffer(
          input.message,
          5, // topK
          'flowglad-docs'
        )
      } catch (error) {
        // Log error but continue without RAG context
        console.error('Failed to query Turbopuffer for docs:', error)
      }

      // 2. Build context from retrieved docs (filter out docs without text)
      const docsWithText = docResults.filter((doc) => doc.text)
      const context = docsWithText
        .map((doc) => `[${doc.title || doc.path}]\n${doc.text}`)
        .join('\n\n---\n\n')

      // 3. Generate response with Vercel AI SDK
      const systemPromptWithDocs = `${SUPPORT_CHAT_SYSTEM_PROMPT}

RELEVANT DOCUMENTATION:
${context}`

      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemPromptWithDocs,
        messages: [
          ...input.history.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: input.message },
        ],
      })

      return {
        response:
          result.text ||
          'I apologize, but I was unable to generate a response.',
        sources: docsWithText.slice(0, 3).map((doc) => ({
          title: doc.title,
          path: doc.path,
        })),
      }
    }
  )

export const supportChatRouter = router({
  sendMessage,
})
