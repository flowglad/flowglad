import {
  CoreCustomerUser,
  FlowgladServerSessionParams,
  NextjsAuthFlowgladServerSessionParams,
  SupabaseFlowgladServerSessionParams,
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
    } else if (!session.user.email) {
      throw new Error(
        'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
      )
    } else {
      coreCustomerUser = {
        externalId: session.user.email,
        name: session.user.name || '',
        email: session.user.email || '',
      }
    }
  }
  return coreCustomerUser
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

export const getSessionFromParams = async (
  params: FlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  if ('nextAuth' in params) {
    coreCustomerUser = await getSessionFromNextAuth(params)
  }

  if ('supabaseAuth' in params) {
    coreCustomerUser = await sessionFromSupabaseAuth(params)
  }
  return coreCustomerUser
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
