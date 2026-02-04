import * as p from '@clack/prompts'
import type { CAC } from 'cac'
import { requestAccessToken } from '../auth/accessToken'
import { loadCredentials, saveCredentials } from '../auth/config'
import { saveProjectConfig } from '../projectConfig'
import { getBaseUrl } from './login'

interface Organization {
  id: string
  name: string
  createdAt: string
}

interface PricingModel {
  id: string
  name: string
  isDefault: boolean
  updatedAt: string
}

interface ListOrganizationsResponse {
  organizations: Organization[]
}

interface ListPricingModelsResponse {
  organization?: {
    id: string
    name: string
  }
  pricingModels: PricingModel[]
}

interface LinkOptions {
  org?: string
  pm?: string
}

/**
 * Registers the link command with the CLI.
 *
 * The link command allows users to interactively select an organization and
 * pricing model to work with. This selection is stored in a project-level
 * config file (.flowglad/config.json) and an access token is generated.
 */
export const registerLinkCommand = (cli: CAC): void => {
  cli
    .command(
      'link',
      'Link this project to an organization and pricing model'
    )
    .option('--org <id>', 'Organization ID (skip prompt)')
    .option('--pm <id>', 'Pricing model ID (skip prompt)')
    .action(async (options: LinkOptions) => {
      await linkFlow(options)
    })
}

/**
 * Executes the link flow.
 *
 * 1. Validate credentials exist
 * 2. If --pm alone: look up org from PM
 * 3. If no --org: fetch orgs and prompt for selection
 * 4. If no --pm: fetch PMs and prompt for selection
 * 5. Generate access token
 * 6. Save to project config and credentials
 */
