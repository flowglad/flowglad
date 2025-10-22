import { mcpHandler } from '@/mcp/handler'

/**
 * MCP Server Route
 *
 * This route exposes the MCP server at /mcp endpoint.
 * The actual MCP handler logic is in src/mcp/handler.ts
 */

export { mcpHandler as GET, mcpHandler as POST }
