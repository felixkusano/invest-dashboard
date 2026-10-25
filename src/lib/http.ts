/**
 * HTTP-Client für Provider: Timeout, Retries mit exponentiellem Backoff, Behandlung von 429 (Retry-After),
 * einfaches In-Process-Rate-Limit pro Provider. Schlüssel werden nie geloggt.
 */
export class ProviderError extends Error {
  constructor(public provider: string, message: string, public status?: number, public retryable = false) {
    super(`[${provider}] ${message}`);
  }
}

type FetchOpts = {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number; // Mindestabstand zwischen Requests desselben Providers
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  fetchImpl?: typeof fetch;
};

const lastCall = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function redact(url: string): string {
  return url.replace(/(api_token|apikey|api_key|token|key)=[^&]+/gi, "$1=***");
}

export async function fetchWithRetry(url: string, opts: FetchOpts): Promise<Response> {
  const { provider, timeoutMs = 12000, retries = 2, minIntervalMs = 0 } = opts;
  const f = opts.fetchImpl ?? fetch;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    if (minIntervalMs) {
      const wait = (lastCall.get(provider) ?? 0) + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall.set(provider, Date.now());
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(url, { method: opts.method ?? "GET", headers: opts.headers, body: opts.body, signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        lastErr = new ProviderError(provider, `HTTP ${res.status} bei ${redact(url)}`, res.status, true);
        if (attempt < retries) {
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15000) : 500 * 2 ** attempt);
          attempt++;
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) throw new ProviderError(provider, `HTTP ${res.status} bei ${redact(url)}`, res.status, false);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ProviderError && !e.retryable) throw e;
      lastErr = e instanceof ProviderError ? e : new ProviderError(provider, `Netzwerkfehler: ${(e as Error).name === "AbortError" ? "Timeout" : (e as Error).message}`, undefined, true);
      if (attempt >= retries) throw lastErr;
      await sleep(400 * 2 ** attempt);
      attempt++;
    }
  }
  throw lastErr;
}

export async function getJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(opts.provider, `Ungültiges JSON von ${redact(url)}`);
  }
}

export async function getText(url: string, opts: FetchOpts): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}
