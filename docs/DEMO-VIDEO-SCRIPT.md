# RecallOps — narrated demo script

Recommended: record your own voice over the current deployed website. A personal 2–3 minute walkthrough makes your contribution and the product clearer. The included WebM is a captions-only recording of the public portal, suitable as a backup or as footage for your own narration. It does not prove a fresh live Anakin run.

## Before recording

1. Open https://recallops-nine.vercel.app/judge in a fresh browser session. Use a desktop window around 1440 × 900, browser zoom 100%, and hide unrelated tabs and notifications.
2. Check microphone input in your screen recorder. Record the browser window and microphone; a face camera is optional. Do not show your owner key, environment files, or provider dashboard secrets.
3. Keep the public portal empty unless you have real unit details to demonstrate. Published serial criteria are notice facts, not proof you own a matching unit. Do not copy them into invented inventory.
4. Rehearse the sequence below once. If using the included WebM, add your own voice-over or upload it with its existing captions. The captions file is video/captions.vtt.

## Main recording: about 2 minutes 30 seconds

| Time | What to show / click | What to say |
| --- | --- | --- |
| 0:00–0:20 | Open /judge on Overview. Keep the no-key badge and navigation visible. | “Hi, I’m Sreepad, the sole builder of RecallOps. Recall notices identify affected products, but teams need to know which physical units require action. RecallOps brings official evidence and unit facts together, and keeps missing information in review.” |
| 0:20–0:35 | Point to the public badge and the five navigation screens. | “Judges can open this public portal without an owner key. Inventory stays in this browser tab. This evaluation uses dated, preserved official evidence; it does not make a new Anakin request.” |
| 0:35–1:00 | Click Investigations. Show the notice title, retrieval date and source links. Open the linked CPSC notice in another tab if it loads, then return. Expand provenance and original source hash. | “Here is the official INIU notice, linked to CPSC. Anakin retrieved the source in our earlier live integration checks. RecallOps preserves the retrieval date, provider identifier and original source hash, so the evidence is traceable.” |
| 1:00–1:20 | Scroll to Criteria from the notice. Expand exclusion criteria. | “The notice contains model, color, purchase-market, date and serial requirements, plus explicit exclusions. The owner pipeline validates extracted rules against the source. A deterministic TypeScript matcher evaluates them; the language model does not make the final unit decision.” |
| 1:20–1:40 | Click Inventory. Show the empty table, blank form and CSV template link. Do not submit invented values. | “Inventory starts empty because we do not fabricate owned units. A reviewer can add a real product or import their own CSV. Facts they do not know stay blank. With real inputs, Investigations runs the matcher and shows a criterion-by-criterion explanation. Affected results add a local hold.” |
| 1:40–2:00 | Click Exports → Download evidence JSON. Open the downloaded JSON with your browser/editor and briefly show mode, scope, evidence and empty inventory. | “Exports work even without inventory. This report includes the saved official rule, provenance and scope. With units added, it also includes assessment traces, and reviewers can download inventory and hold CSVs. These files do not expose the owner’s data.” |
| 2:00–2:20 | Return to Settings. Show session storage, provider-request status and the owner workspace description. | “The owner workspace remains protected. It supports fresh Anakin Search and Scraper investigations, Wire listing enrichment, persistent Turso inventory, internal tasks and monitor controls. The public evaluation does not simulate those live operations.” |
| 2:20–2:35 | Return to Overview and keep project name and public URL visible. | “RecallOps uses React and TypeScript on Node.js 24, deployed on Vercel with Turso for owner data. My focus is traceable evidence, explicit uncertainty and useful actions—without presenting a model match as a safety guarantee. Thank you.” |

## Optional: a stronger hands-on segment if you have a real unit

Replace the 1:20–1:40 segment with 40–60 seconds:

1. In Inventory, enter an actual unit’s asset tag and product title. Read brand, model and serial from its physical label and purchase facts from your receipt. Omit anything uncertain.
2. Click Add unit to session, then Investigations → Compare units with saved notice.
3. Expand that unit’s result and show match, mismatch, missing or unsupported facts. Say: “This result was calculated from the facts I supplied and the saved notice. It applies to this notice only; it is not a full current recall search.”
4. If the product is outside this notice, show that honestly. Do not promise an affected result or change serials to force one. Missing facts should remain needs review.
5. In Exports, download the result CSV and JSON evidence report. If you show a hold, explain it is a local flag in this public session, not an external action.

If you have no suitable physical unit, use the main script. Do not describe an empty-workspace video as a completed unit investigation. A fresh Anakin demonstration is an optional separate recording inside your protected owner session with genuine input and actual provider results; it is not included in this public walkthrough.

## Upload and submit

- Upload your final video to Drive, YouTube or Loom and make it viewable by link. Use the uploaded video URL in Demo Video link.
- Test both the video URL and https://recallops-nine.vercel.app/judge in a signed-out/private browser.
- Use FORM-ANSWERS.md for the form. The deployed link should be /judge, not /workspace. Never share the owner key.
