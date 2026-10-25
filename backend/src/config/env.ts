import 'dotenv/config';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5050),
  HOST: z.string().default('0.0.0.0'),
  APP_ACCESS_TOKEN: z
    .string({ error: 'APP_ACCESS_TOKEN wajib diisi' })
    .min(16, 'APP_ACCESS_TOKEN minimal 16 karakter'),

  MQTT_HOST: z.string().default('sdp.polinela.ac.id'),
  MQTT_PORT: z.coerce.number().int().positive().default(1883),
  MQTT_USERNAME: optionalString,
  MQTT_PASSWORD: optionalString,
  MQTT_CLIENT_ID: optionalString,
  MQTT_SENSOR_TOPIC: z.string().default('environment/data'),
  MQTT_RELAY_TOPIC: z.string().default('relay/control'),

  STALE_AFTER_MS: z.coerce.number().int().min(5000).default(20000),

  GEMINI_API_KEY: optionalString,
  // gemini-3.5-flash is superseded by gemini-3.6-flash (ai.google.dev/gemini-api/docs/deprecations, checked 2026-10-25).
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.6-flash'),
  // Optional second model, tried after the primary keeps failing transiently (503/429/5xx/timeout) or its quota is exhausted.
  GEMINI_FALLBACK_MODEL: optionalString,
  /** Per-attempt deadline. */
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5000).default(30000),
  /** Deadline for all attempts and backoff together; keep below the app's 60 s chat timeout. */
  GEMINI_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(5000).max(55000).default(45000),
  GEMINI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  GEMINI_THINKING_LEVEL: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),

  /** Conversation turns (user + model messages) forwarded to Gemini per request. */
  CHAT_HISTORY_TURNS: z.coerce.number().int().min(0).max(40).default(12),
  /** Character budget for that history; oldest turns are dropped first. */
  CHAT_HISTORY_CHARS: z.coerce.number().int().min(1000).max(60000).default(16000),

  HISTORY_FILE: z.string().default('./data/history.json'),
  HISTORY_HOURS: z.coerce.number().min(1).max(168).default(24),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Only report variable names and messages, never values.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Konfigurasi tidak valid:\n  - ${problems.join('\n  - ')}`);
  }
  return parsed.data;
}
