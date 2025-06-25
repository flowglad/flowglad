import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import { promises as fs } from 'fs'
import path from 'path'

enum ProjectStructure {}

enum PricingComponent {}

const getSetupInstructionsSchema = {
  projectStructure: z.nativeEnum(ProjectStructure),
  pricingComponents: z
    .array(z.nativeEnum(PricingComponent))
    .describe(
      'Aspects of the pricing model that need to be considered to properly set up billing and payments.'
    ),
  stackDetails: z
    .string()
    .describe(
      'The stack details for the project. Make sure to include things such as how requests are authenticated on the backend, and how authenticated requests are sent on the frontend (cookes? authorization headers?)'
    ),
  additionalDetails: z
    .string()
    .describe(
      'Additional details for the project. Include things like the tenant / customer model if there is one. Are customers organizations like groups of users, or is every user a customer?'
    ),
}

const loadInstructions = async (
  filename: string
): Promise<string> => {
  return await fs.readFile(
    path.join(process.cwd(), 'src', 'mcp', 'tools', filename),
    'utf8'
  )
}

export const getSetupInstructions: ToolConstructor<
  typeof getSetupInstructionsSchema
> = {
  name: 'getSetupInstructions',
  description:
    'Get setup instructions for a project to integrate billing and payments',
  schema: getSetupInstructionsSchema,
  callbackConstructor:
    (apiKey: string) =>
    async ({
      projectStructure,
      pricingComponents,
      stackDetails,
      additionalDetails,
    }) => {
      const instructions = await loadInstructions(
        'mcpsetupinstructions.md'
      )
      return {
        content: [
          {
            type: 'text',
            text: instructions,
          },
        ],
      }
    },
}
