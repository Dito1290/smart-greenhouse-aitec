type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  if (level === 'error') console.error(line);
  else console.log(line);
}

// Callers must never pass secrets in meta; keep it to ids, codes and counts.
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
