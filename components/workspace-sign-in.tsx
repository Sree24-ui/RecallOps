"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type WorkspaceSession = {
  authenticated: boolean;
  mode: "local" | "operator" | "unconfigured";
  expiresAt?: string;
};
export function WorkspaceSignIn({
  checking,
  unavailable,
  error,
  submitting,
  onSubmit,
  onRetry,
}: {
  checking: boolean;
  unavailable: boolean;
  error: string;
  submitting: boolean;
  onSubmit: (key: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <div className="access-page">
      <header className="access-header">
        <Link href="/" className="access-brand">
          <ShieldCheck aria-hidden="true" />
          RecallOps
        </Link>
        <Link href="/" className="access-back">
          <ArrowLeft size={16} />
          Official recall catalogue
        </Link>
      </header>
      <main className="access-layout">
        <section className="access-story">
          <span className="access-eyebrow">Your inventory. Your evidence.</span>
          <h1>
            Every unit.
            <br />
            <span>A clearer decision.</span>
          </h1>
          <p>
            Bring official recall evidence and your physical inventory together
            in one private workspace.
          </p>
          <div className="access-feature">
            <PackageCheck aria-hidden="true" />
            <div>
              <strong>Start with what you own</strong>
              <span>Import your actual units and review missing details.</span>
            </div>
          </div>
          <div className="access-feature">
            <FileCheck2 aria-hidden="true" />
            <div>
              <strong>Keep the source in sight</strong>
              <span>Trace each assessment to its notice and criteria.</span>
            </div>
          </div>
          <div className="access-feature">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>Follow through with confidence</strong>
              <span>
                Track internal holds, tasks and your decision history.
              </span>
            </div>
          </div>
        </section>
        <section className="access-card" aria-labelledby="access-title">
          <div className="access-icon">
            <Fingerprint aria-hidden="true" size={30} />
          </div>
          <div className="access-eyebrow">Private workspace</div>
          <p>
            Reviewing the project?{" "}
            <Link href="/judge">
              Open the public judge portal — no key needed →
            </Link>
          </p>
          <h2 id="access-title">
            {checking
              ? "Checking your session"
              : unavailable
                ? "Workspace setup needed"
                : "Welcome back"}
          </h2>
          {checking ? (
            <output className="access-checking">
              <LoaderCircle className="spin" size={18} />
              Checking access securely…
            </output>
          ) : unavailable ? (
            <>
              <p>
                The owner needs to finish access setup before this workspace can
                open. The official catalogue is available now.
              </p>
              <Button onClick={onRetry} variant="outline">
                Check again
              </Button>
            </>
          ) : (
            <>
              <p>
                Sign in with your owner access key to open your inventory and
                investigations.
              </p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!key.trim() || submitting) return;
                  await onSubmit(key.trim());
                  setKey("");
                }}
              >
                <label htmlFor="owner-access-key">Owner access key</label>
                <div className="access-input">
                  <Input
                    id="owner-access-key"
                    type={visible ? "text" : "password"}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={submitting}
                    required
                    aria-describedby="access-help"
                    placeholder="Enter your private access key"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-label={visible ? "Hide access key" : "Show access key"}
                    disabled={submitting}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p id="access-help" className="access-help">
                  Use the key from your private owner-access file. The Anakin
                  API key is a separate credential.
                </p>
                {error && (
                  <p role="alert" className="access-error">
                    {error}
                  </p>
                )}
                <Button
                  className="access-submit"
                  type="submit"
                  disabled={!key.trim() || submitting}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="spin" size={17} />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </form>
              <div className="access-privacy">
                <LockKeyhole size={15} />
                <span>
                  Your session stays signed in across refreshes. Your access key
                  is never saved in browser storage.
                </span>
              </div>
            </>
          )}
          {!checking && unavailable && error && (
            <p role="alert" className="access-error">
              {error}
            </p>
          )}
          {!checking && error && (
            <button className="access-retry" onClick={onRetry}>
              Check connection again
            </button>
          )}
        </section>
      </main>
      <footer className="access-footer">
        <span>Evidence before resale.</span>
        <Link href="/">
          Browse public notices <ArrowRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
