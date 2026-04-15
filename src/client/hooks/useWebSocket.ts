/**
 * useWebSocket hook
 *
 * Manages a single WebSocket connection to the pi-author backend.
 * Uses a version counter to ensure only the latest connection dispatches messages.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ClientMessage, ServerMessage } from '@shared/protocol';

type MessageHandler = (msg: ServerMessage) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  addHandler: (handler: MessageHandler) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Version counter: incremented on every connect, old connections ignored
  const versionRef = useRef(0);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current !== null) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      // Nullify handlers before closing to prevent stale events
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Clean up any existing connection first
    cleanup();

    const version = ++versionRef.current;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Ignore if this is a stale connection
      if (versionRef.current !== version) { ws.close(); return; }
      setConnected(true);
    };

    ws.onmessage = (event) => {
      // Ignore messages from stale connections
      if (versionRef.current !== version) return;
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      // Only reconnect if this is still the current connection
      if (versionRef.current !== version) return;
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(() => {
        if (versionRef.current === version) {
          connect();
        }
      }, 2000);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [cleanup]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return useMemo(() => ({ connected, send, addHandler }), [connected, send, addHandler]);
}
