'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Package,
  LockKeyhole,
  ScanLine,
  FileSearch,
  CircleAlert,
  Clock3,
  Radio,
  Upload,
  Play,
  Check,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  assessmentNames,
  formatTime,
  priority,
  sourceHost,
  summarizeInventory,
  type Data,
  type Item,
} from '@/lib/ui/workspace';

export function WorkspaceOverview({
  data,
  openItem,
  navigate,
  filter,
  judge,
  busy,
}: {
  data: Data;
  openItem: (item: Item) => void;
  navigate: (
    screen:
      | 'import'
      | 'investigation'
      | 'inventory'
      | 'actions'
      | 'evidence'
      | 'health'
      | 'monitoring'
      | 'judge',
  ) => void;
  filter: (status: string) => void;
  judge: () => void;
  busy: boolean;
}) {
  const stats = summarizeInventory(data.inventory);
  const attention = [...data.inventory]
    .filter((item) => priority(item) < 3)
    .sort(
      (a, b) =>
        priority(a) - priority(b) || a.assetTag.localeCompare(b.assetTag),
    );
  const tasks = data.tasks.filter((task) => task.status !== 'done');
  const live = data.inventory.filter((item) =>
    ['LIVE_ANAKIN', 'CACHED_ANAKIN'].includes(item.assessment?.label ?? ''),
  ).length;
  const recentSources = [...data.sources]
    .sort((a, b) => Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt))
    .slice(0, 3);
  const recentRuns = [...data.runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 4);
  const segments = Object.entries(stats.statuses).filter(([, n]) => n > 0);
  return (
    <>
      <div className="head overview-head">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> Inventory operations
          </div>
          <h1>Your safety workspace.</h1>
          <p>
            {stats.total
              ? `${stats.total.toLocaleString()} units tracked. Prioritize the records that need a decision.`
              : 'Bring in your inventory to start investigating individual units.'}
          </p>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={() => navigate('import')}>
            <Upload /> Import inventory
          </Button>
          <Button
            disabled={!stats.total || busy}
            onClick={() => navigate('investigation')}
          >
            <ScanLine /> Investigate inventory
          </Button>
        </div>
      </div>
      <div className="overview-stats" aria-label="Workspace totals">
        {[
          {
            label: 'Inventory units',
            value: stats.total,
            detail: `${stats.assessed} assessed`,
            icon: Package,
            tone: 'neutral',
            action: 'all',
          },
          {
            label: 'Affected units',
            value: stats.statuses.affected,
            detail: 'Matched all notice criteria',
            icon: CircleAlert,
            tone: 'red',
            action: 'affected',
          },
          {
            label: 'Needs review',
            value: stats.statuses.needs_review,
            detail: 'Resolve missing or conflicting facts',
            icon: FileSearch,
            tone: 'amber',
            action: 'needs_review',
          },
          {
            label: 'Quarantine holds',
            value: stats.holds,
            detail: 'Excluded from sale exports',
            icon: LockKeyhole,
            tone: 'teal',
            action: 'quarantined',
          },
        ].map(({ label, value, detail, icon: Icon, tone, action }) => (
          <button
            key={label}
            className={`metric-card ${tone}`}
            onClick={() => filter(action)}
            aria-label={`${label}: ${value}`}
          >
            <span className="metric-top">
              <span>{label}</span>
              <Icon size={19} />
            </span>
            <strong>{value.toLocaleString()}</strong>
            <span className="metric-bottom">
              {detail}
              <ArrowUpRight size={16} />
            </span>
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel queue-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">Next decisions</span>
              <h2>
                Needs attention{' '}
                <span className="count">{attention.length}</span>
              </h2>
            </div>
            <button className="text-action" onClick={() => filter('all')}>
              View inventory <ArrowRight size={16} />
            </button>
          </div>
          {!stats.total ? (
            <div className="empty">
              <Package />
              <h3>Your inventory starts here</h3>
              <p>
                Import a CSV or add a physical unit. The labeled Judge demo is
                also available.
              </p>
              <Button onClick={() => navigate('import')}>
                <PlusIcon /> Add inventory
              </Button>
            </div>
          ) : !attention.length ? (
            <div className="empty">
              <Check />
              <h3>No records awaiting review</h3>
              <p>
                All units have an assessment. Their notice scope still applies.
              </p>
              <Button variant="outline" onClick={() => navigate('inventory')}>
                Inspect inventory
              </Button>
            </div>
          ) : (
            <div className="attention-list">
              {attention.slice(0, 5).map((item) => (
                <button
                  className="attention-row"
                  key={item.id}
                  onClick={() => openItem(item)}
                >
                  <span
                    className={`queue-icon ${item.quarantined ? 'held' : item.assessment?.status === 'needs_review' ? 'review' : 'pending'}`}
                  >
                    {item.quarantined ? (
                      <LockKeyhole size={19} />
                    ) : item.assessment ? (
                      <FileSearch size={19} />
                    ) : (
                      <Package size={19} />
                    )}
                  </span>
                  <span className="queue-copy">
                    <strong>
                      {item.assetTag}
                      <span>{item.title}</span>
                    </strong>
                    <span>
                      {item.assessment?.reason ??
                        'No assessment yet. Run an investigation to collect evidence.'}
                    </span>
                  </span>
                  <span className="queue-end">
                    <span
                      className={`badge ${item.assessment?.status ?? 'unassessed'}`}
                    >
                      {item.assessment
                        ? assessmentNames[item.assessment.status]
                        : 'Unassessed'}
                    </span>
                    <ArrowRight size={17} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {attention.length > 5 && (
            <button className="queue-more" onClick={() => filter('all')}>
              Explore all {stats.total} inventory units <ArrowRight size={16} />
            </button>
          )}
        </section>
        <section className="panel coverage-panel">
          <div className="eyebrow">Assessment coverage</div>
          <h2>Evidence, in context.</h2>
          <div className="coverage-number">
            <strong>
              {stats.assessed}
              <span> / {stats.total}</span>
            </strong>
            <span>units assessed</span>
          </div>
          <div className="coverage-track" aria-hidden="true">
            {segments.map(([status, n]) => (
              <span
                key={status}
                className={`segment ${status}`}
                style={{ flex: n }}
              />
            ))}
          </div>
          <div className="coverage-legend">
            {Object.entries(stats.statuses).map(([status, n]) => (
              <button key={status} onClick={() => filter(status)}>
                <span className={`legend-dot ${status}`} />
                <span>
                  {status === 'unassessed'
                    ? 'Unassessed'
                    : assessmentNames[status as keyof typeof assessmentNames]}
                </span>
                <strong>{n}</strong>
              </button>
            ))}
          </div>
          <p className="coverage-note">
            <FileSearch size={16} />
            {live} units use live or cached Anakin evidence. Demo results remain
            labeled.
          </p>
          <p className="subtext">
            No relevant notice found does not mean a product is safe.
          </p>
        </section>
      </div>
      <div className="overview-lower">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <Activity size={18} /> Recent provider calls
            </h2>
            <button className="text-action" onClick={() => navigate('health')}>
              Health <ArrowUpRight size={15} />
            </button>
          </div>
          {recentRuns.length ? (
            recentRuns.map((run) => (
              <div className="recent-run" key={run.id}>
                <span className={`run-indicator ${run.status}`}>
                  {run.status === 'success' ? (
                    <Check size={15} />
                  ) : (
                    <CircleAlert size={15} />
                  )}
                </span>
                <div>
                  <strong>{run.product}</strong>
                  <span className="subtext">{formatTime(run.startedAt)}</span>
                </div>
                <span className={`run-status ${run.status}`}>{run.status}</span>
              </div>
            ))
          ) : (
            <div className="compact-empty">
              <Radio />
              <p>No provider calls recorded.</p>
              <button
                className="text-action"
                onClick={() => navigate('investigation')}
              >
                Open investigation <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>
              <FileSearch size={18} /> Recent evidence
            </h2>
            <button
              className="text-action"
              onClick={() => navigate('evidence')}
            >
              Library <ArrowUpRight size={15} />
            </button>
          </div>
          {recentSources.length ? (
            recentSources.map((source) => (
              <div className="source-summary" key={source.id}>
                <span className="source-domain">{sourceHost(source.url)}</span>
                <strong>{source.title}</strong>
                <span className="subtext">
                  {source.label} · {formatTime(source.retrievedAt)}
                </span>
              </div>
            ))
          ) : (
            <div className="compact-empty">
              <FileSearch />
              <p>Source documents will appear after an investigation.</p>
            </div>
          )}
        </section>
        <section className="panel next-action-panel">
          <span className="eyebrow">Action center</span>
          <Clock3 size={25} />
          <h2>
            {tasks.length} open staff {tasks.length === 1 ? 'task' : 'tasks'}
          </h2>
          <p>Assign owners, review deadlines and prepare the remedy packet.</p>
          <Button variant="outline" onClick={() => navigate('actions')}>
            Manage actions <ArrowRight />
          </Button>
          <div className="demo-shortcut">
            <Play size={18} />
            <div>
              <strong>Explore with sample inventory</strong>
              <span>
                {data.demo.sampleCount} labeled units · controlled replay
              </span>
            </div>
          </div>
          <Button
            className="demo-button"
            disabled={busy}
            variant="ghost"
            onClick={judge}
          >
            Run RecallOps Judge Demo <ArrowUpRight />
          </Button>
        </section>
      </div>
    </>
  );
}
function PlusIcon() {
  return <Upload size={17} />;
}
