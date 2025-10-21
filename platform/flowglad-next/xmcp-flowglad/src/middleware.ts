import { apiKeyAuthMiddleware } from 'xmcp'

export default apiKeyAuthMiddleware({
  headerName: 'Authorization',
  validateApiKey: async (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false
    }

    const token = authHeader.substring(7) // Remove "Bearer " prefix
    return token === '12345'
  },
})
