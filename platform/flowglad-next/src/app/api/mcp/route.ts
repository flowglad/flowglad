import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import core from '@/utils/core'
import { verifyApiKey } from '@/utils/unkey'
import { z } from 'zod/v3'
import {
  queryTurbopuffer,
  getTurbopufferClient,
  getOpenAIClient,
} from '@/utils/turbopuffer'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Integration step metadata
const INTEGRATION_STEPS = [
  {
    step: 0,
    name: 'prerequisites',
    file: '00-prerequisites.md',
    title: 'Prerequisites & Environment Setup',
    description:
      'Set up your environment with the necessary Flowglad credentials',
  },
  {
    step: 1,
    name: 'install-packages',
    file: '01-install-packages.md',
    title: 'Install Flowglad Packages',
    description:
      'Install the correct Flowglad SDK packages for your framework',
  },
  {
    step: 2,
    name: 'server-factory',
    file: '02-server-factory.md',
    title: 'Server Factory Setup',
    description:
      'Create a Flowglad server factory function that integrates with your auth',
  },
  {
    step: 3,
    name: 'api-route',
    file: '03-api-route.md',
    title: 'API Route Setup',
    description:
      'Create an API route that handles communication between frontend and Flowglad',
  },
  {
    step: 4,
    name: 'frontend-provider',
    file: '04-frontend-provider.md',
    title: 'Frontend Provider Setup',
    description:
      'Wrap your application with FlowgladProvider for client-side billing access',
  },
  {
    step: 5,
    name: 'use-billing-hook',
    file: '05-use-billing-hook.md',
    title: 'Using the useBilling Hook',
    description:
      'Access billing data and functions in your React components',
  },
  {
    step: 6,
    name: 'feature-access-usage',
    file: '06-feature-access-usage.md',
    title: 'Feature Access & Usage Tracking',
    description: 'Implement feature gating and usage-based billing',
  },
  {
    step: 7,
    name: 'migrate-existing-billing',
    file: '07-migrate-existing-billing.md',
    title: 'Migrate Existing Billing Code',
    description: 'Replace existing mock billing with Flowglad',
  },
  {
    step: 8,
    name: 'final-verification',
    file: '08-final-verification.md',
    title: 'Final Verification',
    description:
      'Verify your Flowglad integration is complete and functioning',
  },
]

const STEPS_DIR = join(process.cwd(), 'src/prompts/integration-steps')

