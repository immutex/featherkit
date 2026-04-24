import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { USE_MOCK } from '@/lib/env';
import { getApiToken, getWebSocketUrl } from './api';

export type OrchestratorEvent =
  | { type: 'phase:start'; taskId: string; phase: string }
  | { type: 'phase:stdout'; line: string }
  | { type: 'phase:complete'; taskId: string; phase: string; status: 'ok' | 'timeout' | 'failed' | 'stuck'; durationMs: number }
  | { type: 'phase:failed'; taskId: string; phase: string; reason: string }
  | { type: 'gate:awaiting'; taskId: string; phase: 'frame' | 'sync' }
  | { type: 'gate:approved'; taskId: string; phase: 'frame' | 'sync' }
  | { type: 'user-input'; projectId: string; message: string; at: string; requestId: string; taskId?: string }
  | { type: 'chat-response'; projectId: string; message: string; at: string; agentName?: string; requestId?: string; taskId?: string }
  | { type: 'task:done'; taskId: string }
  | { type: 'orchestrator:lock-acquired'; pid: number }
  | { type: 'orchestrator:lock-released' }
  | { type: 'orchestrator:stale-lock-cleared'; stalePid: number }
  | { type: 'ping'; at: string };

export const ORCHESTRATOR_EVENT_NAME = 'featherkit:orchestrator-event';

export function useOrchestratorEvents(onEvent: (event: OrchestratorEvent) => void): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(USE_MOCK);

  useEffect(() => {
    if (USE_MOCK) {
      setConnected(true);
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (cancelled) {
        return;
      }

      try {
        const url = new URL(getWebSocketUrl());
        url.searchParams.set('token', getApiToken());

        socket = new WebSocket(url.toString());
      } catch {
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 1_500);
        return;
      }

      socket.addEventListener('open', () => {
        setConnected(true);
      });

      socket.addEventListener('message', (message) => {
        const event = JSON.parse(String(message.data)) as OrchestratorEvent;
        if (event.type === 'ping') {
          setConnected(true);
          return;
        }

        setConnected(true);
        window.dispatchEvent(new CustomEvent<OrchestratorEvent>(ORCHESTRATOR_EVENT_NAME, { detail: event }));
        onEvent(event);
        void queryClient.invalidateQueries({ queryKey: ['state'] });
        void queryClient.invalidateQueries({ queryKey: ['events'] });
      });

      socket.addEventListener('close', () => {
        if (cancelled) {
          return;
        }

        setConnected(false);
        reconnectTimer = window.setTimeout(connect, 1_500);
      });

      socket.addEventListener('error', () => {
        setConnected(false);
        socket?.close();
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [onEvent, queryClient]);

  return { connected };
}
