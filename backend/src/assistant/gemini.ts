import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { logger } from '../logger.js';
import { SYSTEM_INSTRUCTION } from './prompt.js';

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface Assistant {
  readonly model: string;
  isConfigured(): boolean;
  answer(userTurn: string, history: ChatTurn[]): Promise<string>;
  transcribe(audioBase64: string, mimeType: string): Promise<string>;
}

export class AssistantError extends Error {
  constructor(
    readonly code: 'not_configured' | 'upstream' | 'timeout' | 'empty' | 'rate_limited',
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

export const NO_SPEECH = '[TIDAK_TERDENGAR]';

export class GeminiAssistant implements Assistant {
  private ai: GoogleGenAI | null;

  constructor(
    apiKey: string | undefined,
    readonly model: string,
    private readonly timeoutMs: number,
    private readonly thinkingLevel: ThinkingLevel = ThinkingLevel.LOW,
  ) {
    this.ai = apiKey ? new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } }) : null;
  }

  isConfigured() {
    return this.ai !== null;
  }

  private client(): GoogleGenAI {
    if (!this.ai) throw new AssistantError('not_configured', 503, 'Gemini belum dikonfigurasi di server (GEMINI_API_KEY).');
    return this.ai;
  }

  private wrap(err: unknown): AssistantError {
    if (err instanceof AssistantError) return err;
    if (err instanceof ApiError) {
      logger.error('gemini api error', { status: err.status, model: this.model });
      if (err.status === 429) return new AssistantError('rate_limited', 429, 'Kuota Gemini sedang habis atau dibatasi. Coba lagi sebentar lagi.');
      if (err.status === 404) return new AssistantError('upstream', 502, `Model Gemini "${this.model}" tidak ditemukan. Periksa GEMINI_MODEL.`);
      if (err.status === 401 || err.status === 403) return new AssistantError('upstream', 502, 'Kunci API Gemini ditolak. Periksa GEMINI_API_KEY di server.');
      return new AssistantError('upstream', 502, 'Layanan Gemini mengembalikan galat.');
    }
    const msg = (err as Error)?.message ?? '';
    if (/timeout|timed out|abort/i.test(msg)) {
      logger.error('gemini timeout', { model: this.model });
      return new AssistantError('timeout', 504, 'Gemini tidak merespons dalam batas waktu.');
    }
    logger.error('gemini request failed', { model: this.model, error: msg.slice(0, 200) });
    return new AssistantError('upstream', 502, 'Tidak dapat menghubungi layanan Gemini.');
  }

  async answer(userTurn: string, history: ChatTurn[]): Promise<string> {
    const ai = this.client();
    try {
      const res = await ai.models.generateContent({
        model: this.model,
        contents: [
          ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          { role: 'user', parts: [{ text: userTurn }] },
        ],
        // No tools/function declarations: the model has no path to actuators.
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.3,
          maxOutputTokens: 2048,
          // Gemini 3.x thinks at a high level by default, which made answers slow.
          thinkingConfig: { thinkingLevel: this.thinkingLevel },
        },
      });
      const text = res.text?.trim();
      if (!text) throw new AssistantError('empty', 502, 'Gemini tidak memberikan jawaban. Coba ulangi pertanyaan.');
      return text;
    } catch (err) {
      throw this.wrap(err);
    }
  }

  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const ai = this.client();
    try {
      const res = await ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              {
                text: `Transkripsikan ucapan dalam rekaman ini secara verbatim. Bahasa utama: Indonesia. Tulis hanya teks transkripsinya tanpa komentar, tanda kutip, atau terjemahan. Jika tidak ada ucapan yang jelas, balas persis: ${NO_SPEECH}`,
              },
            ],
          },
        ],
        config: { temperature: 0, maxOutputTokens: 512, thinkingConfig: { thinkingLevel: this.thinkingLevel } },
      });
      return res.text?.trim() ?? '';
    } catch (err) {
      throw this.wrap(err);
    }
  }
}
