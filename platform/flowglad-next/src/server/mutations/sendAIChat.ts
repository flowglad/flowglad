import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { classifyNounAndVerb } from '@/ai/classify'
import { structuredOutputMap } from '@/ai/structuredOutputMap'
import { Nouns, Verbs } from '@/types'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import core from '@/utils/core'

const coreMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})

// Define the input schema
const sendAIChatSchema = z.object({
  prompt: z.string(),
  messages: z.array(coreMessageSchema), // Assuming CoreMessage is not defined, using z.any() for now
  parsedInput: z.any(),
})

export const sendAIChat = protectedProcedure
  .input(sendAIChatSchema)
  .mutation(async ({ input }) => {
    const messages = coreMessageSchema
      .array()
      .parse([
        ...input.messages,
        { role: 'user', content: input.prompt },
      ])
    const { text: response } = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      system: `You just received a request from a user via a React web app they're using to chat with you. Generate a helpful affirmative response.

This is going to be used as part of a message that we send back to the user that includes a subcomponent.

Focus on just the affirmative response, which we'll then append later with a subcomponent.

Don't wrap your response in quotation marks or anything.

Examples:
Sure thing, I can help with that:
On it, here ya go:
You got it!
`,
      messages,
    })

    const classification = await classifyNounAndVerb({ messages })
    const { noun, verb } = classification
    if (noun !== Nouns.Product) {
      throw new Error('Invalid noun')
    }
    const generateStructuredOutput = structuredOutputMap[noun][verb]
    let structuredOutput: any
    if (verb === Verbs.Edit) {
      const selectionCriteria = classification.recordSelectionCriteria
      const existingRecord = await authenticatedTransaction(
        async ({ transaction }) => {
          const [product] = await selectProducts(
            selectionCriteria,
            transaction
          )
          return product
        }
      )
      structuredOutput = await generateStructuredOutput(
        messages,
        existingRecord
      )
    } else {
      // @ts-expect-error - generateStructuredOutput can't infer its arguments, so is expecting 2 when it only needs 1
      structuredOutput = await generateStructuredOutput(messages)
    }
    return {
      data: {
        response,
        messages,
        classification,
        structuredOutput,
        id: core.nanoid(),
      },
    }
  })
