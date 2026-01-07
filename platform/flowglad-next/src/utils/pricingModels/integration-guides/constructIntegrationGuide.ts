import { openai } from '@ai-sdk/openai'
import { generateObject, generateText, streamText } from 'ai'
import yaml from 'json-to-pretty-yaml'
import { z } from 'zod'
import { FeatureType } from '@/types'
import { logger } from '@/utils/logger'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import { fetchMarkdownFromDocs } from '@/utils/textContent'
import {
  getOpenAIClient,
  getTurbopufferClient,
  queryMultipleTurbopuffer,
} from '@/utils/turbopuffer'

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
  return pricingModelData.products.some(
    (product) => (product.price.trialPeriodDays ?? 0) > 0
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

export const getLatestSdkVersionsFragment = async () => {
  const [nextjs, react, server] = await Promise.all([
    getNpmPackageVersion('@flowglad/nextjs'),
    getNpmPackageVersion('@flowglad/react'),
    getNpmPackageVersion('@flowglad/server'),
  ])

  return `The following are the latest version for Flowglad's NPM packages (sdks)\n"@flowglad/nextjs": ${nextjs}\n"@flowglad/react":${react}\n"@flowglad/server": ${server}`
}

const getNpmPackageVersion = async (name: string) => {
  const res = await fetch(`https://registry.npmjs.org/${name}`)

  if (!res.ok) return null

  const data = await res.json()

  return data['dist-tags'].latest
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

const synthesizeIntegrationQuestions = async ({
  template,
  codebaseContext,
  pricingModelYaml,
}: {
  template: string
  codebaseContext: string
  pricingModelYaml: string
}): Promise<string[]> => {
  // Early return if codebaseContext is empty or only whitespace
  if (!codebaseContext || codebaseContext.trim() === '') {
    return []
  }

  const schema = z.object({
    questions: z
      .array(z.string())
      .describe(
        'A list of strategic questions needed to understand the codebase and fill in the template placeholders'
      ),
  })

  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema,
    system: `You are an expert technical writer specializing in creating integration guides for Flowglad billing systems.

Your task is to analyze an integration guide template, codebase context, and pricing model to identify gaps in understanding that would prevent you from filling in the template placeholders correctly.

Think like a developer who needs to integrate Flowglad into this codebase. Review the template to understand what information is needed, then examine the codebase context to see what's already known. Identify areas where you lack sufficient context to make informed decisions about how to fill in the placeholders.

Generate strategic, context-seeking questions that would help you understand:
- The project's architecture, structure, and conventions
- How authentication and user management works
- File organization and routing patterns
- Existing billing or subscription code (if any)
- How Flowglad concepts (customers, subscriptions, usage meters, features) map to this codebase
- Framework-specific patterns and conventions being used

These should be high-level questions that reveal gaps in understanding, not just "what is {PLACEHOLDER}". Focus on questions that would help you understand the codebase well enough to make correct decisions about all the placeholders.`,
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

Please analyze the template, codebase context, and pricing model. Identify gaps in your understanding that would prevent you from correctly filling in the template placeholders. Generate strategic questions that would help you understand the codebase structure, patterns, and how Flowglad should integrate with it.`,
      },
    ],
  })

  return (result.object as z.infer<typeof schema>).questions
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

const getContextualDocs = async ({
  questions,
  topK = 2,
}: {
  questions: string[]
  topK?: number
}): Promise<string> => {
  // If no questions provided, return empty string
  if (questions.length === 0) {
    return ''
  }

  const tpuf = await getTurbopufferClient()
  const openai = await getOpenAIClient()

  // Get query results from turbopuffer
  const queryResults = await queryMultipleTurbopuffer(
    questions,
    topK,
    'flowglad-docs',
    tpuf,
    openai
  )

  // Flatten and deduplicate paths
  const pathSet = new Set<string>()
  const deduplicatedPaths: string[] = []

  queryResults.forEach((queryResult) => {
    queryResult.results.forEach((result) => {
      if (result.path && !pathSet.has(result.path)) {
        pathSet.add(result.path)
        deduplicatedPaths.push(result.path)
      }
    })
  })

  // Sort paths alphabetically
  deduplicatedPaths.sort((a, b) => a.localeCompare(b))

  // Fetch and concatenate all markdown files from docs.flowglad.com
  const markdownContents: string[] = []
  for (const path of deduplicatedPaths) {
    const markdown = await fetchMarkdownFromDocs(path)

    if (markdown) {
      // Add separator with file path
      markdownContents.push(
        `\n\n${'='.repeat(80)}\nFILE: ${path}\n${'='.repeat(80)}\n\n${markdown}`
      )
    }
  }

  return markdownContents.join('') || ''
}

const synthesizeIntegrationGuideStream = async function* ({
  template,
  codebaseContext,
  pricingModelYaml,
  contextualDocs,
}: {
  template: string
  codebaseContext: string
  pricingModelYaml: string
  contextualDocs: string
}): AsyncGenerator<string, void, unknown> {
  const result = await streamText({
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

Here are some docs you can use to answer any questions you might have:
${contextualDocs}
---

Please fill in all template placeholders based on the codebase context and pricing model information. Output the complete markdown file with all placeholders replaced.`,
      },
    ],
  })

  // Buffer to handle opening tags that might be split across chunks
  let buffer = ''
  let openingTagProcessed = false
  let accumulated = ''

  for await (const chunk of result.textStream) {
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
      console.error('Error synthesizing integration guide:', error)
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
    await getLatestSdkVersionsFragment(),
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
  const questions = await synthesizeIntegrationQuestions({
    template: templateWithFragments,
    codebaseContext,
    pricingModelYaml,
  })
  let contextualDocs = ''
  try {
    contextualDocs = await getContextualDocs({ questions })
  } catch (error) {
    logger.debug(
      'Failed to fetch contextual docs, falling back to empty string',
      {
        error: error instanceof Error ? error.message : String(error),
        error_name:
          error instanceof Error ? error.name : 'UnknownError',
      }
    )
    contextualDocs = ''
  }
  // If codebaseContext is provided, use AI to synthesize the guide with streaming
  // Otherwise, yield the template as-is (backward compatibility)
  if (codebaseContext) {
    yield* synthesizeIntegrationGuideStream({
      template: templateWithFragments,
      codebaseContext,
      pricingModelYaml,
      contextualDocs,
    })
  } else {
    yield templateWithFragments
  }
}
