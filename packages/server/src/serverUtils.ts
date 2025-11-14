import { z } from 'zod'
import {
  CoreCustomerUser,
  FlowgladServerSessionParams,
  NextjsAuthFlowgladServerSessionParams,
  SupabaseFlowgladServerSessionParams,
  ClerkFlowgladServerSessionParams,
} from './types'

export const getSessionFromNextAuth = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const session = await params.nextAuth.auth()
  if (session?.user) {
    if (params.nextAuth.customerFromAuth) {
      coreCustomerUser =
        await params.nextAuth.customerFromAuth(session)
    } else {
      if (!session.user.email) {
        throw new Error(
          'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
        )
      }
      coreCustomerUser = {
        externalId: session.user.email,
        name: session.user.name || '',
        email: session.user.email || '',
      }
    }
  }
  return coreCustomerUser
}

const getSessionFromNextAuth4 = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  const session = await params.nextAuth.auth()
  return session
}

export const sessionFromSupabaseAuth = async (
  params: SupabaseFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const {
    data: { user },
  } = await (await params.supabaseAuth.client()).auth.getUser()
  if (user) {
    coreCustomerUser = {
      externalId: user.id,
      name: user.user_metadata.name || '',
      email: user.email || '',
    }
  }
  return coreCustomerUser
}

export const sessionFromClerkAuth = async (
  params: ClerkFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const session = await params.clerk.currentUser()
  if (params.clerk.customerFromCurrentUser && session) {
    coreCustomerUser =
      await params.clerk.customerFromCurrentUser(session)
  } else if (session) {
    coreCustomerUser = {
      externalId: session.id,
      name: session.firstName || '',
      email: session.emailAddresses[0].emailAddress || '',
    }
  }
  return coreCustomerUser
}

export const getSessionFromParams = async (
  params: FlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const providerCount = [
    'nextAuth' in params,
    'supabaseAuth' in params,
    'clerk' in params,
  ].filter(Boolean).length
  if (providerCount > 1) {
    throw new Error(
      'FlowgladError: Only one of nextAuth, supabaseAuth, or clerk may be defined at a time.'
    )
  }
  if (params.getRequestingCustomer) {
    coreCustomerUser = await params.getRequestingCustomer()
  } else {
    if ('nextAuth' in params) {
      coreCustomerUser = await getSessionFromNextAuth(params)
    } else if ('supabaseAuth' in params) {
      coreCustomerUser = await sessionFromSupabaseAuth(params)
    } else if ('clerk' in params) {
      coreCustomerUser = await sessionFromClerkAuth(params)
    }
  }

  const customerSchema = z.object({
    externalId: z.string().min(1),
    name: z.string(),
    email: z.email(),
  })
  const parsedCustomer = customerSchema.safeParse(coreCustomerUser)
  if (!parsedCustomer.success) {
    throw new Error(
      "Unable to derive requesting customer from session. Please check your flowgladServer constructor, in your server's flowglad.ts file. This is an issue with how your user's session data on the server is being mapped to Flowglad requesting customer input.\n\n" +
        'Issues:\n' +
        `${parsedCustomer.error.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join(`\n`)}.\n\n` +
        'Received input:\n' +
        JSON.stringify(coreCustomerUser)
    )
  }
  return parsedCustomer.data
}

export const parseErrorStringToErrorObject = (
  errorString: string
) => {
  let [errorCode, ...errorJsonParts] = errorString.split(' ')
  if (isNaN(Number(errorCode))) {
    errorCode = 'Unknown'
  }
  let errorJson: Record<string, unknown> = {}
  try {
    errorJson = JSON.parse(errorJsonParts.join(' '))
  } catch (e) {
    errorJson = {
      message: errorString,
    }
  }
  return {
    code: errorCode,
    json: errorJson,
  }
}
