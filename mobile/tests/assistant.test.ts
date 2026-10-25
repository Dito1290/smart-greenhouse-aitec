import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../src/api';
import { parseInline, parseMarkdown } from '../src/markdown';
import { cleanForSpeech } from '../src/voice';

const REPLY = `### Penilaian
**Perlu perhatian** — suhu udara 34,2 °C.

### Tindakan yang disarankan
1. Nyalakan kipas lewat panel \`Kontrol relay\`.
2. Periksa ventilasi
   - buka jendela atas
- *Pantau* 15 menit

\`\`\`
mosquitto_sub -t environment/data
\`\`\`
---
Teks biasa
baris kedua`;

describe('assistant markdown', () => {
  it('parses headings, lists, inline styles, code blocks and rules', () => {
    const blocks = parseMarkdown(REPLY);
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'heading', 'ordered', 'ordered', 'bullet', 'bullet', 'code', 'rule', 'paragraph']);
    expect(blocks[0]).toEqual({ type: 'heading', inlines: [{ text: 'Penilaian' }] });
    expect(blocks[1]).toMatchObject({ inlines: [{ text: 'Perlu perhatian', bold: true }, { text: ' — suhu udara 34,2 °C.' }] });
    expect(blocks[3]).toMatchObject({ marker: '1.', inlines: [{ text: 'Nyalakan kipas lewat panel ' }, { text: 'Kontrol relay', code: true }, { text: '.' }] });
    expect(blocks[5]).toMatchObject({ depth: 1, inlines: [{ text: 'buka jendela atas' }] });
    expect(blocks[6]).toMatchObject({ depth: 0, inlines: [{ text: 'Pantau', italic: true }, { text: ' 15 menit' }] });
    expect(blocks[7]).toEqual({ type: 'code', text: 'mosquitto_sub -t environment/data' });
    expect(blocks[9]).toMatchObject({ inlines: [{ text: 'Teks biasa\nbaris kedua' }] });
  });

  it('keeps unsupported or unbalanced syntax as visible text', () => {
    expect(parseInline('nilai 2 * 3 dan **tebal')).toEqual([{ text: 'nilai 2 * 3 dan **tebal' }]);
    expect(parseMarkdown('| a | b |')).toEqual([{ type: 'paragraph', inlines: [{ text: '| a | b |' }] }]);
    expect(parseMarkdown('```\nkode tanpa penutup')).toEqual([{ type: 'code', text: 'kode tanpa penutup' }]);
  });

  it('does not read markdown symbols aloud', () => {
    const spoken = cleanForSpeech(REPLY);
    expect(spoken).not.toMatch(/[#*`]/);
    expect(spoken).toContain('Perlu perhatian');
  });
});

describe('assistant error contract', () => {
  afterEach(() => vi.unstubAllGlobals());
  const conn = { baseUrl: 'http://server.test', token: 't' };

  it('exposes retryable and retry-after hints from provider errors', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'unavailable', message: 'Layanan Gemini sedang sibuk', retryable: true, retryAfterSec: 5 }), { status: 503 }));
    const err = await apiRequest(conn, '/api/assistant/chat', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'unavailable', status: 503, retryable: true, retryAfterSec: 5, message: 'Layanan Gemini sedang sibuk' });
  });

  it('stays compatible with older error bodies and non-JSON pages', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'upstream', message: 'x' }), { status: 502 }));
    expect(await apiRequest(conn, '/x').catch((e) => e)).toMatchObject({ code: 'upstream', retryable: undefined, retryAfterSec: null });
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(await apiRequest(conn, '/x').catch((e) => e)).toMatchObject({ code: 'http_error', message: 'Server membalas galat 502.' });
  });
});
