import { FeatureType } from '@/types'
import { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import yaml from 'json-to-pretty-yaml'
import { generateText, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

/**
 * Markdown files are imported dynamically to avoid parse-time errors when
 * this module is imported but the function isn't called (e.g., when generating
 * OpenAPI docs with tsx). Dynamic imports are evaluated at runtime, so the
 * markdown files are only loaded when constructIntegrationGuide is actually executed.
 */

interface PricingModelIntegrationGuideParams {
  pricingModelData: SetupPricingModelInput
  isBackendJavascript: boolean
  codebaseContext?: string
}

const hasTrials = (
  pricingModelData: SetupPricingModelInput
): boolean => {
  return pricingModelData.products.some((product) =>
    product.prices.some((price) => (price.trialPeriodDays ?? 0) > 0)
  )
}

const hasUsageMeters = (
  pricingModelData: SetupPricingModelInput
): boolean => {
  return pricingModelData.usageMeters.length > 0
}

const hasToggleFeatures = (
  pricingModelData: SetupPricingModelInput
): boolean => {
  return pricingModelData.features.some(
    (feature) => feature.type === FeatureType.Toggle
  )
}

const constructToggleFeaturesFragment = async (
  pricingModelData: SetupPricingModelInput
): Promise<string> => {
  if (!hasToggleFeatures(pricingModelData)) {
    return ``
  }
  const toggleFeaturesFragment = await import(
    '@/prompts/integration-fragments/pricing/toggle-features.md'
  )
  return toggleFeaturesFragment.default
}

const constructFreeTrialFragment = async (
  pricingModelData: SetupPricingModelInput
): Promise<string> => {
  if (!hasTrials(pricingModelData)) {
    return ``
  }
  const freeTrialFragment = await import(
    '@/prompts/integration-fragments/pricing/free-trials.md'
  )
  return freeTrialFragment.default
}

const constructUsageBasedFragment = async (
  pricingModelData: SetupPricingModelInput
): Promise<string> => {
  if (!hasUsageMeters(pricingModelData)) {
    return ``
  }
  const usageBasedFragment = await import(
    '@/prompts/integration-fragments/pricing/usage-based.md'
  )
  return usageBasedFragment.default
}

export const constructBackendIntegrationFragment = async ({
  isBackendJavascript,
}: {
  isBackendJavascript: boolean
}): Promise<string> => {
  if (!isBackendJavascript) {
    const httpIntegrationFragment = await import(
      '@/prompts/integration-fragments/http-integration.md'
    )
    return httpIntegrationFragment.default
  }
  const javascriptIntegrationFragment = await import(
    '@/prompts/integration-fragments/javascript-integration.md'
  )
  return javascriptIntegrationFragment.default
}

const pricingModelYamlFragment = (
  pricingModelData: SetupPricingModelInput
): string => {
  return `For completeness, here is the YAML representation of the pricing model we are trying to integrate:
---
${yaml.stringify(pricingModelData)}
`
}

/**
 * Strips markdown code block tags from the beginning and end of text.
 * Handles both ```markdown and ``` variants.
 */
const stripMarkdownCodeBlockTags = (text: string): string => {
  // Remove opening markdown code block tags (```markdown or ```)
  let cleaned = text.trimStart()
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice(11).trimStart()
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3).trimStart()
  }

  // Remove closing code block tags (```)
  cleaned = cleaned.trimEnd()
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trimEnd()
  }

  return cleaned
}

const synthesizeIntegrationGuide = async ({
  template,
  codebaseContext,
  pricingModelYaml,
}: {
  template: string
  codebaseContext: string
  pricingModelYaml: string
}): Promise<string> => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are an expert technical writer specializing in creating integration guides for Flowglad billing systems.

Your task is to fill in template placeholders in a markdown integration guide template based on codebase context and pricing model information.

Instructions:
1. Use ONLY the information provided in the codebase context and pricing model YAML to fill in template placeholders
2. Do NOT modify the existing markdown structure or add commentary
3. Replace all placeholders like {FRAMEWORK}, {LANGUAGE}, {AUTH_LIBRARY}, etc. with actual values from the context
4. If information is missing from the context, use reasonable defaults or generic placeholders
5. Preserve all code blocks, formatting, and structure exactly as in the template
6. Output ONLY the filled-in markdown - no explanations or commentary
7. Do NOT wrap your response in markdown code block tags (do not use \`\`\`markdown or \`\`\`). Output raw markdown content directly.`,
    messages: [
      {
        role: 'user',
        content: `Here is the integration guide template with placeholders:

${template}

---

Here is the codebase context that describes the target project:

${codebaseContext}

---

Here is the pricing model YAML:

${pricingModelYaml}

---

Please fill in all template placeholders based on the codebase context and pricing model information. Output the complete markdown file with all placeholders replaced.`,
      },
    ],
  })

  return stripMarkdownCodeBlockTags(result.text)
}

