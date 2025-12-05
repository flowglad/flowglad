import { Stack } from 'expo-router'
import { authClient } from '@/lib/auth-client'
import { FlowgladProvider } from '@flowglad/react'

export default function RootLayout() {
  const { data: session } = authClient.useSession()
  const isAuthenticated = !!session
  return (
    <FlowgladProvider
      loadBilling={isAuthenticated}
      baseURL="https://4653658d0d9a.ngrok-free.app"
      requestConfig={{ fetch }}
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
