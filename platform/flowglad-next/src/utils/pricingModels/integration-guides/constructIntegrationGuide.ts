import { FeatureType } from '@/types'
import { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import javascriptIntegrationFragment from '@/prompts/integration-fragments/javascript-integration.md'
import httpIntegrationFragment from '@/prompts/integration-fragments/http-integration.md'
import freeTrialFragment from '@/prompts/integration-fragments/pricing/free-trials.md'
import usageBasedFragment from '@/prompts/integration-fragments/pricing/usage-based.md'
import toggleFeaturesFragment from '@/prompts/integration-fragments/pricing/toggle-features.md'
import integrationCoreFragment from '@/prompts/integration-fragments/integration-core.md'
import yaml from 'json-to-pretty-yaml'

interface PricingModelIntegrationGuideParams {
  pricingModelData: SetupPricingModelInput
  isBackendJavascript: boolean
}

const hasTrials = (
  pricingModelData: SetupPricingModelInput
): boolean => {
  return pricingModelData.products.some((product) =>
    product.prices.some((price) => price.trialPeriodDays !== null)
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

const constructToggleFeaturesFragment = (
  pricingModelData: SetupPricingModelInput
): string => {
  if (!hasToggleFeatures(pricingModelData)) {
    return ``
  }
  return toggleFeaturesFragment
}

const constructFreeTrialFragment = (
  pricingModelData: SetupPricingModelInput
): string => {
  if (!hasTrials(pricingModelData)) {
    return ``
  }
  return freeTrialFragment
}

const constructUsageBasedFragment = (
  pricingModelData: SetupPricingModelInput
): string => {
  if (!hasUsageMeters(pricingModelData)) {
    return ``
  }
  return usageBasedFragment
}

export const constructBackendIntegrationFragment = ({
  isBackendJavascript,
}: {
  isBackendJavascript: boolean
}): string => {
  if (!isBackendJavascript) {
    return httpIntegrationFragment
  }
  return javascriptIntegrationFragment
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
  return [
    integrationCoreFragment,
    constructBackendIntegrationFragment({
      isBackendJavascript,
    }),
    constructToggleFeaturesFragment(pricingModelData),
    constructUsageBasedFragment(pricingModelData),
    constructFreeTrialFragment(pricingModelData),
    pricingModelYamlFragment(pricingModelData),
  ].join('')
}
