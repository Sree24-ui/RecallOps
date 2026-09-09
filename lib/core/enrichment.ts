/** Defensive product-field mapping; provider output shape is not guaranteed by Wire docs. */
export function normalizeEnrichment(
  data: unknown,
): Record<string, { value: string; path: string }> {
  const out: Record<string, { value: string; path: string }> = {};
  const map: Record<string, string> = {
    title: 'productTitle',
    product_title: 'productTitle',
    productTitle: 'productTitle',
    brand: 'brand',
    model: 'model',
    model_number: 'model',
    seller: 'seller',
    asin: 'marketplaceIdentifier',
    url: 'productUrl',
    product_url: 'productUrl',
    image: 'image',
    image_url: 'image',
    variant: 'variant',
    specifications: 'specifications',
  };
  function visit(v: unknown, path: string, depth: number) {
    if (depth > 3 || !v || typeof v !== 'object' || Array.isArray(v)) return;
    for (const [key, value] of Object.entries(v)) {
      const field = map[key];
      if (
        field &&
        !out[field] &&
        typeof value === 'string' &&
        value.trim() &&
        value.length <= 1500
      ) {
        if (
          (field === 'productUrl' || field === 'image') &&
          !value.startsWith('https://')
        )
          continue;
        out[field] = { value: value.trim(), path: `${path}.${key}` };
      } else if (!/serial|credential|secret|token/i.test(key))
        visit(value, `${path}.${key}`, depth + 1);
    }
  }
  visit(data, 'data', 0);
  return out;
}
