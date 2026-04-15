/**
 * WebSocket Message Handler
 *
 * Routes client messages to the appropriate handlers (agent, card state, config).
 */

import type { WebSocket } from 'ws';
import { CardState } from '../card/state.js';
import { AgentLoop } from '../agent/agent-loop.js';
import {
  saveConfig,
  getCurrentConfig,
} from '../llm/provider.js';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.js';
import type { EntryCategory } from '../card/schema.js';

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function handleConnection(ws: WebSocket) {
  const cardState = new CardState();

  // Send initial state
  send(ws, {
    type: 'connected',
    card: cardState.getCard(),
    config: getCurrentConfig(),
  });

  // Subscribe to card changes and broadcast
  cardState.onChange((card) => {
    send(ws, { type: 'card_updated', card });
  });

  // Create agent loop
  const agent = new AgentLoop(cardState, {
    onStreamStart: () => send(ws, { type: 'stream_start' }),
    onStreamChunk: (content) => send(ws, { type: 'stream_chunk', content }),
    onStreamEnd: () => send(ws, { type: 'stream_end' }),
    onToolCall: (name, args) => send(ws, { type: 'tool_call', name, args }),
    onToolResult: (name, summary) => send(ws, { type: 'tool_result', name, summary }),
    onCardUpdated: () => {
      send(ws, { type: 'card_updated', card: cardState.getCard() });
    },
    onError: (message) => send(ws, { type: 'error', message }),
  });

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: '无法解析消息' });
      return;
    }

    try {
      switch (msg.type) {
        case 'chat':
          await agent.processMessage(msg.content);
          break;

        case 'edit_entry':
          cardState.updateEntry(msg.entryId, msg.updates);
          break;

        case 'add_entry':
          cardState.addEntry(
            msg.category as EntryCategory,
            msg.label,
            msg.content,
          );
          break;

        case 'delete_entry':
          cardState.deleteEntry(msg.entryId);
          break;

        case 'edit_meta':
          cardState.updateMeta(msg.field, msg.value);
          break;

        case 'set_first_mes':
          cardState.setFirstMes(msg.content);
          break;

        case 'add_alternate_greeting':
          cardState.addAlternateGreeting(msg.content);
          break;

        case 'import_card':
          cardState.replaceCard(msg.card);
          agent.resetHistory();
          break;

        case 'export_card':
          send(ws, { type: 'export_ready', card: cardState.getCard() });
          break;

        case 'new_card':
          cardState.reset();
          agent.resetHistory();
          break;

        case 'update_llm_config':
          saveConfig(msg.config);
          send(ws, {
            type: 'connected',
            card: cardState.getCard(),
            config: msg.config,
          });
          break;

        default:
          send(ws, { type: 'error', message: `未知消息类型` });
      }
    } catch (error: any) {
      send(ws, { type: 'error', message: error?.message || String(error) });
    }
  });

  ws.on('close', () => {
    // Cleanup if needed
  });
}
