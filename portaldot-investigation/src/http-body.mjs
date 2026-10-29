export class RequestTooLargeError extends Error {
  constructor(message = "Request body is too large.") {
    super(message);
    this.name = "RequestTooLargeError";
  }
}

export async function readRequestText(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("Request body exceeded the configured limit.").catch(() => {});
        throw new RequestTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } catch {
    throw new SyntaxError("Request body is not valid UTF-8.");
  }
}
