import { FlowgladProvider } from '@flowglad/react'
import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { authClient } from '@/lib/auth-client'

export default function RootLayout() {
  const { data: session } = authClient.useSession()
  const isAuthenticated = !!session
  // Pass user info in custom headers
  const requestConfig = useMemo(() => {
    if (!session?.user) {
      return { fetch }
    }
    console.log('Setting up headers for user:', session.user.id)
    return {
      fetch,
      headers: {
        'x-user-id': session.user.id || '',
        'x-user-email': session.user.email || '',
        'x-user-name': session.user.name || session.user.email || '',
      },
    }
  }, [session])

  return (
    <FlowgladProvider
      loadBilling={isAuthenticated}
      baseURL="http://localhost:8081"
      requestConfig={requestConfig}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </FlowgladProvider>
  )
}
