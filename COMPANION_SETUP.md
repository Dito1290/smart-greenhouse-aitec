# AI Greenhouse Companion — Setup, Architecture & Verification

Mobile app (Expo / React Native) + backend gateway (Node.js / TypeScript) for the ESP32
greenhouse that publishes to `environment/data` and listens on `relay/control`.

> **Firmware note.** The ESP32 firmware that uses `environment/data` / `relay/control` /
> `pupuk_on` was **not present on this machine**. The template sketch in
> `src/smart_greenhouse_esp32.ino` uses different topics (`greenhouse/<id>/...`) and is
> **not** the firmware this app targets. The integration below is built from the
> protocol specification in the project brief. Every firmware-dependent item is marked
> UNVERIFIED in the test report.

---

## 1. Architecture

```
ESP32 ──MQTT (1883, plaintext)──► sdp.polinela.ac.id ◄──MQTT── backend/ (gateway)
                                                                 │  subscribes environment/data
                                                                 │  publishes  relay/control (allowlist only)
                                                                 │  calls Gemini (API key stays here)
                                                                 ▼
                                               HTTPS/HTTP + Bearer token (REST polling, 3 s)
                                                                 ▼
                                                      mobile/ (Expo Go app)
```

- **Why a gateway:** MQTT credentials and the Gemini key never reach the phone. The app
  can't publish arbitrary topics or payloads. It can only ask for one of six
  allowlisted relay commands.
- **Transport:** REST polling. It's the simplest reliable option for a 5-second sensor
  interval, and it needs no extra real-time infrastructure.
- **History:** kept in memory for 24 h, snapshotted every 60 s to `backend/data/history.json`
  (no database added).
- **Voice:** Expo Go has no native speech-recognition module, so the phone records audio
  (`expo-audio`, 16 kHz mono AAC, max 30 s, only while the mic button is active). The
  backend sends it to Gemini for Indonesian transcription. Answers are spoken with the
  phone's TTS (`expo-speech`, `id-ID`). This is **turn-based**, not Gemini Live.

### Repository layout (new parts)

| Path | Purpose |
|---|---|
| `backend/src/sensors/schema.ts` | Defensive payload parser: original field names, null-not-zero, range checks, mirror detection |
| `backend/src/sensors/store.ts` | Latest value, freshness (fresh/stale/none), duplicate drop, 24 h history, disk snapshot |
| `backend/src/mqtt/gateway.ts` | MQTT client, exponential backoff (2 s → 60 s cap), no offline queueing of commands |
| `backend/src/relays/relays.ts` | Exact command allowlist, per-relay lock + 3 s cooldown, QoS 1 publish with 5 s timeout |
| `backend/src/assistant/prompt.ts` | System instruction + sensor-context builder (timestamps, staleness, missing data, 30-min stats) |
| `backend/src/assistant/gemini.ts` | Gemini chat + audio transcription; **no tools/function calling** (no path to actuators) |
| `backend/src/http/app.ts` | REST API, Bearer auth, rate limits, body limits |
| `mobile/src/screens/*` | Dashboard, Sensor details, AI assistant, Settings/diagnostics |
| `mobile/src/state/*` | Settings (token in SecureStore) and polling store |

### API

All routes except `/api/health` require `Authorization: Bearer <APP_ACCESS_TOKEN>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Liveness only, no data |
| GET | `/api/status` | Broker link, data freshness, counters, last relay commands, Gemini config |
| GET | `/api/sensors/latest` | Latest reading (`null` before first message) + field metadata |
| GET | `/api/sensors/history?minutes=60` | Real readings only, thinned to ≤500 points |
| POST | `/api/relays/:relay` `{ "action": "on" \| "off" }` | `relay` ∈ `fertilizer`, `exhaust`, `light` |
| POST | `/api/assistant/chat` | `{ message, history?, profile? }` |
| POST | `/api/assistant/transcribe` | `{ audioBase64, mimeType }` |

Relay mapping (unchanged firmware strings): `fertilizer` → `pupuk_on`/`pupuk_off`,
`exhaust` → `exhaust_on`/`exhaust_off`, `light` → `lampu_on`/`lampu_off`.

---

## 2. Backend setup

Requirements: Node.js 20+ (tested on 24.16).

```bash
cd ~/smart-greenhouse-aitec/backend
npm install
cp .env.example .env
# Generate an access token for the app:
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Edit `backend/.env`:

