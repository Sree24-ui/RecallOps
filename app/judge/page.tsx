"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  FileSearch,
  LayoutDashboard,
  LockKeyhole,
  Package,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { fields, flatten, type Inventory } from "@/lib/core/rules";
import { MAX_CSV_BYTES, parseCsv } from "@/lib/core/csv";
import {
  assessJudgeItems,
  createJudgeItems,
  exportJudgeCsv,
  exportJudgeJson,
  judgeEvidence,
  restoreJudgeItems,
  type JudgeItem,
} from "@/lib/judge/workspace";
import "./judge.css";

const screens = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "investigations", label: "Investigations", icon: FileSearch },
  { id: "exports", label: "Exports", icon: Download },
  { id: "settings", label: "Settings", icon: Settings },
] as const;
type Screen = (typeof screens)[number]["id"];
const storageKey = "recallops-judge-session-v1";
const names: Record<string, string> = {
  assetTag: "Asset tag",
  title: "Product title",
  brand: "Brand",
  model: "Model",
  serial: "Serial number",
  color: "Color",
  originalPurchaseDate: "Original purchase date",
  purchaseCountry: "Purchase country",
  retailer: "Retailer",
  manufactureDate: "Manufacture date",
  hasPawPrint: "Has paw print (true / false)",
};
const fieldName = (name: string) =>
  names[name] ??
  name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const statusName = (name: string) => name.replaceAll("_", " ");
