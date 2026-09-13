'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
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
  LayoutDashboard,
  Search,
  X,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
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
import { useIsMobile } from '@/hooks/use-mobile';
import {
  normalize,
  normalizeModel,
  type Inventory,
  type AssessmentState,
} from '@/lib/core/rules';
import { MAX_CSV_BYTES, MAX_ROWS } from '@/lib/core/csv';
import { investigationLimits } from '@/lib/core/runtime-policy';
import {
  WorkspaceSignIn,
  type WorkspaceSession,
} from '@/components/workspace-sign-in';
import {
  WorkspaceSettings,
  type WorkspaceDensity,
} from '@/components/workspace-settings';
import { WorkspaceOverview } from '@/components/workspace-overview';
import {
  assessmentNames as names,
  filterInventory,
  formatTime as time,
} from '@/lib/ui/workspace';
import type { Item, Task, Run, Audit, Data } from '@/lib/ui/workspace';
const screenNames = {
  overview: 'Overview',
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
const INVENTORY_PAGE_SIZE = 20;
function Status({ status }: { status?: AssessmentState }) {
  return status ? (
    <span className={`badge ${status}`} title={status}>
      {names[status]}
    </span>
  ) : (
    <span className="badge unassessed">Unassessed</span>
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
  labels,
  id,
  disabled,
}: {
  id?: string;
  disabled?: boolean;
  labels?: Record<string, string>;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
    >
      <SelectTrigger id={id} aria-label={label}>
        <SelectValue>
          {labels?.[value] ?? value.replaceAll('_', ' ')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v}>
            {labels?.[v] ?? v.replaceAll('_', ' ')}
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
  data,
}: {
  data: Data | null;
  screen: Screen;
  navigate: (s: Screen) => void;
  ready: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const nav = [
    ['overview', LayoutDashboard],
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
        <Link href="/" className="nav-button">
          Official recall catalogue <ArrowUpRight size={16} />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation" style={{ padding: '0 .7rem' }}>
          {nav
            .filter(([name]) => name !== 'judge' || data?.demo.enabled)
            .map(([name, Icon]) => (
              <button
                disabled={!ready}
                key={name}
                className={`nav-button ${screen === name ? 'active' : ''}`}
                aria-label={screenNames[name]}
                aria-current={screen === name ? 'page' : undefined}
                onClick={() => {
                  navigate(name);
                  setOpenMobile(false);
                }}
              >
                <Icon />
                <span>{screenNames[name]}</span>
                {data && name === 'inventory' && (
                  <span className="nav-count">{data.inventory.length}</span>
                )}
                {data && name === 'actions' && (
                  <span className="nav-count">
                    {data.inventory.filter((item) => item.quarantined).length}
                  </span>
                )}
              </button>
            ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="nav-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} /> Operator workspace
          </div>
          <p>Evidence before resale.</p>
          <span>Single operator · US electronics</span>
        </div>
      </SidebarFooter>
    </>
  );
}
export default function Page() {
  const isMobile = useIsMobile();
  const [requestedScreen, setScreen] = useState<Screen>('overview'),
    [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState<string>(''),
    [sourceId, setSourceId] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [issues, setIssues] = useState<string[]>([]),
    [message, setMessage] = useState(''),
    [search, updateSearch] = useState(''),
    [filter, updateFilter] = useState('all'),
    [sort, updateSort] = useState('priority'),
    [page, setPage] = useState(1),
    [routeReady, setRouteReady] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [connectionError, setConnectionError] = useState(''),
    [lastUpdated, setLastUpdated] = useState(''),
    [reviewedCsv, setReviewedCsv] = useState(''),
    [investigationGroup, setInvestigationGroup] = useState('all'),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<Inventory[] | null>(null),
    [asinDraft, setAsinDraft] = useState<{
      itemId: string;
      value: string;
    } | null>(null),
    [monitorUrl, setMonitorUrl] = useState(''),
    [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [density, setDensity] = useState<WorkspaceDensity>('comfortable');
  const screen: Screen =
    requestedScreen === 'judge' && data && !data.demo.enabled
      ? 'overview'
      : requestedScreen;
  const asin = asinDraft?.itemId === selected ? asinDraft.value : '';
  const sessionGeneration = useRef(0);
  const csvReadGeneration = useRef(0);
  const fetchGeneration = useRef(0);
  const requestsInFlight = useRef(0);
  function setSearch(value: string) {
    updateSearch(value);
    setPage(1);
  }
  function setFilter(value: string) {
    updateFilter(value);
    setPage(1);
  }
  function setSort(value: string) {
    updateSort(value);
    setPage(1);
  }
  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json' }),
    [],
  );
  const clearWorkspace = useCallback(() => {
    fetchGeneration.current++;
    setData(null);
    setLastUpdated('');
    setRefreshing(false);
    setBusy('');
    setSelected('');
    setSourceId('');
    updateSearch('');
    updateFilter('all');
    setInvestigationGroup('all');
    setScreen('overview');
    setCsv('');
    setPreview(null);
    setReviewedCsv('');
    setAsinDraft(null);
    csvReadGeneration.current++;
    setMonitorUrl('');
    setError('');
    setIssues([]);
    setMessage('');
    setConnectionError('');
  }, []);
  const expireSession = useCallback(() => {
    sessionGeneration.current++;
    clearWorkspace();
    setSession((current) => ({
      authenticated: false,
      mode: current?.mode ?? 'operator',
    }));
    setSessionError('Your session has ended. Sign in again to continue.');
  }, [clearWorkspace]);
  const checkSession = useCallback(async () => {
    const generation = ++sessionGeneration.current;
    setSessionError('');
    try {
      const res = await fetch('/api/session', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok)
        throw Error('Unable to check workspace access. Please try again.');
      const next = (await res.json()) as WorkspaceSession;
      if (
        typeof next.authenticated !== 'boolean' ||
        !['local', 'operator', 'unconfigured'].includes(next.mode)
      )
        throw Error('Unable to check workspace access. Please try again.');
      if (generation === sessionGeneration.current) setSession(next);
    } catch (e) {
      if (generation === sessionGeneration.current)
        setSessionError(
          e instanceof Error ? e.message : 'Unable to check workspace access.',
        );
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(checkSession);
  }, [checkSession]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem('recallops-density') === 'compact')
          setDensity('compact');
      } catch {
        /* Preferences are optional. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function changeDensity(value: WorkspaceDensity) {
    setDensity(value);
    try {
      localStorage.setItem('recallops-density', value);
    } catch {
      /* Keep the current tab usable if storage is unavailable. */
    }
  }
  async function signIn(key: string) {
    setSigningIn(true);
    setSessionError('');
    sessionGeneration.current++;
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: headers(),
        body: JSON.stringify({ token: key }),
      });
      const next = (await res.json()) as WorkspaceSession & { error?: string };
      if (!res.ok)
        throw Error(next.error ?? 'Unable to sign in. Please try again.');
      setSession(next as WorkspaceSession);
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  }
  async function signOut() {
    setSigningOut(true);
    sessionGeneration.current++;
    try {
      const res = await fetch('/api/session', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const next = (await res.json()) as WorkspaceSession & { error?: string };
      if (!res.ok)
        throw Error(next.error ?? 'Unable to sign out. Please try again.');
      clearWorkspace();
      setSession(next as WorkspaceSession);
      setSessionError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign out.');
    } finally {
      setSigningOut(false);
    }
  }
  const refresh = useCallback(async () => {
    const generation = ++fetchGeneration.current;
    requestsInFlight.current++;
    setRefreshing(true);
    try {
      const res = await fetch('/api/workspace', { headers: headers() });
      const d = (await res.json()) as Data & { error?: string };
      if (res.status === 401) {
        if (generation === fetchGeneration.current) expireSession();
        throw Error('Sign in to continue.');
      }
      if (!res.ok) throw Error(d.error ?? 'Unable to load workspace');
      if (generation === fetchGeneration.current) {
        setData(d);
        setLastUpdated(new Date().toISOString());
        setConnectionError('');
      }
      return d as Data;
    } catch (e) {
      if (generation === fetchGeneration.current)
        setConnectionError(
          e instanceof Error ? e.message : 'Unable to refresh',
        );
      throw e;
    } finally {
      requestsInFlight.current--;
      if (generation === fetchGeneration.current) setRefreshing(false);
    }
  }, [headers, expireSession]);
  useEffect(() => {
    if (!session?.authenticated) return;
    void Promise.resolve()
      .then(refresh)
      .catch(() => {});
  }, [refresh, session?.authenticated]);
  useEffect(() => {
    const restore = () => {
      const state = new URLSearchParams(window.location.hash.slice(1));
      const view = state.get('view') ?? 'overview';
      setScreen(
        Object.hasOwn(screenNames, view) ? (view as Screen) : 'overview',
      );
      setSelected(state.get('item') ?? '');
      setSourceId(state.get('source') ?? '');
      const status = state.get('filter') ?? 'all';
      setFilter(
        ['all', 'unassessed', 'quarantined', ...Object.keys(names)].includes(
          status,
        )
          ? status
          : 'all',
      );
      setSearch(state.get('q') ?? '');
      setRouteReady(true);
    };
    const frame = requestAnimationFrame(restore);
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, []);
  useEffect(() => {
    if (!routeReady) return;
    const state = new URLSearchParams({ view: screen });
    if (selected) state.set('item', selected);
    if (sourceId) state.set('source', sourceId);
    if (filter !== 'all') state.set('filter', filter);
    if (search) state.set('q', search);
    window.history.replaceState(null, '', '#' + state.toString());
  }, [routeReady, screen, selected, sourceId, filter, search]);
  useEffect(() => {
    if (busy || !session?.authenticated) return;
    const update = () => {
      if (document.visibilityState === 'visible' && !requestsInFlight.current)
        void refresh().catch(() => {});
    };
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [busy, refresh, session?.authenticated]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [screen]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(),
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
        if (!requestsInFlight.current) void refresh().catch(() => {});
      }, 2500);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  function navigate(s: Screen) {
    window.history.pushState(
      null,
      '',
      '#' +
        new URLSearchParams({
          view: s,
          item: selected,
          source: sourceId,
          filter,
          q: search,
        }).toString(),
    );
    setScreen(s);
    setError('');
    setIssues([]);
    setMessage('');
    window.scrollTo(0, 0);
  }
  async function act(body: Record<string, unknown>, label: string) {
    const generation = sessionGeneration.current;
    setBusy(label);
    setElapsed(0);
    setError('');
    setIssues([]);
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
        task?: Task;
        [key: string]: unknown;
      };
      // Requests can finish after sign-out or a new session has begun.
      if (generation !== sessionGeneration.current) return null;
      if (!res.ok) {
        if (res.status === 401) {
          expireSession();
          return null;
        }
        if (res.status === 409) await refresh().catch(() => {});
        throw Error(result.error ?? 'Action failed');
      }
      if (result.task) {
        const savedTask = result.task;
        setData((current) =>
          current
            ? {
                ...current,
                tasks: current.tasks.map((task) =>
                  task.id === savedTask.id ? savedTask : task,
                ),
              }
            : current,
        );
      }
      // A confirmed mutation remains successful even if its follow-up read fails.
      await refresh().catch(() => {});
      if (generation !== sessionGeneration.current) return null;
      if (result.errors?.length) {
        const unique = [...new Set(result.errors)];
        setError(
          `${unique.length} investigation issue${unique.length === 1 ? '' : 's'} need review. Completed work has been saved.`,
        );
        setIssues(unique);
      } else if (typeof result.message === 'string') setMessage(result.message);
      else setMessage(`${label} completed.`);
      return result;
    } catch (e) {
      if (generation === sessionGeneration.current)
        setError(e instanceof Error ? e.message : 'Action failed');
      return null;
    } finally {
      if (generation === sessionGeneration.current) setBusy('');
    }
  }
  async function judge() {
    const result = await act({ action: 'judge' }, 'Judge demo');
    if (result) {
      setSourceId('');
      setSelected(
        typeof result.selectedItemId === 'string' ? result.selectedItemId : '',
      );
      navigate('case');
    }
  }
  const item = data?.inventory.find((x) => x.id === selected),
    assessment = item?.assessment,
    source = data?.sources.find(
      (s) =>
        s.id === (sourceId || assessment?.versionId || data.sources[0]?.id),
    );
  const inventory = data?.inventory ?? [],
    counts = {
      affected: inventory.filter((x) => x.assessment?.status === 'affected')
        .length,
      review: inventory.filter((x) => x.assessment?.status === 'needs_review')
        .length,
      holds: inventory.filter((x) => x.quarantined).length,
    };
  const filtered = filterInventory(inventory, search, filter, sort);
  const pages = Math.max(1, Math.ceil(filtered.length / INVENTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visibleRows = filtered.slice(
    (currentPage - 1) * INVENTORY_PAGE_SIZE,
    currentPage * INVENTORY_PAGE_SIZE,
  );
  function applyFilter(value: string) {
    setFilter(value);
    setSearch('');
    setSort('priority');
    navigate('inventory');
  }
  const productGroupMap = new Map<
    string,
    { key: string; label: string; itemIds: string[] }
  >();
  for (const record of inventory) {
    const key = JSON.stringify([
      normalize(record.brand ?? ''),
      normalizeModel(record.model ?? ''),
    ]);
    const group = productGroupMap.get(key) ?? {
      key,
      label: `${record.brand || 'Unknown brand'} · ${record.model || 'Unknown model'}`,
      itemIds: [],
    };
    group.itemIds.push(record.id);
    productGroupMap.set(key, group);
  }
  const productGroups = [...productGroupMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const limits = data?.health.investigationLimits ?? investigationLimits;
  const selectedInvestigationGroup = productGroupMap.get(investigationGroup);
  const investigationCount =
    investigationGroup === 'all'
      ? inventory.length
      : (selectedInvestigationGroup?.itemIds.length ?? 0);
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
      if (res.status === 401) {
        expireSession();
        return;
      }
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

  if (!session?.authenticated)
    return (
      <WorkspaceSignIn
        checking={!session && !sessionError}
        unavailable={session?.mode === 'unconfigured'}
        error={sessionError}
        submitting={signingIn}
        onSubmit={signIn}
        onRetry={() => void checkSession()}
      />
    );

  return (
    <SidebarProvider>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const content = document.getElementById('main-content');
          content?.focus();
          content?.scrollIntoView({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <Sidebar>
        <Navigation
          screen={screen}
          navigate={navigate}
          ready={!!data || !!error || !!connectionError}
          data={data}
        />
      </Sidebar>
      <SidebarInset className="main">
        <header className="topbar">
          <div className="actions">
            <SidebarTrigger
              disabled={!data && !error && !connectionError}
              className="hide-desktop"
            />
            <span className="path">Workspace / {screenNames[screen]}</span>
          </div>
          <div className="actions">
            <span
              className={`status-light ${data?.health.keyConfigured ? '' : 'off'}`}
            >
              ● Anakin{' '}
              {!data
                ? 'connecting…'
                : data.health.keyConfigured
                  ? 'key configured'
                  : 'key not configured'}
            </span>
            <span
              className="last-sync"
              title={lastUpdated ? time(lastUpdated) : undefined}
            >
              {refreshing
                ? 'Syncing workspace…'
                : lastUpdated
                  ? 'Updated ' +
                    new Date(lastUpdated).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Connecting…'}
            </span>
            <Button
              variant="outline"
              disabled={refreshing}
              aria-label="Refresh workspace"
              onClick={() => void refresh().catch(() => {})}
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            </Button>
          </div>
        </header>
        <div
          className={`workspace ${density === 'compact' ? 'workspace-density-compact' : ''}`}
          id="main-content"
          tabIndex={-1}
        >
          {connectionError && (
            <div role="alert" className="notice error connection-notice">
              <div>
                <strong>
                  {data ? 'Connection interrupted' : 'Workspace unavailable'}
                </strong>
                <p>
                  {data ? 'Showing the last received records. ' : ''}
                  {connectionError}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={refreshing}
                onClick={() => void refresh().catch(() => {})}
              >
                Retry connection
              </Button>
              {!data && session.mode === 'operator' && (
                <Button
                  variant="ghost"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="notice error">
              {error}
              {issues.length > 0 && (
                <details className="issue-details">
                  <summary>Review investigation details</summary>
                  <ul>
                    {issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </details>
              )}
              <button
                aria-label="Dismiss error"
                className="dismiss-notice"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div aria-live="polite" className="notice">
              {message}
              <button
                aria-label="Dismiss notification"
                className="dismiss-notice"
                onClick={() => setMessage('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div aria-live="polite" className="notice">
              <strong className="busy-heading">
                <LoaderCircle className="spin" size={18} />
                {busy} is running · {elapsed}s
              </strong>
              <p>
                Provider calls and completed assessments are saved as they
                finish. Keep this window open.
              </p>
              <div className="progress-line" />
            </div>
          )}
          {!data && !connectionError && !error ? (
            <div aria-label="Loading workspace">
              <Skeleton className="h-12 w-1/2 mb-6" />
              <Skeleton className="h-80 w-full" />
            </div>
          ) : null}
          {(data || screen === 'settings') && (
            <>
              {screen === 'overview' && data && (
                <WorkspaceOverview
                  data={data}
                  openItem={openItem}
                  navigate={navigate}
                  filter={applyFilter}
                  judge={judge}
                  busy={!!busy}
                />
              )}
              {screen === 'judge' && data?.demo.enabled && (
                <>
                  <div className="head">
                    <div>
                      <div className="eyebrow">RecallOps / Judge Mode</div>
                      <p>
                        An autonomous product-safety agent that prevents
                        recalled products from being resold.
                      </p>
                    </div>
                    <Provenance label="CONTROLLED_DEMO_FIXTURE" />
                  </div>
                  <section className="hero">
                    <div>
                      <div className="eyebrow">
                        Evidence → decision → action
                      </div>
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
                        {data?.demo.sampleCount} sample units ·{' '}
                        {data?.demo.subject} recordings · Local actions only
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
                      Investigation to run the server-side live path with your
                      key. Unrelated sample products are assessed only against
                      the demo notices.
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
                      <Button
                        variant="outline"
                        onClick={() => navigate('import')}
                      >
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
                      placeholder="Search asset, brand, model, serial…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Choice
                      label="Assessment filter"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        'all',
                        ...Object.keys(names),
                        'unassessed',
                        'quarantined',
                      ]}
                      labels={{
                        all: 'All assessments',
                        ...names,
                        unassessed: 'Unassessed',
                        quarantined: 'Quarantined',
                      }}
                    />
                    <Choice
                      label="Sort inventory"
                      value={sort}
                      onChange={setSort}
                      options={['priority', 'asset', 'recent']}
                      labels={{
                        priority: 'Priority first',
                        asset: 'Asset tag',
                        recent: 'Recently assessed',
                      }}
                    />
                    {(search || filter !== 'all') && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSearch('');
                          setFilter('all');
                        }}
                      >
                        <X size={15} />
                        Clear filters
                      </Button>
                    )}
                  </div>
                  <section className="panel flush">
                    {filtered.length ? (
                      <InventoryTable rows={visibleRows} onOpen={openItem} />
                    ) : (
                      <div className="empty">
                        <Search />
                        <h3>
                          {inventory.length
                            ? 'No matching units'
                            : 'No inventory yet'}
                        </h3>
                        <p>
                          {inventory.length
                            ? 'Try another identifier or clear the current filters.'
                            : 'Import a CSV or add a physical unit to begin.'}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() =>
                            inventory.length
                              ? (setSearch(''), setFilter('all'))
                              : navigate('import')
                          }
                        >
                          {inventory.length
                            ? 'Clear filters'
                            : 'Import inventory'}
                        </Button>
                      </div>
                    )}
                    {filtered.length > 0 && (
                      <div className="pagination">
                        <span>
                          Showing {(currentPage - 1) * INVENTORY_PAGE_SIZE + 1}–
                          {Math.min(
                            currentPage * INVENTORY_PAGE_SIZE,
                            filtered.length,
                          )}{' '}
                          of {filtered.length} units
                        </span>
                        <div className="actions">
                          <Button
                            variant="ghost"
                            aria-label="Previous inventory page"
                            disabled={currentPage === 1}
                            onClick={() => setPage(currentPage - 1)}
                          >
                            <ChevronLeft />
                          </Button>
                          <span>
                            Page {currentPage} of {pages}
                          </span>
                          <Button
                            variant="ghost"
                            aria-label="Next inventory page"
                            disabled={currentPage === pages}
                            onClick={() => setPage(currentPage + 1)}
                          >
                            <ChevronRight />
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                  <p className="muted">
                    “No relevant notice found” describes search coverage. It
                    does not mean a product is safe.
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
                        One row per physical unit. Original purchase facts must
                        come from the original sale record.
                      </p>
                    </div>
                    <a
                      href="/inventory-template.csv"
                      download
                      className="asset-link"
                    >
                      Download blank CSV template ↓
                    </a>
                  </div>
                  <section className="panel">
                    <h2>CSV import</h2>
                    <p className="muted">
                      Required: assetTag, title. Up to{' '}
                      {MAX_ROWS.toLocaleString()} rows and{' '}
                      {MAX_CSV_BYTES / 1000} KB. Duplicate asset tags with
                      different values are rejected.
                    </p>
                    <label className="muted" htmlFor="csv-file">
                      Choose CSV file
                    </label>
                    <Input
                      id="csv-file"
                      type="file"
                      disabled={!!busy}
                      accept=".csv,text/csv"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const generation = ++csvReadGeneration.current;
                        setPreview(null);
                        setReviewedCsv('');
                        setCsv('');
                        setError('');
                        if (f.size > MAX_CSV_BYTES) {
                          setError(`CSV exceeds ${MAX_CSV_BYTES / 1000} KB`);
                          return;
                        }
                        try {
                          const text = await f.text();
                          if (generation === csvReadGeneration.current)
                            setCsv(text);
                        } catch {
                          if (generation === csvReadGeneration.current)
                            setError(
                              'Unable to read that CSV file. Choose it again or paste its contents.',
                            );
                        }
                      }}
                    />
                    <label htmlFor="csv-text" className="subtext">
                      Or paste CSV
                    </label>
                    <textarea
                      id="csv-text"
                      className="import-area"
                      disabled={!!busy}
                      value={csv}
                      onChange={(e) => {
                        csvReadGeneration.current++;
                        setCsv(e.target.value);
                        setPreview(null);
                        setReviewedCsv('');
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
                          if (r?.rows) {
                            setPreview(r.rows);
                            setReviewedCsv(csv);
                          }
                        }}
                      >
                        Review import
                      </Button>
                      {preview && (
                        <Button
                          disabled={!!busy}
                          onClick={async () => {
                            const r = await act(
                              { action: 'import', csv: reviewedCsv },
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
                          ['purchaseCountry', 'Original sale country'],
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
                              maxLength={name === 'assetTag' ? 80 : 200}
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
                        Search → official-page extraction → evidence validation
                        → deterministic matching → persisted cases and holds.
                      </p>
                    </div>
                  </div>
                  <section className="panel">
                    <h2>Investigate {investigationCount} inventory units</h2>
                    <p>{data?.health.coverage}</p>
                    <div className="toolbar">
                      <Select
                        value={investigationGroup}
                        onValueChange={(value) =>
                          value !== null && setInvestigationGroup(value)
                        }
                        disabled={!!busy}
                      >
                        <SelectTrigger aria-label="Investigation product group">
                          <SelectValue>
                            {selectedInvestigationGroup
                              ? `${selectedInvestigationGroup.label} (${selectedInvestigationGroup.itemIds.length} units)`
                              : `All inventory (${inventory.length} units)`}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            All inventory ({inventory.length} units)
                          </SelectItem>
                          {productGroups.map((group) => (
                            <SelectItem key={group.key} value={group.key}>
                              {group.label} ({group.itemIds.length} units)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="muted">
                      Live investigations process up to {limits.groups} product
                      groups per run. Select a product group to investigate it
                      separately. Unsupported source domains and incomplete
                      investigations remain visible.
                      {!!data?.health.approvedHosts?.length && (
                        <>
                          {' '}
                          Approved domains:{' '}
                          {data.health.approvedHosts.join(', ')}.
                        </>
                      )}
                    </p>
                    <Button
                      disabled={
                        !!busy ||
                        !investigationCount ||
                        (investigationGroup !== 'all' &&
                          investigationCount > limits.items)
                      }
                      onClick={() =>
                        act(
                          {
                            action: 'scan',
                            ...(selectedInvestigationGroup
                              ? { itemIds: selectedInvestigationGroup.itemIds }
                              : {}),
                          },
                          'Live investigation',
                        )
                      }
                    >
                      <ScanLine />
                      Run live Anakin investigation
                    </Button>
                    {investigationGroup !== 'all' &&
                      investigationCount > limits.items && (
                        <p className="muted">
                          Scoped investigations support up to {limits.items}{' '}
                          units. Choose All inventory to include this group.
                        </p>
                      )}
                    {!data?.health.keyConfigured && (
                      <div className="notice warning">
                        Anakin is not configured for this workspace. A missing
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
                          disabled={
                            !!busy || item.acknowledged || !item.assessment
                          }
                          onClick={() =>
                            act(
                              { action: 'acknowledge', itemId: item.id },
                              'Case acknowledgment',
                            )
                          }
                        >
                          <Check />
                          {item.acknowledged
                            ? 'Acknowledged'
                            : 'Acknowledge case'}
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
                        {assessment?.reason ??
                          'This unit has not been assessed.'}
                      </p>
                      {item.quarantined && (
                        <p>
                          <LockKeyhole
                            size={15}
                            style={{ display: 'inline' }}
                          />{' '}
                          Persisted quarantine: this unit is blocked from
                          approved-for-sale exports.
                        </p>
                      )}
                    </div>
                    <div className="case-intro">
                      <div>
                        <strong>
                          {assessment
                            ? `${
                                assessment.trace.filter(
                                  (t) =>
                                    t.outcome === 'missing' ||
                                    t.outcome === 'unsupported',
                                ).length
                              } missing or unsupported inventory checks`
                            : 'Assessment not started'}
                        </strong>
                        <p className="muted">
                          {assessment?.trace
                            .filter(
                              (t) =>
                                t.outcome === 'missing' ||
                                t.outcome === 'unsupported',
                            )
                            .map((t) =>
                              t.field.replace(/([a-z])([A-Z])/g, '$1 $2'),
                            )
                            .filter(
                              (value, index, all) =>
                                all.indexOf(value) === index,
                            )
                            .join(' · ') ||
                            (assessment
                              ? 'Read the source scope and full decision below.'
                              : 'Start an investigation to retrieve the applicable notice.')}
                        </p>
                      </div>
                      <div className="actions">
                        <Button
                          variant="outline"
                          onClick={() => navigate('actions')}
                        >
                          Case tasks <ArrowRight size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const section =
                              document.getElementById('unit-enrichment');
                            if (section instanceof HTMLDetailsElement) {
                              section.open = true;
                              section.scrollIntoView({
                                behavior: window.matchMedia(
                                  '(prefers-reduced-motion: reduce)',
                                ).matches
                                  ? 'instant'
                                  : 'smooth',
                                block: 'start',
                              });
                              section
                                .querySelector('input')
                                ?.focus({ preventScroll: true });
                            }
                          }}
                        >
                          Enrich this unit <ArrowUpRight size={16} />
                        </Button>
                      </div>
                    </div>
                    <details
                      className="panel unit-enrichment"
                      id="unit-enrichment"
                    >
                      <summary>Listing details for {item.assetTag}</summary>
                      <p className="muted">
                        Add details from this unit’s Amazon listing with Anakin
                        Wire. Listing information does not establish a physical
                        serial number or purchase history.
                      </p>
                      <form
                        className="toolbar"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (
                            /^[A-Za-z0-9]{10}$/.test(asin) &&
                            !busy &&
                            data?.health.keyConfigured
                          )
                            void act(
                              { action: 'wire', itemId: item.id, asin },
                              'Wire enrichment',
                            );
                        }}
                      >
                        <Input
                          aria-label="Amazon ASIN"
                          maxLength={10}
                          value={asin}
                          onChange={(event) =>
                            setAsinDraft({
                              itemId: item.id,
                              value: event.target.value.trim(),
                            })
                          }
                          placeholder="10-character ASIN"
                        />
                        <Button
                          type="submit"
                          disabled={
                            !!busy ||
                            !/^[A-Za-z0-9]{10}$/.test(asin) ||
                            !data?.health.keyConfigured
                          }
                        >
                          Enrich with Anakin Wire
                        </Button>
                      </form>
                      {!data?.health.keyConfigured && (
                        <p className="muted">
                          Anakin must be configured before listing details can
                          be retrieved.
                        </p>
                      )}
                      {data?.audit
                        .filter(
                          (event) =>
                            event.entityId === item.id &&
                            event.type === 'wire.enrichment',
                        )
                        .map((event) => (
                          <div className="notice" key={event.id}>
                            <strong>
                              Listing updated · {time(event.createdAt)}
                            </strong>
                            <dl className="enrichment-fields">
                              {Object.entries(event.contributions ?? {}).map(
                                ([field, value]) => (
                                  <div key={field}>
                                    <dt>
                                      {field.replace(
                                        /([a-z])([A-Z])/g,
                                        '$1 $2',
                                      )}
                                    </dt>
                                    <dd>{value}</dd>
                                  </div>
                                ),
                              )}
                            </dl>
                          </div>
                        ))}
                    </details>
                    <div className="columns">
                      <div>
                        <section className="panel flush">
                          <div className="panel-title">
                            <h2>Eligibility decision table</h2>
                            <span className="count">
                              {assessment?.verified ?? 0} /{' '}
                              {assessment?.total ?? 0} fields verified
                            </span>
                          </div>
                          {assessment?.trace.length ? (
                            isMobile ? (
                              <CriteriaCards assessment={assessment} />
                            ) : (
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
                                      <TableCell
                                        className={`outcome ${t.outcome}`}
                                      >
                                        {t.outcome}
                                      </TableCell>
                                      <TableCell>
                                        <EvidenceExcerpt text={t.evidence} />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )
                          ) : (
                            <div className="empty">
                              No applicable rule criteria were available.
                              Inspect investigation scope and errors.
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
                          {assessment?.rule?.claimUrl?.startsWith(
                            'https://',
                          ) && (
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
                      <aside className="case-aside">
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
                              <p className="hash">
                                SN {item.serial || 'Missing'}
                              </p>
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
                              (x) =>
                                x.entityId === item.id ||
                                x.entityId === item.caseId,
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
                    {item && (
                      <Button
                        variant="outline"
                        onClick={() => navigate('case')}
                      >
                        <ArrowLeft size={16} />
                        Back to {item.assetTag}
                      </Button>
                    )}
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
                                  source.url.startsWith(
                                    'https://recallops.invalid',
                                  )
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
                              {source.providerId ??
                                'Not available in recording'}
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
                            className={
                              source?.id === s.id ? 'source-selected' : ''
                            }
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
                        {counts.holds} units on internal hold. Acknowledgment
                        never releases a quarantine.
                      </p>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="actions">
                      <Button onClick={() => download('holds')}>
                        <Download />
                        CSV hold list
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => download('packet')}
                      >
                        Remedy packet
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => download('sales')}
                      >
                        Customer manifest
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => download('approved')}
                      >
                        Approved-for-sale export
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => download('json')}
                      >
                        JSON audit data
                      </Button>
                    </div>
                    <p className="subtext">
                      Sale exports require operator acknowledgment, an
                      excluded/no-notice assessment, and no quarantine. They do
                      not certify safety. Customer contacts are drafts only.
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
                          key={t.id}
                          task={t}
                          item={inventory.find(
                            (item) => item.caseId === t.caseId,
                          )}
                          openItem={openItem}
                          disabled={!!busy}
                          save={(v) =>
                            act(
                              {
                                action: 'task',
                                taskId: t.id,
                                revision: t.revision,
                                ...v,
                              },
                              'Task update',
                            )
                          }
                        />
                      ))
                    ) : (
                      <p className="muted">
                        Tasks are created when a unit is affected or needs
                        review.
                      </p>
                    )}
                  </section>
                </>
              )}
              {screen === 'monitoring' && (
                <>
                  <div className="head">
                    <div>
                      <div className="eyebrow">
                        Source changes & reassessment
                      </div>
                      <h1>A change starts a new investigation.</h1>
                      <p>
                        Changes preserve evidence and rerun extraction and
                        matching before updating a case.
                      </p>
                    </div>
                    {data?.demo.enabled && (
                      <Button
                        disabled={!!busy || !data?.demo.monitoringReady}
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
                    )}
                  </div>
                  {data?.demo.enabled && (
                    <div className="notice">
                      <Provenance label="CONTROLLED_DEMO_FIXTURE" />
                      <p>
                        The test notice first excludes MON-001. Version B
                        includes its serial and adds a required batch. The
                        missing batch sends the sample to review. This notice is
                        synthetic.
                      </p>
                    </div>
                  )}
                  <section className="panel">
                    <h2>Live official-source monitor</h2>
                    <p className="muted">
                      New monitors are paused to avoid recurring credit
                      consumption. “Run now” queues a provider check and
                      separately re-extracts the source. Scheduled activation is
                      available in Anakin after reviewing the interval.
                    </p>
                    <div className="toolbar">
                      <Input
                        aria-label="Official monitor URL"
                        placeholder="https://… official source URL"
                        value={monitorUrl}
                        onChange={(e) => setMonitorUrl(e.target.value)}
                      />
                      <Button
                        disabled={
                          !!busy ||
                          !monitorUrl.trim().startsWith('https://') ||
                          !data?.health.keyConfigured
                        }
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
                    <div className="source-suggestions">
                      {[
                        ...new Set(
                          data?.sources
                            .filter(
                              (s) =>
                                s.label !== 'CONTROLLED_DEMO_FIXTURE' &&
                                s.url.startsWith('https://'),
                            )
                            .map((s) => s.url),
                        ),
                      ]
                        .slice(0, 4)
                        .map((url) => (
                          <button
                            className="source-chip"
                            key={url}
                            onClick={() => setMonitorUrl(url)}
                            title={url}
                          >
                            <FileSearch size={14} />
                            Use {new URL(url).hostname}
                          </button>
                        ))}
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
                          Provider ID:{' '}
                          {m.providerId ||
                            (m.label === 'CONTROLLED_DEMO_FIXTURE'
                              ? 'Local controlled fixture'
                              : 'Unavailable')}{' '}
                          · Last checked: {time(m.lastCheckedAt)}
                        </p>
                        {m.run && (
                          <p className="subtext">
                            Requested job: {m.run.jobId} ·{' '}
                            {time(m.run.requestedAt)} · Provider completion
                            unconfirmed
                          </p>
                        )}
                        {m.independentReassessment && (
                          <p className="subtext">
                            Independent source scrape reassessed{' '}
                            {m.independentReassessment.assessed} units at{' '}
                            {time(m.independentReassessment.completedAt)}.
                          </p>
                        )}
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
                              (e.status === 'processed'
                                ? 'Source change processed; review the saved assessment and audit trail.'
                                : e.status === 'failed'
                                  ? 'Reassessment failed. Inspect the error before retrying.'
                                  : 'Source change awaiting extraction and reassessment.')}
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
                        Server-side application calls only. Connected-tool
                        research is not counted as a successful app integration.
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
                        : 'Not configured'}
                    </strong>
                    <br />
                    Public webhook origin:{' '}
                    {data?.health.webhookConfigured
                      ? 'Configured'
                      : 'Not configured; provider callbacks are unavailable'}
                  </div>
                  <div className="health-grid">
                    {['Search', 'Scraper', 'Wire', 'Monitoring'].map(
                      (product) => {
                        const runs =
                            data?.runs.filter((r) => r.product === product) ??
                            [],
                          last = runs.find((r) => r.status === 'success');
                        return (
                          <section className="panel health-card" key={product}>
                            <h3>
                              {product}
                              <span
                                className={
                                  last ? 'status-light' : 'status-light off'
                                }
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
                              <dt>Requests in recent log</dt>
                              <dd>
                                {runs.reduce((s, r) => s + r.requestCount, 0)}
                              </dd>
                              <dt>Reported credits</dt>
                              <dd>
                                {runs.some((r) => r.credits !== undefined)
                                  ? runs.reduce(
                                      (s, r) => s + (r.credits ?? 0),
                                      0,
                                    )
                                  : 'Not returned'}
                              </dd>
                            </dl>
                          </section>
                        );
                      },
                    )}
                  </div>
                  <section className="panel">
                    <h2>Call log</h2>
                    <Runs runs={data?.runs ?? []} />
                  </section>
                </>
              )}
              {screen === 'settings' && data && (
                <WorkspaceSettings
                  health={data.health}
                  counts={{
                    inventory: data.inventory.length,
                    monitors: data.monitors.length,
                    tasks: data.tasks.filter((task) => task.status !== 'done')
                      .length,
                  }}
                  sessionMode={session.mode === 'local' ? 'local' : 'operator'}
                  lastUpdated={lastUpdated}
                  density={density}
                  onDensityChange={changeDensity}
                  onSignOut={() => void signOut()}
                  signingOut={signingOut}
                  expiresAt={session.expiresAt}
                />
              )}
            </>
          )}
          <p className="footer-note">
            RecallOps provides evidence-backed decision support. It does not
            provide legal advice, regulatory certification, or a guarantee that
            a product is safe. No external claim, customer contact or disposal
            action is submitted automatically.
          </p>
        </div>
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
  const mobile = useIsMobile();
  return rows.length ? (
    mobile ? (
      <div className="mobile-inventory">
        {rows.map((item) => (
          <button
            className="mobile-unit"
            key={item.id}
            aria-label={item.assetTag}
            aria-describedby={`unit-details-${item.id}`}
            onClick={() => onOpen(item)}
          >
            <strong>
              {item.assetTag}
              <ArrowUpRight size={16} />
            </strong>
            <span className="sr-only" id={`unit-details-${item.id}`}>
              {item.title}.{' '}
              {item.assessment ? names[item.assessment.status] : 'Unassessed'}.
              {item.quarantined ? ' Quarantined.' : ''} {item.assessment?.label}
            </span>
            <span>{item.title}</span>
            <span className="subtext">
              {item.brand || 'Brand not recorded'} ·{' '}
              {item.model || 'Model not recorded'} · SN{' '}
              {item.serial || 'Missing'}
            </span>
            <span className="actions">
              <Status status={item.assessment?.status} />
              {item.quarantined && (
                <span className="danger-action">
                  <LockKeyhole size={14} /> Quarantined
                </span>
              )}
            </span>
            <Provenance label={item.assessment?.label} />
          </button>
        ))}
      </div>
    ) : (
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
    )
  ) : (
    <div className="empty">
      <Package />
      <h3>No units in this view</h3>
      <p>Import your own inventory to begin.</p>
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
  item,
  openItem,
}: {
  task: Task;
  disabled: boolean;
  save: (value: Record<string, string>) => Promise<unknown>;
  item?: Item;
  openItem: (item: Item) => void;
}) {
  const [draft, setDraft] = useState<Pick<
    Task,
    'owner' | 'status' | 'dueDate' | 'priority'
  > | null>(null);
  const values = draft ?? task;
  const [baseline, setBaseline] = useState(task.revision);
  const dirty = draft !== null;
  const [saving, setSaving] = useState(false);
  const conflict = dirty && task.revision !== baseline;
  const edit = (field: keyof NonNullable<typeof draft>, value: string) => {
    if (!dirty) setBaseline(task.revision);
    setDraft({
      owner: values.owner,
      status: values.status,
      dueDate: values.dueDate,
      priority: values.priority,
      [field]: value,
    });
  };
  return (
    <div className="task-row">
      <div className="task-title">
        <strong>{task.title}</strong>
        {item && (
          <button className="asset-link" onClick={() => openItem(item)}>
            {item.assetTag}{' '}
            <ArrowUpRight size={14} style={{ display: 'inline' }} />
          </button>
        )}
      </div>
      <label htmlFor={`owner-${task.id}`}>
        Owner
        <Input
          id={`owner-${task.id}`}
          aria-label={`Owner for ${task.title}`}
          value={values.owner}
          onChange={(e) => edit('owner', e.target.value)}
          maxLength={100}
          disabled={disabled || saving}
        />
      </label>
      <label htmlFor={`due-${task.id}`}>
        Due date
        <Input
          id={`due-${task.id}`}
          aria-label={`Due date for ${task.title}`}
          type="date"
          value={values.dueDate}
          onChange={(e) => edit('dueDate', e.target.value)}
          disabled={disabled || saving}
        />
      </label>
      <label htmlFor={`status-${task.id}`}>
        Status
        <Choice
          id={`status-${task.id}`}
          disabled={disabled || saving}
          label={`Status for ${task.title}`}
          value={values.status}
          options={['open', 'in_progress', 'done']}
          onChange={(v) => edit('status', v)}
        />
      </label>
      <label htmlFor={`priority-${task.id}`}>
        Priority
        <Choice
          id={`priority-${task.id}`}
          disabled={disabled || saving}
          label={`Priority for ${task.title}`}
          value={values.priority}
          options={['urgent', 'high', 'normal']}
          onChange={(v) => edit('priority', v)}
        />
      </label>
      <Button
        variant="outline"
        disabled={
          disabled ||
          saving ||
          !dirty ||
          conflict ||
          !values.owner.trim() ||
          !values.dueDate
        }
        onClick={async () => {
          setSaving(true);
          try {
            const result = await save({
              owner: values.owner,
              status: values.status,
              dueDate: values.dueDate,
              priority: values.priority,
            });
            if (result) setDraft(null);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Check size={16} />
        )}
        Save task
      </Button>
      {dirty && (
        <div className="task-draft-note">
          {conflict
            ? 'This task changed elsewhere. Discard this draft to load the latest saved values.'
            : 'Unsaved changes'}{' '}
          <button
            className="text-action"
            disabled={saving}
            onClick={() => setDraft(null)}
          >
            Discard draft
          </button>
        </div>
      )}
    </div>
  );
}
function EvidenceExcerpt({ text }: { text: string }) {
  return text.length > 220 ? (
    <details>
      <summary>Show exact excerpt</summary>
      <p>{text}</p>
    </details>
  ) : (
    <span>{text}</span>
  );
}
function CriteriaCards({
  assessment,
}: {
  assessment: NonNullable<Item['assessment']>;
}) {
  return (
    <div className="mobile-criteria">
      {assessment.trace.map((criterion, index) => (
        <details
          key={`${criterion.id}-${index}`}
          className="criterion-card"
          open={criterion.outcome === 'missing'}
        >
          <summary>
            <strong>
              {criterion.field.replace(/([a-z])([A-Z])/g, '$1 $2')}
            </strong>
            <span className={`outcome ${criterion.outcome}`}>
              {criterion.outcome}
            </span>
          </summary>
          <p>
            {criterion.exclusion ? 'Explicit exclusion' : 'Required inclusion'}
          </p>
          <dl>
            <dt>Inventory value</dt>
            <dd>{criterion.inventoryValue || 'Not recorded'}</dd>
            <dt>Requirement</dt>
            <dd>{criterion.requirement}</dd>
          </dl>
          <blockquote>{criterion.evidence}</blockquote>
        </details>
      ))}
    </div>
  );
}
