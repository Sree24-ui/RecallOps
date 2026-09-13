import type { Inventory, AssessmentState, SourceLabel } from '../core/rules';
import type { Assessment } from '../server/workflow';
export const assessmentNames: Record<AssessmentState, string> = {
  affected: 'Affected',
  excluded_by_notice: 'Excluded by notice',
  needs_review: 'Needs review',
  no_relevant_notice_found: 'No relevant notice found',
};
export type Item = Inventory & {
  id: string;
  quarantined: boolean;
  acknowledged: boolean;
  caseId?: string;
  assessment: (Assessment & { id: string; createdAt: string }) | null;
};
export type Source = {
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
export type Task = {
  revision: string;
  id: string;
  caseId: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  dueDate: string;
};
export type Event = {
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
export type Run = {
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
export type Audit = {
  id: string;
  entityId: string;
  type: string;
  createdAt: string;
  contributedFields?: string[];
  contributions?: Record<string, string>;
  action?: string;
};
export type Monitor = {
  id: string;
  url: string;
  providerId?: string;
  label: SourceLabel;
  state: unknown;
  lastCheckedAt?: string;
  run?: { jobId: string; status: string; requestedAt: string };
  independentReassessment?: { completedAt: string; assessed: number };
  version?: string;
};
export type Data = {
  demo: {
    enabled?: boolean;
    sampleCount: number;
    subject: string;
    monitoringReady: boolean;
  };
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
    deployment?: 'hosted' | 'local';
    approvedHosts?: string[];
    investigationLimits?: {
      groups: number;
      sourcesPerGroup: number;
      items: number;
    };
    providerDurationMs?: number;
  };
};

export function summarizeInventory(items: Item[]) {
  const statuses = {
    affected: 0,
    excluded_by_notice: 0,
    needs_review: 0,
    no_relevant_notice_found: 0,
    unassessed: 0,
  };
  for (const item of items) statuses[item.assessment?.status ?? 'unassessed']++;
  return {
    total: items.length,
    statuses,
    holds: items.filter((item) => item.quarantined).length,
    assessed: items.filter((item) => item.assessment !== null).length,
  };
}
export function priority(item: Item) {
  return item.quarantined || item.assessment?.status === 'affected'
    ? 0
    : item.assessment?.status === 'needs_review'
      ? 1
      : !item.assessment
        ? 2
        : 3;
}
export function filterInventory(
  items: Item[],
  query: string,
  status: string,
  sort: string,
) {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((item) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'unassessed'
          ? !item.assessment
          : status === 'quarantined'
            ? item.quarantined
            : item.assessment?.status === status);
      const text = [
        item.assetTag,
        item.title,
        item.brand,
        item.model,
        item.serial,
        item.retailer,
        item.sku,
        item.batch,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return matchesStatus && tokens.every((token) => text.includes(token));
    })
    .sort((a, b) => {
      if (sort === 'priority')
        return (
          priority(a) - priority(b) ||
          a.assetTag.localeCompare(b.assetTag, undefined, { numeric: true })
        );
      if (sort === 'recent')
        return (
          (Date.parse(b.assessment?.createdAt ?? '') || 0) -
            (Date.parse(a.assessment?.createdAt ?? '') || 0) ||
          a.assetTag.localeCompare(b.assetTag)
        );
      return a.assetTag.localeCompare(b.assetTag, undefined, { numeric: true });
    });
}
export function formatTime(value?: string) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Not yet';
}
export function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source unavailable';
  }
}
