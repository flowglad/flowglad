import { FeatureType } from '@/types'
import { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import yaml from 'json-to-pretty-yaml'

/**
 * Markdown files are imported dynamically to avoid parse-time errors when
 * this module is imported but the function isn't called (e.g., when generating
 * OpenAPI docs with tsx). Dynamic imports are evaluated at runtime, so the
 * markdown files are only loaded when constructIntegrationGuide is actually executed.
 */

interface PricingModelIntegrationGuideParams {
  pricingModelData: SetupPricingModelInput
  isBackendJavascript: boolean
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

export const constructIntegrationGuide = async ({
  pricingModelData,
  isBackendJavascript,
}: PricingModelIntegrationGuideParams) => {
  const integrationCoreFragment = await import(
    '@/prompts/integration-fragments/integration-core.md'
  )

  return [
    integrationCoreFragment.default,
    await constructBackendIntegrationFragment({
      isBackendJavascript,
    }),
    await constructToggleFeaturesFragment(pricingModelData),
    await constructUsageBasedFragment(pricingModelData),
    await constructFreeTrialFragment(pricingModelData),
    pricingModelYamlFragment(pricingModelData),
  ].join('')
}