const synthesizeIntegrationGuideStream = async function* ({
  template,
  codebaseContext,
  pricingModelYaml,
}: {
  template: string
  codebaseContext: string
  pricingModelYaml: string
}): AsyncGenerator<string, void, unknown> {
  // Dynamically import AI SDK packages to avoid loading undici at module load time.
  // When this module is statically imported (e.g., by pricingModelsRouter -> appRouter -> swagger),
  // static imports of 'ai' and '@ai-sdk/openai' cause undici to load, which expects the File API
  // to be available. This causes "ReferenceError: File is not defined" when generating OpenAPI
  // docs with tsx in Node.js environments where File is not available.
  const { streamText, tool } = await import('ai')
  const { openai } = await import('@ai-sdk/openai')
  const { fetchMarkdownFromDocs } = await import(
    '@/utils/textContent'
  )

  const result = await streamText({
    model: openai('gpt-4o-mini'),
    // Allow multiple steps - don't stop after tool calls
    // The default stopWhen is stepCountIs(1), which stops after the first step (tool calls)
    // We need to allow the stream to continue after tool execution to generate text
    stopWhen: async ({ steps }) => {
      const lastStep = steps[steps.length - 1]
      // Only stop if the last step finished with 'stop' or 'length' (normal completion)
      // Don't stop if finishReason is 'tool-calls' - continue generating after tools execute
      return (
        lastStep?.finishReason === 'stop' ||
        lastStep?.finishReason === 'length'
      )
    },
    tools: {
      fetchDocs: tool({
        description: `Fetch documentation from Flowglad docs. Use this tool when you need Flowglad documentation to understand concepts, APIs, or integration patterns that aren't clear from the provided context.

    Examples of when to use this:
    - You encounter a placeholder like {FRAMEWORK} or {AUTH_LIBRARY} and need to understand what it should be
    - You need to see examples or patterns from the documentation
    - You're unsure about how to fill in a specific section
    - You need to verify the correct way to implement something
    - You need API reference information for specific endpoints

    Available documentation paths:

    API Reference:
    - api-reference/api-keys/get-api-key.md
    - api-reference/checkout-sessions/create-checkout-session.md
    - api-reference/checkout-sessions/get-checkout-session.md
    - api-reference/checkout-sessions/list-checkout-sessions.md
    - api-reference/customer/create-customer.md
    - api-reference/customer/get-billing-details.md
    - api-reference/customer/get-customer.md
    - api-reference/customer/list-customers.md
    - api-reference/customer/update-customer.md
    - api-reference/discounts/create-discount.md
    - api-reference/discounts/get-discount.md
    - api-reference/discounts/list-discounts.md
    - api-reference/discounts/update-discount.md
    - api-reference/features/create-feature.md
    - api-reference/features/get-feature.md
    - api-reference/features/list-features.md
    - api-reference/features/update-feature.md
    - api-reference/introduction.md
    - api-reference/invoice-line-items/get-invoice-line-item.md
    - api-reference/invoice-line-items/list-invoice-line-items.md
    - api-reference/invoices/get-invoice.md
    - api-reference/invoices/list-invoices.md
    - api-reference/payment-methods/get-payment-method.md
    - api-reference/payment-methods/list-payment-methods.md
    - api-reference/payments/get-payment.md
    - api-reference/payments/list-payments.md
    - api-reference/payments/refund-a-payment.md
    - api-reference/prices/create-price.md
    - api-reference/prices/get-price.md
    - api-reference/prices/list-prices.md
    - api-reference/prices/update-price.md
    - api-reference/pricing-models/clone-a-pricingmodel.md
    - api-reference/pricing-models/create-pricing-model.md
    - api-reference/pricing-models/get-default-pricing-model-for-organization.md
    - api-reference/pricing-models/get-pricing-model.md
    - api-reference/pricing-models/list-pricing-models.md
    - api-reference/pricing-models/setup-a-pricingmodel.md
    - api-reference/pricing-models/update-pricing-model.md
    - api-reference/product-features/create-product-feature.md
    - api-reference/product-features/expire-product-feature.md
    - api-reference/product-features/get-product-feature.md
    - api-reference/product-features/list-product-features.md
    - api-reference/products/create-product.md
    - api-reference/products/get-product.md
    - api-reference/products/list-products.md
    - api-reference/products/update-product.md
    - api-reference/purchases/get-purchase.md
    - api-reference/subscription-item-features/create-subscription-item-feature.md
    - api-reference/subscription-item-features/expire-subscription-item-feature.md
    - api-reference/subscription-item-features/get-subscription-item-feature.md
    - api-reference/subscription-item-features/update-subscription-item-feature.md
    - api-reference/subscriptions/adjust-subscription.md
    - api-reference/subscriptions/cancel-subscription.md
    - api-reference/subscriptions/create-subscription.md
    - api-reference/subscriptions/get-subscription.md
    - api-reference/subscriptions/list-subscriptions.md
    - api-reference/usage-events/create-usage-event.md
    - api-reference/usage-events/get-usage-event.md
    - api-reference/usage-events/list-usage-events.md
    - api-reference/usage-meters/create-usage-meter.md
    - api-reference/usage-meters/get-usage-meter.md
    - api-reference/usage-meters/list-usage-meters.md
    - api-reference/usage-meters/update-usage-meter.md
    - api-reference/webhooks/create-webhook.md
    - api-reference/webhooks/get-webhook.md
    - api-reference/webhooks/update-webhook.md

    Core Documentation:
    - countries.md
    - data-model.md
    - quickstart.md
    - principles.md
    - integrate-by-http.md
    - integrate-by-prompt.md

    Features:
    - features/checkout-sessions.md
    - features/discounts.md
    - features/invoices.md
    - features/prices.md
    - features/pricing-models.md
    - features/products.md
    - features/subscriptions.md
    - features/usage.md
    - features/webhooks.md

    SDKs:
    - sdks/introduction.md
    - sdks/setup.md
    - sdks/auth-adaptors.md
    - sdks/checkout-sessions.md
    - sdks/customer-purchases.md
    - sdks/examples.md
    - sdks/express.md
    - sdks/feature-access-usage.md
    - sdks/nextjs.md
    - sdks/pricing-models-products.md
    - sdks/react.md
    - sdks/server.md
    - sdks/subscription-management.md`,
        inputSchema: z.object({
          path: z
            .string()
            .describe(
              'The documentation path relative to docs.flowglad.com (e.g., "sdks/nextjs.md", "api-reference/customer/create-customer.md", "features/subscriptions.md"). Use .md extension. See the tool description for all available paths.'
            ),
        }),
        execute: async ({ path }: { path: string }) => {
          try {
            const content = await fetchMarkdownFromDocs(path)
            if (content) {
              return {
                success: true,
                content,
                path,
              }
            }

            return {
              success: false,
              error: `Documentation not found at path: ${path}`,
              path,
            }
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Unknown error',
              path,
            }
          }
        },
      }),
    },
    system: `You are an expert technical writer specializing in creating integration guides for Flowglad billing systems.

Your task is to fill in template placeholders in a markdown integration guide template based on codebase context and pricing model information.

Instructions:
1. Use the information provided in the codebase context and pricing model YAML to fill in template placeholders
2. If you encounter information that is missing, unclear, or you're unsure about, USE THE fetchDocs TOOL to fetch relevant documentation from docs.flowglad.com
3. When you see placeholders like {FRAMEWORK}, {LANGUAGE}, {AUTH_LIBRARY}, etc., check the codebase context first. If the information isn't there or you're confused, use the fetchDocs tool to get the relevant documentation
4. DO NOT guess or make assumptions - if you're confused or missing information, use the fetchDocs tool to fetch it
5. Replace all placeholders with actual values from the context or from fetched documentation
6. Preserve all code blocks, formatting, and structure exactly as in the template
7. Output ONLY the filled-in markdown - no explanations or commentary
8. Do NOT wrap your response in markdown code block tags (do not use \`\`\`markdown or \`\`\`). Output raw markdown content directly.`,
    messages: [
      {
        role: 'user',
        content: `Here is the integration guide template with placeholders:

${template}

---

Here is the codebase context that describes the target project:

${codebaseContext}

---

Here is the pricing model YAML:

${pricingModelYaml}

---

Please fill in all template placeholders based on the codebase context and pricing model information.

If you encounter any placeholder or reference you don't understand, or if information is missing from the context, use the fetchDocs tool to look up the relevant Flowglad documentation. Don't guess - fetch the information you need.

Output the complete markdown file with all placeholders replaced.`,
      },
    ],
  })

  // Buffer to handle opening tags that might be split across chunks
  let buffer = ''
  let openingTagProcessed = false
  let accumulated = ''
  let chunkCount = 0

  try {
    // The textStream automatically handles tool calls - it will pause when tools are called
    // and resume after tool execution completes. The stream may not emit immediately if
    // the model decides to call a tool first, but it will start emitting once tool calls complete.
    for await (const chunk of result.textStream) {
      chunkCount++
      accumulated += chunk
      buffer += chunk

      // Process opening tags at the start
      if (!openingTagProcessed) {
        const trimmed = buffer.trimStart()
        if (trimmed.startsWith('```markdown')) {
          buffer = trimmed.slice(11).trimStart()
          openingTagProcessed = true
        } else if (trimmed.startsWith('```')) {
          buffer = trimmed.slice(3).trimStart()
          openingTagProcessed = true
        } else if (trimmed.length > 0 && !trimmed.startsWith('```')) {
          // Content started without tags
          openingTagProcessed = true
        }
      }

      // Yield content after opening tags are processed
      // Trim closing fences before yielding to prevent streaming closing markers
      if (openingTagProcessed && buffer.length > 0) {
        // Check if buffer ends with a closing fence marker (after trimming whitespace)
        const trimmedEnd = buffer.trimEnd()
        if (trimmedEnd.endsWith('```')) {
          // Find the last occurrence of ``` in the buffer
          const lastFenceIndex = buffer.lastIndexOf('```')
          // Extract content before the closing fence
          const contentBeforeFence = buffer
            .slice(0, lastFenceIndex)
            .trimEnd()
          // Yield content before the fence (if any)
          if (contentBeforeFence.length > 0) {
            yield contentBeforeFence
          }
          // Discard the closing fence and any trailing content
          buffer = ''
        } else {
          // No closing fence detected, yield the buffer as-is
          yield buffer
          buffer = ''
        }
      }
    }

    // If no chunks were received but steps completed, try to get the final text
    if (chunkCount === 0) {
      const steps = await result.steps
      const lastStep = steps[steps.length - 1]
      if (lastStep?.text) {
        const cleaned = stripMarkdownCodeBlockTags(lastStep.text)
        if (cleaned.length > 0) {
          yield cleaned
          return
        }
      }
    }
  } catch (error) {
    // If there's an error, try to yield any accumulated content before rethrowing
    if (accumulated.length > 0) {
      const cleaned = stripMarkdownCodeBlockTags(accumulated)
      if (cleaned.length > 0) {
        yield cleaned
      }
    }
    throw error
  }

  // Handle any remaining buffer and closing tags
  if (buffer.length > 0) {
    const trimmed = buffer.trimEnd()
    if (trimmed.endsWith('```')) {
      yield trimmed.slice(0, -3).trimEnd()
    } else {
      yield buffer
    }
  }
}