// Create MCP handler with tools
const handler = createMcpHandler(
  (server) => {
    // Register all tools - mcp-handler will auto-discover them
    // toolSet(server, '')
    server.registerTool(
      'echoTest',
      {
        description: 'Echo a test message',
        inputSchema: {
          message: z.string(),
        },
      },
      async ({ message }) => ({
        content: [{ type: 'text', text: `Tool echo: ${message}` }],
      })
    )

    // Query Flowglad documentation using Turbopuffer vector search
    server.registerTool(
      'queryDocs',
      {
        description:
          'Search Flowglad documentation using semantic vector search. Returns relevant documentation sections based on the query.',
        inputSchema: {
          query: z
            .string()
            .min(1)
            .describe(
              'The search query to find relevant documentation'
            ),
          topK: z
            .number()
            .min(1)
            .max(20)
            .default(5)
            .optional()
            .describe(
              'Number of results to return (default: 5, max: 20)'
            ),
        },
      },
      async ({ query, topK = 5 }) => {
        try {
          const tpuf = await getTurbopufferClient()
          const openai = await getOpenAIClient()

          const results = await queryTurbopuffer(
            query,
            topK,
            'flowglad-docs',
            tpuf,
            openai
          )

          if (results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No documentation found for query: "${query}"`,
                },
              ],
            }
          }

          // Dynamically import fetchMarkdownFromDocs to avoid loading fetch/undici at module load time.
          // See docsSearchRouter for explanation.
          const { fetchMarkdownFromDocs } = await import(
            '@/utils/textContent'
          )

          // Fetch full markdown content for each result
          const resultsWithMarkdown = await Promise.all(
            results.map(async (result) => {
              const markdown = await fetchMarkdownFromDocs(
                result.path
              )
              const similarity = (1 - result.$dist).toFixed(4)

              return {
                similarity,
                path: result.path,
                title: result.title,
                description: result.description,
                markdown:
                  markdown || result.text || 'Content not available',
              }
            })
          )

          // Format results nicely with full content
          const formattedResults = resultsWithMarkdown
            .map((result, index) => {
              return `Result ${index + 1} (similarity: ${result.similarity})
Path: ${result.path}
${result.title ? `Title: ${result.title}\n` : ''}${result.description ? `Description: ${result.description}\n` : ''}
${'='.repeat(80)}
${result.markdown}
${'='.repeat(80)}`
            })
            .join('\n\n')

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} result(s) for query: "${query}"\n\n${formattedResults}`,
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error querying documentation: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          }
        }
      }
    )

    // Get step-by-step integration instructions
    server.registerTool(
      'getSetupInstructions',
      {
        description:
          'Get detailed step-by-step instructions for integrating Flowglad. Use this tool to work through the integration one step at a time, getting focused context for each step. Call without arguments to list all available steps.',
        inputSchema: {
          step: z
            .union([z.number().min(0).max(8), z.string()])
            .optional()
            .describe(
              'Step number (0-8) or step name (e.g., "server-factory", "api-route"). Omit to list all steps.'
            ),
        },
      },
      async ({ step }) => {
        try {
          // If no step provided, return list of all steps
          if (step === undefined || step === null) {
            const stepList = INTEGRATION_STEPS.map(
              (s) =>
                `Step ${s.step}: ${s.title}\n  Name: "${s.name}"\n  ${s.description}`
            ).join('\n\n')

            return {
              content: [
                {
                  type: 'text',
                  text: `# Flowglad Integration Steps

Use this tool to get detailed instructions for each step.
Call with step number (0-8) or step name.

## Available Steps

${stepList}

## Recommended Flow

1. **New Project**: Steps 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8
2. **Existing Project with Mock Billing**: Steps 0 → 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8
3. **Server-Only Integration**: Steps 0 → 1 → 2 → 3 → 6 → 8

## Example Usage

\`\`\`
getSetupInstructions({ step: 0 })
getSetupInstructions({ step: "server-factory" })
\`\`\``,
                },
              ],
            }
          }

          // Find the requested step
          let stepInfo
          if (typeof step === 'number') {
            stepInfo = INTEGRATION_STEPS.find((s) => s.step === step)
          } else {
            const stepLower = step.toLowerCase()
            stepInfo = INTEGRATION_STEPS.find(
              (s) =>
                s.name === stepLower ||
                s.title.toLowerCase().includes(stepLower) ||
                s.file.includes(stepLower)
            )
          }

          if (!stepInfo) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Step not found: "${step}". Available steps: ${INTEGRATION_STEPS.map((s) => `${s.step} (${s.name})`).join(', ')}`,
                },
              ],
            }
          }

          // Read the step file
          const filePath = join(STEPS_DIR, stepInfo.file)
          const content = await readFile(filePath, 'utf-8')

          // Add navigation context
          const prevStep = INTEGRATION_STEPS.find(
            (s) => s.step === stepInfo.step - 1
          )
          const nextStep = INTEGRATION_STEPS.find(
            (s) => s.step === stepInfo.step + 1
          )

          const navigation = `
---

## Navigation

${prevStep ? `← Previous: Step ${prevStep.step} - ${prevStep.title} (name: "${prevStep.name}")` : '(This is the first step)'}
${nextStep ? `→ Next: Step ${nextStep.step} - ${nextStep.title} (name: "${nextStep.name}")` : '(This is the final step)'}

To get another step, call: getSetupInstructions({ step: <number or name> })`

          return {
            content: [
              {
                type: 'text',
                text: content + navigation,
              },
            ],
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error getting setup instructions: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          }
        }
      }
    )

    // Get the default pricing model
    server.registerTool(
      'getDefaultPricingModel',
      {
        description:
          'Get the default pricing model for the organization. This returns the pricing model with products, prices, features, and usage meters.',
        inputSchema: {},
      },
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: 'To get the pricing model, use the Flowglad dashboard or call flowglad(customerExternalId).getPricingModel() in your server code.',
            },
          ],
        }
      }
    )

    // Setup pricing model tool
    server.registerTool(
      'setupPricingModel',
      {
        description:
          'Get instructions for setting up a pricing model in Flowglad.',
        inputSchema: {},
      },
      async () => {
        return {
          content: [
            {
              type: 'text',
              text: `# Setting Up a Pricing Model

## Steps

1. **Log in to Flowglad Dashboard**
   Visit https://app.flowglad.com and log in

2. **Navigate to Pricing Models**
   Go to Store > Pricing Models

3. **Create Products**
   - Click "Create Product"
   - Add name, description
   - Create multiple products for different tiers (Free, Pro, Enterprise)

4. **Create Prices**
   - Within each product, click "Create Price"
   - Set price type: Subscription or Single Payment
   - Set billing interval (monthly, yearly)
   - Set unit price

5. **Create Features (Optional)**
   - Add features for feature gating
   - Assign features to products

6. **Create Usage Meters (Optional)**
   - For usage-based billing
   - Choose aggregation type: Sum or Count Distinct
   - Link to usage prices

## After Setup

- Use product/price slugs in your code
- Test with test mode payments
- Switch to live mode when ready`,
            },
          ],
        }
      }
    )
  },
  {},
  {
    basePath: '/api',
    verboseLogs: true,
    maxDuration: 60,
  }
)

const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  // Extract token from Authorization header if not provided
  if (!bearerToken) {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      console.warn('[MCP] No Authorization header provided')
      return undefined
    }

    // Use regex to extract Bearer token (same as commit 53518871cb743070a23cb89ffb7e326075282811)
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      console.warn('[MCP] Invalid Authorization header format')
      return undefined
    }

    bearerToken = match[1]
  }

  // Verify API key using Unkey
  try {
    const { result, error } = await verifyApiKey(bearerToken)

    if (error) {
      console.warn('[MCP] API key verification error:', error)
      return undefined
    }

    if (!result?.valid) {
      console.warn('[MCP] Invalid API key provided')
      return undefined
    }
  } catch (error) {
    console.warn('[MCP] API key verification failed:', error)
    return undefined
  }

  // Return AuthInfo on successful verification
  return {
    token: bearerToken,
    clientId: 'authenticated-user',
    scopes: ['*'],
  }
}

/**
 * MCP Server Route at /api/mcp
 *
 * Authentication: Use API key from /settings > API in the dashboard
 * The API key should be sent in the Authorization header as a Bearer token.
 *
 * Example MCP client configuration:
 *   "Authorization": "Bearer sk_test_..."
 */
export async function POST(req: Request) {
  try {
    if (core.IS_PROD) {
      throw Error('Unauthorized: MCP not enabled')
    }

    // Let withMcpAuth handle authentication using verifyToken
    const authHandler = withMcpAuth(handler, verifyToken, {
      required: true, // Auth is required and we verify it via verifyToken
    })

    // Ensure Accept header is set (required by mcp-handler)
    const acceptHeader = req.headers.get('Accept')
    if (!acceptHeader || !acceptHeader.includes('application/json')) {
      // Clone request with Accept header
      const headers = new Headers(req.headers)
      headers.set('Accept', 'application/json, text/event-stream')

      const body = req.body ? await req.text() : null
      const modifiedReq = new Request(req.url, {
        method: req.method,
        headers,
        body,
      })
      return await authHandler(modifiedReq)
    }

    return await authHandler(req)
  } catch (error) {
    console.error('[MCP] Error:', error)

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data:
            error instanceof Error ? error.message : String(error),
        },
        id: null,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// Handle GET requests - return a simple JSON response indicating the endpoint is available
export async function GET(req: Request) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      result: {
        service: 'mcp-server',
        version: '1.0.0',
        status: 'available',
      },
      id: null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
