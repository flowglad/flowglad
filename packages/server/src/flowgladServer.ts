import { CreatePurchaseSessionParams } from '@flowglad/shared'
import {
  ClerkFlowgladServerSessionParams,
  CoreCustomerProfileUser,
  FlowgladServerSessionParams,
  NextjsAuthFlowgladServerSessionParams,
  SupabaseFlowgladServerSessionParams,
} from './types'

import { Flowglad as FlowgladNode } from '@flowglad/node'

const getSessionFromNextAuth = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  let coreCustomerProfileUser: CoreCustomerProfileUser | null = null
  const session = await params.nextAuth.auth()
  if (session?.user) {
    if (params.nextAuth.customerProfileFromAuth) {
      coreCustomerProfileUser =
        await params.nextAuth.customerProfileFromAuth(session)
    } else {
      if (!session.user.email) {
        throw new Error(
          'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
        )
      }
      coreCustomerProfileUser = {
        externalId: session.user.email,
        name: session.user.name || '',
        email: session.user.email || '',
      }
    }
  }
  return coreCustomerProfileUser
}

const getSessionFromNextAuth4 = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  const session = await params.nextAuth.auth()
  return session
}

const sessionFromSupabaseAuth = async (
  params: SupabaseFlowgladServerSessionParams
) => {
  let coreCustomerProfileUser: CoreCustomerProfileUser | null = null
  const {
    data: { user },
  } = await (await params.supabaseAuth.client()).auth.getUser()
  if (user) {
    coreCustomerProfileUser = {
      externalId: user.id,
      name: user.user_metadata.name || '',
      email: user.email || '',
    }
  }
  return coreCustomerProfileUser
}

const sessionFromClerkAuth = async (
  params: ClerkFlowgladServerSessionParams
) => {
  let coreCustomerProfileUser: CoreCustomerProfileUser | null = null
  const session = await params.clerk.currentUser()
  if (params.clerk.customerProfileFromCurrentUser && session) {
    coreCustomerProfileUser =
      await params.clerk.customerProfileFromCurrentUser(session)
  } else if (session) {
    coreCustomerProfileUser = {
      externalId: session.id,
      name: session.firstName || '',
      email: session.emailAddresses[0].emailAddress || '',
    }
  }
  return coreCustomerProfileUser
}

const getSessionFromParams = async (
  params: FlowgladServerSessionParams
) => {
  let coreCustomerProfileUser: CoreCustomerProfileUser | null = null
  if ('nextAuth' in params) {
    coreCustomerProfileUser = await getSessionFromNextAuth(params)
  } else if ('supabaseAuth' in params) {
    coreCustomerProfileUser = await sessionFromSupabaseAuth(params)
  } else if ('clerk' in params) {
    coreCustomerProfileUser = await sessionFromClerkAuth(params)
  } else if (params.getRequestingCustomerProfile) {
    coreCustomerProfileUser =
      await params.getRequestingCustomerProfile()
  }
  return coreCustomerProfileUser
}

export class FlowgladServer {
  private createHandlerParams: FlowgladServerSessionParams
  private flowgladNode: FlowgladNode
  constructor(createHandlerParams: FlowgladServerSessionParams) {
    this.createHandlerParams = createHandlerParams
    this.flowgladNode = new FlowgladNode({
      apiKey: createHandlerParams.apiKey,
      baseURL: createHandlerParams.baseURL,
    })
  }

  public getRequestingcustomerProfileId =
    async (): Promise<string> => {
      if (this.createHandlerParams.getRequestingCustomerProfile) {
        const profile =
          await this.createHandlerParams.getRequestingCustomerProfile()
        if (profile) {
          return profile.externalId
        }
      }
      const session = await getSessionFromParams(
        this.createHandlerParams
      )
      if (!session) {
        throw new Error('User not authenticated')
      }
      return session.externalId
    }

  public getSession =
    async (): Promise<CoreCustomerProfileUser | null> => {
      return getSessionFromParams(this.createHandlerParams)
    }

  public getBilling =
    async (): Promise<FlowgladNode.CustomerProfiles.CustomerProfileRetrieveBillingResponse> => {
      const customerProfile = await this.findOrCreateCustomerProfile()
      return this.flowgladNode.customerProfiles.retrieveBilling(
        customerProfile.externalId
      )
    }

  public findOrCreateCustomerProfile = async (): Promise<
    FlowgladNode.CustomerProfiles.CustomerProfileRetrieveResponse['customerProfile']
  > => {
    let customerProfile:
      | FlowgladNode.CustomerProfiles.CustomerProfileRetrieveResponse['customerProfile']
      | null = null
    console.log('====findOrCreateCustomerProfile....')
    try {
      const getResult = await this.getCustomerProfile()
      console.log('====getResult', getResult)
      customerProfile = getResult.customerProfile
    } catch (error) {
      console.log('====error', error)
      if ((error as any).error.code === 'NOT_FOUND') {
        const session = await getSessionFromParams(
          this.createHandlerParams
        )
        if (!session) {
          throw new Error('User not authenticated')
        }
        const createResult = await this.createCustomerProfile({
          customerProfile: {
            email: session.email,
            name: session.name,
            externalId: session.externalId,
          },
        })
        console.log('====createResult', createResult)
        customerProfile = createResult.data.customerProfile
      }
    }
    if (!customerProfile) {
      throw new Error('Customer profile not found')
    }
    return customerProfile
  }

  public getCustomerProfile =
    async (): Promise<FlowgladNode.CustomerProfiles.CustomerProfileRetrieveResponse> => {
      const session = await getSessionFromParams(
        this.createHandlerParams
      )
      if (!session) {
        throw new Error('User not authenticated')
      }
      return this.flowgladNode.customerProfiles.retrieve(
        session.externalId
      )
    }
  public createCustomerProfile = async (
    params: FlowgladNode.CustomerProfiles.CustomerProfileCreateParams
  ): Promise<FlowgladNode.CustomerProfiles.CustomerProfileCreateResponse> => {
    return this.flowgladNode.customerProfiles.create(params)
  }
  public createPurchaseSession = async (
    params: CreatePurchaseSessionParams
  ): Promise<FlowgladNode.PurchaseSessions.PurchaseSessionCreateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    return this.flowgladNode.purchaseSessions.create({
      customerProfileExternalId: session.externalId,
      variantId: params.variantId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    })
  }
}
