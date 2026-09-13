import snapshot from "@/data/judge-evidence.json";
import {
  decide,
  fields,
  inventorySchema,
  ruleSchema,
  type Decision,
  type Inventory,
} from "@/lib/core/rules";
import { MAX_ROWS, toCsv } from "@/lib/core/csv";

export const judgeEvidence = snapshot.records.map((record) => ({
  ...record,
  rule: ruleSchema.parse(record.rule),
}));
export const judgeScope = snapshot.scope;
export type JudgeItem = {
  id: string;
  item: Inventory;
  decision: Decision | null;
  evidenceId: string | null;
  assessedAt: string | null;
  held: boolean;
};
export function createJudgeItems(
  items: Inventory[],
  existing: JudgeItem[] = [],
): JudgeItem[] {
  if (items.length + existing.length > MAX_ROWS)
    throw Error(`Keep this session within ${MAX_ROWS.toLocaleString()} units.`);
  const tags = new Set(existing.map((row) => row.item.assetTag.toLowerCase()));
  const added = items.map((input) => {
    const item = inventorySchema.parse(input) as Inventory;
    if (tags.has(item.assetTag.toLowerCase()))
      throw Error(
        `Asset tag ${item.assetTag} already exists. Use a unique tag for each physical unit.`,
      );
    tags.add(item.assetTag.toLowerCase());
    return {
      id: crypto.randomUUID(),
      item,
      decision: null,
      evidenceId: null,
      assessedAt: null,
      held: false,
    };
  });
  return [...existing, ...added];
}
export function assessJudgeItems(
  items: JudgeItem[],
  evidenceId: string,
): JudgeItem[] {
  const evidence = judgeEvidence.find((record) => record.id === evidenceId);
  if (!evidence) throw Error("Select an available saved notice.");
  return items.map((row) => {
    const decision = decide(row.item, evidence.rule);
    return {
      ...row,
      decision,
      evidenceId,
      assessedAt: new Date().toISOString(),
      held: row.held || decision.status === "affected",
    };
  });
}
export function restoreJudgeItems(raw: string): JudgeItem[] {
  if (raw.length > 4_000_000)
    throw Error("Saved session exceeds the size limit.");
  const saved = JSON.parse(raw);
  if (saved.version !== 1 || !Array.isArray(saved.items))
    throw Error("Saved session format is unsupported.");
  const rows = createJudgeItems(saved.items.map((row: JudgeItem) => row.item));
  return rows.map((row, index) => {
    const previous = saved.items[index];
    if (!previous.evidenceId) return row;
    const [assessed] = assessJudgeItems([row], previous.evidenceId);
    return {
      ...assessed,
      held: assessed.held || previous.held === true,
      assessedAt:
        typeof previous.assessedAt === "string" &&
        Number.isFinite(Date.parse(previous.assessedAt))
          ? previous.assessedAt
          : assessed.assessedAt,
    };
  });
}
export function exportJudgeJson(
  items: JudgeItem[],
  evidenceId?: string,
): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      mode: "PUBLIC_JUDGE_SAVED_EVIDENCE",
      exportedAt: new Date().toISOString(),
      scope: judgeScope,
      limitations: [
        "Unit facts are supplied by the visitor and have not been independently verified.",
        "No fresh Anakin request or complete recall search was performed.",
        "Outcomes apply only to the saved notice. Exclusion is not a safety certification.",
        "Holds are local session flags, not changes to owner inventory.",
      ],
      evidence: judgeEvidence.filter(
        (record) => !evidenceId || record.id === evidenceId,
      ),
      inventory: items,
    },
    null,
    2,
  );
}
export function exportJudgeCsv(items: JudgeItem[], onlyHeld = false): string {
  return toCsv(
    items
      .filter((row) => !onlyHeld || row.held)
      .map((row) => ({
        ...row.item,
        status: row.decision?.status ?? "not_assessed",
        localHold: row.held,
        assessedAt: row.assessedAt,
        sourceUrl:
          judgeEvidence.find((record) => record.id === row.evidenceId)?.url ??
          "",
        sourceRetrievedAt:
          judgeEvidence.find((record) => record.id === row.evidenceId)
            ?.retrievedAt ?? "",
        mode: "PUBLIC_JUDGE_SAVED_EVIDENCE",
        reason: row.decision?.reason ?? "",
      })),
    [
      "assetTag",
      "title",
      ...fields,
      "status",
      "localHold",
      "assessedAt",
      "sourceUrl",
      "sourceRetrievedAt",
      "mode",
      "reason",
    ],
  );
}
