/** Read bounded UTF-8 data without trusting Content-Length or buffering an unlimited body. */
export async function limitedText(
  body: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<string> {
  if (!body) return '';
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw Error('Input too large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
