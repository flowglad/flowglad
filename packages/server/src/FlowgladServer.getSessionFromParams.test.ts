import { describe, expect, it } from 'vitest'
import { FlowgladServer } from './FlowgladServer'
import {
  getSessionFromNextAuth,
  sessionFromBetterAuth,
  sessionFromSupabaseAuth,
} from './serverUtils'
import type {
  BaseFlowgladServerSessionParams,
  BetterAuthFlowgladServerSessionParams,
  ClerkFlowgladServerSessionParams,
  NextjsAuthFlowgladServerSessionParams,
  ScopedFlowgladServerParams,
  SupabaseFlowgladServerSessionParams,
} from './types'

describe('getSessionFromParams', () => {
  describe('NextAuth branch', () => {
    it('returns CoreCustomerUser when customerFromAuth returns a valid object', async () => {
      // setup:
      const customer = {
        externalId: 'ext_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }
      const params: NextjsAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { email: 'ignored@example.com', name: 'Ignored' },
          }),
          customerFromAuth: async () => customer,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual(customer)
    })

    it('returns CoreCustomerUser when auth() returns session with user.email and user.name present (no customerFromAuth)', async () => {
      // setup:
      const email = 'jane@example.com'
      const name = 'Jane'
      const params: NextjsAuthFlowgladServerSessionParams = {
        nextAuth: {
          auth: async () => ({ user: { email, name } }),
        },
        apiKey: 'test',
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: email,
        name,
        email,
      })
    })

    it('throws explicit NextAuth missing email error when user exists but email is missing and no customerFromAuth provided', async () => {
      // setup:
      const params: NextjsAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { name: 'Jane', email: null } as any,
          }),
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        new Error(
          'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
        )
      )
    })

    it('fails validation when customerFromAuth returns null', async () => {
      // setup:
      const params: NextjsAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { name: 'Jane', email: 'jane@example.com' },
          }),
          customerFromAuth: async () => null,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer from session/
      )
    })

    it('fails validation when auth() returns null session (no user)', async () => {
      // setup:
      const params: NextjsAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => null,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer from session/
      )
    })

    it('propagates errors thrown by nextAuth.auth()', async () => {
      // setup:
      const params: NextjsAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => {
            throw new Error('boom')
          },
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow('boom')
    })
  })

  describe('Supabase branch', () => {
    it('returns CoreCustomerUser when auth.getUser resolves with user having id, email and user_metadata.name', async () => {
      // setup:
      const user = {
        id: 'user_123',
        email: 'jane@example.com',
        user_metadata: { name: 'Jane' },
      }
      const supabaseClient = {
        auth: {
          getUser: async () => ({
            data: { user },
          }),
        },
      }
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () => supabaseClient as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: user.id,
        name: user.user_metadata.name,
        email: user.email,
      })
    })

    it('fails validation when getUser resolves with user missing email', async () => {
      // setup:
      const user = {
        id: 'user_123',
        email: undefined,
        user_metadata: { name: 'Jane' },
      } as any
      const supabaseClient = {
        auth: {
          getUser: async () => ({
            data: { user },
          }),
        },
      }
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () => supabaseClient as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer/
      )
    })

    it('fails validation when getUser resolves with user null', async () => {
      // setup:
      const supabaseClient = {
        auth: {
          getUser: async () => ({
            data: { user: null },
          }),
        },
      }
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () => supabaseClient as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer/
      )
    })

    it('propagates errors thrown by supabaseAuth.client', async () => {
      // setup:
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () => {
            throw new Error('client boom')
          },
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow('client boom')
    })

    it('propagates errors thrown by auth.getUser', async () => {
      // setup:
      const supabaseClient = {
        auth: {
          getUser: async () => {
            throw new Error('getUser boom')
          },
        },
      }
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () => supabaseClient as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'getUser boom'
      )
    })

    it('supports synchronous supabaseAuth.client that returns a client object', async () => {
      // setup:
      const user = {
        id: 'user_sync',
        email: 'sync@example.com',
        user_metadata: { name: 'Sync User' },
      }
      const supabaseClient = {
        auth: {
          getUser: async () => ({ data: { user } }),
        },
      }
      const params: SupabaseFlowgladServerSessionParams = {
        apiKey: 'test',
        supabaseAuth: {
          client: () => supabaseClient as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: user.id,
        name: user.user_metadata.name,
        email: user.email,
      })
    })
  })

  describe('Clerk branch', () => {
    it('returns CoreCustomerUser when customerFromCurrentUser returns a valid object', async () => {
      // setup:
      const clerkUser = {
        id: 'clerk_1',
        firstName: 'Jane',
        lastName: null,
        username: null,
        emailAddresses: [{ emailAddress: 'jane@example.com' }],
      }
      const customer = {
        externalId: 'ext_1',
        name: 'Customer Name',
        email: 'customer@example.com',
      }
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => clerkUser as any,
          customerFromCurrentUser: async () => customer,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual(customer)
    })

    it('returns CoreCustomerUser when currentUser has firstName and a valid emailAddresses[0].emailAddress (no customerFromCurrentUser)', async () => {
      // setup:
      const clerkUser = {
        id: 'clerk_2',
        firstName: 'Jane',
        lastName: null,
        username: null,
        emailAddresses: [{ emailAddress: 'jane@example.com' }],
      }
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => clerkUser as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: clerkUser.id,
        name: clerkUser.firstName,
        email: clerkUser.emailAddresses[0].emailAddress,
      })
    })

    it('fails validation when customerFromCurrentUser returns null', async () => {
      // setup:
      const clerkUser = {
        id: 'clerk_3',
        firstName: 'Jane',
        lastName: null,
        username: null,
        emailAddresses: [{ emailAddress: 'jane@example.com' }],
      }
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => clerkUser as any,
          customerFromCurrentUser: async () => null,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer/
      )
    })

    it('fails validation when currentUser is null', async () => {
      // setup:
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => null,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer/
      )
    })

    it('throws when emailAddresses is empty and no customerFromCurrentUser provided', async () => {
      // setup:
      const clerkUser = {
        id: 'clerk_5',
        firstName: 'Jane',
        lastName: null,
        username: null,
        emailAddresses: [],
      }
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => clerkUser as any,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow()
    })

    it('propagates errors thrown by clerk.currentUser', async () => {
      // setup:
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => {
            throw new Error('clerk boom')
          },
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow('clerk boom')
    })

    it('propagates errors thrown by customerFromCurrentUser', async () => {
      // setup:
      const clerkUser = {
        id: 'clerk_6',
        firstName: 'Jane',
        lastName: null,
        username: null,
        emailAddresses: [{ emailAddress: 'jane@example.com' }],
      }
      const params: ClerkFlowgladServerSessionParams = {
        apiKey: 'test',
        clerk: {
          currentUser: async () => clerkUser as any,
          customerFromCurrentUser: async () => {
            throw new Error('mapper boom')
          },
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow('mapper boom')
    })
  })

  describe('Base getRequestingCustomer branch', () => {
    it('returns CoreCustomerUser when getRequestingCustomer resolves valid customer', async () => {
      // setup:
      const customer = {
        externalId: 'ext_base_1',
        name: 'Base User',
        email: 'base@example.com',
      }
      const params: BaseFlowgladServerSessionParams = {
        apiKey: 'test',
        getRequestingCustomer: async () => customer,
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual(customer)
    })

    it('fails validation when getRequestingCustomer resolves with invalid fields (e.g., empty name or invalid email)', async () => {
      // setup:
      const badCustomer = {
        externalId: 'ext_base_bad',
        name: '',
        email: 'user',
      }
      const params: BaseFlowgladServerSessionParams = {
        apiKey: 'test',
        getRequestingCustomer: async () => badCustomer as any,
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow()
    })

    it('propagates errors thrown by getRequestingCustomer', async () => {
      // setup:
      const params: BaseFlowgladServerSessionParams = {
        apiKey: 'test',
        getRequestingCustomer: async () => {
          throw new Error('base boom')
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow('base boom')
    })
  })

  describe('BetterAuth branch', () => {
    const buildSession = (
      overrides?: Partial<{
        id: string
        email: string | null
        name: string | null
      }>
    ) => ({
      user: {
        id: overrides?.id ?? 'better_1',
        email: overrides?.email ?? 'better@example.com',
        name: overrides?.name ?? 'Better User',
      },
    })

    it('returns CoreCustomerUser using default mapping when getSession resolves session', async () => {
      // setup:
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () => buildSession(),
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: 'better_1',
        name: 'Better User',
        email: 'better@example.com',
      })
    })

    it('uses customerFromSession override when provided', async () => {
      // setup:
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () => buildSession(),
          customerFromSession: async () => ({
            externalId: 'custom_ext',
            name: 'Custom Name',
            email: 'custom@example.com',
          }),
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual({
        externalId: 'custom_ext',
        name: 'Custom Name',
        email: 'custom@example.com',
      })
    })

    it('fails validation when getSession returns null', async () => {
      // setup:
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () => null,
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        /Unable to derive requesting customer/
      )
    })

    it('fails validation when default mapping yields invalid email', async () => {
      // setup:
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () =>
            buildSession({ email: 'not-an-email' }),
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(/email/)
    })

    it('propagates errors thrown by betterAuth.getSession', async () => {
      // setup:
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () => {
            throw new Error('betterAuth boom')
          },
        },
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'betterAuth boom'
      )
    })

    it('uses getRequestingCustomer when provided even if betterAuth exists', async () => {
      // setup:
      const fallbackCustomer = {
        externalId: 'ext_ba_1',
        name: 'BA User',
        email: 'ba@example.com',
      }
      const params: BetterAuthFlowgladServerSessionParams = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () => buildSession(),
        },
        getRequestingCustomer: async () => fallbackCustomer,
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual(
        fallbackCustomer
      )
    })
  })

  describe('Branch precedence', () => {
    it('prefers getRequestingCustomer over other providers when both are provided', async () => {
      // setup:
      const baseCustomer = {
        externalId: 'pref_ext',
        name: 'Preferred Base',
        email: 'base@pref.com',
      }
      const params = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { email: 'n@e.com', name: 'Next' },
          }),
        },
        getRequestingCustomer: async () => baseCustomer,
      } satisfies NextjsAuthFlowgladServerSessionParams &
        BaseFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).resolves.toEqual(baseCustomer)
    })

    it('throws exclusivity error if both nextAuth and supabaseAuth are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { email: 'a@b.com', name: 'n' },
          }),
        },
        supabaseAuth: {
          client: async () =>
            ({
              auth: {
                getUser: async () => ({
                  data: {
                    user: {
                      id: 'i',
                      email: 's@b.com',
                      user_metadata: { name: 's' },
                    },
                  },
                }),
              },
            }) as any,
        },
      } satisfies NextjsAuthFlowgladServerSessionParams &
        SupabaseFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })

    it('throws exclusivity error if both nextAuth and clerk are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        nextAuth: {
          auth: async () => ({
            user: { email: 'a@b.com', name: 'n' },
          }),
        },
        clerk: {
          currentUser: async () =>
            ({
              id: 'c',
              firstName: 'C',
              emailAddresses: [{ emailAddress: 'c@b.com' }],
            }) as any,
        },
      } satisfies NextjsAuthFlowgladServerSessionParams &
        ClerkFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })

    it('throws exclusivity error if both supabaseAuth and clerk are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        supabaseAuth: {
          client: async () =>
            ({
              auth: {
                getUser: async () => ({
                  data: {
                    user: {
                      id: 'i',
                      email: 's@b.com',
                      user_metadata: { name: 's' },
                    },
                  },
                }),
              },
            }) as any,
        },
        clerk: {
          currentUser: async () =>
            ({
              id: 'c',
              firstName: 'C',
              emailAddresses: [{ emailAddress: 'c@b.com' }],
            }) as any,
        },
      } satisfies SupabaseFlowgladServerSessionParams &
        ClerkFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })

    it('throws exclusivity error if both betterAuth and nextAuth are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () =>
            ({
              user: {
                id: 'better_1',
                email: 'better@example.com',
                name: 'Better',
              },
            }) as any,
        },
        nextAuth: {
          auth: async () => ({
            user: { email: 'a@b.com', name: 'n' },
          }),
        },
      } satisfies BetterAuthFlowgladServerSessionParams &
        NextjsAuthFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })

    it('throws exclusivity error if both betterAuth and supabaseAuth are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () =>
            ({
              user: {
                id: 'better_1',
                email: 'better@example.com',
                name: 'Better',
              },
            }) as any,
        },
        supabaseAuth: {
          client: async () =>
            ({
              auth: {
                getUser: async () => ({
                  data: {
                    user: {
                      id: 'supabase_1',
                      email: 's@b.com',
                      user_metadata: { name: 'Supa' },
                    },
                  },
                }),
              },
            }) as any,
        },
      } satisfies BetterAuthFlowgladServerSessionParams &
        SupabaseFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })

    it('throws exclusivity error if both betterAuth and clerk are provided', async () => {
      // setup:
      const params = {
        apiKey: 'test',
        betterAuth: {
          getSession: async () =>
            ({
              user: {
                id: 'better_1',
                email: 'better@example.com',
                name: 'Better',
              },
            }) as any,
        },
        clerk: {
          currentUser: async () =>
            ({
              id: 'clerk_1',
              firstName: 'Clerk',
              emailAddresses: [{ emailAddress: 'clerk@example.com' }],
            }) as any,
        },
      } satisfies BetterAuthFlowgladServerSessionParams &
        ClerkFlowgladServerSessionParams
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: Only one of nextAuth, supabaseAuth, clerk, or betterAuth may be defined at a time.'
      )
    })
  })
})

