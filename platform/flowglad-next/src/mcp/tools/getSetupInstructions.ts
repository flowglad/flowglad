import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import { promises as fs } from 'fs'
import path from 'path'

enum ProjectStructure {
  Nextjs = 'nextjs',
}

enum PricingComponent {
  FeatureAccess = 'feature_access',
  UsageBased = 'usage_based',
  Subscription = 'subscription',
  OneTime = 'one_time',
  FreeTrial = 'free_trial_by_time',
  FreeTrialByCredit = 'free_trial_by_credit',
  Discount = 'discount',
}

const getSetupInstructionsSchema = {
  projectStructure: z
    .nativeEnum(ProjectStructure)
    .describe(
      'The structure of the project. Currently only MCP servers are supported.'
    ),
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
    path.join(process.cwd(), 'src/mcp/tools/instructions', filename),
    'utf8'
  )
}

export const getSetupInstructions: ToolConstructor<
  typeof getSetupInstructionsSchema
> = {
  name: 'getSetupInstructions',
  description:
    'Get instructions for a project to integrate billing and payments.',
  schema: getSetupInstructionsSchema,
  callbackConstructor:
    (_apiKey: string) =>
    async ({
      projectStructure,
      pricingComponents: _pricingComponents,
      stackDetails: _stackDetails,
      additionalDetails: _additionalDetails,
    }) => {
      const instructions = await loadInstructions(
        `${projectStructure}-setup.mdx`
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
