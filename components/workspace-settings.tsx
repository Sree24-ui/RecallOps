'use client';

import {
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Globe2,
  KeyRound,
  ListFilter,
  LoaderCircle,
  LogOut,
  Plug,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type WorkspaceDensity = 'comfortable' | 'compact';

export type WorkspaceSettingsProps = {
  health: {
    keyConfigured: boolean;
    webhookConfigured: boolean;
    coverage: string;
    approvedHosts?: readonly string[];
    investigationLimits?: {
      groups: number;
      sourcesPerGroup: number;
      items: number;
    };
    providerDurationMs?: number;
    deployment?: 'hosted' | 'local';
    authMode?: string;
  };
  counts: { inventory: number; monitors: number; tasks: number };
  sessionMode: 'local' | 'operator';
  lastUpdated: string | null;
  density: WorkspaceDensity;
  onDensityChange: (value: WorkspaceDensity) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  expiresAt?: string;
};

function ConfigurationStatus({ configured }: { configured: boolean }) {
  return (
    <span className={`ws-settings-status ${configured ? 'ready' : 'missing'}`}>
      {configured ? (
        <Check aria-hidden="true" />
      ) : (
        <CircleHelp aria-hidden="true" />
      )}
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

function DensityPreview({ density }: { density: WorkspaceDensity }) {
  return (
    <span
      className={`ws-settings-density-preview ${density}`}
      aria-hidden="true"
    >
      {[0, 1, 2].map((row) => (
        <span className="ws-settings-density-row" key={row}>
          <span />
          <span />
          <span />
        </span>
      ))}
    </span>
  );
}

export function WorkspaceSettings({
  health,
  counts,
  sessionMode,
  lastUpdated,
  density,
  onDensityChange,
  onSignOut,
  signingOut = false,
  expiresAt,
}: WorkspaceSettingsProps) {
  const updated = lastUpdated ? new Date(lastUpdated) : null;
  const timestamp =
    updated && Number.isFinite(updated.valueOf()) ? updated : null;
  const approvedHosts = [...new Set(health.approvedHosts ?? [])];
  const limits = health.investigationLimits;
  const durationSeconds = health.providerDurationMs
    ? Math.round(health.providerDurationMs / 1000)
    : null;

  return (
    <div className="ws-settings">
      <header className="ws-settings-header">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1>Workspace settings</h1>
          <p>
            Manage your session, check integrations and choose how you work.
          </p>
        </div>
        {timestamp && (
          <span className="ws-settings-updated">
            <Clock3 aria-hidden="true" />
            Updated{' '}
            <time
              dateTime={timestamp.toISOString()}
              title={timestamp.toLocaleString()}
            >
              {timestamp.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
          </span>
        )}
      </header>

      <section
        className="ws-settings-session"
        aria-labelledby="ws-session-title"
      >
        <div className="ws-settings-session-main">
          <span className="ws-settings-session-icon">
            <ShieldCheck aria-hidden="true" />
          </span>
          <div className="ws-settings-session-copy">
            <div className="ws-settings-session-title">
              <h2 id="ws-session-title">
                {sessionMode === 'operator' ? 'Owner session' : 'Local session'}
              </h2>
              <span className="ws-settings-connected">
                <span />
                Connected
              </span>
            </div>
            <p>
              {sessionMode === 'operator'
                ? 'You have access to inventory, investigations and internal actions.'
                : 'You are working on this computer. Local access is enabled.'}
            </p>
            {expiresAt && (
              <p>
                Session ends{' '}
                <time dateTime={expiresAt}>
                  {new Date(expiresAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
              </p>
            )}
          </div>
          {sessionMode === 'operator' && (
            <Button
              variant="outline"
              onClick={onSignOut}
              disabled={signingOut}
              className="ws-settings-signout"
            >
              {signingOut ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          )}
        </div>
        <dl className="ws-settings-session-details">
          <div>
            <dt>Workspace</dt>
            <dd>
              {health.deployment === 'hosted'
                ? 'Hosted'
                : health.deployment === 'local'
                  ? 'This computer'
                  : 'Connected'}
            </dd>
          </div>
          <div>
            <dt>Inventory units</dt>
            <dd>{counts.inventory.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Open tasks</dt>
            <dd>{counts.tasks.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Saved monitors</dt>
            <dd>{counts.monitors.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <div className="ws-settings-grid">
        <section
          className="ws-settings-card"
          aria-labelledby="ws-integration-title"
        >
          <div className="ws-settings-card-heading">
            <span className="ws-settings-icon">
              <Plug aria-hidden="true" />
            </span>
            <div>
              <h2 id="ws-integration-title">Anakin connection</h2>
              <p>Configuration reported by your workspace.</p>
            </div>
          </div>
          <div className="ws-settings-service">
            <KeyRound aria-hidden="true" />
            <div>
              <h3>Evidence tools</h3>
              <p>Recall search and evidence extraction</p>
            </div>
            <ConfigurationStatus configured={health.keyConfigured} />
          </div>
          <div className="ws-settings-service">
            <Radio aria-hidden="true" />
            <div>
              <h3>Monitor callbacks</h3>
              <p>Address for provider change notifications</p>
            </div>
            <ConfigurationStatus configured={health.webhookConfigured} />
          </div>
          <p className="ws-settings-note">
            {health.keyConfigured
              ? 'Credentials stay on the server. Configuration does not confirm a successful provider call; check Anakin health for actual activity.'
              : 'The workspace owner needs to configure Anakin before evidence tools can run. Your saved inventory remains available.'}
          </p>
        </section>

        <section
          className="ws-settings-card"
          aria-labelledby="ws-display-title"
        >
          <div className="ws-settings-card-heading">
            <span className="ws-settings-icon">
              <SlidersHorizontal aria-hidden="true" />
            </span>
            <div>
              <h2 id="ws-display-title">Display preferences</h2>
              <p>Table spacing for this browser.</p>
            </div>
          </div>
          <fieldset className="ws-settings-density" aria-label="Table spacing">
            {(['comfortable', 'compact'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`ws-settings-density-option ${density === option ? 'selected' : ''}`}
                aria-pressed={density === option}
                onClick={() => onDensityChange(option)}
              >
                <DensityPreview density={option} />
                <span className="ws-settings-density-label">
                  {option === 'comfortable' ? 'Comfortable' : 'Compact'}
                  <span className="ws-settings-density-check">
                    {density === option && <Check aria-hidden="true" />}
                  </span>
                </span>
              </button>
            ))}
          </fieldset>
          <p className="ws-settings-note">
            Changes apply immediately. Your preference is saved in this browser.
          </p>
        </section>

        <section
          className="ws-settings-card ws-settings-coverage"
          aria-labelledby="ws-coverage-title"
        >
          <div className="ws-settings-card-heading">
            <span className="ws-settings-icon">
              <Globe2 aria-hidden="true" />
            </span>
            <div>
              <h2 id="ws-coverage-title">Evidence coverage</h2>
              <p>Where the investigator can look.</p>
            </div>
          </div>
          <p className="ws-settings-coverage-copy">
            {health.coverage || 'Coverage information is unavailable.'}
          </p>
          <details className="ws-settings-sources">
            <summary>
              Approved source domains{' '}
              <span>
                {approvedHosts.length ? approvedHosts.length : 'Unavailable'}
              </span>
              <ChevronDown aria-hidden="true" />
            </summary>
            {approvedHosts.length ? (
              <ul>
                {approvedHosts.map((host) => (
                  <li key={host}>{host}</li>
                ))}
              </ul>
            ) : (
              <p>Source domains have not been reported by this workspace.</p>
            )}
          </details>
          <p className="ws-settings-note">
            The public catalogue contains recall notices. Only inventory you add
            is assessed as a physical unit.
          </p>
        </section>

        <section className="ws-settings-card" aria-labelledby="ws-limits-title">
          <div className="ws-settings-card-heading">
            <span className="ws-settings-icon">
              <ListFilter aria-hidden="true" />
            </span>
            <div>
              <h2 id="ws-limits-title">Investigation limits</h2>
              <p>Current limits for each investigation.</p>
            </div>
          </div>
          {limits ? (
            <dl className="ws-settings-limit-list">
              <div>
                <dt>Inventory units per request</dt>
                <dd>{limits.items.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Product groups per run</dt>
                <dd>{limits.groups.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Sources per product group</dt>
                <dd>{limits.sourcesPerGroup.toLocaleString()}</dd>
              </div>
              {durationSeconds !== null && (
                <div>
                  <dt>Provider work per run</dt>
                  <dd>{durationSeconds.toLocaleString()} seconds</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="ws-settings-coverage-copy">
              Investigation limits have not been reported by this workspace.
            </p>
          )}
          <p className="ws-settings-note">
            When a limit is reached, remaining groups keep their existing
            assessments. Select those units for another investigation.
          </p>
        </section>
      </div>
    </div>
  );
}