describe('getSessionFromNextAuth (helper)', () => {
  it('returns CoreCustomerUser when customerFromAuth returns valid', async () => {
    // setup:
    const customer = {
      externalId: 'ext_helper_1',
      name: 'Helper Jane',
      email: 'helper.jane@example.com',
    }
    const params: NextjsAuthFlowgladServerSessionParams = {
      nextAuth: {
        auth: async () => ({
          user: { email: 'ignored@example.com', name: 'Ignored' },
        }),
        customerFromAuth: async () => customer,
      },
    }

    // expects:
    await expect(getSessionFromNextAuth(params)).resolves.toEqual(
      customer
    )
  })

  it('returns null when auth() returns null session', async () => {
    // setup:
    const params: NextjsAuthFlowgladServerSessionParams = {
      nextAuth: {
        auth: async () => null,
      },
    }

    // expects:
    await expect(getSessionFromNextAuth(params)).resolves.toBeNull()
  })

  it('throws explicit NextAuth missing email error when no customerFromAuth and user.email missing', async () => {
    // setup:
    const params: NextjsAuthFlowgladServerSessionParams = {
      nextAuth: {
        auth: async () => ({
          user: { name: 'Jane', email: null } as any,
        }),
      },
    }

    // expects:
    await expect(getSessionFromNextAuth(params)).rejects.toThrow(
      new Error(
        'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
      )
    )
  })
})

