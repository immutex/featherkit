import { Container, ProcessTerminal, TUI, Text } from '@mariozechner/pi-tui';
import type { FeatherConfig } from '../../config/schema.js';
import type { OrchestratorEvent } from '../events.js';
import { StreamView } from './stream.js';

export interface Dashboard {
  onEvent: (event: OrchestratorEvent) => void;
  stop: () => void;
  start: () => void;
  cleanup: () => void;
}

const PHASES = ['frame', 'build', 'critic', 'sync'] as const;

function formatFallbackEvent(event: OrchestratorEvent): string {
  switch (event.type) {
    case 'phase:start': return `[feather] phase:start taskId=${event.taskId} phase=${event.phase}\n`;
    case 'phase:stdout': return `[feather] phase:stdout line=${event.line}\n`;
    case 'phase:complete': return `[feather] phase:complete taskId=${event.taskId} phase=${event.phase} status=${event.status} durationMs=${event.durationMs}\n`;
    case 'phase:failed': return `[feather] phase:failed taskId=${event.taskId} phase=${event.phase} reason=${event.reason}\n`;
    case 'gate:awaiting': return `[feather] gate:awaiting taskId=${event.taskId} phase=${event.phase}\n`;
    case 'gate:approved': return `[feather] gate:approved taskId=${event.taskId} phase=${event.phase}\n`;
    case 'task:done': return `[feather] task:done taskId=${event.taskId}\n`;
    case 'orchestrator:lock-acquired': return `[feather] orchestrator:lock-acquired pid=${event.pid}\n`;
    case 'orchestrator:lock-released': return `[feather] orchestrator:lock-released\n`;
    case 'orchestrator:stale-lock-cleared': return `[feather] orchestrator:stale-lock-cleared stalePid=${event.stalePid}\n`;
    default: return `[feather] event\n`;
  }
}

export function createDashboard(config: FeatherConfig): Dashboard {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const root = new Container();
  const header = new Text('');
  const phases = new Text('');
  const streamText = new Text('');
  const history = new Text('');
  const stream = new StreamView(config.orchestrator.tui.maxStreamLines);
  const state = { taskId: 'none', phaseStatus: {} as Record<string, 'idle' | 'running' | 'done' | 'failed'>, done: false, history: [] as string[] };
  let active = true;
  let started = false;

  const safe = (action: () => void) => {
    if (!active) return;
    try {
      action();
    } catch {
      active = false;
    }
  };
  const render = () => {
    header.setText([
      `FeatherKit Orchestrator — ${config.projectName}`,
      `Task: ${state.taskId}${state.done ? ' (done)' : ''}   Session: none`,
      '──────────────────────────────────────────────────────────────',
    ].join('\n'));
    phases.setText([
      PHASES.join('  ▶  '),
      PHASES.map((phase) => state.phaseStatus[phase] === 'done' ? '✓' : state.phaseStatus[phase] === 'running' ? '⋯' : state.phaseStatus[phase] === 'failed' ? '✗' : '·').join('           '),
      '──────────────────────────────────────────────────────────────',
    ].join('\n'));
    streamText.setText(['Output', stream.render(), '──────────────────────────────────────────────────────────────'].filter(Boolean).join('\n'));
    history.setText(['History', ...(state.history.length > 0 ? state.history : ['(no history yet)'])].join('\n'));
    tui.requestRender(true);
  };

  root.addChild(header);
  root.addChild(phases);
  root.addChild(streamText);
  root.addChild(history);
  tui.addChild(root);
  safe(() => {
    tui.setClearOnShrink(false);
    tui.start();
    started = true;
    render();
  });

  return {
    onEvent: (event) => {
      if (!active) {
        process.stderr.write(formatFallbackEvent(event));
        return;
      }

      try {
      switch (event.type) {
        case 'phase:start':
          state.taskId = event.taskId;
          state.done = false;
          state.phaseStatus[event.phase] = 'running';
          break;
        case 'phase:stdout':
          stream.push(event.line);
          break;
        case 'phase:complete':
          state.taskId = event.taskId;
          state.phaseStatus[event.phase] = event.status === 'ok' ? 'done' : 'failed';
          state.history.push(`${event.status === 'ok' ? '✓' : '✗'} ${event.phase}  ${Math.round(event.durationMs / 1000)}s`);
          break;
        case 'phase:failed':
          state.taskId = event.taskId;
          state.phaseStatus[event.phase] = 'failed';
          state.history.push(`✗ ${event.phase}  ${event.reason}`);
          break;
        case 'task:done':
          state.taskId = event.taskId;
          state.done = true;
          break;
      }
      state.history = state.history.slice(-6);
      render();
      } catch {
        active = false;
        process.stderr.write(formatFallbackEvent(event));
      }
    },
    stop: () => safe(() => {
      if (!started) return;
      tui.stop();
      started = false;
    }),
    start: () => safe(() => {
      if (started || !process.stdout.isTTY) return;
      tui.start();
      started = true;
      render();
    }),
    cleanup: () => safe(() => {
      if (!started) return;
      tui.stop();
      started = false;
    }),
  };
}