const excerptText = (value: string) =>
  value.replaceAll("**", "").replaceAll("\u00a0", " ");
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " UTC";
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function JudgePortal() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [items, setItems] = useState<JudgeItem[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState<Inventory[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [evidenceId, setEvidenceId] = useState(judgeEvidence[0].id);
  const [reset, setReset] = useState(false);
  const uploadGeneration = useRef(0);
  const evidence = judgeEvidence.find((record) => record.id === evidenceId)!;
  const assessed = items.filter((row) => row.decision).length;
  const held = items.filter((row) => row.held).length;
  const review = items.filter(
    (row) => row.decision?.status === "needs_review",
  ).length;
  useEffect(() => {
    const sync = () => {
      const value = location.hash.slice(1);
      if (screens.some((entry) => entry.id === value))
        setScreen(value as Screen);
    };
    window.addEventListener("hashchange", sync);
    const hydration = window.setTimeout(() => {
      sync();
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) setItems(restoreJudgeItems(stored));
      } catch {
        setError(
          "The saved session could not be restored. You can start again or re-import your CSV.",
        );
      }
      setReady(true);
    }, 0);
    return () => {
      window.clearTimeout(hydration);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  function updateItems(next: JudgeItem[]) {
    setItems(next);
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, items: next }),
      );
    } catch {
      throw Error(
        "Browser storage is unavailable or full. You can continue in memory; export your work before leaving.",
      );
    }
  }
  function go(value: Screen) {
    setScreen(value);
    window.history.pushState(null, "", `#${value}`);
    setMessage("");
    setError("");
  }
  function attempt(action: () => void) {
    try {
      action();
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "ZodError"
          ? cause.message
          : "Check the required asset tag, product title and field lengths (200 characters maximum).",
      );
      setMessage("");
    }
  }
  function run() {
    attempt(() => {
      updateItems(assessJudgeItems(items, evidenceId));
      setMessage(
        `Compared ${items.length} ${items.length === 1 ? "unit" : "units"} with the saved notice. Review the criterion trace below; no live provider request was made.`,
      );
    });
  }
  function save(kind: "json" | "csv" | "holds") {
    download(
      kind === "json"
        ? exportJudgeJson(items, evidenceId)
        : exportJudgeCsv(items, kind === "holds"),
      `RecallOps-judge-${kind === "json" ? "evidence.json" : kind === "holds" ? "holds.csv" : "inventory.csv"}`,
      kind === "json" ? "application/json" : "text/csv",
    );
    setMessage("Download prepared. Find it in your browser downloads.");
  }
  return (
    <div className="judge-shell">
      <a className="skip-link" href="#judge-content">
        Skip to portal content
      </a>
      <header className="judge-header">
        <Link href="/" className="judge-brand">
          <ShieldCheck /> RecallOps
        </Link>
        <span className="judge-badge">
          Public judge portal <span>· No key needed</span>
        </span>
        <Link href="/workspace" className="judge-owner">
          <LockKeyhole size={15} /> Owner sign-in
        </Link>
      </header>
      <div className="judge-layout">
        <aside className="judge-sidebar">
          <div className="judge-eyebrow">Explore the workflow</div>
          <nav aria-label="Judge portal">
            {screens.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-label={label}
                aria-current={screen === id ? "page" : undefined}
              >
                <Icon size={19} />
                {label}
                {id === "inventory" && <span>{items.length}</span>}
              </button>
            ))}
          </nav>
          <div className="judge-sidebar-note">
            <ShieldCheck size={22} />
            <strong>Your session, your data</strong>
            <p>
              Units stay in this tab. Owner inventory and provider credentials
              are never loaded here.
            </p>
            <Link href="/">
              Browse official catalogue <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
        <main id="judge-content" className="judge-main">
          <div className="judge-mode">
            <span className="judge-dot" />
            <strong>Saved official evidence</strong>
            <span>
              Original source retrieved {date(evidence.retrievedAt)}. This
              portal does not make fresh Anakin requests.
            </span>
          </div>
          {error && (
            <div role="alert" className="judge-alert">
              {error}
            </div>
          )}
          {message && (
            <output className="judge-success">
              <Check size={18} />
              {message}
            </output>
          )}
          {screen === "overview" && (
            <>
              <div className="judge-intro">
                <div className="judge-eyebrow">
                  Anakin Forge / hands-on review
                </div>
                <h1>
                  Follow the evidence.
                  <br />
                  <span>Explore every step.</span>
                </h1>
                <p>
                  Open an official notice, inspect the criteria, and export a
                  source-backed report. Bring your own unit details to try the
                  inventory assessment.
                </p>
                <div className="judge-buttons">
                  <button
                    className="judge-primary"
                    onClick={() => go("investigations")}
                  >
                    Explore the evidence <ArrowRight size={17} />
                  </button>
                  <button onClick={() => go("inventory")}>
                    Add your inventory
                  </button>
                </div>
              </div>
              <div className="judge-stats">
                {[
                  ["Saved notices", judgeEvidence.length],
                  ["Your units", items.length],
                  ["Assessed", assessed],
                  ["Local holds", held],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="judge-section-title">
                <h2>A real workflow. Your own inputs.</h2>
                <span>No account required</span>
              </div>
              <div className="judge-steps">
                {[
                  {
                    n: "01",
                    title: "Inspect the notice",
                    text: "Read preserved official criteria, dates and Anakin retrieval provenance.",
                    target: "investigations",
                  },
                  {
                    n: "02",
                    title: "Compare your units",
                    text: "Add a real unit or import a CSV. Missing facts remain unknown.",
                    target: "inventory",
                  },
                  {
                    n: "03",
                    title: "Take the evidence",
                    text: "Download a JSON report or CSV of your session and local holds.",
                    target: "exports",
                  },
                ].map((step) => (
                  <button
                    key={step.n}
                    onClick={() => go(step.target as Screen)}
                  >
                    <span>{step.n}</span>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                    <ArrowRight size={20} />
                  </button>
                ))}
              </div>
              <section className="judge-card judge-scope">
                <h2>What you are reviewing</h2>
                <p>
                  This is an isolated evaluation workspace using a preserved
                  INIU notice and the same deterministic matching engine as the
                  owner portal. It begins without invented units. You can
                  explore evidence and exports even without a physical product.
                </p>
                <p>
                  Fresh Anakin discovery, Wire enrichment, persistent team tasks
                  and monitor controls belong to the protected owner workspace.
                  These are not simulated here.
                </p>
              </section>
            </>
          )}
          {screen === "inventory" && (
            <>
              <div className="judge-title">
                <div>
                  <div className="judge-eyebrow">Your facts / this session</div>
                  <h1>Inventory</h1>
                  <p>
                    Add only physical units you can identify. Leave uncertain
                    fields blank.
                  </p>
                </div>
                <a
                  href="/inventory-template.csv"
                  download
                  className="judge-link-button"
                >
                  <Download size={17} /> Blank CSV template
                </a>
              </div>
              <div className="judge-two-columns">
                <section className="judge-card">
                  <h2>Add a unit</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      attempt(() => {
                        const item = Object.fromEntries(
                          Object.entries(draft).filter(([, value]) =>
                            value.trim(),
                          ),
                        ) as Inventory;
                        updateItems(createJudgeItems([item], items));
                        setDraft({});
                        setMessage(
                          "Unit added to this tab. Open Investigations to compare the saved notice.",
                        );
                      });
                    }}
                  >
                    <div className="judge-form-grid">
                      {[
                        "assetTag",
                        "title",
                        "brand",
                        "model",
                        "serial",
                        "color",
                        "retailer",
                        "purchaseCountry",
                        "originalPurchaseDate",
                      ].map((field) => (
                        <label key={field}>
                          {fieldName(field)}
                          {["assetTag", "title"].includes(field) ? " *" : ""}
                          <input
                            value={draft[field] ?? ""}
                            required={["assetTag", "title"].includes(field)}
                            maxLength={field === "assetTag" ? 80 : 200}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                [field]: event.target.value,
                              })
                            }
                            placeholder={
                              field === "originalPurchaseDate"
                                ? "YYYY-MM or YYYY-MM-DD"
                                : undefined
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <details className="judge-extra">
                      <summary>Additional unit facts</summary>
                      <div className="judge-form-grid">
                        {fields
                          .filter(
                            (field) =>
                              ![
                                "brand",
                                "model",
                                "serial",
                                "color",
                                "retailer",
                                "purchaseCountry",
                                "originalPurchaseDate",
                              ].includes(field),
                          )
                          .map((field) => (
                            <label key={field}>
                              {fieldName(field)}
                              <input
                                maxLength={200}
                                value={draft[field] ?? ""}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    [field]: event.target.value,
                                  })
                                }
                              />
                            </label>
                          ))}
                      </div>
                    </details>
                    <button
                      className="judge-primary"
                      type="submit"
                      disabled={!ready}
                    >
                      Add unit to session
                    </button>
                  </form>
                </section>
                <section className="judge-card">
                  <Upload className="judge-accent-icon" size={28} />
                  <h2>Import your CSV</h2>
                  <p>
                    Use assetTag and title headers plus the facts you know. The
                    template contains no example inventory.
                  </p>
                  <label className="judge-upload">
                    Choose inventory CSV
                    <input
                      aria-label="Choose inventory CSV"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (event) => {
                        const generation = ++uploadGeneration.current;
                        const file = event.target.files?.[0];
                        setCsv(null);
                        setFileName("");
                        if (!file) return;
                        if (file.size > MAX_CSV_BYTES) {
                          setError("CSV exceeds 256 KB.");
                          return;
                        }
                        try {
                          const text = await file.text();
                          if (generation !== uploadGeneration.current) return;
                          const parsed = parseCsv(text);
                          if (!parsed.length)
                            throw Error(
                              "This CSV has headers only. Add your real unit records first.",
                            );
                          setCsv(parsed);
                          setFileName(file.name);
                          setError("");
                        } catch (cause) {
                          if (generation === uploadGeneration.current)
                            setError(
                              cause instanceof Error &&
                                cause.name !== "ZodError"
                                ? cause.message
                                : "CSV fields are invalid. Check the template headers and required values.",
                            );
                        }
                      }}
                    />
                  </label>
                  {csv && (
                    <div className="judge-import-review">
                      <strong>{csv.length} units ready for review</strong>
                      <p>{fileName}</p>
                      <ul>
                        {csv.slice(0, 3).map((item) => (
                          <li key={item.assetTag}>
                            {item.assetTag} · {item.title}
                          </li>
                        ))}
                      </ul>
                      {csv.length > 3 && <p>And {csv.length - 3} more.</p>}
                      <button
                        className="judge-primary"
                        onClick={() =>
                          attempt(() => {
                            updateItems(createJudgeItems(csv, items));
                            setCsv(null);
                            setMessage("Reviewed CSV added to this session.");
                          })
                        }
                      >
                        Import {csv.length} units
                      </button>
                    </div>
                  )}
                  <p className="judge-small">
                    Up to 1,000 units and 256 KB per CSV. Duplicate asset tags
                    are rejected. Files are parsed in your browser.
                  </p>
                </section>
              </div>
              <section className="judge-card">
                <div className="judge-section-title">
                  <h2>
                    Your units{" "}
                    <span className="judge-count">{items.length}</span>
                  </h2>
                  {items.length > 0 && (
                    <button onClick={() => go("investigations")}>
                      Compare saved notice <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                {!items.length ? (
                  <div className="judge-empty">
                    <Package size={30} />
                    <h3>No units added</h3>
                    <p>
                      You can still explore official evidence and download its
                      report. No serial numbers or ownership records will be
                      invented.
                    </p>
                  </div>
                ) : (
                  <div className="judge-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Asset / product</th>
                          <th>Model / serial</th>
                          <th>Saved-notice result</th>
                          <th>Local hold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{row.item.assetTag}</strong>
                              <span>{row.item.title}</span>
                            </td>
                            <td>
                              {row.item.model || "Model unknown"}
                              <span>{row.item.serial || "Serial unknown"}</span>
                            </td>
                            <td>
                              {row.decision
                                ? statusName(row.decision.status)
                                : "Not assessed"}
                            </td>
                            <td>{row.held ? "Held" : "No hold set"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          {screen === "investigations" && (
            <>
              <div className="judge-title">
                <div>
                  <div className="judge-eyebrow">Source → criteria → unit</div>
                  <h1>Investigations</h1>
                  <p>
                    Inspect a preserved extraction and run a real comparison of
                    your inputs.
                  </p>
                </div>
                <span className="judge-badge">
                  Saved evidence · no live call
                </span>
              </div>
              <section className="judge-card">
                <label className="judge-select-label">
                  Saved official notice
                  <select
                    value={evidenceId}
                    onChange={(event) => setEvidenceId(event.target.value)}
                  >
                    {judgeEvidence.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.noticeId}
                      </option>
                    ))}
                  </select>
                </label>
                <h2>{evidence.title}</h2>
                <p className="judge-quote">{excerptText(evidence.excerpt)}</p>
                <div className="judge-buttons">
                  <a href={evidence.url} target="_blank" rel="noreferrer">
                    Original manufacturer notice <ArrowUpRight size={15} />
                  </a>
                  <a
                    href={evidence.supportingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Linked CPSC notice <ArrowUpRight size={15} />
                  </a>
                </div>
                <dl className="judge-provenance">
                  <div>
                    <dt>Source retrieved</dt>
                    <dd>{date(evidence.retrievedAt)}</dd>
                  </div>
                  <div>
                    <dt>Rule record saved</dt>
                    <dd>{date(evidence.extractedAt)}</dd>
                  </div>
                  <div>
                    <dt>Anakin source retrieval ID</dt>
                    <dd>{evidence.providerId}</dd>
                  </div>
                </dl>
                <details className="judge-extra">
                  <summary>Provenance and original source hash</summary>
                  <p>{evidence.provenance}</p>
                  <code>{evidence.contentHash}</code>
                </details>
              </section>
              <section className="judge-card">
                <div className="judge-section-title">
                  <h2>Criteria from the notice</h2>
                  <span>
                    {flatten(evidence.rule.conditions).length} inclusion
                    criteria
                  </span>
                </div>
                <p>
                  These values describe the published notice; they are not
                  prefilled physical inventory. The rule also retains explicit
                  exclusions.
                </p>
                <div className="judge-criteria">
                  {flatten(evidence.rule.conditions).map((condition) => (
                    <div key={condition.id}>
                      <span>{fieldName(condition.field)}</span>
                      <strong>{condition.values.join(" · ")}</strong>
                      <small>
                        {condition.op.replaceAll("_", " ")}
                        {condition.precision ? ` / ${condition.precision}` : ""}
                      </small>
                    </div>
                  ))}
                </div>
                <details className="judge-extra">
                  <summary>
                    Read exclusion criteria and supporting excerpts
                  </summary>
                  {evidence.rule.exclusions &&
                    flatten(evidence.rule.exclusions).map((condition) => (
                      <div key={condition.id} className="judge-exclusion">
                        <strong>
                          {fieldName(condition.field)} ·{" "}
                          {condition.op.replaceAll("_", " ")} ·{" "}
                          {condition.values.join(" / ")}
                        </strong>
                        <p>{excerptText(condition.evidence)}</p>
                      </div>
                    ))}
                </details>
              </section>
              <section className="judge-card">
                <div className="judge-section-title">
                  <h2>Compare your inventory</h2>
                  <span>{items.length} units in this session</span>
                </div>
                <p>
                  The TypeScript matcher evaluates the selected saved rule. It
                  does not search other notices or recheck today’s source. A
                  match adds a local hold; later assessments do not silently
                  release it.
                </p>
                <div className="judge-buttons">
                  <button
                    className="judge-primary"
                    disabled={!items.length}
                    onClick={run}
                  >
                    Compare {items.length}{" "}
                    {items.length === 1 ? "unit" : "units"} with saved notice
                  </button>
                  <button onClick={() => go("inventory")}>
                    {items.length
                      ? "Open inventory"
                      : "Add your first real unit"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
                {!items.length && (
                  <p className="judge-small">
                    No unit needed to inspect the evidence above or download an
                    evidence report in Exports.
                  </p>
                )}
                {assessed > 0 && (
                  <div className="judge-results">
                    <h3>
                      {assessed} assessed · {review} need review · {held} local
                      holds
                    </h3>
                    {items
                      .filter((row) => row.decision)
                      .map((row) => (
                        <details key={row.id} className="judge-result">
                          <summary>
                            <strong>{row.item.assetTag}</strong>
                            <span
                              className={`judge-status judge-status-${row.decision!.status}`}
                            >
                              {statusName(row.decision!.status)}
                            </span>
                            {row.held && <span>Local hold</span>}
                          </summary>
                          <p>{row.decision!.reason}</p>
                          <p className="judge-small">
                            {row.decision!.verified} / {row.decision!.total}{" "}
                            criteria evaluated from supplied facts. Outcome
                            applies only to this saved notice.
                          </p>
                          <div className="judge-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Fact</th>
                                  <th>Your value</th>
                                  <th>Requirement / source excerpt</th>
                                  <th>Outcome</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.decision!.trace.map((trace, index) => (
                                  <tr key={index}>
                                    <td>
                                      {fieldName(trace.field)}
                                      {trace.exclusion && (
                                        <span>Exclusion</span>
                                      )}
                                    </td>
                                    <td>{trace.inventoryValue ?? "Unknown"}</td>
                                    <td>
                                      {trace.requirement}
                                      <span>{excerptText(trace.evidence)}</span>
                                    </td>
                                    <td>{trace.outcome}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                  </div>
                )}
              </section>
            </>
          )}
          {screen === "exports" && (
            <>
              <div className="judge-title">
                <div>
                  <div className="judge-eyebrow">Take a traceable record</div>
                  <h1>Exports</h1>
                  <p>
                    Downloads contain this session’s evidence and supplied
                    facts, with the saved-source scope included.
                  </p>
                </div>
              </div>
              <div className="judge-export-grid">
                {[
                  {
                    kind: "json",
                    title: "Evidence report",
                    text: "Official criteria, provenance, retrieval dates, limitations, and any unit assessment traces.",
                    count: `${judgeEvidence.length} saved notice · ${items.length} units`,
                    button: "Download evidence JSON",
                  },
                  {
                    kind: "csv",
                    title: "Inventory results",
                    text: "Your supplied unit facts, assessment results, source links and local hold status.",
                    count: `${items.length} units`,
                    button: "Download inventory CSV",
                  },
                  {
                    kind: "holds",
                    title: "Local hold list",
                    text: "Units flagged by the saved notice in this browser session. No external action has been taken.",
                    count: `${held} held units`,
                    button: "Download holds CSV",
                  },
                ].map((entry) => (
                  <section key={entry.kind} className="judge-card">
                    <Download className="judge-accent-icon" size={26} />
                    <h2>{entry.title}</h2>
                    <p>{entry.text}</p>
                    <strong className="judge-export-count">
                      {entry.count}
                    </strong>
                    <button
                      className="judge-primary"
                      onClick={() =>
                        save(entry.kind as "json" | "csv" | "holds")
                      }
                    >
                      {entry.button}
                    </button>
                  </section>
                ))}
              </div>
              <section className="judge-card">
                <h2>No inventory yet? The evidence report still works.</h2>
                <p>
                  It includes the actual saved notice and its rule. Inventory
                  CSVs contain headers only until you add units. These files are
                  not the private owner workspace’s exports.
                </p>
              </section>
            </>
          )}
          {screen === "settings" && (
            <>
              <div className="judge-title">
                <div>
                  <div className="judge-eyebrow">Access and scope</div>
                  <h1>Judge portal settings</h1>
                  <p>
                    A separate workspace for each visitor, with no shared owner
                    access key.
                  </p>
                </div>
              </div>
              <div className="judge-two-columns">
                <section className="judge-card">
                  <h2>Public session</h2>
                  <dl className="judge-settings-list">
                    <div>
                      <dt>Access</dt>
                      <dd>No account or key required</dd>
                    </div>
                    <div>
                      <dt>Storage</dt>
                      <dd>This tab’s session storage</dd>
                    </div>
                    <div>
                      <dt>Inventory</dt>
                      <dd>{items.length} visitor-supplied units</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{judgeEvidence.length} dated official notice</dd>
                    </div>
                    <div>
                      <dt>Provider requests</dt>
                      <dd>None from this portal</dd>
                    </div>
                  </dl>
                  <p>
                    Reloading this tab keeps your work where browser storage is
                    available. Export first if you want to keep a copy outside
                    this session.
                  </p>
                  {reset ? (
                    <div className="judge-buttons">
                      <button
                        className="judge-danger"
                        onClick={() => {
                          uploadGeneration.current++;
                          attempt(() => updateItems([]));
                          setDraft({});
                          setCsv(null);
                          setFileName("");
                          setReset(false);
                          setMessage(
                            "Session cleared. Official evidence remains available.",
                          );
                        }}
                      >
                        Confirm clear session
                      </button>
                      <button onClick={() => setReset(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setReset(true)}>
                      Clear this session
                    </button>
                  )}
                </section>
                <section className="judge-card">
                  <LockKeyhole className="judge-accent-icon" size={26} />
                  <h2>Owner workspace</h2>
                  <p>
                    The owner portal uses a signed session and persistent Turso
                    storage. It supports fresh Anakin investigations, Wire
                    enrichment, staff tasks and monitor controls.
                  </p>
                  <p>
                    Judges can evaluate the public workflow without receiving
                    this credential. The owner key is not part of the
                    submission.
                  </p>
                  <Link className="judge-link-button" href="/workspace">
                    Owner sign-in <ArrowUpRight size={16} />
                  </Link>
                </section>
              </div>
            </>
          )}
          <footer className="judge-footer">
            RecallOps provides evidence-backed decision support. A saved-notice
            comparison is not a current full recall search or a safety
            certification. Check the original notices before taking action. No
            claim, message or disposal request is submitted here.
          </footer>
        </main>
      </div>
    </div>
  );
}