export const linkFlow = async (
  options: LinkOptions
): Promise<void> => {
  const credentials = await loadCredentials()
  if (!credentials) {
    console.error('Not logged in. Run `flowglad login` first.')
    process.exit(1)
    return
  }

  const baseUrl = getBaseUrl()

  let orgId = options.org
  let pmId = options.pm
  let selectedOrg: Organization | undefined
  let selectedPm: PricingModel | undefined

  // Case 1: --pm provided alone - look up org from PM
  if (pmId && !orgId) {
    const pmResponse = await fetch(
      `${baseUrl}/api/cli/list-pricing-models?pricingModelId=${encodeURIComponent(pmId)}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.refreshToken}`,
        },
      }
    )

    if (!pmResponse.ok) {
      const errorData = (await pmResponse
        .json()
        .catch(() => ({}))) as { message?: string }
      if (pmResponse.status === 404) {
        console.error(
          errorData.message ?? `Pricing model ${pmId} not found.`
        )
      } else if (pmResponse.status === 403) {
        console.error(
          errorData.message ??
            `You do not have access to pricing model ${pmId}.`
        )
      } else {
        console.error('Failed to fetch pricing model')
      }
      process.exit(1)
      return
    }

    const pmData =
      (await pmResponse.json()) as ListPricingModelsResponse
    if (!pmData.organization) {
      console.error('Unexpected response: missing organization info')
      process.exit(1)
      return
    }
    orgId = pmData.organization.id
    selectedOrg = {
      id: pmData.organization.id,
      name: pmData.organization.name,
      createdAt: '', // Not needed for display
    }
    selectedPm = pmData.pricingModels[0]
    console.log(`Using organization: ${selectedOrg.name}`)
  }

  // Case 2: Need to fetch and maybe prompt for org
  if (!orgId) {
    const orgsResponse = await fetch(
      `${baseUrl}/api/cli/list-organizations`,
      {
        headers: {
          Authorization: `Bearer ${credentials.refreshToken}`,
        },
      }
    )

    if (!orgsResponse.ok) {
      console.error('Failed to fetch organizations')
      process.exit(1)
      return
    }

    const { organizations } =
      (await orgsResponse.json()) as ListOrganizationsResponse

    if (organizations.length === 0) {
      console.error('No organizations found.')
      process.exit(1)
      return
    }

    const selectedOrgId = await p.select({
      message: 'Select an organization:',
      options: organizations.map((o) => ({
        label: o.name,
        value: o.id,
      })),
    })
    if (p.isCancel(selectedOrgId)) {
      process.exit(1)
      return
    }
    orgId = selectedOrgId as string
    selectedOrg = organizations.find((o) => o.id === orgId)
  }

  // Case 3: --org provided but not --pm, or interactive org selection done
  if (!selectedPm) {
    const pmsResponse = await fetch(
      `${baseUrl}/api/cli/list-pricing-models?organizationId=${encodeURIComponent(orgId!)}&livemode=false`,
      {
        headers: {
          Authorization: `Bearer ${credentials.refreshToken}`,
        },
      }
    )

    if (!pmsResponse.ok) {
      const errorData = (await pmsResponse
        .json()
        .catch(() => ({}))) as { message?: string }
      if (pmsResponse.status === 403) {
        console.error(
          errorData.message ??
            'You do not have access to this organization.'
        )
      } else {
        console.error('Failed to fetch pricing models')
      }
      process.exit(1)
      return
    }

    const { pricingModels } =
      (await pmsResponse.json()) as ListPricingModelsResponse

    if (pricingModels.length === 0) {
      console.error('No test pricing models found.')
      process.exit(1)
      return
    }

    // If --pm was provided with --org, validate it exists in this org
    if (pmId) {
      selectedPm = pricingModels.find((pm) => pm.id === pmId)
      if (!selectedPm) {
        console.error(
          `Pricing model ${pmId} not found in this organization.`
        )
        process.exit(1)
        return
      }
    } else {
      // Interactive PM selection
      const selectedPmId = await p.select({
        message: 'Select a pricing model:',
        options: pricingModels.map((pm) => ({
          label: `${pm.name}${pm.isDefault ? ' (default)' : ''}`,
          value: pm.id,
        })),
      })
      if (p.isCancel(selectedPmId)) {
        process.exit(1)
        return
      }
      pmId = selectedPmId as string
      selectedPm = pricingModels.find((pm) => pm.id === pmId)
    }
  }

  // If we don't have selectedOrg yet (--org flag was used), fetch org name
  if (!selectedOrg) {
    const orgsResponse = await fetch(
      `${baseUrl}/api/cli/list-organizations`,
      {
        headers: {
          Authorization: `Bearer ${credentials.refreshToken}`,
        },
      }
    )
    if (orgsResponse.ok) {
      const data =
        (await orgsResponse.json()) as ListOrganizationsResponse
      selectedOrg = data.organizations.find((o) => o.id === orgId)
    }
    if (!selectedOrg) {
      console.error('Failed to fetch organization details')
      process.exit(1)
      return
    }
  }

  // Generate access token using existing requestAccessToken()
  const tokenResponse = await requestAccessToken(
    baseUrl,
    credentials.refreshToken,
    { organizationId: orgId!, pricingModelId: pmId!, livemode: false }
  )

  // Save link state to PROJECT-LEVEL config (.flowglad/config.json)
  await saveProjectConfig({
    organizationId: orgId!,
    organizationName: selectedOrg.name,
    pricingModelId: pmId!,
    pricingModelName: selectedPm!.name,
    livemode: false,
  })

  // Save access token to USER-LEVEL credentials (~/.flowglad/credentials.json)
  await saveCredentials({
    ...credentials,
    accessToken: tokenResponse.accessToken,
    accessTokenExpiresAt: new Date(tokenResponse.expiresAt).getTime(),
    organizationId: orgId!,
    organizationName: selectedOrg.name,
    pricingModelId: pmId!,
    pricingModelName: selectedPm!.name,
    livemode: false,
  })

  console.log(`Linked to ${selectedOrg.name} / ${selectedPm!.name}`)
  console.log('Config saved to .flowglad/config.json')
}
