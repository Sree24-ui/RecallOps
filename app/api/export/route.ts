import { context, errorResponse } from '../../../lib/server/api';
import { payload } from '../../../lib/server/store';
import { type Inventory, maySell } from '../../../lib/core/rules';
import type { Assessment } from '../../../lib/server/workflow';
import { toCsv } from '../../../lib/core/csv';
import { escapeHtml as h } from '../../../lib/server/security';
export async function GET(req: Request) {
  try {
    const { store } = context(req),
      url = new URL(req.url),
      type = url.searchParams.get('type') ?? 'holds',
      itemId = url.searchParams.get('itemId');
    const items = await store.all(
        'SELECT * FROM inventory_items ORDER BY asset_tag',
      ),
      assessments = await store.all(
        'SELECT * FROM assessments ORDER BY created_at DESC,rowid DESC',
      ),
      cases = await store.all('SELECT * FROM cases');
    const rows = items.map((r) => {
      const a = assessments.find((x) => x.item_id === r.id);
      return {
        ...payload<Inventory>(r),
        id: r.id,
        quarantined: !!r.quarantined,
        assessment: a ? payload<Assessment>(a) : null,
        acknowledged: !!cases.find((c) => c.item_id === r.id)?.acknowledged,
      };
    });
    let content = '',
      mime = 'text/csv',
      extension = 'csv';
    if (type === 'holds')
      content = toCsv(
        rows
          .filter((r) => r.quarantined)
          .map((r) => ({ ...r, status: r.assessment?.status })),
        ['assetTag', 'title', 'serial', 'quarantined', 'status'],
      );
    else if (type === 'approved')
      content = toCsv(
        rows
          .filter(
            (r) =>
              r.assessment &&
              maySell(r.assessment.status, r.quarantined, r.acknowledged),
          )
          .map((r) => ({
            ...r,
            status: r.assessment?.status,
            note: 'Operator acknowledged; assessment is not a safety guarantee',
          })),
        ['assetTag', 'title', 'serial', 'status', 'note'],
      );
    else if (type === 'sales') {
      const sales = await store.all('SELECT * FROM sales_records');
      content = toCsv(
        sales
          .filter((s) => rows.find((r) => r.id === s.item_id)?.quarantined)
          .map((s) => ({
            ...payload(s),
            assetTag: rows.find((r) => r.id === s.item_id)?.assetTag,
            suggestedMessage:
              'We are contacting you about a potential product recall. Please stop using the identified unit and review the linked official notice. We will help you verify eligibility and next steps.',
          })),
        ['assetTag', 'customer', 'email', 'orderId', 'suggestedMessage'],
      );
    } else if (type === 'json') {
      content = JSON.stringify(
        rows.filter((r) => !itemId || r.id === itemId),
        null,
        2,
      );
      mime = 'application/json';
      extension = 'json';
    } else if (type === 'packet') {
      const selected = rows.filter((r) =>
        itemId ? r.id === itemId : r.quarantined,
      );
      const audit = await store.all(
        'SELECT * FROM audit_events ORDER BY created_at',
      );
      const sources = await store.all('SELECT * FROM source_versions');
      content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RecallOps action packet</title><style>body{font:16px/1.5 system-ui;color:#182e39;max-width:1000px;margin:40px auto;padding:24px}h1{font-size:36px}h2{border-top:2px solid #123e46;padding-top:24px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:10px;border:1px solid #ccd7dd;text-align:left;vertical-align:top}code{overflow-wrap:anywhere}blockquote{border-left:3px solid #297b7b;padding-left:16px}article{break-before:page}a{color:#075b75}@media print{body{margin:0}thead{display:table-header-group}}</style></head><body><h1>RecallOps / Action packet</h1><p>Business: RecallOps local workspace · Prepared ${h(new Date().toISOString())}</p><p>Evidence-backed decision support. Not legal advice, regulatory certification, or a guarantee that a product is safe. Quarantine is an internal inventory action. No claim or customer message has been submitted.</p>${selected
        .map((r) => {
          const a = r.assessment,
            s = sources.find((s) => s.id === a?.versionId),
            source = s ? payload(s) : null;
          return `<article><h2>${h(r.assetTag)} · ${h(r.title)}</h2><p><strong>${h(a?.status ?? 'Unassessed')}</strong> · Quarantine: ${h(r.quarantined)}</p><p>${h(a?.rule?.immediateAction ?? a?.reason)}</p><p>Serial: ${h(r.serial)} · Model: ${h(r.model)} · Case inventory ID: ${h(r.id)}</p><h3>Field-by-field decision</h3><table><thead><tr><th>Criterion</th><th>Inventory value</th><th>Requirement</th><th>Result</th><th>Exact evidence</th></tr></thead><tbody>${a?.trace.map((t) => `<tr><td>${h(t.field)}</td><td>${h(t.inventoryValue ?? 'Missing')}</td><td>${h(t.requirement)}</td><td>${h(t.outcome)}</td><td>${h(t.evidence)}</td></tr>`).join('') ?? ''}</tbody></table><h3>Source record</h3><p>${h(a?.label)} · Retrieved ${h(source?.retrievedAt)} · Version ${h(s?.id)}</p><p><a href="${h(a?.sourceUrl?.startsWith('https:') ? a.sourceUrl : '')}">${h(a?.sourceUrl)}</a></p><p>Supporting source: <a href="https://iniushop.com/pages/recall-b41">INIU recall notice</a></p><code>SHA-256 ${h(s?.content_hash)}</code><h3>Hazard and remedy</h3><p>${h(a?.rule?.hazard)}</p><p>${h(a?.rule?.remedy)}</p><p>${h(a?.rule?.contact)}</p><p>Claim link: ${h(a?.rule?.claimUrl)}</p><h3>Proof checklist</h3><ul>${a?.rule?.proof.map((p) => `<li>${h(p)}</li>`).join('') ?? ''}</ul><h3>Suggested customer message — draft</h3><blockquote>Our records identify your ${h(r.title)} (${h(r.assetTag)}) for recall review. Please stop using an affected unit and follow the official notice. We can help you collect the product and purchase details required to verify the manufacturer's remedy.</blockquote><h3>Audit timeline</h3><ul>${audit
            .filter((e) => e.entity_id === r.id)
            .map((e) => `<li>${h(e.created_at)} · ${h(e.event_type)}</li>`)
            .join('')}</ul></article>`;
        })
        .join('')}</body></html>`;
      mime = 'text/html';
      extension = 'html';
    } else throw Error('Unknown export type');
    await store
      .audit('export', 'export.created', { type, count: rows.length, itemId })
      .run();
    return new Response(content, {
      headers: {
        'Content-Type': `${mime}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="recallops-${type}.${extension}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
