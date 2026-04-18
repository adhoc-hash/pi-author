/**
 * pi-author Server Entry Point
 *
 * Express HTTP server + WebSocket server for the agent.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { loadConfig, setCurrentConfig } from './llm/provider.js';
import { handleConnection } from './ws/handler.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Load saved LLM config
const savedConfig = loadConfig();
if (savedConfig) setCurrentConfig(savedConfig);

const app = express();
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  handleConnection(ws);

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`[pi-author] Server running on http://localhost:${PORT}`);
  console.log(`[pi-author] WebSocket at ws://localhost:${PORT}/ws`);
});
