import { ZodError } from 'zod';
import { redact } from './security';
export function readableError(error: unknown): string {
  if (
    error instanceof ZodError ||
    (error instanceof Error &&
      error.message.includes('"code":') &&
      error.message.includes('"path":'))
  )
    return 'The source did not provide complete, valid recall criteria. Review the official notice; no eligibility decision was inferred.';
  if (error instanceof SyntaxError)
    return 'The response was not valid JSON. Review the input or retry the source.';
  return redact(
    error instanceof Error ? error.message : 'Request failed',
  ).slice(0, 500);
}
