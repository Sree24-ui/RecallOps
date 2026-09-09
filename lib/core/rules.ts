import { z } from 'zod';

export const states = [
  'affected',
  'excluded_by_notice',
  'needs_review',
  'no_relevant_notice_found',
] as const;
export type AssessmentState = (typeof states)[number];
export const labels = [
  'LIVE_ANAKIN',
  'CACHED_ANAKIN',
  'CONTROLLED_DEMO_FIXTURE',
  'DEGRADED_FALLBACK',
] as const;
export type SourceLabel = (typeof labels)[number];
export const fields = [
  'brand',
  'model',
  'serial',
  'sku',
  'batch',
  'color',
  'variant',
  'originalPurchaseDate',
  'manufactureDate',
  'retailer',
  'channel',
  'purchaseCountry',
  'hasPawPrint',
] as const;
export type Field = (typeof fields)[number];
export type Inventory = { assetTag: string; title: string } & Partial<
  Record<Field, string>
>;
export const inventorySchema = z
  .object({
    assetTag: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(200),
    ...Object.fromEntries(
      fields.map((f) => [f, z.string().trim().max(200).optional()]),
    ),
  })
  .strict();
export type Condition = {
  kind: 'condition';
  id: string;
  field: Field;
  op:
    | 'equals'
    | 'model_equals'
    | 'in'
    | 'not_in'
    | 'prefix'
    | 'suffix'
    | 'serial_range'
    | 'date_range'
    | 'boolean'
    | 'unsupported';
  values: string[];
  evidence: string;
  precision?: 'day' | 'month';
};
export type Logic = Condition | { kind: 'all' | 'any'; children: Logic[] };
export const logicSchema: z.ZodType<Logic> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.literal('condition'),
        id: z.string().max(80),
        field: z.enum(fields),
        op: z.enum([
          'equals',
          'model_equals',
          'in',
          'not_in',
          'prefix',
          'suffix',
          'serial_range',
          'date_range',
          'boolean',
          'unsupported',
        ]),
        values: z.array(z.string().max(300)).max(60),
        evidence: z.string().min(1).max(800),
        precision: z.enum(['day', 'month']).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.enum(['all', 'any']),
        children: z.array(logicSchema).min(1).max(30),
      })
      .strict(),
  ]),
);
export const ruleSchema = z
  .object({
    schemaVersion: z.literal('1'),
    noticeId: z.string().max(100),
    title: z.string().max(300),
    brand: z.string().min(1).max(100),
    models: z.array(z.string().min(1).max(100)).min(1).max(20),
    scopeEvidence: z.string().min(1).max(800),
    conditions: logicSchema,
    exclusions: logicSchema.nullable(),
    unresolved: z.array(z.string().max(400)).max(20),
    hazard: z.string().max(800),
    immediateAction: z.string().max(800),
    remedy: z.string().max(800),
    proof: z.array(z.string().max(300)).max(20),
    contact: z.string().max(300),
    claimUrl: z.string().max(1000),
    informationEvidence: z.string().min(1).max(1500),
  })
  .strict();
export type Rule = z.infer<typeof ruleSchema>;
export type Trace = {
  id: string;
  field: Field;
  inventoryValue: string | null;
  requirement: string;
  outcome: 'match' | 'mismatch' | 'missing' | 'unsupported';
  evidence: string;
  exclusion: boolean;
};
export type Decision = {
  status: AssessmentState;
  trace: Trace[];
  verified: number;
  total: number;
  reason: string;
};
export const normalize = (s: string) =>
  s.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
export const normalizeModel = (s: string) =>
  normalize(s).replace(/[\s\-_]/g, '');