describe('sessionFromSupabaseAuth (helper)', () => {
  it('returns CoreCustomerUser when user has id, email, and user_metadata.name', async () => {
    // setup:
    const user = {
      id: 'user_helper_1',
      email: 'user.helper@example.com',
      user_metadata: { name: 'Helper User' },
    }
    const params: SupabaseFlowgladServerSessionParams = {
      supabaseAuth: {
        client: async () =>
          ({
            auth: {
              getUser: async () => ({ data: { user } }),
            },
          }) as any,
      },
    }

    // expects:
    await expect(sessionFromSupabaseAuth(params)).resolves.toEqual({
      externalId: user.id,
      name: user.user_metadata.name,
      email: user.email,
    })
  })

  it('returns null when user is null', async () => {
    // setup:
    const params: SupabaseFlowgladServerSessionParams = {
      supabaseAuth: {
        client: async () =>
          ({
            auth: {
              getUser: async () => ({ data: { user: null } }),
            },
          }) as any,
      },
    }

    // expects:
    await expect(sessionFromSupabaseAuth(params)).resolves.toBeNull()
  })
})

describe('sessionFromClerkAuth (helper)', () => {
  it('returns CoreCustomerUser when customerFromCurrentUser returns valid', async () => {
    // setup:
    const clerkUser = {
      id: 'clerk_helper_1',
      firstName: 'Helper',
      lastName: null,
      username: null,
      emailAddresses: [{ emailAddress: 'helper@example.com' }],
    }
    const customer = {
      externalId: 'ext_clerk_helper',
      name: 'Mapped Name',
      email: 'mapped@example.com',
    }
    const params: ClerkFlowgladServerSessionParams = {
      apiKey: 'test',
      clerk: {
        currentUser: async () => clerkUser as any,
        customerFromCurrentUser: async () => customer,
      },
    }
    const server = new FlowgladServer(params)

    // expects:
    await expect(server.getSession()).resolves.toEqual(customer)
  })

  it('returns CoreCustomerUser when using default mapping (firstName + emailAddresses[0])', async () => {
    // setup:
    const clerkUser = {
      id: 'clerk_helper_2',
      firstName: 'Helper Default',
      lastName: null,
      username: null,
      emailAddresses: [
        { emailAddress: 'helper.default@example.com' },
      ],
    }
    const params: ClerkFlowgladServerSessionParams = {
      apiKey: 'test',
      clerk: {
        currentUser: async () => clerkUser as any,
      },
    }
    const server = new FlowgladServer(params)

    // expects:
    await expect(server.getSession()).resolves.toEqual({
      externalId: clerkUser.id,
      name: clerkUser.firstName,
      email: clerkUser.emailAddresses[0].emailAddress,
    })
  })
})

