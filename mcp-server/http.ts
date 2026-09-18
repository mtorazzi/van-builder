#!/usr/bin/env node
// Van Builder MCP server — HTTP transport (for remote agents via Tailscale Funnel).
//
// Same tools as the stdio transport, but exposed over HTTP on localhost.
// Bind to 127.0.0.1 only by default — use Tailscale Funnel to expose securely.
//
// TRANSPORTS:
//   1. Streamable HTTP at /mcp   — modern MCP spec (Claude Desktop, Cursor, etc.)
//   2. SSE at /sse + /messages   — legacy/compatible (Grok Bot, FastMCP-style clients)
//
// Usage: npm run mcp:http
// Environment variables:
//   VAN_BUILDER_MCP_PORT  — HTTP port (default: 8767)
//   VAN_BUILDER_MCP_TOKEN — Optional bearer token for authentication
//
// Funnel setup for Grok Bot (SSE transport):
//   tailscale funnel --bg --set-path=/van-sse localhost:8767/sse
//   tailscale funnel --bg --set-path=/van-messages localhost:8767/messages
//
//   Then configure Grok Bot with:
//     URL: https://core.tail8c689e.ts.net/van-sse
//
// Funnel setup for Streamable HTTP (Claude Desktop, etc.):
//   tailscale funnel --bg --set-path=/van-mcp localhost:8767/mcp
//
//   Then configure with:
//     URL: https://core.tail8c689e.ts.net/van-mcp
//
// See mcp-server/server.ts for tool registration (shared between transports).

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createVanBuilderServer } from './server.js';

const PORT = parseInt(process.env.VAN_BUILDER_MCP_PORT || '8767', 10);
const TOKEN = process.env.VAN_BUILDER_MCP_TOKEN || null;
const HOST = process.env.VAN_BUILDER_MCP_HOST || '127.0.0.1';

// ----- Streamable HTTP transport (modern MCP clients) -----
const streamableServer = createVanBuilderServer();
const streamableTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

// ----- SSE transport (Grok Bot and FastMCP-style clients) -----
// Each SSE connection gets its own server instance and transport.
// Sessions are keyed by sessionId and cleaned up on disconnect.
const sseSessions = new Map<string, { transport: SSEServerTransport; server: ReturnType<typeof createVanBuilderServer> }>();

function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!TOKEN) return true;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (!checkAuth(req, res)) return;

  // ----- SSE: establish new connection (GET /sse) -----
  if ((url.pathname === '/sse' || url.pathname === '/sse/') && req.method === 'GET') {
    console.log('[SSE] New connection request');
    const sseServer = createVanBuilderServer();
    const sseTransport = new SSEServerTransport('/messages', res);

    sseSessions.set(sseTransport.sessionId, { transport: sseTransport, server: sseServer });
    console.log(`[SSE] Session ${sseTransport.sessionId} created (${sseSessions.size} active)`);

    sseTransport.onclose = () => {
      sseSessions.delete(sseTransport.sessionId);
      console.log(`[SSE] Session ${sseTransport.sessionId} closed (${sseSessions.size} active)`);
    };

    try {
      // Note: connect() calls start() internally on the transport
      await sseServer.connect(sseTransport);
    } catch (err) {
      console.error('[SSE] Connection error:', err);
      sseSessions.delete(sseTransport.sessionId);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to establish SSE connection' }));
      }
    }
    return;
  }

  // ----- SSE: handle client messages (POST /messages?sessionId=xxx) -----
  if ((url.pathname === '/messages' || url.pathname === '/messages/') && req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId query parameter' }));
      return;
    }

    const session = sseSessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found or expired', sessionId }));
      return;
    }

    try {
      await session.transport.handlePostMessage(req, res);
    } catch (err) {
      console.error(`[SSE] Message handling error for session ${sessionId}:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process message' }));
      }
    }
    return;
  }

  // ----- Streamable HTTP: all methods at /mcp -----
  if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
    try {
      await streamableTransport.handleRequest(req, res);
    } catch (err) {
      console.error('[Streamable HTTP] Request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
    return;
  }

  // ----- Health check -----
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'van-builder',
      transports: {
        streamableHttp: { path: '/mcp', method: 'POST/GET/DELETE' },
        sse: { connectPath: '/sse', messagesPath: '/messages', method: 'GET + POST' },
      },
      activeSseSessions: sseSessions.size,
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    endpoints: {
      '/mcp': 'Streamable HTTP transport (modern MCP clients)',
      '/sse': 'SSE transport connect (Grok Bot, FastMCP-style clients)',
      '/messages': 'SSE transport messages (POST with ?sessionId=...)',
      '/health': 'Health check',
    },
  }));
});

async function main() {
  await streamableServer.connect(streamableTransport);

  httpServer.listen(PORT, HOST, () => {
    console.log(`van-builder MCP server (HTTP) listening on http://${HOST}:${PORT}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  Streamable HTTP: http://${HOST}:${PORT}/mcp`);
    console.log(`  SSE connect:     http://${HOST}:${PORT}/sse`);
    console.log(`  SSE messages:    http://${HOST}:${PORT}/messages`);
    console.log(`  Health check:    http://${HOST}:${PORT}/health`);
    console.log('');
    if (TOKEN) {
      console.log('Authentication: Bearer token required');
    } else {
      console.log('Authentication: None (loopback only — use Tailscale Funnel for secure remote access)');
    }
    console.log('');
    console.log('=== Tailscale Funnel setup ===');
    console.log('');
    console.log('For Grok Bot (SSE transport):');
    console.log('  tailscale funnel --bg --set-path=/van-sse localhost:8767/sse');
    console.log('  tailscale funnel --bg --set-path=/van-messages localhost:8767/messages');
    console.log('');
    console.log('  Grok Bot AddMcpServer URL: https://core.tail8c689e.ts.net/van-sse');
    console.log('');
    console.log('For Streamable HTTP clients (Claude Desktop, Cursor):');
    console.log('  tailscale funnel --bg --set-path=/van-mcp localhost:8767/mcp');
    console.log('');
    console.log('  URL: https://core.tail8c689e.ts.net/van-mcp');
  });
}

main().catch((err) => {
  console.error('van-builder MCP server (HTTP) failed to start:', err);
  process.exit(1);
});
