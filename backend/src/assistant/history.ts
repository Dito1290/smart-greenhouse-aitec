import type { ChatTurn } from './gemini.js';

export interface HistoryLimits {
  /** Maximum messages (user + model) kept. */
  maxTurns: number;
  /** Total character budget across kept messages. */
  maxChars: number;
  /** Per-message cap; longer messages are truncated. */
  maxTurnChars?: number;
}

const DEFAULT_TURN_CHARS = 4000;

/**
 * Turns client-supplied history into a sequence Gemini accepts: valid roles only,
 * non-empty text, alternating user/model, starting with user and ending with model
 * (the new question is appended as the final user turn). Keeps the most recent turns
 * that fit the limits. Invalid entries are dropped rather than failing the request.
 */
export function normalizeHistory(raw: unknown, limits: HistoryLimits): ChatTurn[] {
  if (!Array.isArray(raw) || limits.maxTurns <= 0) return [];
  const perTurn = limits.maxTurnChars ?? DEFAULT_TURN_CHARS;

  const cleaned: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { role, text } = item as { role?: unknown; text?: unknown };
    if ((role !== 'user' && role !== 'model') || typeof text !== 'string') continue;
    let t = text.trim();
    if (!t) continue;
    if (t.length > perTurn) t = `${t.slice(0, perTurn)} …[dipotong]`;
    const prev = cleaned.at(-1);
    // Consecutive same-role messages (e.g. a question whose answer failed) are merged.
    if (prev && prev.role === role) prev.text = `${prev.text}\n\n${t}`.slice(0, perTurn * 2);
    else cleaned.push({ role, text: t });
  }

  // The new question follows, so the history must end on a model turn.
  while (cleaned.length && cleaned.at(-1)!.role !== 'model') cleaned.pop();

  // Keep the newest turns within both budgets.
  const kept: ChatTurn[] = [];
  let chars = 0;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const turn = cleaned[i];
    if (kept.length >= limits.maxTurns || chars + turn.text.length > limits.maxChars) break;
    kept.unshift(turn);
    chars += turn.text.length;
  }

  // Gemini expects the conversation to open with a user turn.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}
