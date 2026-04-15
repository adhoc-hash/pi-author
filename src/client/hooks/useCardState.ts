/**
 * useCardState hook
 *
 * Manages the client-side card state, synced via WebSocket.
 * Uses a ref for stream accumulation to avoid React's nested-setState pitfall.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UseWebSocketReturn } from './useWebSocket';
import type { CharacterCardV3, EntryCategory, LorebookEntry } from '../../server/card/schema';
import type { LLMConfig, ChatMessage, ServerMessage } from '@shared/protocol';

export type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

export interface UseCardStateOptions {
  onToast?: ToastFn;
}

export interface UseCardStateReturn {
  card: CharacterCardV3 | null;
  messages: ChatMessage[];
  streaming: boolean;
  streamContent: string;
  llmConfig: LLMConfig | null;
  sendChat: (content: string) => void;
  editEntry: (entryId: number, updates: Partial<LorebookEntry>) => void;
  addEntry: (category: EntryCategory, label: string, content: string) => void;
  deleteEntry: (entryId: number) => void;
  editMeta: (field: string, value: any) => void;
  setFirstMes: (content: string) => void;
  importCard: (card: CharacterCardV3) => void;
  exportCard: () => void;
  newCard: () => void;
  updateLLMConfig: (config: LLMConfig) => void;
}

let messageIdCounter = 0;

export function useCardState(ws: UseWebSocketReturn, opts?: UseCardStateOptions): UseCardStateReturn {
  const toast = opts?.onToast;
  const [card, setCard] = useState<CharacterCardV3 | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null);

  // Ref for stream accumulation — avoids nested setState
  const streamRef = useRef('');

  useEffect(() => {
    const removeHandler = ws.addHandler((msg: ServerMessage) => {
      switch (msg.type) {
        case 'connected':
          setCard(msg.card);
          setLLMConfig(msg.config);
          break;

        case 'card_updated':
          setCard(msg.card);
          break;

        case 'stream_start':
          streamRef.current = '';
          setStreaming(true);
          setStreamContent('');
          break;

        case 'stream_chunk':
          streamRef.current += msg.content;
          setStreamContent(streamRef.current);
          break;

        case 'stream_end': {
          const finalContent = streamRef.current;
          streamRef.current = '';
          setStreaming(false);
          setStreamContent('');
          if (finalContent) {
            setMessages((msgs) => [
              ...msgs,
              {
                id: `msg-${++messageIdCounter}`,
                role: 'assistant',
                content: finalContent,
                timestamp: Date.now(),
              },
            ]);
          }
          break;
        }

        case 'tool_call':
          // Tool calls are shown via tool_result
          break;

        case 'tool_result':
          setMessages((msgs) => [
            ...msgs,
            {
              id: `tool-${++messageIdCounter}`,
              role: 'system',
              content: `✅ ${msg.summary}`,
              timestamp: Date.now(),
              toolCalls: [{ name: msg.name, summary: msg.summary }],
            },
          ]);
          break;

        case 'error':
          setMessages((msgs) => [
            ...msgs,
            {
              id: `err-${++messageIdCounter}`,
              role: 'system',
              content: `❌ ${msg.message}`,
              timestamp: Date.now(),
            },
          ]);
          setStreaming(false);
          streamRef.current = '';
          break;

        case 'export_ready': {
          const filename = downloadJson(msg.card);
          toast?.(`已导出: ${filename}`, 'success');
          break;
        }
      }
    });

    return removeHandler;
  }, [ws]);

  const sendChat = useCallback((content: string) => {
    if (!content.trim()) return;
    setMessages((msgs) => [
      ...msgs,
      {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      },
    ]);
    ws.send({ type: 'chat', content });
  }, [ws]);

  const editEntry = useCallback((entryId: number, updates: Partial<LorebookEntry>) => {
    ws.send({ type: 'edit_entry', entryId, updates });
  }, [ws]);

  const addEntry = useCallback((category: EntryCategory, label: string, content: string) => {
    ws.send({ type: 'add_entry', category, label, content });
  }, [ws]);

  const deleteEntry = useCallback((entryId: number) => {
    ws.send({ type: 'delete_entry', entryId });
  }, [ws]);

  const editMeta = useCallback((field: string, value: any) => {
    ws.send({ type: 'edit_meta', field, value });
  }, [ws]);

  const setFirstMes = useCallback((content: string) => {
    ws.send({ type: 'set_first_mes', content });
  }, [ws]);

  const importCard = useCallback((cardData: CharacterCardV3) => {
    ws.send({ type: 'import_card', card: cardData });
    setMessages([]);
  }, [ws]);

  const exportCard = useCallback(() => {
    ws.send({ type: 'export_card' });
  }, [ws]);

  const newCard = useCallback(() => {
    ws.send({ type: 'new_card' });
    setMessages([]);
  }, [ws]);

  const updateLLMConfig = useCallback((config: LLMConfig) => {
    ws.send({ type: 'update_llm_config', config });
    setLLMConfig(config);
  }, [ws]);

  return {
    card, messages, streaming, streamContent, llmConfig,
    sendChat, editEntry, addEntry, deleteEntry, editMeta,
    setFirstMes, importCard, exportCard, newCard, updateLLMConfig,
  };
}

function downloadJson(card: CharacterCardV3): string {
  const filename = `${card.data.name || 'character'}.json`;
  const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
