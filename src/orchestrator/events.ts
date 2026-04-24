import { EventEmitter } from 'node:events';

export type PhaseRunStatus = 'ok' | 'timeout' | 'failed' | 'stuck';

export type OrchestratorEvent =
  | { type: 'phase:start'; taskId: string; phase: string }
  | { type: 'phase:stdout'; line: string }
  | { type: 'phase:complete'; taskId: string; phase: string; status: PhaseRunStatus; durationMs: number }
  | { type: 'phase:failed'; taskId: string; phase: string; reason: string }
  | { type: 'gate:awaiting'; taskId: string; phase: 'frame' | 'sync' }
  | { type: 'gate:approved'; taskId: string; phase: 'frame' | 'sync' }
  | { type: 'user-input'; projectId: string; message: string; at: string; requestId: string; taskId?: string }
  | { type: 'chat-response'; projectId: string; message: string; at: string; agentName?: string; requestId?: string; taskId?: string }
  | { type: 'task:done'; taskId: string }
  | { type: 'orchestrator:lock-acquired'; pid: number }
  | { type: 'orchestrator:lock-released' }
  | { type: 'orchestrator:stale-lock-cleared'; stalePid: number };

const orchestratorEventBus = new EventEmitter();
orchestratorEventBus.setMaxListeners(50);

export function publishOrchestratorEvent(event: OrchestratorEvent): void {
  orchestratorEventBus.emit('event', event);
}

export function subscribeToOrchestratorEvents(listener: (event: OrchestratorEvent) => void): () => void {
  orchestratorEventBus.on('event', listener);
  return () => {
    orchestratorEventBus.off('event', listener);
  };
}
