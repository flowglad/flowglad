import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { protectedProcedure } from '@/server/trpc'

const generateDescriptionSchema = z.object({
  productName: z.string(),
  additionalNotes: z.string().optional(),
})

export const generateDescription = protectedProcedure
  .input(generateDescriptionSchema)
  .output(z.object({ description: z.string() }))
  .mutation(async ({ input }) => {
    const description = (
      await authenticatedTransaction(async ({ transaction }) => {
        // Assuming there's a function to generate description based on input
        const generatedDescription = await generateText({
          model: openai('gpt-4o-mini'),
          system: `You are a helpful assistant that generates descriptions for products. You just received a request to help copywrite a description for a product. The title has been provided by the user.`,
          messages: [
            {
              role: 'user',
              content: `${input.productName}\n\n${
                input.additionalNotes &&
                `\n\nAdditional notes: ${input.additionalNotes}`
              }`,
            },
          ],
        })
        return generatedDescription
      })
    ).unwrap()

    return {
      description: description.text,
    }
  })
