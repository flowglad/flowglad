import { FeatureType } from '@/types'
import { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import yaml from 'json-to-pretty-yaml'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

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
6. Output ONLY the filled-in markdown - no explanations or commentary`,
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

  return result.text
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
    const synthesizedGuide = await synthesizeIntegrationGuide({
      template: templateWithFragments,
      codebaseContext,
      pricingModelYaml,
    })
    return synthesizedGuide
  }

  // Fallback to original behavior when no codebaseContext is provided
  return templateWithFragments
}