| Variable | Value |
|---|---|
| `APP_ACCESS_TOKEN` | the generated token (min 16 chars) |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | the broker account (e.g. `septa2` + its password) |
| `MQTT_CLIENT_ID` | leave empty (random). **Must not equal the ESP32's client id** or the broker will kick one of them off |
| `GEMINI_API_KEY` | from Google AI Studio |
| `GEMINI_MODEL` | default `gemini-3.6-flash` (Google's listed replacement for `gemini-3.5-flash`; verified 2026-10-25 with `models.get` + live calls). `gemini-3.8-flash` returned 503 on 2026-10-23 and 504 `DEADLINE_EXCEEDED` on 2/3 calls on 2026-10-25 |
| `GEMINI_FALLBACK_MODEL` | optional, e.g. `gemini-3.5-flash-lite`; tried after the primary keeps failing with transient errors or its (per-model) daily quota is exhausted. Replies report which model answered |
| `GEMINI_MAX_RETRIES` / `GEMINI_TIMEOUT_MS` / `GEMINI_TOTAL_TIMEOUT_MS` | defaults 2 / 30000 / 45000. Retries apply only to 429/5xx/timeout/network errors, with exponential backoff + jitter and `Retry-After`/`RetryInfo` honoured; the total stays under the app's 60 s timeout |
| `CHAT_HISTORY_TURNS` / `CHAT_HISTORY_CHARS` | defaults 12 / 16000. Conversation history comes from the app per request; the server stores none |
| `GEMINI_THINKING_LEVEL` | `LOW` (default), `MEDIUM`, `HIGH`. Higher = slower. `MINIMAL` was rejected by `gemini-3.8-flash` (400), so it is not offered |
| `STALE_AFTER_MS` | default 20000 (4 × the 5 s publish interval) |

Run:

```bash
npm test          # 85 tests, incl. end-to-end against an in-process MQTT broker; Gemini is mocked
npm run build
npm start         # or: npm run dev
```

Check it:

```bash
curl http://localhost:5050/api/health
curl -H "Authorization: Bearer $APP_ACCESS_TOKEN" http://localhost:5050/api/status
```

In `/api/status`, `broker.connected: true` means the broker accepted the credentials.
`data.state: "fresh"` means the ESP32 is publishing right now.

### Configuring Gemini securely

- Put the key **only** in `backend/.env` (git-ignored). It is never sent to the phone and
  never logged.
- If the model ID is retired, change `GEMINI_MODEL`. The app shows a specific error
  ("Model Gemini … tidak tersedia") instead of a fake answer.
- Provider errors reach the app as `{ error, message, retryable, retryAfterSec }`. Codes:
  `unavailable` (503), `rate_limited` (429), `timeout` (504), `network` (502) are temporary;
  `auth`, `model_config`, `quota_exhausted`, `bad_request`, `not_configured` need the admin.
  Logs record status, RPC reason, attempt and timing per attempt; never the key or the prompt.

---

## 3. Mobile app setup (Expo Go)

```bash
cd ~/smart-greenhouse-aitec/mobile
npm install
npx expo start            # same Wi-Fi as the phone
npx expo start --tunnel   # if the Wi-Fi has client isolation
```

1. Install **Expo Go** (SDK 58) on the phone and scan the QR code.
2. The app opens on **Pengaturan**. Enter the **server address** and **access token**, then
   tap **Simpan & uji koneksi**.
3. Optionally fill in the plant profile (species, growth stage, medium).

Checks: `npm test` (8 logic tests), `npx tsc --noEmit`, `npx expo-doctor`.

---

## 4. Network: the `aitec` Wi-Fi, the broker, and the phone

There are three separate links, and each one must work:

1. **ESP32 → broker:** the ESP32 on `aitec` must reach `sdp.polinela.ac.id:1883`, so the
   access point needs internet access.
2. **Backend → broker:** the laptop/server running `backend/` must reach
   `sdp.polinela.ac.id:1883`.
3. **Phone → backend:** the phone must reach the backend's HTTP port.

Verify step by step:

```bash
# From the laptop (on the network you will demo on):
nc -vz sdp.polinela.ac.id 1883            # TCP reachable?
# Is the ESP32 actually publishing? (needs the broker account)
npx mqtt sub -h sdp.polinela.ac.id -p 1883 -u septa2 -P '<password>' -t environment/data -v
```

Phone → backend options:

| Situation | Server address in the app |
|---|---|
| Phone and laptop on the same Wi-Fi, no client isolation | `http://<laptop-LAN-IP>:5050` (find with `ipconfig getifaddr en0`) |
| `aitec` blocks device-to-device traffic, or the phone uses mobile data | Expose the backend over HTTPS, e.g. `ngrok http 5050`, and use the `https://…` URL |
| Backend deployed on a server (e.g. your Portainer host) | Its HTTPS URL |

Test from the phone's browser: `http://<address>/api/health` should return `{"ok":true}`.

---

## 5. Security notes

- `.env` files are git-ignored; `.env.example` files contain placeholders only.
- The broker uses **plaintext MQTT on 1883**. Port 8883 (TLS) was refused when tested on
  2026-10-23. MQTT credentials therefore cross the network unencrypted between the
  backend and the broker. Run the backend on a trusted network, or ask the broker admin
  for TLS.
- Exposing the backend publicly protects it only with the access token plus rate limits
  (300 req/min overall, 20/min relays, 15/min AI). Use HTTPS (tunnel or reverse proxy)
  so the token isn't sent in clear text, and rotate the token if it leaks.
- The token is stored on the phone in SecureStore (Keychain/Keystore).
- The Gemini model has no tools: it cannot trigger relays. The system prompt also forbids
  claiming that it did.

---

## 6. Test report (2026-10-23)

### Passed (automated)

| Area | Evidence |
|---|---|
| Payload parsing: all 9 fields with original names | `backend/tests/schema.test.ts` |
| Missing / null / non-numeric / out-of-range values → `null`, never 0 | `schema.test.ts`, `prompt.test.ts`, mobile `logic.test.ts` |
| Invalid JSON, arrays, empty objects don't crash and keep the last valid reading | `schema.test.ts`, `store.test.ts`, `e2e.mqtt.test.ts` |
| Duplicate messages dropped; stale detection; history pruning; disk round-trip | `store.test.ts` |
| Exact relay strings for all 6 commands; allowlist rejects `pump`, `__proto__`, `TOGGLE`, … | `relays.test.ts`, `api.test.ts` |
| Concurrent double tap → 1 publish (409 for the second); same-command cooldown; opposite action allowed | `relays.test.ts` |
| Broker down → relay commands refused (503), not queued | `relays.test.ts`, `e2e.mqtt.test.ts` |
| Publish failure/timeout is recorded and reported; `physicalStateConfirmed` is always false | `relays.test.ts` |
| Bearer auth on all routes except health | `api.test.ts` |
| AI request includes values, units, timestamps, freshness, profile, question; stale/absent data labelled | `prompt.test.ts`, `api.test.ts` |
| Gemini errors surfaced (503/502/504/429), not fabricated | `api.test.ts` |
| Transcription: success, "no speech" (422), bad MIME type rejected | `api.test.ts` |
| Full MQTT path over a real (local) broker: device publish → API; API relay → device receives exact string; outage visible; bad credentials reported; reconnect continues after auth refusal | `e2e.mqtt.test.ts` |
| Backend `tsc` build; mobile `tsc --noEmit`; `expo-doctor` 20/20; Android production bundle exports | commands above |
| Android bundle contains no Gemini key, MQTT password/username, Wi-Fi password, or broker host | grep of exported bundle |

### Passed (manual, local simulation)

These ran against a **local** test broker with a simulated ESP32, not the real device:

- Backend start-up with missing config → clear error, exit 1, no secret values printed.
- Real broker `sdp.polinela.ac.id:1883` with placeholder credentials → "Not authorized"
  shown in `/api/status`, no crash.
- Dashboard, sensor detail charts (real readings only, gaps break the line), assistant
  empty/error states and settings rendered in a 390 px-wide web preview.
- Stale state after pausing the device, and broker-down state after killing the broker:
  readings greyed and labelled "Nilai terakhir, bukan kondisi kini"; relay controls
  disabled with a reason.
- Backend reconnected automatically when the broker came back (backoff 4 s, 8 s, …).
- Relay commands via the running backend reached the simulated device as `lampu_on`,
  `pupuk_off`, `exhaust_on`, `exhaust_off`.

### Not tested (requires something unavailable here)

| Item | Why |
|---|---|
| Real ESP32 data via `sdp.polinela.ac.id` | No broker password; anonymous access is refused |
| Real relay actuation | No hardware access |
| Live Gemini answers | 2026-10-25 with the real key and a synthetic reading: `gemini-3.6-flash` + LOW answered the Panion prompt and a follow-up; one real 503 was retried and recovered; a later real 429 daily-quota error was classified `quota_exhausted` and not retried. Not exercised from the phone; transcription not re-tested |
| App on a physical phone / Expo Go | No device or emulator on this Mac. The bundle compiles, but microphone permission, recording, and TTS playback have **not** been exercised |
| iOS | Not built |
| Relay buttons' confirmation dialog | `Alert` is a no-op in the web preview; verify on the phone |

---

## 7. Unresolved issues & required hardware checks

1. **Obtain and review the real firmware.** Confirm the topics, the payload field names,
   and the exact command strings, and check whether the payload uses `null` or sentinel
   values for failed sensors.
2. **Units.** UV (`mW/cm²`), light (`lx`), pressure (`hPa`), RH (`%`) and TDS (`ppm`) are
   assumed and marked with `*` in the app. Confirm them against the sensor library calls.
   If pressure is in kPa or Pa, readings will be rejected as out of range. Adjust `min`/`max`
   in `backend/src/sensors/schema.ts`.
3. **pH/TDS calibration.** Verify the conversion formulas with buffer solutions
   (pH 4.01/6.86/9.18) and a reference TDS/EC meter.
4. **Fertilizer relay logic.** Bench-test the state transitions, in particular what happens
   when `pupuk_on` arrives while the automatic 10 s dosing timer is running, and whether a
   manual ON is ever turned off automatically. Until that's verified, the app asks for
   confirmation and warns about the conflict.
5. **Relay acknowledgement.** The firmware doesn't publish relay state, so the app can only
   show "diterima broker". A minimal future firmware patch would publish a retained
   `relay/state` JSON (`{"pupuk":0,"exhaust":1,"lampu":0}`) after every pin change; the
   backend could then mark commands confirmed. This patch is **not** implemented: it
   needs the real firmware and hardware testing.
6. **Blocking `delay(~5000)` in the main loop** means relay commands can take up to about
   5 s to be processed. The "Mengirim…" state ends when the broker acknowledges, not when
   the relay switches.
7. **Environmental sensor init can block start-up.** If the dashboard shows the broker
   connected but no data, check the serial log for a stuck sensor initialisation.
8. **MQTT client ID collision:** make sure the backend and ESP32 never use the same
   client ID.

---

## 8. Demo checklist

- [ ] ESP32 powered and joined to `aitec`; the access point has internet.
- [ ] `backend/.env` filled in; `npm start` logs `mqtt connected` and `mqtt subscribed`.
- [ ] `curl …/api/status` → `broker.connected: true`, `data.state: "fresh"`.
- [ ] Phone browser opens `<server>/api/health`.
- [ ] Expo Go → app → Pengaturan → **Simpan & uji koneksi** shows success.
- [ ] Dashboard: four connection rows, "Masuk … dtk lalu", 7 sensor tiles.
- [ ] Unplug the ESP32 for 30 s → tiles turn "basi", summary says the condition is unknown.
- [ ] Tap **Nyalakan** on the light → confirm → "diterima broker, belum dikonfirmasi
      perangkat"; physically observe the lamp.
- [ ] Assistant: tap an example question → answer cites readings and timestamps.
- [ ] Tap the mic, ask *"Apakah suhu saat ini perlu diperhatikan?"*, tap again → transcript
      appears as a message → answer is read aloud → **Hentikan** stops it.
- [ ] Turn off "Bacakan otomatis" → the next answer is silent; "Dengarkan" replays it.
- [ ] Deny the mic permission → a text-input fallback message appears.