describe('sessionFromBetterAuth (helper)', () => {
  const buildSession = () => ({
    user: {
      id: 'helper_better_1',
      email: 'helper.better@example.com',
      name: 'Helper Better',
    },
  })

  it('returns CoreCustomerUser using default mapping', async () => {
    // setup:
    const params: BetterAuthFlowgladServerSessionParams = {
      betterAuth: {
        getSession: async () => buildSession(),
      },
    }

    // expects:
    await expect(sessionFromBetterAuth(params)).resolves.toEqual({
      externalId: 'helper_better_1',
      name: 'Helper Better',
      email: 'helper.better@example.com',
    })
  })

  it('uses customerFromSession override when provided', async () => {
    // setup:
    const params: BetterAuthFlowgladServerSessionParams = {
      betterAuth: {
        getSession: async () => buildSession(),
        customerFromSession: async () => ({
          externalId: 'custom_helper',
          name: 'Custom Helper',
          email: 'custom.helper@example.com',
        }),
      },
    }

    // expects:
    await expect(sessionFromBetterAuth(params)).resolves.toEqual({
      externalId: 'custom_helper',
      name: 'Custom Helper',
      email: 'custom.helper@example.com',
    })
  })

  it('returns null when getSession resolves null', async () => {
    // setup:
    const params: BetterAuthFlowgladServerSessionParams = {
      betterAuth: {
        getSession: async () => null,
      },
    }

    // expects:
    await expect(sessionFromBetterAuth(params)).resolves.toBeNull()
  })

  it('propagates errors thrown by betterAuth.getSession', async () => {
    // setup:
    const params: BetterAuthFlowgladServerSessionParams = {
      betterAuth: {
        getSession: async () => {
          throw new Error('helper boom')
        },
      },
    }

    // expects:
    await expect(sessionFromBetterAuth(params)).rejects.toThrow(
      'helper boom'
    )
  })
})

