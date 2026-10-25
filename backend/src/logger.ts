type Level = 'info' | 'warn' | 'error';

// Google API keys, `key=` query params and bearer tokens can appear inside upstream error text.
const SECRET_PATTERNS: [RegExp, string][] = [
  [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]'],
  [/([?&](?:key|api_key|token|access_token)=)[^&\s"']+/gi, '$1[redacted]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]'],
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((t, [re, sub]) => t.replace(re, sub), text);
}

function sanitize(meta?: Record<string, unknown>) {
  if (!meta) return meta;
  return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? redact(v) : v]));
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...sanitize(meta) });
  if (level === 'error') console.error(line);
  else console.log(line);
}

// Callers must never pass secrets in meta; keep it to ids, codes and counts.
// String values are still redacted as a second line of defence.
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
