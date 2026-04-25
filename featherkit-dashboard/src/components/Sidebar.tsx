import { Home, Folder, Plug, Feather, Bot, ChevronRight, Brain } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Project } from '@/data/mock';
import { Dot } from './ui/Dot';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type TabId = 'home' | 'projects' | 'agents' | 'connections' | 'memory';

export function Sidebar({
  activeTab,
  onNav,
  selectedProject,
  onSelectProject,
  projects,
  connected,
  orchestratorStatus,
  pid,
  showMemory,
}: {
  activeTab: TabId;
  onNav: (t: TabId) => void;
  selectedProject: string;
  onSelectProject: (id: string) => void;
  projects: Project[];
  connected: boolean;
  orchestratorStatus: string;
  pid?: number;
  showMemory: boolean;
}) {
  const [projectsOpen, setProjectsOpen] = useState(activeTab === 'projects');
  const tone = orchestratorStatus === 'running' ? 'ok' : orchestratorStatus === 'paused' ? 'warn' : 'muted';

  const totalPending = projects.reduce((sum, p) => sum + p.pendingInputs.length, 0);
  const showBadgeOnButton = totalPending > 0 && !projectsOpen;

  function toggleProjects() {
    const next = !projectsOpen;
    setProjectsOpen(next);
    if (activeTab !== 'projects') onNav('projects');
  }

  return (
    <aside className="w-[240px] xl:w-[260px] shrink-0 bg-surface border-r border-border flex flex-col h-screen">
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center shadow-[0_0_14px_rgba(34,211,238,0.3)]">
            <Feather size={16} className="text-bg" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">FeatherKit</div>
            <div className="text-2xs text-ink-5 font-mono uppercase tracking-widest">v{__APP_VERSION__}</div>
          </div>
          <div className="ml-auto">
            <ConnectionStatus connected={connected} />
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        <NavItem icon={Home} label="Home" active={activeTab === 'home'} onClick={() => onNav('home')} />

        <div>
          <button
            onClick={toggleProjects}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
              activeTab === 'projects' ? 'bg-white/[.05] text-ink' : 'text-ink-3 hover:text-ink hover:bg-white/[.03]',
            )}
          >
            <ChevronRight size={14} className={cn('text-ink-5 transition-transform duration-200 shrink-0', projectsOpen && 'rotate-90')} />
            <Folder size={16} className={activeTab === 'projects' ? 'text-accent' : 'text-ink-4'} />
            <span className={activeTab === 'projects' ? 'font-medium' : ''}>Projects</span>
            {showBadgeOnButton && (
              <span className="ml-auto relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-warn" />
              </span>
            )}
          </button>
          <AnimatePresence>
            {projectsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="ml-4 pl-4 border-l border-border/60 space-y-0.5 py-1">
                  {projects.map(p => {
                    const on = selectedProject === p.id && activeTab === 'projects';
                    const hasInput = p.pendingInputs.length > 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          onSelectProject(p.id);
                          if (activeTab !== 'projects') onNav('projects');
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-200',
                          on ? 'bg-white/[.05] text-ink' : 'text-ink-3 hover:text-ink hover:bg-white/[.03]',
                        )}
                      >
                        <Dot tone={p.status === 'active' ? 'ok' : 'muted'} size={5} pulse={p.status === 'active'} />
                        <span className={cn('truncate', on && 'font-medium')}>{p.name}</span>
                        {hasInput && (
                          <span className="ml-auto relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warn" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <NavItem icon={Bot} label="Agents" active={activeTab === 'agents'} onClick={() => onNav('agents')} />
        {showMemory && <NavItem icon={Brain} label="Memory" active={activeTab === 'memory'} onClick={() => onNav('memory')} />}
        <NavItem icon={Plug} label="Connections" active={activeTab === 'connections'} onClick={() => onNav('connections')} />
      </nav>

      <div className="px-3 pb-3">
        <div className="bg-elevated border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs text-ink-5 uppercase tracking-wider font-medium">Orchestrator</span>
            <Dot tone={tone} pulse={orchestratorStatus === 'running'} size={7} />
          </div>
          <div className="text-sm font-medium text-ink capitalize">{orchestratorStatus.replace('-', ' ')}</div>
          <div className="text-xs text-ink-4 font-mono mt-1">pid {pid ?? '—'}</div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
        active ? 'bg-white/[.05] text-ink' : 'text-ink-3 hover:text-ink hover:bg-white/[.03]',
      )}
    >
      <span className="w-[14px] shrink-0" />
      <Icon size={16} className={active ? 'text-accent' : 'text-ink-4'} />
      <span className={active ? 'font-medium' : ''}>{label}</span>
    </button>
  );
}
