import { readableError } from './errors';
import { limitedText } from '../core/limits';
import { providerLimits } from '../core/runtime-policy';
import { z } from 'zod';
import { type Rule, type SourceLabel } from '../core/rules';
import { extractionSchema, decodeExtraction } from '../core/extraction';
import { safeUrl, recallNoticeUrl, redact } from './security';
export type Product = 'Search' | 'Scraper' | 'Wire' | 'Monitoring';
export type Run = {
  product: Product;
  status: 'success' | 'failed';
  startedAt: string;
  durationMs: number;
  requestCount: number;
  providerId?: string;
  cached?: boolean;
  credits?: number;
  error?: string;
};
export type Scrape = {
  id: string;
  url: string;
  markdown: string;
  rule: Rule;
  label: SourceLabel;
  cached: boolean;
};
const searchSchema = z.object({
  id: z.string().optional(),
  results: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        snippet: z.string().optional(),
        date: z.string().optional(),
        last_updated: z.string().optional(),
      }),
    )
    .max(20),
});
export class ProviderDeadlineError extends Error {
  constructor() {
    super(
      'The provider operation time limit was reached. Retry the operation; a submitted provider job may still be processing.',
    );
    this.name = 'ProviderDeadlineError';
  }
}
export class Anakin {
  constructor(
    private key: string | undefined,
    private record: (r: Run) => Promise<void>,
    private fetcher: typeof fetch = fetch,
    private pause: (n: number) => Promise<void> = (n) =>
      new Promise((r) => setTimeout(r, n)),
    private pollLimit = 25,
    private deadlineAt = Date.now() + providerLimits.workflowDurationMs,
  ) {}
  hasTimeRemaining() {
    return Date.now() < this.deadlineAt;
  }
  checkDeadline() {
    const remaining = this.deadlineAt - Date.now();
    if (remaining <= 0) throw new ProviderDeadlineError();
    return remaining;
  }
  private async boundedPause(delay: number) {
    if (delay >= this.checkDeadline()) throw new ProviderDeadlineError();
    await this.pause(delay);
    this.checkDeadline();
  }
  private async track<T>(
    product: Product,
    fn: (
      request: (
        path: string,
        body?: unknown,
      ) => Promise<Record<string, unknown>>,
    ) => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    let count = 0;
    let providerId: string | undefined;
    let cached: boolean | undefined;
    let credits: number | undefined;
    let result: T;
    try {
      if (!this.key)
        throw Error(
          'ANAKIN_API_KEY is missing. Configure it server-side in .dev.vars.',
        );
      const request = async (path: string, body?: unknown) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const timeout = Math.min(
            providerLimits.requestTimeoutMs,
            this.checkDeadline(),
          );
          count++;
          const res = await this.fetcher('https://api.anakin.io/v1' + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.key!,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(timeout),
            redirect: 'manual',
          });
          if (
            (res.status === 429 || res.status >= 500) &&
            body === undefined &&
            attempt < 2
          ) {
            const retryAfter = res.headers.get('Retry-After');
            const requested =
              retryAfter === null
                ? 0
                : /^\d+(?:\.\d+)?$/.test(retryAfter)
                  ? Number(retryAfter) * 1000
                  : Date.parse(retryAfter) - Date.now();
            const delay = Math.max(
              500 * 2 ** attempt,
              Number.isFinite(requested) ? requested : 0,
            );
            if (delay > 30000)
              throw Error(
                'Provider requested a longer retry delay; retry the operation later',
              );
            await res.body?.cancel();
            await this.boundedPause(delay);
            continue;
          }
          if (!res.ok)
            throw Error(`Anakin ${product} returned HTTP ${res.status}`);
          const raw = await limitedText(res.body, 2_000_000);
          if (raw.length > 2_000_000)
            throw Error('Provider response exceeds 2 MB');
          const data = JSON.parse(raw) as Record<string, unknown>;
          for (const key of ['id', 'jobId', 'job_id'])
            if (typeof data[key] === 'string') providerId = data[key];
          if (typeof data.cached === 'boolean') cached = data.cached;
          if (typeof data.credits_used === 'number')
            credits = data.credits_used;
          this.checkDeadline();
          return data;
        }
        throw Error('Anakin retries exhausted');
      };
      result = await fn(request);
      const o = result as Record<string, unknown>;
      await this.record({
        product,
        status: 'success',
        startedAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        requestCount: count,
        providerId: typeof o?.id === 'string' ? o.id : providerId,
        cached: typeof o?.cached === 'boolean' ? o.cached : cached,
        credits: typeof o?.credits_used === 'number' ? o.credits_used : credits,
      });
      return result;
    } catch (e) {
      const error = redact(readableError(e)).replaceAll(
        this.key ?? '__NO_SECRET__',
        '[REDACTED]',
      );
      await this.record({
        product,
        status: 'failed',
        startedAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        requestCount: count,
        providerId,
        cached,
        credits,
        error,
      });
      if (e instanceof ProviderDeadlineError || !this.hasTimeRemaining())
        throw new ProviderDeadlineError();
      throw Error(error);
    }
  }
  search(prompt: string) {
    return this.track('Search', async (request) =>
      searchSchema.parse(await request('/search', { prompt, limit: 5 })),
    );
  }
  scrape(
    url: string,
    onRetrieved?: (source: Omit<Scrape, 'rule'>) => Promise<void>,
  ) {
    recallNoticeUrl(url);
    return this.track('Scraper', async (request) => {
      const submitted = await request('/url-scraper', {
        url,
        formats: ['markdown', 'json'],
        generateJson: true,
        outputSchema: extractionSchema,
        useBrowser: false,
      });
      if (typeof submitted.jobId !== 'string')
        throw Error('Scraper submission did not return jobId');
      for (let i = 0; i < this.pollLimit; i++) {
        await this.boundedPause(2000);
        const r = await request(
          `/url-scraper/${encodeURIComponent(submitted.jobId)}`,
        );
        if (r.status === 'failed') throw Error('Anakin extraction job failed');
        if (r.status !== 'completed') continue;
        if (typeof r.markdown !== 'string' || r.markdown.length < 30)
          throw Error('Scraper returned no usable source text');
        if (r.url !== undefined) {
          if (typeof r.url !== 'string') throw Error('Invalid provider URL');
          safeUrl(r.url);
        }
        await onRetrieved?.({
          id: submitted.jobId,
          url,
          markdown: r.markdown,
          cached: r.cached === true,
          label: r.cached === true ? 'CACHED_ANAKIN' : 'LIVE_ANAKIN',
        });
        const rule = decodeExtraction(r.generatedJson, r.markdown);
        return {
          id: submitted.jobId,
          url,
          markdown: r.markdown,
          rule,
          cached: r.cached === true,
          label: r.cached === true ? 'CACHED_ANAKIN' : 'LIVE_ANAKIN',
        } as Scrape;
      }
      throw Error(
        'Scraper polling deadline reached; job may still be processing',
      );
    });
  }
  wire(asin: string): Promise<Record<string, unknown>> {
    if (!/^[A-Z0-9]{10}$/i.test(asin)) throw Error('Enter a 10-character ASIN');
    return this.track('Wire', async (request) => {
      const catalog = await request('/wire/catalog/amazon');
      const actions = z
        .array(
          z.object({
            action_id: z.string(),
            type: z.string(),
            parameters: z.unknown().optional(),
          }),
        )
        .parse(catalog.actions);
      if (
        !actions.some(
          (a) => a.action_id === 'am_product_details' && a.type === 'read',
        )
      )
        throw Error('Amazon product-details read action unavailable');
      const r = await request('/wire/task', {
        action_id: 'am_product_details',
        params: { asin },
      });
      if (typeof r.job_id !== 'string') throw Error('Wire returned no job_id');
      let delay = 2000;
      for (let i = 0; i < this.pollLimit; i++) {
        await this.boundedPause(delay);
        const p = await request(`/wire/jobs/${encodeURIComponent(r.job_id)}`);
        if (p.status === 'failed') {
          const detail =
            p.error &&
            typeof p.error === 'object' &&
            'message' in p.error &&
            typeof p.error.message === 'string'
              ? `: ${p.error.message}`
              : '';
          throw Error(`Wire product enrichment failed${detail}`);
        }
        if (p.status === 'completed')
          return { ...p, id: r.job_id, action: 'am_product_details', asin };
        delay = Math.max(1000, Number(p.retry_after_ms) || 2000);
        if (delay > 30000)
          throw Error(
            'Wire requested a longer polling delay; check the provider job later',
          );
      }
      throw Error('Wire polling deadline reached');
    });
  }
  monitorCreate(url: string, webhook?: string) {
    recallNoticeUrl(url);
    return this.track('Monitoring', (request) =>
      request('/monitors', {
        url,
        intervalMinutes: 1440,
        scope: 'page',
        watchMode: 'full_page',
        isActive: false,
        ...(webhook ? { alertWebhookUrl: webhook } : {}),
      }),
    );
  }
  monitorGet(id: string) {
    return this.track('Monitoring', (request) =>
      request(`/monitors/${encodeURIComponent(id)}`),
    );
  }
  monitorRun(id: string) {
    return this.track('Monitoring', (request) =>
      request(`/monitors/${encodeURIComponent(id)}/run`, {}),
    );
  }
  monitorChanges(id: string) {
    return this.track('Monitoring', (request) =>
      request(`/monitors/${encodeURIComponent(id)}/changes`),
    );
  }
}
