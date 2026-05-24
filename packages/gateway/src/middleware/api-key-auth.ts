import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * API Key authentication middleware.
 *
 * Checks for a valid API key in the X-API-Key header.
 * The key is configured via the API_KEY environment variable.
 * If API_KEY is not set, authentication is disabled (development mode).
 *
 * Protected routes can be configured via the skipAuthPaths array.
 */
const API_KEY = process.env.API_KEY || '';
const SKIP_AUTH = new Set([
  '/health',
  '/healthz',
  ...(process.env.API_KEY_SKIP_PATHS || '').split(',').filter(Boolean),
]);

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Auth disabled when no API_KEY is configured
  if (!API_KEY) return;

  // Skip auth for health check endpoints
  if (SKIP_AUTH.has(request.url)) return;

  const provided = request.headers['x-api-key'];
  if (!provided || provided !== API_KEY) {
    reply.status(401).send({ error: 'Unauthorized: missing or invalid API key' });
  }
}
