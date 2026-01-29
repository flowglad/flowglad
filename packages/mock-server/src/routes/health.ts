/**
 * Health check endpoint handler.
 * Returns a 200 OK response with JSON body indicating server health.
 */
export function handleHealth(serviceName: string): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: serviceName,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}