describe('Scoped FlowgladServer variant', () => {
  describe('getSession with scoped customerExternalId', () => {
    it('returns customer with scoped externalId', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'org_123',
        getCustomerDetails: async () => ({
          name: 'Org 123',
          email: 'org_123@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      const session = await server.getSession()
      expect(session).toEqual(
        expect.objectContaining({ externalId: 'org_123' })
      )
    })

    it('skips all auth logic when scoped', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'user_456',
        getCustomerDetails: async () => ({
          name: 'User 456',
          email: 'user_456@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      // expects: should not throw, even though no auth is configured
      const session = await server.getSession()
      expect(session).toEqual(
        expect.objectContaining({ externalId: 'user_456' })
      )
    })

    it('throws error if customerExternalId is empty string', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: '',
        getCustomerDetails: async () => ({
          name: '',
          email: '',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: customerExternalId cannot be empty'
      )
    })

    it('throws error if customerExternalId is only whitespace', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: '   ',
        getCustomerDetails: async () => ({
          name: '',
          email: '',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: customerExternalId cannot be empty'
      )
    })
  })

  describe('getRequestingCustomerId with scoped customerExternalId', () => {
    it('returns scoped externalId', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'org_123',
        getCustomerDetails: async () => ({
          name: 'Org 123',
          email: 'org_123@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      const customerId = await server.getRequestingCustomerId()
      expect(customerId).toBe('org_123')
    })
  })

  describe('FlowgladServer methods work with scoped variant', () => {
    it('getSession works with scoped ID', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'org_789',
        getCustomerDetails: async () => ({
          name: 'Org 789',
          email: 'org_789@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      const session = await server.getSession()
      expect(session).toEqual(
        expect.objectContaining({ externalId: 'org_789' })
      )
    })

    it('getRequestingCustomerId works with scoped ID', async () => {
      // setup:
      const params: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'user_abc',
        getCustomerDetails: async () => ({
          name: 'User ABC',
          email: 'user_abc@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      // expects:
      const customerId = await server.getRequestingCustomerId()
      expect(customerId).toBe('user_abc')
    })
  })

  describe('Type safety: scoped params should not mix with auth params', () => {
    it('type system prevents mixing scoped with other auth types', () => {
      // This test validates at compile time that you cannot mix
      // ScopedFlowgladServerParams with other auth params.
      // If this compiles, the type system is working correctly.

      const scopedParams: ScopedFlowgladServerParams = {
        apiKey: 'test',
        customerExternalId: 'org_123',
        getCustomerDetails: async () => ({
          name: 'Org 123',
          email: 'org_123@example.com',
        }),
      }

      // TypeScript should enforce this at compile time
      expect(scopedParams).toEqual(
        expect.objectContaining({
          apiKey: 'test',
          customerExternalId: 'org_123',
        })
      )
      expect('customerExternalId' in scopedParams).toBe(true)
      expect('nextAuth' in scopedParams).toBe(false)
      expect('supabaseAuth' in scopedParams).toBe(false)
      expect('clerk' in scopedParams).toBe(false)
      expect('betterAuth' in scopedParams).toBe(false)
    })

    it('throws error if scoped customerExternalId is mixed with nextAuth at runtime', async () => {
      const params = {
        apiKey: 'test',
        customerExternalId: 'org_123',
        nextAuth: {
          auth: async () => ({
            user: { email: 'a@b.com', name: 'Test' },
          }),
        },
      }
      const server = new FlowgladServer(params)

      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: customerExternalId cannot be used with other authentication methods.'
      )
    })

    it('throws error if scoped customerExternalId is mixed with getRequestingCustomer', async () => {
      const params = {
        apiKey: 'test',
        customerExternalId: 'org_123',
        getRequestingCustomer: async () => ({
          externalId: 'user_1',
          name: 'Test',
          email: 'test@example.com',
        }),
      }
      const server = new FlowgladServer(params)

      await expect(server.getSession()).rejects.toThrow(
        'FlowgladError: customerExternalId cannot be used with other authentication methods.'
      )
    })
  })
})
