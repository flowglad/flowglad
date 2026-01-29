import { handleHealth } from './routes/health'
import { handleUnkeyRoute } from './routes/unkey'

const SVIX_PORT = 9001
const UNKEY_PORT = 9002
const TRIGGER_PORT = 9003

interface ServerConfig {
  port: number
  serviceName: string
  routeHandler?: (req: Request, pathname: string) => Response | null
}

function createServer(config: ServerConfig): void {
  const { port, serviceName, routeHandler } = config

  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === '/health') {
        return handleHealth(serviceName)
      }

      // Try service-specific route handler
      if (routeHandler) {
        const response = routeHandler(req, url.pathname)
        if (response) {
          return response
        }
      }

      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: `Route ${url.pathname} not found on ${serviceName} mock server`,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    },
  })

  console.log(
    `${serviceName} mock server running on http://localhost:${port}`
  )
}

// Start all mock servers
createServer({ port: SVIX_PORT, serviceName: 'svix' })
createServer({
  port: UNKEY_PORT,
  serviceName: 'unkey',
  routeHandler: handleUnkeyRoute,
})
createServer({ port: TRIGGER_PORT, serviceName: 'trigger' })

console.log('\nMock servers started:')
console.log(`  Svix:    http://localhost:${SVIX_PORT}/health`)
console.log(`  Unkey:   http://localhost:${UNKEY_PORT}/health`)
console.log(`  Trigger: http://localhost:${TRIGGER_PORT}/health`)
