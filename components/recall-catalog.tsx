"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Search,
  ArrowUpRight,
  ArrowRight,
  FileCheck2,
  PackageSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import catalog from "@/data/official-recalls.json";
import { filterRecalls, recallNumber } from "@/lib/ui/catalog";

export function RecallCatalog() {
  const [query, setQuery] = useState("");
  const records = filterRecalls(catalog.records, query);
  const verified = catalog.records.map((r) => r.retrievedAt).sort()[0];
  return (
    <div className="catalog-shell">
      <a href="#catalog-results" className="skip-link">
        Skip to recalls
      </a>
      <header className="catalog-nav">
        <Link className="brand" href="/">
          <ShieldCheck />
          RecallOps
        </Link>
        <Link className="catalog-workspace" href="/judge">
          Open judge portal <ArrowUpRight size={18} />
        </Link>
      </header>
      <main className="catalog-main">
        <div className="catalog-heading">
          <div>
            <div className="eyebrow">Official evidence / US electronics</div>
            <h1>
              Know the notice.
              <br />
              <span>Verify the unit.</span>
            </h1>
            <p>
              Search real product recalls from the U.S. Consumer Product Safety
              Commission. Open the official notice for eligibility and remedy
              instructions.
            </p>
          </div>
          <div className="catalog-source">
            <FileCheck2 size={28} />
            <strong>{catalog.records.length} official notices</strong>
            <span>
              Retrieved{" "}
              {verified
                ? new Date(verified).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "—"}
            </span>
            <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">
              About the CPSC data <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <section
          aria-label="Search official notices"
          className="catalog-search"
        >
          <Search size={21} />
          <label className="sr-only" htmlFor="recall-search">
            Search by brand, model or recall number
          </label>
          <Input
            id="recall-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand, model or recall number"
          />
          {query && (
            <Button variant="ghost" onClick={() => setQuery("")}>
              Clear
            </Button>
          )}
        </section>
        <div className="catalog-scope">
          <p>{catalog.scope}</p>
          <a
            href="https://www.cpsc.gov/Recalls"
            target="_blank"
            rel="noreferrer"
          >
            Search all CPSC recalls <ArrowUpRight size={15} />
          </a>
        </div>
        <section id="catalog-results" tabIndex={-1} aria-label="Recall notices">
          <div className="catalog-results-header">
            <h2>Recall notices</h2>
            <output>
              {records.length} of {catalog.records.length} shown
            </output>
          </div>
          <div className="catalog-grid">
            {records.map((r) => (
              <article className="catalog-card" key={r.id}>
                <div className="catalog-card-meta">
                  <span>CPSC {recallNumber(r.number)}</span>
                  <time dateTime={r.date}>
                    {new Date(r.date + "T00:00:00Z").toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      },
                    )}
                  </time>
                </div>
                <h3>{r.products.join(" · ") || r.title}</h3>
                <p className="catalog-hazard">{r.hazards.join(" ")}</p>
                <details>
                  <summary>Product details & remedy</summary>
                  <div className="catalog-detail">
                    <h4>Official description</h4>
                    <p>{r.description}</p>
                    <h4>Remedy</h4>
                    <p>
                      Read the current remedy instructions in the original CPSC
                      notice. The API snapshot can omit or mismatch this
                      information.
                    </p>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      View remedy on CPSC <ArrowUpRight size={15} />
                    </a>
                    <p className="muted">{r.contact}</p>
                  </div>
                </details>
                <a
                  className="catalog-official"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read official notice <ArrowUpRight size={18} />
                </a>
              </article>
            ))}
          </div>
          {!records.length && (
            <div className="empty">
              <PackageSearch />
              <h3>No notice in this selection matches</h3>
              <p>
                Try another spelling or use the full CPSC recall search above.
                An empty result does not establish that a product is safe.
              </p>
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          )}
        </section>
        <section className="catalog-next">
          <div>
            <h2>Explore the RecallOps workflow</h2>
            <p>
              Open the public judge portal without a key. Inspect saved official
              evidence, compare your own unit facts, and download a report.
              Fresh Anakin investigations remain in the owner workspace.
            </p>
          </div>
          <Link href="/judge">
            Explore judge portal <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="catalog-footer">
        <span>RecallOps · Evidence before resale</span>
        <a href={catalog.licenseUrl} target="_blank" rel="noreferrer">
          Public data & provenance
        </a>
        <a href="/api/recalls" download="official-recalls.json">
          Download notice data
        </a>
      </footer>
    </div>
  );
}
