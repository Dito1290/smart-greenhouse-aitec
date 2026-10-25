import { ThinkingLevel } from '@google/genai';
import { GeminiAssistant } from './assistant/gemini.js';
import { loadConfig } from './config/env.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';
import { MqttGateway } from './mqtt/gateway.js';
import { RelayService } from './relays/relays.js';
import { SensorStore } from './sensors/store.js';

const SNAPSHOT_INTERVAL_MS = 60_000;

async function main() {
  const config = loadConfig();

  const store = new SensorStore({
    staleAfterMs: config.STALE_AFTER_MS,
    historyMs: config.HISTORY_HOURS * 3600_000,
  });
  await store.load(config.HISTORY_FILE);

  let lastRejectLog = 0;
  const gateway = new MqttGateway({
    host: config.MQTT_HOST,
    port: config.MQTT_PORT,
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    clientId: config.MQTT_CLIENT_ID,
    sensorTopic: config.MQTT_SENSOR_TOPIC,
    onSensorMessage: (payload) => {
      const outcome = store.ingest(payload);
      // Throttle so a misbehaving publisher can't flood the log.
      if (!outcome.accepted && outcome.reason !== 'duplicate' && Date.now() - lastRejectLog > 30_000) {
        lastRejectLog = Date.now();
        logger.warn('sensor payload rejected', { reason: outcome.reason, bytes: payload.length });
      }
    },
  });

  const relays = new RelayService(gateway, { topic: config.MQTT_RELAY_TOPIC });
  const assistant = new GeminiAssistant({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    fallbackModel: config.GEMINI_FALLBACK_MODEL,
    timeoutMs: config.GEMINI_TIMEOUT_MS,
    totalTimeoutMs: config.GEMINI_TOTAL_TIMEOUT_MS,
    maxRetries: config.GEMINI_MAX_RETRIES,
    thinkingLevel: ThinkingLevel[config.GEMINI_THINKING_LEVEL],
  });
  if (!assistant.isConfigured()) logger.warn('GEMINI_API_KEY not set; assistant endpoints will return 503');
  if (!config.MQTT_USERNAME || !config.MQTT_PASSWORD) logger.warn('MQTT credentials not set; broker will likely reject the connection');

  const app = createApp({
    accessToken: config.APP_ACCESS_TOKEN,
    store,
    relays,
    assistant,
    brokerStatus: () => gateway.getStatus(),
    topics: { sensor: config.MQTT_SENSOR_TOPIC, relay: config.MQTT_RELAY_TOPIC },
    history: { maxTurns: config.CHAT_HISTORY_TURNS, maxChars: config.CHAT_HISTORY_CHARS },
  });

  gateway.start();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info('backend listening', { host: config.HOST, port: config.PORT, model: config.GEMINI_MODEL, fallbackModel: config.GEMINI_FALLBACK_MODEL ?? null });
  });

  const snapshotTimer = setInterval(() => {
    store.save(config.HISTORY_FILE).catch((err) => logger.warn('history snapshot failed', { error: err.message }));
  }, SNAPSHOT_INTERVAL_MS);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    clearInterval(snapshotTimer);
    server.close();
    await Promise.allSettled([gateway.stop(), store.save(config.HISTORY_FILE)]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
