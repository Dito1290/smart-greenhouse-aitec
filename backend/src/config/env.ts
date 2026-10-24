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
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5000).default(30000),
  GEMINI_THINKING_LEVEL: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),

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