export const constructIntegrationGuide = async ({
  pricingModelData,
  isBackendJavascript,
  codebaseContext = '',
}: PricingModelIntegrationGuideParams) => {
  const integrationCoreFragment = await import(
    '@/prompts/integration-fragments/integration-core.md'
  )

  const otherFragments = [
    await constructBackendIntegrationFragment({
      isBackendJavascript,
    }),
    await constructToggleFeaturesFragment(pricingModelData),
    await constructUsageBasedFragment(pricingModelData),
    await constructFreeTrialFragment(pricingModelData),
    pricingModelYamlFragment(pricingModelData),
  ].join('')

  const templateWithFragments =
    integrationCoreFragment.default + otherFragments
  const pricingModelYaml = pricingModelYamlFragment(pricingModelData)

  // If codebaseContext is provided, use AI to synthesize the guide
  // Otherwise, return the template as-is (backward compatibility)
  if (codebaseContext) {
    try {
      const synthesizedGuide = await synthesizeIntegrationGuide({
        template: templateWithFragments,
        codebaseContext,
        pricingModelYaml,
      })
      return synthesizedGuide
    } catch (error) {
      // Fall back to locally generated template on transient LLM errors
      return templateWithFragments
    }
  }

  // Fallback to original behavior when no codebaseContext is provided
  return templateWithFragments
}

export const constructIntegrationGuideStream = async function* ({
  pricingModelData,
  isBackendJavascript,
  codebaseContext = '',
}: PricingModelIntegrationGuideParams): AsyncGenerator<
  string,
  void,
  unknown
> {
  const integrationCoreFragment = await import(
    '@/prompts/integration-fragments/integration-core.md'
  )

  const otherFragments = [
    await constructBackendIntegrationFragment({
      isBackendJavascript,
    }),
    await constructToggleFeaturesFragment(pricingModelData),
    await constructUsageBasedFragment(pricingModelData),
    await constructFreeTrialFragment(pricingModelData),
    pricingModelYamlFragment(pricingModelData),
  ].join('')

  const templateWithFragments =
    integrationCoreFragment.default + otherFragments
  const pricingModelYaml = pricingModelYamlFragment(pricingModelData)
  if (codebaseContext) {
    yield* synthesizeIntegrationGuideStream({
      template: templateWithFragments,
      codebaseContext,
      pricingModelYaml,
    })
  } else {
    yield templateWithFragments
  }
}