const truth = (a: boolean): true | false => a;
type Tri = true | false | null;
function combine(kind: 'all' | 'any', values: Tri[]): Tri {
  if (!values.length) return null;
  if (kind === 'all')
    return values.includes(false) ? false : values.includes(null) ? null : true;
  return values.includes(true) ? true : values.includes(null) ? null : false;
}
function validDate(v: string, precision: 'day' | 'month'): boolean {
  if (precision === 'month')
    return (
      /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(v) &&
      (v.length === 7 || validDate(v, 'day'))
    );
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
function leaf(c: Condition, item: Inventory): Tri {
  const raw = item[c.field];
  if (raw === undefined || raw.trim() === '') return null;
  if (c.field === 'serial' && /\s/.test(raw.trim())) return null;
  const n = normalize(raw),
    vs = c.values.map(normalize);
  switch (c.op) {
    case 'equals':
      return vs.length === 1 ? truth(n === vs[0]) : null;
    case 'model_equals':
      return vs.length === 1
        ? truth(normalizeModel(raw) === normalizeModel(vs[0]))
        : null;
    case 'in':
      return vs.length ? truth(vs.includes(n)) : null;
    case 'not_in':
      return vs.length ? truth(!vs.includes(n)) : null;
    case 'prefix':
      return vs.length === 1 && vs[0] ? truth(n.startsWith(vs[0])) : null;
    case 'suffix':
      return vs.length === 1 && vs[0] ? truth(n.endsWith(vs[0])) : null;
    case 'boolean':
      return vs.length === 1 &&
        ['TRUE', 'FALSE'].includes(n) &&
        ['TRUE', 'FALSE'].includes(vs[0])
        ? truth(n === vs[0])
        : null;
    case 'serial_range': {
      // Comparable prefix and digit width only. Never lexicographic arbitrary serial ranges.
      const parts = [n, ...vs].map((x) => /^([A-Z]*)(\d+)$/.exec(x));
      if (
        vs.length !== 2 ||
        parts.some((x) => !x) ||
        !parts.every(
          (x) => x![1] === parts[0]![1] && x![2].length === parts[0]![2].length,
        )
      )
        return null;
      const [v, a, b] = parts.map((x) => BigInt(x![2]));
      return a > b ? null : truth(v >= a && v <= b);
    }
    case 'date_range': {
      const p = c.precision ?? 'day';
      if (vs.length !== 2 || ![raw, ...c.values].every((x) => validDate(x, p)))
        return null;
      const width = p === 'month' ? 7 : 10;
      const [v, a, b] = [raw, ...c.values].map((x) => x.slice(0, width));
      return a > b ? null : truth(v >= a && v <= b);
    }
    default:
      return null;
  }
}
export function flatten(node: Logic): Condition[] {
  return node.kind === 'condition' ? [node] : node.children.flatMap(flatten);
}
function evaluate(
  node: Logic,
  item: Inventory,
  trace: Trace[],
  exclusion = false,
): Tri {
  if (node.kind !== 'condition')
    return combine(
      node.kind,
      node.children.map((x) => evaluate(x, item, trace, exclusion)),
    );
  const v = leaf(node, item),
    raw = item[node.field];
  trace.push({
    id: node.id,
    field: node.field,
    inventoryValue: raw || null,
    requirement: `${node.op}: ${node.values.join(' · ')}${node.precision ? ` (${node.precision} precision)` : ''}`,
    outcome:
      v === true
        ? 'match'
        : v === false
          ? 'mismatch'
          : raw
            ? 'unsupported'
            : 'missing',
    evidence: node.evidence,
    exclusion,
  });
  return v;
}
export function relevant(rule: Rule, item: Inventory): boolean | 'unknown' {
  if (!item.brand || !item.model) return 'unknown';
  return (
    normalize(item.brand) === normalize(rule.brand) &&
    rule.models.some((m) => normalizeModel(m) === normalizeModel(item.model!))
  );
}
export function decide(
  item: Inventory,
  rule: Rule | null,
  options: { conflict?: boolean; discoveryComplete?: boolean } = {},
): Decision {
  const base = { trace: [] as Trace[], verified: 0, total: 0 };
  if (!rule)
    return {
      ...base,
      status:
        options.discoveryComplete === false
          ? 'needs_review'
          : 'no_relevant_notice_found',
      reason:
        options.discoveryComplete === false
          ? 'Investigation incomplete. Retry discovery or review manually.'
          : 'No relevant notice found within the completed investigation scope. This is not a safety guarantee.',
    };
  const scope = relevant(rule, item);
  if (scope === false)
    return {
      ...base,
      status: 'no_relevant_notice_found',
      reason:
        'This notice covers a different product. Other recalls have not been ruled out.',
    };
  if (scope === 'unknown')
    return {
      ...base,
      status: 'needs_review',
      reason:
        'Product identity is incomplete; notice relevance cannot be established.',
    };
  const include = evaluate(rule.conditions, item, base.trace),
    exclude = rule.exclusions
      ? evaluate(rule.exclusions, item, base.trace, true)
      : false;
  base.total = base.trace.length;
  base.verified = base.trace.filter(
    (x) => x.outcome === 'match' || x.outcome === 'mismatch',
  ).length;
  if (options.conflict || rule.unresolved.length)
    return {
      ...base,
      status: 'needs_review',
      reason: options.conflict
        ? 'Conflicting source evidence requires review.'
        : `Unresolved notice conditions: ${rule.unresolved.join('; ')}`,
    };
  if (exclude === true || include === false)
    return {
      ...base,
      status: 'excluded_by_notice',
      reason:
        'An explicit condition excludes this unit from this notice. This is not a safety certification.',
    };
  if (include === true && exclude === false)
    return {
      ...base,
      status: 'affected',
      reason:
        'All mandatory inclusion conditions match and no explicit exclusion applies.',
    };
  return {
    ...base,
    status: 'needs_review',
    reason:
      'A relevant notice exists, but required inventory facts are missing or unsupported.',
  };
}
export function groundRule(input: unknown, markdown: string): Rule {
  checkDepth(input);
  const rule = ruleSchema.parse(input);
  const nodes = [
    ...flatten(rule.conditions),
    ...(rule.exclusions ? flatten(rule.exclusions) : []),
  ];
  if (nodes.length > 80) throw Error('Extraction exceeds condition limit');
  for (const quote of [
    rule.scopeEvidence,
    rule.informationEvidence,
    ...nodes.map((x) => x.evidence),
  ])
    if (!markdown.includes(quote))
      throw Error('Extraction evidence is not an exact source excerpt');
  if (!nodes.some((x) => x.field === 'model'))
    throw Error('Notice lacks an explicit model condition');
  for (const c of nodes) {
    const required = ['date_range', 'serial_range'].includes(c.op)
      ? 2
      : ['in', 'not_in', 'unsupported'].includes(c.op)
        ? null
        : 1;
    if (
      c.op !== 'unsupported' &&
      (!c.values.length || (required !== null && c.values.length !== required))
    )
      throw Error('Invalid extraction operator arity');
    if (c.op === 'boolean') {
      // Natural-language polarity needs semantic review; a quoted keyword alone
      // cannot establish that a boolean is true or false.
      rule.unresolved.push('Boolean eligibility requires manual source review');
    } else if (c.op !== 'unsupported') {
      for (const value of c.values) {
        const supported =
          c.op === 'date_range'
            ? dateOperandSupported(c.evidence, value, c.precision ?? 'day')
            : c.field === 'purchaseCountry' && normalize(value) === 'US'
              ? ['US', 'USA', 'United States', 'United States of America'].some(
                  (alias) => containsOperand(c.evidence, alias),
                )
              : containsOperand(c.evidence, value, c.op === 'model_equals');
        if (!supported)
          throw Error(
            'Extracted operand is not grounded in its supporting excerpt',
          );
      }
    }
  }
  if (!containsOperand(rule.scopeEvidence, rule.brand))
    rule.unresolved.push(
      'Brand scope is not explicitly supported by the scope excerpt',
    );

  if (
    rule.models.some(
      (model) => !containsOperand(rule.scopeEvidence, model, true),
    )
  )
    rule.unresolved.push(
      'Model scope is not explicitly supported by its excerpt',
    );
  if (
    /(?:only|limited)[\s\S]{0,180}(?:serial|\bSN\b)/i.test(markdown) &&
    !nodes.some((c) => c.field === 'serial')
  )
    rule.unresolved.push(
      'Serial eligibility language exists but no serial condition was extracted',
    );
  // Extraction is evidence, never executable policy or tool authorization.
  if (
    /ignore (?:all |previous |prior )?instructions|system prompt|api[_ -]?key|send.*credentials/i.test(
      markdown,
    )
  )
    rule.unresolved.push(
      'Potential prompt injection in source content; manual review required',
    );
  return rule;
}

function containsOperand(
  excerpt: string,
  value: string,
  model = false,
): boolean {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = model ? normalizeModel(value) : normalize(value);
  if (!normalized) return false;
  const pattern = model
    ? Array.from(normalized, escape).join('[\\s_-]*')
    : escape(normalized);
  // Keep identifier boundaries and internal punctuation. 000G2 is not 000G21,
  // and neither 000G21-X nor A000G21 proves the exact serial 000G21.
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])${pattern}(?=$|[^\\p{L}\\p{N}_-])`,
    'u',
  ).test(normalize(excerpt));
}

function dateOperandSupported(
  excerpt: string,
  value: string,
  precision: 'day' | 'month',
): boolean {
  if (
    !validDate(value, precision) ||
    value.length !== (precision === 'month' ? 7 : 10)
  )
    return false;
  if (containsOperand(excerpt, value)) return true;
  const months = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];
  const names = months.map((m) => `${m}|${m.slice(0, 3)}`).join('|');
  const pattern = new RegExp(
    `\\b(${names})\\.?\\s+(?:(\\d{1,2})(?:ST|ND|RD|TH)?[,]?\\s+)?(\\d{4})\\b`,
    'g',
  );
  for (const match of normalize(excerpt).matchAll(pattern)) {
    const month = String(
      months.findIndex((m) => m.startsWith(match[1])) + 1,
    ).padStart(2, '0');
    const date = `${match[3]}-${month}${match[2] ? `-${match[2].padStart(2, '0')}` : ''}`;
    // Never invent day precision from a month-only source statement.
    if (date === value) return true;
  }
  return false;
}
export const maySell = (
  state: AssessmentState,
  quarantined: boolean,
  acknowledged: boolean,
) =>
  !quarantined &&
  acknowledged &&
  (state === 'excluded_by_notice' || state === 'no_relevant_notice_found');

function checkDepth(value: unknown, depth = 0): void {
  if (depth > 12) throw Error('Extraction nesting exceeds limit');
  if (value && typeof value === 'object')
    for (const child of Object.values(value)) checkDepth(child, depth + 1);
}
