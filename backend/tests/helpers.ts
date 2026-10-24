import type { Assistant, ChatTurn } from '../src/assistant/gemini.js';

export const VALID_PAYLOAD = {
  TDS: 812.4,
  pH: 6.21,
  temperature: 29.8,
  humidity: 71.5,
  env_temp_c: 29.8,
  env_humidity: 71.5,
  uv_intensity: 0.42,
  luminous_intensity: 18250,
  atmosphere_pressure: 1008.6,
};

export class FakeAssistant implements Assistant {
  readonly model = 'fake-model';
  calls: { userTurn: string; history: ChatTurn[] }[] = [];
  reply = 'jawaban uji';
  failWith: Error | null = null;
  transcript = 'bagaimana kondisi greenhouse saya';
  constructor(private configured = true) {}
  isConfigured() {
    return this.configured;
  }
  async answer(userTurn: string, history: ChatTurn[]) {
    this.calls.push({ userTurn, history });
    if (this.failWith) throw this.failWith;
    return this.reply;
  }
  async transcribe() {
    if (this.failWith) throw this.failWith;
    return this.transcript;
  }
}
