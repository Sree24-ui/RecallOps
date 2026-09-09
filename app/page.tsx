'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Package,
  Upload,
  ScanLine,
  ClipboardList,
  FileSearch,
  LockKeyhole,
  Radio,
  Activity,
  Settings,
  ArrowUpRight,
  ArrowLeft,
  Download,
  Play,
  Plus,
  Check,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Inventory, AssessmentState, SourceLabel } from '@/lib/core/rules';
import type { Assessment } from '@/lib/server/workflow';
type Item = Inventory & {
  id: string;
  quarantined: boolean;
  acknowledged: boolean;
  caseId?: string;
  assessment: (Assessment & { id: string; createdAt: string }) | null;
};
type Source = {
  id: string;
  title: string;
  url: string;
  markdown: string;
  label: SourceLabel;
  authority: string;
  retrievedAt: string;
  contentHash: string;
  providerId?: string;
  supportingUrls?: string[];
};
type Task = {
  id: string;
  caseId: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  dueDate: string;
};
type Event = {
  id: string;
  status: string;
  createdAt: string;
  previous?: AssessmentState;
  current?: AssessmentState;
  difference?: string;
  previousSnapshot?: string;
  currentSnapshot?: string;
  assetTag?: string;
  label?: SourceLabel;
  error?: string;
};
type Run = {
  id: string;
  product: string;
  status: string;
  startedAt: string;
  durationMs: number;
  requestCount: number;
  providerId?: string;
  cached?: boolean;
  credits?: number;
  error?: string;
};
type Audit = {
  id: string;
  entityId: string;
  type: string;
  createdAt: string;
  contributedFields?: string[];
  contributions?: Record<string, string>;
  action?: string;
};
type Monitor = {
  id: string;
  url: string;
  providerId?: string;
  label: SourceLabel;
  state: unknown;
  lastCheckedAt?: string;
  version?: string;
};
type Data = {
  inventory: Item[];
  tasks: Task[];
  sources: Source[];
  monitors: Monitor[];
  events: Event[];
  runs: Run[];
  audit: Audit[];
  imports: { id: string; createdAt: string; count: number; mode: string }[];
  health: {
    keyConfigured: boolean;
    webhookConfigured: boolean;
    coverage: string;
  };
};
const names: Record<AssessmentState, string> = {
  affected: 'Affected',
  excluded_by_notice: 'Excluded by notice',
  needs_review: 'Needs review',
  no_relevant_notice_found: 'No relevant notice found',
};
const screenNames = {
  judge: 'Judge Mode',
  inventory: 'Inventory',
  import: 'Import review',
  investigation: 'Investigation',
  results: 'Assessments',
  case: 'Case details',
  evidence: 'Evidence library',
  actions: 'Quarantine & actions',
  monitoring: 'Monitoring',
  health: 'Anakin health',
  settings: 'Settings',
};
type Screen = keyof typeof screenNames;
const time = (s?: string) => (s ? new Date(s).toLocaleString() : 'Not yet');
function Status({ status }: { status?: AssessmentState }) {
  return status ? (
    <span className={`badge ${status}`} title={status}>
      {names[status]}
    </span>
  ) : (
    <span className="badge no_relevant_notice_found">Unassessed</span>
  );
}
function Provenance({ label }: { label?: string | null }) {
  return label ? <span className="provenance">{label}</span> : null;
}
function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v}>
            {v.replaceAll('_', ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Navigation({
  screen,
  navigate,
  ready,
}: {
  screen: Screen;
  navigate: (s: Screen) => void;
  ready: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const nav = [
    ['judge', Play],
    ['inventory', Package],
    ['import', Upload],
    ['investigation', ScanLine],
    ['results', ClipboardList],
    ['evidence', FileSearch],
    ['actions', LockKeyhole],
    ['monitoring', Radio],
    ['health', Activity],
    ['settings', Settings],
  ] as const;
  return (
    <>
      <SidebarHeader>
        <div className="brand">
          <ShieldCheck />
          RecallOps
        </div>
        <div className="nav-label">Safety workspace</div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation" style={{ padding: '0 .7rem' }}>
          {nav.map(([name, Icon]) => (
            <button
              disabled={!ready}
              key={name}
              className={`nav-button ${screen === name ? 'active' : ''}`}
              aria-current={screen === name ? 'page' : undefined}
              onClick={() => {
                navigate(name);
                setOpenMobile(false);
              }}
            >
              <Icon />
              {screenNames[name]}
            </button>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="nav-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} /> Local workspace
          </div>
          <p>Evidence before resale.</p>
          <span>Single operator · US electronics</span>
        </div>
      </SidebarFooter>
    </>
  );
}
export default function Page() {
  const [screen, setScreen] = useState<Screen>('judge'),
    [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState<string>(''),
    [sourceId, setSourceId] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<Inventory[] | null>(null),
    [asin, setAsin] = useState(''),
    [monitorUrl, setMonitorUrl] = useState(
      'https://iniushop.com/pages/recall-b41',
    ),
    [token, setToken] = useState(''),
    [elapsed, setElapsed] = useState(0);
  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  );
  const refresh = useCallback(async () => {
    const res = await fetch('/api/workspace', { headers: headers() });
    const d = (await res.json()) as Data & { error?: string };
    if (!res.ok) throw Error(d.error ?? 'Unable to load workspace');
    setData(d);
    return d as Data;
  }, [headers]);
  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
        refresh().catch(() => {});
      }, 2500);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  function navigate(s: Screen) {
    setScreen(s);
    setError('');
    setMessage('');
    window.scrollTo(0, 0);
  }
  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setElapsed(0);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as {
        error?: string;
        errors?: string[];
        rows?: Inventory[];
        [key: string]: unknown;
      };
      if (!res.ok) throw Error(result.error ?? 'Action failed');
      await refresh();
      if (result.errors?.length) setError(result.errors.join(' · '));
      else setMessage(`${label} completed.`);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
      return null;
    } finally {
      setBusy('');
    }
  }
  async function judge() {
    const result = await act({ action: 'judge' }, 'Judge demo');
    if (result) {
      const d = await refresh();
      setSelected(d.inventory.find((i) => i.assetTag === 'INIU-001')?.id ?? '');
      setScreen('case');
    }
  }
  const item = data?.inventory.find((x) => x.id === selected),
    assessment = item?.assessment,
    source = data?.sources.find(
      (s) => s.id === (sourceId || assessment?.versionId),
    );
  const inventory = data?.inventory ?? [],
    counts = {
      affected: inventory.filter((x) => x.assessment?.status === 'affected')
        .length,
      review: inventory.filter((x) => x.assessment?.status === 'needs_review')
        .length,
      holds: inventory.filter((x) => x.quarantined).length,
    };
  const filtered = inventory.filter(
    (x) =>
      (filter === 'all' || x.assessment?.status === filter) &&
      `${x.assetTag} ${x.title} ${x.model} ${x.serial}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function openItem(x: Item) {
    setSelected(x.id);
    setSourceId('');
    navigate('case');
  }
  async function download(type: string, forItem?: string) {
    try {
      const res = await fetch(
        `/api/export?type=${type}${forItem ? `&itemId=${forItem}` : ''}`,
        { headers: headers() },
      );
      if (!res.ok) throw Error(((await res.json()) as { error: string }).error);
      const blob = await res.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `recallops-${type}.${type === 'packet' ? 'html' : type === 'json' ? 'json' : 'csv'}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Export downloaded.');
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <Navigation
          screen={screen}
          navigate={navigate}
          ready={!!data || !!error}
        />
      </Sidebar>
      <SidebarInset className="main">
        <header className="topbar">
          <div className="actions">
            <SidebarTrigger
              disabled={!data && !error}
              className="hide-desktop"
            />
            <span className="path">Workspace / {screenNames[screen]}</span>
          </div>
          <div className="actions">
            <span
              className={`status-light ${data?.health.keyConfigured ? '' : 'off'}`}
            >
              ● Anakin{' '}
              {data?.health.keyConfigured
                ? 'key configured'
                : 'key not configured'}
            </span>
            <Button
              variant="outline"
              aria-label="Refresh workspace"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              <RefreshCw size={15} />
            </Button>
          </div>
        </header>
        <main className="workspace" id="main-content">
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {message && (
            <div aria-live="polite" className="notice">
              {message}
            </div>
          )}
          {busy && (
            <div aria-live="polite" className="notice">
              <strong>
                {busy} is running · {elapsed}s
              </strong>
              <p>
                Provider calls and completed assessments are saved as they
                finish. Keep this window open.
              </p>
              <div className="progress-line" />
            </div>
          )}
          {!data && !error ? (
            <div aria-label="Loading workspace">
              <Skeleton className="h-12 w-1/2 mb-6" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : null}
          {screen === 'judge' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">RecallOps / Judge Mode</div>
                  <p>
                    An autonomous product-safety agent that prevents recalled
                    products from being resold.
                  </p>
                </div>
                <Provenance label="CONTROLLED_DEMO_FIXTURE" />
              </div>
              <section className="hero">
                <div>
                  <div className="eyebrow">Evidence → decision → action</div>
                  <h1>A recall notice is only the beginning.</h1>
                  <p className="muted">
                    Investigate individual units. See every eligibility
                    condition. Hold affected inventory before it is resold.
                  </p>
                  <div className="actions">
                    <Button disabled={!!busy || !data} onClick={judge}>
                      <Play />
                      Run RecallOps Judge Demo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate('import')}
                    >
                      Import inventory
                      <ArrowUpRight />
                    </Button>
                  </div>
                  <p className="subtext" style={{ marginTop: '1rem' }}>
                    24 sample units · Official INIU recall recordings · Local
                    actions only
                  </p>
                </div>
                <div>
                  {[
                    [
                      '01',
                      'Preserve the notice',
                      'Inspect official source excerpts and version hashes.',
                    ],
                    [
                      '02',
                      'Evaluate every criterion',
                      'Model, serial, color, original purchase and exclusions.',
                    ],
                    [
                      '03',
                      'Make the hold actionable',
                      'Persist quarantine, staff tasks and a remedy packet.',
                    ],
                  ].map(([n, t, d]) => (
                    <div className="workflow-step" key={n}>
                      <span className="step-number">{n}</span>
                      <div>
                        <h3>{t}</h3>
                        <p className="muted">{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="notice warning">
                <strong>Transparent demonstration</strong>
                <p>
                  Judge Mode replays curated evidence through the real
                  deterministic matcher. It does not call Anakin. Open
                  Investigation to run the server-side live path with your key.
                  Unrelated sample products are assessed only against the demo
                  notices.
                </p>
              </div>
              <div className="stats">
                <div className="stat">
                  <strong>{inventory.length}</strong>
                  <span>Units in workspace</span>
                </div>
                <div className="stat red">
                  <strong>{counts.affected}</strong>
                  <span>Affected by a notice</span>
                </div>
                <div className="stat amber">
                  <strong>{counts.review}</strong>
                  <span>Need review</span>
                </div>
                <div className="stat teal">
                  <strong>{counts.holds}</strong>
                  <span>Internal quarantine holds</span>
                </div>
              </div>
            </>
          )}
          {(screen === 'inventory' || screen === 'results') && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Unit-level records</div>
                  <h1>
                    {screen === 'inventory'
                      ? 'Inventory, under watch.'
                      : 'Every decision has a reason.'}
                  </h1>
                  <p>
                    Inspect the individual unit and its source requirements
                    before taking action.
                  </p>
                </div>
                <div className="actions">
                  <Button variant="outline" onClick={() => navigate('import')}>
                    <Plus />
                    Import units
                  </Button>
                  <Button
                    disabled={!!busy || !inventory.length}
                    onClick={() => {
                      navigate('investigation');
                    }}
                  >
                    <ScanLine />
                    Investigate
                  </Button>
                </div>
              </div>
              <div className="toolbar">
                <Input
                  aria-label="Search inventory"
                  placeholder="Search asset, model or serial…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Choice
                  label="Assessment filter"
                  value={filter}
                  onChange={setFilter}
                  options={['all', ...Object.keys(names)]}
                />
                <span className="muted">{filtered.length} units</span>
              </div>
              <section className="panel flush">
                <InventoryTable rows={filtered} onOpen={openItem} />
              </section>
              <p className="muted">
                “No relevant notice found” describes search coverage. It does
                not mean a product is safe.
              </p>
            </>
          )}
          {screen === 'import' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Inventory intake</div>
                  <h1>Review before importing.</h1>
                  <p>
                    One row per physical unit. Original purchase facts must come
                    from the original sale record.
                  </p>
                </div>
                <a href="/sample-inventory.csv" download className="asset-link">
                  Download sample CSV ↓
                </a>
              </div>
              <section className="panel">
                <h2>CSV import</h2>
                <p className="muted">
                  Required: assetTag, title. Up to 1,000 rows and 256 KB.
                  Duplicate asset tags with different values are rejected.
                </p>
                <label className="muted" htmlFor="csv-file">
                  Choose CSV file
                </label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 256000) {
                      setError('CSV exceeds 256 KB');
                      return;
                    }
                    setCsv(await f.text());
                    setPreview(null);
                  }}
                />
                <label htmlFor="csv-text" className="subtext">
                  Or paste CSV
                </label>
                <textarea
                  id="csv-text"
                  className="import-area"
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="assetTag,title,brand,model,serial,color,channel,retailer,purchaseCountry,originalPurchaseDate"
                />
                <div className="actions" style={{ marginTop: 12 }}>
                  <Button
                    disabled={!!busy || !csv}
                    onClick={async () => {
                      const r = await act(
                        { action: 'import', csv, reviewOnly: true },
                        'CSV validation',
                      );
                      if (r?.rows) setPreview(r.rows);
                    }}
                  >
                    Review import
                  </Button>
                  {preview && (
                    <Button
                      disabled={!!busy}
                      onClick={async () => {
                        const r = await act(
                          { action: 'import', csv },
                          'Inventory import',
                        );
                        if (r) {
                          setPreview(null);
                          navigate('inventory');
                        }
                      }}
                    >
                      Import {preview.length} units
                    </Button>
                  )}
                </div>
                {preview && (
                  <div className="notice">
                    <strong>{preview.length} valid rows</strong>
                    <p>
                      {preview
                        .slice(0, 5)
                        .map((x) => `${x.assetTag} · ${x.title}`)
                        .join(' / ')}
                      {preview.length > 5 ? ' …' : ''}
                    </p>
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Manual entry</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget),
                      entry = Object.fromEntries(
                        [...form].filter(([, v]) => v !== ''),
                      );
                    const r = await act(
                      { action: 'manual', item: entry },
                      'Manual import',
                    );
                    if (r) navigate('inventory');
                  }}
                >
                  <div className="field-grid">
                    {[
                      ['assetTag', 'Asset tag'],
                      ['title', 'Product title'],
                      ['brand', 'Brand'],
                      ['model', 'Model'],
                      ['serial', 'Serial number'],
                      ['color', 'Color'],
                      ['channel', 'Original purchase channel'],
                      ['retailer', 'Original seller'],
                      ['purchaseCountry', 'Original sale country (US)'],
                      [
                        'originalPurchaseDate',
                        'Original purchase date (YYYY-MM-DD or YYYY-MM)',
                      ],
                      ['sku', 'SKU'],
                      ['batch', 'Batch'],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <Input
                          name={name}
                          required={['assetTag', 'title'].includes(name)}
                          maxLength={200}
                        />
                      </label>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    disabled={!!busy}
                    style={{ marginTop: 20 }}
                  >
                    Add inventory unit
                  </Button>
                </form>
              </section>
            </>
          )}
          {screen === 'investigation' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Live investigation</div>
                  <h1>Find the facts behind the notice.</h1>
                  <p>
                    Search → official-page extraction → evidence validation →
                    deterministic matching → persisted cases and holds.
                  </p>
                </div>
              </div>
              <section className="panel">
                <h2>Investigate {inventory.length} inventory units</h2>
                <p>{data?.health.coverage}</p>
                <p className="muted">
                  Live investigations process up to eight product groups per
                  run. Unsupported source domains and incomplete investigations
                  remain visible. Only CPSC and INIU official domains are
                  currently approved.
                </p>
                <Button
                  disabled={!!busy || !inventory.length}
                  onClick={() => act({ action: 'scan' }, 'Live investigation')}
                >
                  <ScanLine />
                  Run live Anakin investigation
                </Button>
                {!data?.health.keyConfigured && (
                  <div className="notice warning">
                    Configure ANAKIN_API_KEY server-side in .dev.vars. A missing
                    key will be recorded as an integration failure, with
                    affected records sent to review.
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Recent provider activity</h2>
                <Runs runs={data?.runs ?? []} />
              </section>
            </>
          )}
          {screen === 'case' &&
            (item ? (
              <>
                <div className="head">
                  <div>
                    <button
                      className="asset-link actions"
                      onClick={() => navigate('results')}
                    >
                      <ArrowLeft size={15} />
                      All assessments
                    </button>
                    <div className="eyebrow" style={{ marginTop: 20 }}>
                      Assessment case / {item.assetTag}
                    </div>
                    <h1>{item.title}</h1>
                  </div>
                  <div className="actions">
                    <Button
                      variant="outline"
                      onClick={() => download('packet', item.id)}
                    >
                      <Download />
                      Action packet
                    </Button>
                    <Button
                      disabled={!!busy || item.acknowledged || !item.assessment}
                      onClick={() =>
                        act(
                          { action: 'acknowledge', itemId: item.id },
                          'Case acknowledgment',
                        )
                      }
                    >
                      <Check />
                      {item.acknowledged ? 'Acknowledged' : 'Acknowledge case'}
                    </Button>
                  </div>
                </div>
                <div
                  className={`notice ${assessment?.status === 'affected' ? 'error' : assessment?.status === 'needs_review' ? 'warning' : ''}`}
                >
                  <div className="actions">
                    <Status status={assessment?.status} />
                    <Provenance label={assessment?.label} />
                  </div>
                  <p>
                    <strong>
                      {assessment?.status === 'affected'
                        ? 'Immediate action: stop use and maintain quarantine.'
                        : assessment?.status === 'needs_review'
                          ? 'Review required before a resale decision.'
                          : 'Review this assessment within its notice scope.'}
                    </strong>
                  </p>
                  <p>
                    {assessment?.reason ?? 'This unit has not been assessed.'}
                  </p>
                  {item.quarantined && (
                    <p>
                      <LockKeyhole size={15} style={{ display: 'inline' }} />{' '}
                      Persisted quarantine: this unit is blocked from
                      approved-for-sale exports.
                    </p>
                  )}
                </div>
                <div className="columns">
                  <div>
                    <section className="panel flush">
                      <div className="panel-title">
                        <h2>Eligibility decision table</h2>
                        <span className="count">
                          {assessment?.verified ?? 0} / {assessment?.total ?? 0}{' '}
                          fields verified
                        </span>
                      </div>
                      {assessment?.trace.length ? (
                        <Table className="criterion">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Required criterion</TableHead>
                              <TableHead>Inventory value</TableHead>
                              <TableHead>Source requirement</TableHead>
                              <TableHead>Result</TableHead>
                              <TableHead>Exact source excerpt</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {assessment.trace.map((t, i) => (
                              <TableRow key={`${t.id}-${i}`}>
                                <TableCell>
                                  <strong>
                                    {t.field.replace(
                                      /([a-z])([A-Z])/g,
                                      '$1 $2',
                                    )}
                                  </strong>
                                  {t.exclusion && (
                                    <div className="subtext">
                                      Explicit exclusion
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {t.inventoryValue || 'Not recorded'}
                                </TableCell>
                                <TableCell>
                                  <code>{t.requirement}</code>
                                </TableCell>
                                <TableCell className={`outcome ${t.outcome}`}>
                                  {t.outcome}
                                </TableCell>
                                <TableCell>{t.evidence}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="empty">
                          No applicable rule criteria were available. Inspect
                          investigation scope and errors.
                        </div>
                      )}
                    </section>
                    <section className="panel">
                      <h2>Remedy & proof</h2>
                      <p>
                        {assessment?.rule?.hazard || 'No hazard extracted.'}
                      </p>
                      <p>{assessment?.rule?.immediateAction}</p>
                      <p>{assessment?.rule?.remedy}</p>
                      <ul style={{ paddingLeft: 20, listStyle: 'disc' }}>
                        {assessment?.rule?.proof.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      <p>{assessment?.rule?.contact}</p>
                      {assessment?.rule?.claimUrl?.startsWith('https://') && (
                        <a
                          href={assessment.rule.claimUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="asset-link"
                        >
                          Official remedy instructions ↗
                        </a>
                      )}
                      <p className="subtext">
                        No customer message, claim, disposal or refund
                        submission is performed automatically.
                      </p>
                    </section>
                  </div>
                  <aside>
                    <section className="panel">
                      <h2>Unit identity</h2>
                      <div className="identity">
                        <div className="product-icon">
                          <Package />
                        </div>
                        <div>
                          <strong>
                            {item.brand} {item.model}
                          </strong>
                          <p className="hash">SN {item.serial || 'Missing'}</p>
                          <span className="subtext">{item.assetTag}</span>
                        </div>
                      </div>
                      <p className="subtext">
                        Original seller: {item.retailer || 'Unknown'}
                        <br />
                        Original channel: {item.channel || 'Unknown'}
                        <br />
                        Original purchase:{' '}
                        {item.originalPurchaseDate || 'Unknown'}
                        <br />
                        Sale country: {item.purchaseCountry || 'Unknown'}
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Evidence provenance</h2>
                      <p>
                        <Provenance label={assessment?.label} />
                      </p>
                      <p className="subtext">
                        Authority:{' '}
                        {data?.sources.find(
                          (s) => s.id === assessment?.versionId,
                        )?.authority ?? 'No source retrieved'}
                      </p>
                      <p className="subtext">
                        Retrieved:{' '}
                        {time(
                          data?.sources.find(
                            (s) => s.id === assessment?.versionId,
                          )?.retrievedAt,
                        )}
                      </p>
                      <Button
                        variant="outline"
                        disabled={!assessment?.versionId}
                        onClick={() => {
                          setSourceId(assessment?.versionId ?? '');
                          navigate('evidence');
                        }}
                      >
                        <FileSearch />
                        Inspect source version
                      </Button>
                    </section>
                    <section className="panel">
                      <h2>Case timeline</h2>
                      <Timeline
                        events={(data?.audit ?? []).filter(
                          (x) => x.entityId === item.id,
                        )}
                      />
                    </section>
                  </aside>
                </div>
              </>
            ) : (
              <div className="empty">
                <p>Select an inventory unit to inspect its case.</p>
                <Button onClick={() => navigate('inventory')}>
                  Open inventory
                </Button>
              </div>
            ))}
          {screen === 'evidence' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Preserved source documents</div>
                  <h1>Inspect the evidence.</h1>
                  <p>
                    Source versions are identified by URL and content hash.
                    Quotations are displayed as untrusted text.
                  </p>
                </div>
              </div>
              <div className="columns">
                <div>
                  <section className="panel">
                    {source ? (
                      <>
                        <Provenance label={source.label} />
                        <h2 style={{ marginTop: 15 }}>{source.title}</h2>
                        <p>
                          <a
                            href={
                              source.url.startsWith('https://recallops.invalid')
                                ? undefined
                                : source.url
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.url}
                          </a>
                        </p>
                        <p className="subtext">
                          {source.authority} · Retrieved{' '}
                          {time(source.retrievedAt)} · Provider job{' '}
                          {source.providerId ?? 'Not available in recording'}
                        </p>
                        <p className="hash">SHA-256 {source.contentHash}</p>
                        {source.supportingUrls?.map((u) => (
                          <p key={u}>
                            <a href={u} target="_blank" rel="noreferrer">
                              Supporting source: {u}
                            </a>
                          </p>
                        ))}
                        <pre className="source-text">{source.markdown}</pre>
                      </>
                    ) : (
                      <div className="empty">
                        Select a source version. Run an investigation to
                        preserve evidence.
                      </div>
                    )}
                  </section>
                </div>
                <aside>
                  <section className="panel">
                    <h2>Version history</h2>
                    {data?.sources.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: '1rem 0',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <button
                          className="asset-link"
                          onClick={() => setSourceId(s.id)}
                        >
                          {s.title}
                        </button>
                        <p className="subtext">{time(s.retrievedAt)}</p>
                        <Provenance label={s.label} />
                      </div>
                    ))}
                  </section>
                </aside>
              </div>
            </>
          )}
          {screen === 'actions' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Quarantine & action center</div>
                  <h1>Make the next step explicit.</h1>
                  <p>
                    {counts.holds} units on internal hold. Acknowledgment never
                    releases a quarantine.
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="actions">
                  <Button onClick={() => download('holds')}>
                    <Download />
                    CSV hold list
                  </Button>
                  <Button variant="outline" onClick={() => download('packet')}>
                    Remedy packet
                  </Button>
                  <Button variant="outline" onClick={() => download('sales')}>
                    Customer manifest
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => download('approved')}
                  >
                    Approved-for-sale export
                  </Button>
                  <Button variant="outline" onClick={() => download('json')}>
                    JSON audit data
                  </Button>
                </div>
                <p className="subtext">
                  Sale exports require operator acknowledgment, an
                  excluded/no-notice assessment, and no quarantine. They do not
                  certify safety. Customer contacts are drafts only.
                </p>
              </section>
              <section className="panel flush">
                <div className="panel-title">
                  <h2>Quarantined inventory</h2>
                  <span className="count">{counts.holds}</span>
                </div>
                <InventoryTable
                  rows={inventory.filter((x) => x.quarantined)}
                  onOpen={openItem}
                />
              </section>
              <section className="panel">
                <h2>Staff tasks</h2>
                {data?.tasks.length ? (
                  data.tasks.map((t) => (
                    <TaskRow
                      key={`${t.id}-${t.status}`}
                      task={t}
                      disabled={!!busy}
                      save={(v) =>
                        act(
                          { action: 'task', taskId: t.id, ...v },
                          'Task update',
                        )
                      }
                    />
                  ))
                ) : (
                  <p className="muted">
                    Tasks are created when a unit is affected or needs review.
                  </p>
                )}
              </section>
            </>
          )}
          {screen === 'monitoring' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Source changes & reassessment</div>
                  <h1>A change starts a new investigation.</h1>
                  <p>
                    Changes preserve evidence and rerun extraction and matching
                    before updating a case.
                  </p>
                </div>
                <Button
                  disabled={
                    !!busy || !inventory.some((i) => i.assetTag === 'MON-001')
                  }
                  onClick={() =>
                    act(
                      { action: 'controlled_change' },
                      'Controlled source change',
                    )
                  }
                >
                  <Play />
                  Run controlled change A → B
                </Button>
              </div>
              <div className="notice">
                <Provenance label="CONTROLLED_DEMO_FIXTURE" />
                <p>
                  The test notice first excludes MON-001. Version B includes its
                  serial and adds a required batch. The missing batch sends the
                  sample to review. This notice is synthetic.
                </p>
              </div>
              <section className="panel">
                <h2>Live official-source monitor</h2>
                <p className="muted">
                  New monitors are paused to avoid recurring credit consumption.
                  “Run now” performs an actual provider check and re-extracts
                  the source. Scheduled activation is available in Anakin after
                  reviewing the interval.
                </p>
                <div className="toolbar">
                  <Input
                    aria-label="Official monitor URL"
                    value={monitorUrl}
                    onChange={(e) => setMonitorUrl(e.target.value)}
                  />
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      act(
                        { action: 'monitor_create', url: monitorUrl },
                        'Monitor creation',
                      )
                    }
                  >
                    Create Anakin monitor
                  </Button>
                </div>
                {data?.monitors.map((m) => (
                  <div key={m.id} className="notice">
                    <div className="actions">
                      <Provenance label={m.label} />
                      <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() =>
                          act(
                            { action: 'monitor_run', monitorId: m.id },
                            'Monitor run',
                          )
                        }
                      >
                        Run now
                      </Button>
                    </div>
                    <p className="hash">{m.url}</p>
                    <p className="subtext">
                      Provider ID: {m.providerId || 'Local controlled fixture'}{' '}
                      · Last checked: {time(m.lastCheckedAt)}
                    </p>
                    <details>
                      <summary>Monitor state</summary>
                      <pre className="source-text">
                        {JSON.stringify(m.state, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </section>
              <section className="panel">
                <div className="actions">
                  <h2>Change history</h2>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      act({ action: 'retry_events' }, 'Event retry')
                    }
                  >
                    Retry pending / failed events
                  </Button>
                </div>
                {data?.events.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: '1.2rem 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div className="actions">
                      <Provenance label={e.label} />
                      <span>
                        {e.assetTag ?? 'Live source event'} · {e.status}
                      </span>
                      <span className="subtext">{time(e.createdAt)}</span>
                    </div>
                    <p>
                      <strong>
                        {e.difference ??
                          'Source changed. Fresh extraction and deterministic reassessment queued.'}
                      </strong>
                    </p>
                    {e.previous && (
                      <div className="actions">
                        <Status status={e.previous} />
                        <span>→</span>
                        <Status status={e.current} />
                      </div>
                    )}
                    {e.currentSnapshot && (
                      <div className="monitor-diff">
                        <section>
                          <h3>Previous snapshot</h3>
                          <p>{e.previousSnapshot ?? 'Initial baseline'}</p>
                        </section>
                        <section>
                          <h3>Current snapshot</h3>
                          <p>{e.currentSnapshot}</p>
                        </section>
                      </div>
                    )}
                    {e.error && <p className="danger-action">{e.error}</p>}
                  </div>
                ))}
              </section>
            </>
          )}
          {screen === 'health' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Integration observability</div>
                  <h1>See what actually ran.</h1>
                  <p>
                    Server-side application calls only. Connected-tool research
                    is not counted as a successful app integration.
                  </p>
                </div>
              </div>
              <div
                className={`notice ${data?.health.keyConfigured ? '' : 'warning'}`}
              >
                Anakin API key:{' '}
                <strong>
                  {data?.health.keyConfigured
                    ? 'Configured server-side'
                    : 'Missing — set ANAKIN_API_KEY in .dev.vars'}
                </strong>
                <br />
                Public webhook origin:{' '}
                {data?.health.webhookConfigured
                  ? 'Configured'
                  : 'Not configured; local controlled monitoring remains available'}
              </div>
              <div className="health-grid">
                {['Search', 'Scraper', 'Wire', 'Monitoring'].map((product) => {
                  const runs =
                      data?.runs.filter((r) => r.product === product) ?? [],
                    last = runs.find((r) => r.status === 'success');
                  return (
                    <section className="panel health-card" key={product}>
                      <h3>
                        {product}
                        <span
                          className={last ? 'status-light' : 'status-light off'}
                        >
                          {last ? 'Verified call' : 'Unverified'}
                        </span>
                      </h3>
                      <dl>
                        <dt>Latest status</dt>
                        <dd>{runs[0]?.status ?? 'Not called'}</dd>
                        <dt>Last success</dt>
                        <dd>{time(last?.startedAt)}</dd>
                        <dt>Last response time</dt>
                        <dd>
                          {last ? `${last.durationMs} ms` : 'Unavailable'}
                        </dd>
                        <dt>Observed requests</dt>
                        <dd>{runs.reduce((s, r) => s + r.requestCount, 0)}</dd>
                        <dt>Reported credits</dt>
                        <dd>
                          {runs.some((r) => r.credits !== undefined)
                            ? runs.reduce((s, r) => s + (r.credits ?? 0), 0)
                            : 'Not returned'}
                        </dd>
                      </dl>
                    </section>
                  );
                })}
              </div>
              <section className="panel">
                <h2>Call log</h2>
                <Runs runs={data?.runs ?? []} />
              </section>
            </>
          )}
          {screen === 'settings' && (
            <>
              <div className="head">
                <div>
                  <div className="eyebrow">Workspace configuration</div>
                  <h1>Explicit boundaries.</h1>
                  <p>
                    Local demo operator. Server-side credentials. Internal
                    inventory actions.
                  </p>
                </div>
              </div>
              <section className="panel">
                <h2>Server configuration</h2>
                <p>
                  Copy <code className="inline-code">.env.example</code> to{' '}
                  <code className="inline-code">.dev.vars</code> and set{' '}
                  <code className="inline-code">ANAKIN_API_KEY</code>. Restart
                  the server. Never commit the file.
                </p>
                <p>
                  For a deployed instance, set PUBLIC_BASE_URL and
                  OPERATOR_TOKEN. No site is deployed by this repository
                  automatically.
                </p>
                <label htmlFor="operator-token">
                  Operator access token (remote instance only)
                </label>
                <div className="toolbar">
                  <Input
                    id="operator-token"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Used only in this tab's memory"
                  />
                </div>
              </section>
              <section className="panel">
                <h2>Amazon Wire enrichment</h2>
                <p>
                  Open a unit case first, then run the discovered Amazon
                  product-details read action. Marketplace identifiers and
                  product URLs are retained in the case audit; serial numbers
                  are never inferred.
                </p>
                <p>
                  Selected unit:{' '}
                  <strong>
                    {item?.assetTag ?? 'None — select a unit in Inventory'}
                  </strong>
                </p>
                <div className="toolbar">
                  <Input
                    aria-label="Amazon ASIN"
                    maxLength={10}
                    value={asin}
                    onChange={(e) => setAsin(e.target.value)}
                    placeholder="10-character ASIN"
                  />
                  <Button
                    disabled={!!busy || !item || asin.length !== 10}
                    onClick={() =>
                      act(
                        { action: 'wire', itemId: item?.id, asin },
                        'Wire enrichment',
                      )
                    }
                  >
                    Enrich with Anakin Wire
                  </Button>
                </div>
                {data?.audit
                  .filter(
                    (a) =>
                      a.entityId === item?.id && a.type === 'wire.enrichment',
                  )
                  .map((a) => (
                    <div className="notice" key={a.id}>
                      <strong>
                        {a.action} · {time(a.createdAt)}
                      </strong>
                      <pre>{JSON.stringify(a.contributions, null, 2)}</pre>
                    </div>
                  ))}
              </section>
              <section className="panel">
                <h2>Safety boundaries</h2>
                <p>
                  Only <code>affected</code> assessments automatically
                  quarantine. Excluded and no-notice assessments describe notice
                  scope. Missing facts, source conflicts and unsupported rules
                  require review.
                </p>
                <p>
                  The current domain allowlist supports CPSC and INIU.
                  Authentication, additional manufacturers, distributed job
                  scheduling and production multi-tenancy require further
                  release work.
                </p>
              </section>
            </>
          )}
          <p className="footer-note">
            RecallOps provides evidence-backed decision support. It does not
            provide legal advice, regulatory certification, or a guarantee that
            a product is safe. No external claim, customer contact or disposal
            action is submitted automatically.
          </p>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
function InventoryTable({
  rows,
  onOpen,
}: {
  rows: Item[];
  onOpen: (x: Item) => void;
}) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Inventory unit</TableHead>
          <TableHead>Model / serial</TableHead>
          <TableHead>Assessment</TableHead>
          <TableHead>Inventory hold</TableHead>
          <TableHead>Evidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((x) => (
          <TableRow key={x.id}>
            <TableCell>
              <button className="asset-link" onClick={() => onOpen(x)}>
                {x.assetTag}
              </button>
              <div className="subtext">{x.title}</div>
            </TableCell>
            <TableCell>
              {x.model || 'Not recorded'}
              <div className="subtext">SN {x.serial || 'Missing'}</div>
            </TableCell>
            <TableCell>
              <Status status={x.assessment?.status} />
            </TableCell>
            <TableCell>
              {x.quarantined ? (
                <span className="danger-action">● Quarantined</span>
              ) : x.assessment?.status === 'needs_review' ? (
                'Review required'
              ) : (
                'No internal hold'
              )}
            </TableCell>
            <TableCell>
              <Provenance label={x.assessment?.label} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <div className="empty">
      <Package />
      <h3>No units in this view</h3>
      <p>Import inventory or run the Judge demo to begin.</p>
    </div>
  );
}
function Timeline({ events }: { events: Audit[] }) {
  return (
    <ol className="timeline">
      {events.slice(0, 12).map((e) => (
        <li key={e.id}>
          <time>{time(e.createdAt)}</time>
          <strong>{e.type.replaceAll('.', ' / ').replaceAll('_', ' ')}</strong>
        </li>
      ))}
    </ol>
  );
}
function Runs({ runs }: { runs: Run[] }) {
  return runs.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Detail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.product}</TableCell>
            <TableCell>{r.status}</TableCell>
            <TableCell>{time(r.startedAt)}</TableCell>
            <TableCell>{r.durationMs} ms</TableCell>
            <TableCell style={{ whiteSpace: 'normal' }}>
              {r.error ?? r.providerId ?? 'Provider ID not returned'}
              {r.cached !== undefined && <div>Cache: {String(r.cached)}</div>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <p className="muted">
      No application provider calls recorded. Controlled Judge Mode does not
      create live integration successes.
    </p>
  );
}
function TaskRow({
  task,
  disabled,
  save,
}: {
  task: Task;
  disabled: boolean;
  save: (v: Record<string, string>) => Promise<unknown>;
}) {
  const [owner, setOwner] = useState(task.owner),
    [status, setStatus] = useState(task.status),
    [dueDate, setDate] = useState(task.dueDate),
    [priority, setPriority] = useState(task.priority);
  return (
    <div className="task-row">
      <strong style={{ fontSize: 14 }}>{task.title}</strong>
      <Input
        aria-label={`Owner for ${task.title}`}
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      />
      <Input
        aria-label={`Due date for ${task.title}`}
        type="date"
        value={dueDate}
        onChange={(e) => setDate(e.target.value)}
      />
      <Choice
        label={`Status for ${task.title}`}
        value={status}
        options={['open', 'in_progress', 'done']}
        onChange={setStatus}
      />
      <Choice
        label={`Priority for ${task.title}`}
        value={priority}
        options={['urgent', 'high', 'normal']}
        onChange={setPriority}
      />
      <Button
        variant="outline"
        disabled={disabled || !owner || !dueDate}
        onClick={() => save({ owner, status, dueDate, priority })}
      >
        Save task
      </Button>
    </div>
  );
}
