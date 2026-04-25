import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskEntry } from '@/data/mock';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Badge } from '@/components/ui/Badge';
import { Dot } from '@/components/ui/Dot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, staggerItem } from '@/lib/motion';
import {
  useVerificationQuery,
  useRunVerification,
  useSetupDetectQuery,
  useSetupVerificationMutation,
} from '@/lib/queries';
import { Wand, Play } from 'lucide-react';

type ToastHandler = (toast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) => void;

export function VerificationView({
  tasks,
  currentTaskId,
  onToast,
}: {
  tasks: TaskEntry[];
  currentTaskId: string | null;
  onToast: ToastHandler;
}) {
  const [showSetup, setShowSetup] = useState(false);
  const setupDetect = useSetupDetectQuery();
  const setupMutation = useSetupVerificationMutation();
  const runAllFns = useRef<Map<string, () => void>>(new Map());
  const [runningAll, setRunningAll] = useState(false);

  const hasTasks = tasks.length > 0;

  const registerRun = useCallback((taskId: string, fn: () => void) => {
    runAllFns.current.set(taskId, fn);
  }, []);

  const unregisterRun = useCallback((taskId: string) => {
    runAllFns.current.delete(taskId);
  }, []);

  async function handleRunAll() {
    setRunningAll(true);
    const fns = [...runAllFns.current.values()];
    await Promise.all(fns.map((fn) => fn()));
    setRunningAll(false);
    onToast({ tone: 'ok', title: 'All checks triggered', desc: `Ran verification for ${fns.length} task(s).` });
  }

  function handleDetect() {
    setShowSetup(true);
    setupDetect.refetch();
  }

  function handleConfirmSetup() {
    const checks = setupDetect.data?.checks;
    if (!checks || Object.keys(checks).length === 0) {
      onToast({ tone: 'warn', title: 'No checks detected', desc: 'Could not auto-detect verification commands from package.json.' });
      return;
    }

    setupMutation.mutate(checks, {
      onSuccess: () => {
        setShowSetup(false);
        onToast({ tone: 'ok', title: 'Verification configured', desc: `${Object.keys(checks).length} checks saved to config.` });
      },
      onError: (error) => {
        onToast({ tone: 'err', title: 'Setup failed', desc: error instanceof Error ? error.message : 'Unable to save verification config.' });
      },
    });
  }

  return (
    <div className="max-w-[1100px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel className="mb-1">Verification</SectionLabel>
          <h2 className="text-lg font-semibold">Verification Runs</h2>
          <p className="text-sm text-ink-4 mt-1">Live check results per task, with on-demand re-runs from the dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasTasks && (
            <Button variant="outline" size="sm" onClick={handleRunAll} disabled={runningAll}>
              <Play size={14} />{runningAll ? 'Running…' : 'Run all'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDetect}>
            <Wand size={14} />Auto-setup
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showSetup && (
          <motion.div
            key="setup-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="p-5 mb-4 border-accent/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Auto-detected checks</div>
                  <div className="text-xs text-ink-4 mt-0.5">Based on your package.json scripts and devDependencies.</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSetup(false)}>Dismiss</Button>
              </div>

              {setupDetect.isFetching && (
                <div className="text-sm text-ink-4 py-4 text-center">Detecting project checks…</div>
              )}

              {setupDetect.isError && (
                <div className="text-sm text-err py-2">Failed to detect checks.</div>
              )}

              {setupDetect.data && Object.keys(setupDetect.data.checks).length === 0 && !setupDetect.isFetching && (
                <div className="text-sm text-ink-4 py-4 text-center">No verification commands detected. Add scripts to package.json or configure manually.</div>
              )}

              {setupDetect.data && Object.keys(setupDetect.data.checks).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(setupDetect.data.checks).map(([name, command]) => (
                    <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg border border-border">
                      <span className="text-sm font-medium text-ink-2 w-28">{name}</span>
                      <code className="text-xs font-mono text-ink-4 flex-1 truncate">{command}</code>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-2">
                    <Button variant="accent" size="sm" onClick={handleConfirmSetup} disabled={setupMutation.isPending}>
                      {setupMutation.isPending ? 'Saving…' : 'Confirm & save'}
                    </Button>
                    <span className="text-xs text-ink-5">This will write to featherkit/config.json</span>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!hasTasks && (
        <Card className="p-8 text-center">
          <div className="text-ink-4 text-sm mb-4">No tasks yet. Create a task to run verification checks.</div>
          <Button variant="ghost" size="sm" onClick={handleDetect}>
            <Wand size={14} />Set up checks anyway
          </Button>
        </Card>
      )}

      {hasTasks && (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[220px_180px_1fr_120px] px-5 py-2.5 text-xs text-ink-5 uppercase tracking-wider border-b border-border bg-elevated/50">
            <span>Task</span><span>Last run</span><span>Checks</span><span>Action</span>
          </div>
          <motion.div initial="initial" animate="animate" variants={stagger(0.04)}>
            {tasks.map((task) => (
              <VerificationRow key={task.id} task={task} isActive={task.id === currentTaskId} registerRun={registerRun} unregisterRun={unregisterRun} />
            ))}
          </motion.div>
        </Card>
      )}
    </div>
  );
}

function verificationTone(status: 'pass' | 'fail' | 'skipped'): 'ok' | 'err' | 'muted' {
  if (status === 'pass') return 'ok';
  if (status === 'fail') return 'err';
  return 'muted';
}

function formatVerificationTimestamp(value: string | undefined | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function formatCheckDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function VerificationRow({ task, isActive, registerRun, unregisterRun }: { task: TaskEntry; isActive: boolean; registerRun: (id: string, fn: () => void) => void; unregisterRun: (id: string) => void }) {
  const verification = useVerificationQuery(task.id);
  const rerun = useRunVerification(task.id);
  const [expanded, setExpanded] = useState(false);
  const checks = verification.data?.checks ? Object.entries(verification.data.checks) : [];

  useEffect(() => {
    registerRun(task.id, () => rerun.mutate());
    return () => unregisterRun(task.id);
  }, [task.id, registerRun, unregisterRun, rerun]);

  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        'grid grid-cols-[220px_180px_1fr_120px] gap-4 px-5 py-3 items-start border-b border-border/50 last:border-b-0',
        isActive && 'bg-accent/[.03]',
      )}
    >
      <div>
        <div className="text-sm font-medium text-ink flex items-center gap-2">
          {task.title}
          {isActive && <Dot tone="accent" size={4} pulse />}
        </div>
        <div className="text-xs font-mono text-ink-5 mt-1">{task.id}</div>
      </div>

      <div className="text-sm text-ink-4">
        {verification.isLoading ? 'Loading…' : formatVerificationTimestamp(verification.data?.lastRunAt)}
      </div>

      <div className="space-y-1">
        {verification.isLoading && <span className="text-sm text-ink-5">Loading results…</span>}
        {verification.isError && <Badge tone="err">failed to load</Badge>}
        {!verification.isLoading && !verification.isError && checks.length === 0 && (
          <span className="text-sm text-ink-5">No verification run recorded yet.</span>
        )}
        {checks.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {checks.map(([name, result]) => (
                <button
                  key={`${task.id}-${name}`}
                  onClick={() => setExpanded(!expanded)}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Badge tone={verificationTone(result.status)} className="normal-case">
                    {name}: {result.status} · {formatCheckDuration(result.durationMs)}
                  </Badge>
                </button>
              ))}
            </div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-1 pt-2"
                >
                  {checks.map(([name, result]) => (
                    <div key={`detail-${name}`} className="px-3 py-2 rounded-lg bg-bg border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone={verificationTone(result.status)} className="normal-case">{name}</Badge>
                        <span className="text-xs text-ink-5">{formatCheckDuration(result.durationMs)}</span>
                      </div>
                      {result.output && (
                        <pre className="text-xs font-mono text-ink-3 whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto fk-scroll">{result.output}</pre>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
          {rerun.isPending ? 'Running…' : <><Play size={14} />Run</>}
        </Button>
      </div>
    </motion.div>
  );
}
