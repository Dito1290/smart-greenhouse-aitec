import type { BrokerStatus } from '../mqtt/gateway.js';
import { RELAY_COMMANDS, type RelayCommandRecord, type RelayId } from '../relays/relays.js';
import { FIELD_META, PRIMARY_FIELDS, type SensorField } from '../sensors/schema.js';
import type { Freshness, Reading } from '../sensors/store.js';

export interface PlantProfile {
  species?: string;
  growthStage?: string;
  medium?: string;
  notes?: string;
}

export interface SensorSnapshot {
  latest: Reading | null;
  freshness: { state: Freshness; ageMs: number | null; staleAfterMs: number };
  /** Last 30 minutes. */
  recent: Reading[];
  /** Optional longer window (last 6 hours) for trend questions; summarised, never sent raw. */
  longer?: Reading[];
  brokerConnected: boolean;
  broker?: Pick<BrokerStatus, 'lastConnectedAt' | 'lastDisconnectedAt' | 'lastError' | 'reconnectAttempts'>;
  relays?: Record<RelayId, RelayCommandRecord | null>;
  ingest?: { counters: { accepted: number; duplicates: number; rejected: number }; lastRejection: { at: number; reason: string } | null };
  topics?: { sensor: string; relay: string };
}

export const SYSTEM_INSTRUCTION = `Anda adalah Panion, asisten operasional greenhouse pintar untuk operator di Indonesia. Anda menguasai agronomi praktis lingkungan greenhouse dan hidroponik, serta sistem yang dipakai di sini: sensor ESP32, broker MQTT, backend gateway, relay, dan aplikasi mobile.

BAHASA DAN GAYA
- Jawab dalam Bahasa Indonesia yang wajar. Bila operator menulis dalam bahasa lain, ikuti bahasanya.
- Langsung ke inti. Jangan membuka dengan salam, basa-basi, atau mengulang pertanyaan.
- Sesuaikan panjang jawaban dengan pertanyaan: pertanyaan sederhana atau istilah dijawab 1–4 kalimat; pertanyaan diagnosis atau troubleshooting dijawab lebih dalam. Umumnya di bawah 300 kata, paling banyak sekitar 450 kata, karena jawaban juga dibacakan dengan suara.
- Spesifik dan berdasar data: sebut angka, waktu, dan nama sensor yang relevan. Hindari saran umum yang tidak terkait kondisi yang terukur.
- Jelaskan alasan setiap rekomendasi (mengapa penting, apa risikonya bila diabaikan) dan apa yang perlu dicek berikutnya.
- Bila informasi penting kurang (misalnya jenis tanaman untuk pertanyaan ambang batas), tetap berikan apa yang bisa dijawab dari data, lalu ajukan satu pertanyaan klarifikasi yang singkat.

SUMBER DATA
- Setiap pesan operator diawali blok KONTEKS SISTEM yang dibuat otomatis oleh server dari data nyata saat pertanyaan dikirim (sensor ESP32, status broker MQTT, perintah relay, profil tanaman). Blok itu bukan tulisan operator.
- Blok KONTEKS SISTEM pada pesan TERBARU adalah satu-satunya gambaran kondisi saat ini. Angka yang muncul di jawaban Anda sebelumnya bisa sudah usang.
- Anda tidak punya akses ke data lain: tidak ada sensor tambahan, riwayat di luar ringkasan yang diberikan, cuaca, foto tanaman, atau log perangkat.

ATURAN KEJUJURAN DATA (wajib)
- Bedakan dengan tegas FAKTA TERUKUR (angka dari konteks beserta waktunya) dan DUGAAN. Tandai dugaan dengan kata seperti "kemungkinan" dan sebutkan tingkat keyakinan (tinggi/sedang/rendah) beserta alasannya.
- Keyakinan "tinggi" hanya untuk hal yang langsung ditunjukkan angka terukur. Kondisi yang tidak dilaporkan sistem (misalnya kipas mati, ventilasi tertutup, pompa macet) paling tinggi berkeyakinan "sedang" dan harus disertai cara mengeceknya.
- Jangan pernah mengarang angka sensor, tren, riwayat, kondisi cuaca, status perangkat, atau hasil tindakan.
- Sensor bertanda "TIDAK TERSEDIA" berarti tidak ada data. Jangan menganggapnya nol, normal, atau buruk.
- Jika status data "BASI" atau "TIDAK ADA", katakan dengan jelas bahwa kondisi saat ini tidak diketahui. Angka terakhir boleh disebut hanya sebagai "pembacaan terakhir pukul ...", bukan sebagai kondisi sekarang. Arahkan ke pemeriksaan koneksi.
- Tren hanya boleh disimpulkan dari ringkasan riwayat di konteks. Bila riwayat tidak cukup, katakan demikian.
- Sistem ini TIDAK memiliki sensor kelembapan tanah/media. Jangan menyimpulkan kelembapan media; bila ditanya, jelaskan bahwa data itu tidak ada dan perlu dicek manual.
- TDS hanya mengukur total padatan terlarut; TDS tidak mengidentifikasi unsur hara tertentu (N, P, K, dll.).
- Kalibrasi sensor pH dan TDS belum diverifikasi, dan sebagian satuan diasumsikan. Sebutkan keterbatasan ini bila kesimpulan bergantung padanya.
- Jangan mengarang ambang batas agronomis. Bila ambang bergantung pada jenis tanaman, varietas, fase tumbuh, atau media, nyatakan ketergantungan itu; sebut rentang hanya sebagai "acuan umum" (bukan "ideal" atau "standar") yang perlu dicek ke referensi tanaman tersebut.
- Jangan mendiagnosis penyakit tertentu hanya dari data lingkungan. Paling jauh, sebut kondisi yang meningkatkan risiko dan sarankan pemeriksaan visual (daun, akar, batang).

RELAY DAN PERANGKAT KERAS
- Anda TIDAK dapat dan TIDAK BOLEH mengendalikan relay, pompa, kipas, lampu, atau pemupukan. Jangan pernah mengatakan atau menyiratkan bahwa Anda telah menyalakan, mematikan, atau mengirim perintah apa pun.
- Bila tindakan relay diperlukan, sarankan operator melakukannya sendiri lewat panel "Kontrol relay" di tab Dasbor aplikasi (aplikasi meminta konfirmasi sebelum mengirim), sertakan alasan dan risikonya.
- Perintah berstatus "DITERIMA BROKER" hanya berarti broker MQTT menerima pesannya. Itu BUKAN bukti relay berubah. Firmware tidak melaporkan status relay, jadi status fisik selalu belum terkonfirmasi kecuali operator memeriksanya langsung.
- Perintah berstatus "GAGAL" berarti perintah tidak terkonfirmasi sampai; laporkan apa adanya dan sarankan langkah diagnosis.
- Gunakan hanya topik MQTT, nama perintah relay, dan nama field sensor yang tercantum di KONTEKS SISTEM. Jangan menciptakan topik, perintah, atau field baru.
- Firmware ESP32 menjalankan otomasi pupuk sendiri (target TDS 800, pita ~750–850, relay pupuk menyala ~10 detik). Itu konfigurasi perangkat, bukan rekomendasi agronomis. Jangan menyarankan pemupukan manual berulang tanpa pemeriksaan karena bisa bertabrakan dengan otomasi dan menyebabkan dosis berlebih.
- Untuk pekerjaan listrik (relay, pompa, kabel 220 V), ingatkan untuk memutus daya sebelum menyentuh rangkaian.

TROUBLESHOOTING SISTEM
Alur data: ESP32 membaca sensor → mengirim JSON berkala (~5 detik) ke broker MQTT pada topik sensor → backend berlangganan topik itu → aplikasi membaca dari backend. Perintah relay berjalan sebaliknya: aplikasi → backend → broker (topik relay) → ESP32.
Gunakan konteks untuk menentukan segmen yang bermasalah:
- Broker tidak terhubung → masalah koneksi backend ke broker (jaringan server, alamat/port, kredensial). ESP32 belum tentu bermasalah.
- Broker terhubung tetapi data BASI/TIDAK ADA → ESP32 kemungkinan tidak mengirim (daya, WiFi, koneksi ESP32 ke broker, topik berbeda, client id bentrok).
- Banyak pesan ditolak → ESP32 mengirim, tetapi format JSON/field tidak sesuai atau nilai di luar rentang.
- Data segar tetapi satu sensor TIDAK TERSEDIA → masalah pada sensor/kabel/pembacaan sensor itu saja.
Berikan langkah pemeriksaan berurutan dari yang paling mungkin dan paling mudah, beserta cara memverifikasi hasil tiap langkah.

PERCAKAPAN
- Pertanyaan lanjutan seperti "kenapa bisa begitu?" atau "bagaimana cara memperbaikinya?" merujuk ke percakapan sebelumnya; jawab dalam konteks itu sambil memakai data terbaru.
- Anda hanya mengingat percakapan yang dikirim bersama pertanyaan ini. Jangan mengaku mengingat percakapan lain.

STRUKTUR JAWABAN
Untuk pertanyaan kondisi, diagnosis, atau troubleshooting, gunakan bagian berikut (lewati bagian yang tidak relevan):
### Penilaian
Satu kalimat dengan salah satu label: Normal, Perlu perhatian, Kritis, atau Data tidak cukup.
### Bukti dari data
Angka relevan beserta waktu pembacaan dan status kesegarannya.
### Kemungkinan penyebab
Diurutkan dari yang paling mungkin, dengan tingkat keyakinan.
### Tindakan yang disarankan
Daftar bernomor sesuai prioritas, masing-masing dengan alasan singkat.
### Cara memverifikasi
Apa yang dicek dan hasil apa yang menandakan masalah teratasi.
### Keselamatan
Hanya bila ada risiko listrik, dosis pupuk, atau kerusakan tanaman. Sebut juga bila perlu konsultasi penyuluh/ahli pertanian.

Untuk pertanyaan sederhana, sapaan, atau penjelasan istilah, jawab langsung tanpa struktur di atas.

FORMAT
Gunakan Markdown sederhana yang didukung aplikasi: judul "### ", **tebal**, daftar "- " atau "1. ", \`kode\` sebaris, dan blok kode dengan tiga backtick untuk potongan konfigurasi atau perintah. Jangan memakai tabel, tautan, gambar, atau HTML.`;

const TZ = 'Asia/Jakarta';
const LONG_WINDOW_LABEL = '6 jam';

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ms) + ' WIB';
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 120) return `${s} detik lalu`;
  if (s < 7200) return `${Math.round(s / 60)} menit lalu`;
  return `${Math.round(s / 3600)} jam lalu`;
}

function describeField(field: SensorField, latest: Reading): string {
  const meta = FIELD_META[field];
  const value = latest.values[field];
  const unit = meta.unit ? ` ${meta.unit}${meta.unitVerified ? '' : ' (satuan diasumsikan)'}` : '';
  if (value === null) {
    const issue = latest.issues[field];
    const reason =
      issue === 'out_of_range' ? `nilai di luar rentang wajar sensor ${meta.min}–${meta.max}, dibuang` :
      issue === 'not_a_number' ? 'nilai bukan angka' :
      issue === 'missing' ? 'field tidak dikirim' : 'nilai kosong';
    return `- ${meta.label} [${field}]: TIDAK TERSEDIA (${reason})`;
  }
  return `- ${meta.label} [${field}]: ${fmt(value)}${unit}`;
}

function summarizeWindow(readings: Reading[], label: string, gapMs: number): string[] {
  if (readings.length < 2) return [`- Riwayat ${label} terakhir tidak cukup untuk melihat tren.`];
  const lines: string[] = [];
  const span = readings.at(-1)!.receivedAt - readings[0].receivedAt;
  lines.push(`- ${readings.length} pembacaan dalam rentang ${Math.round(span / 60000)} menit (${formatTime(readings[0].receivedAt)} s.d. ${formatTime(readings.at(-1)!.receivedAt)}).`);
  for (const field of PRIMARY_FIELDS) {
    const vals = readings.map((r) => r.values[field]).filter((v): v is number => v !== null);
    if (vals.length < 2) {
      lines.push(`- ${FIELD_META[field].label}: data tidak cukup (n=${vals.length})`);
      continue;
    }
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    lines.push(`- ${FIELD_META[field].label}: min ${fmt(min)}, maks ${fmt(max)}, rata-rata ${fmt(sum / vals.length)}, awal ${fmt(vals[0])} → akhir ${fmt(vals.at(-1)!)} (n=${vals.length})`);
  }
  let gaps = 0;
  let longest = 0;
  for (let i = 1; i < readings.length; i++) {
    const d = readings[i].receivedAt - readings[i - 1].receivedAt;
    if (d > gapMs) gaps++;
    if (d > longest) longest = d;
  }
  if (gaps) lines.push(`- Terdapat ${gaps} jeda data lebih dari ${Math.round(gapMs / 1000)} detik (terlama ${Math.round(longest / 60000)} menit).`);
  return lines;
}

function brokerLines(snap: SensorSnapshot, now: number): string[] {
  if (snap.brokerConnected) {
    const since = snap.broker?.lastConnectedAt ? ` sejak ${formatTime(snap.broker.lastConnectedAt)}` : '';
    return [`Broker MQTT: terhubung${since}`];
  }
  const parts = ['Broker MQTT: TIDAK terhubung'];
  const b = snap.broker;
  if (b?.lastDisconnectedAt) parts.push(`terputus ${ago(b.lastDisconnectedAt, now)}`);
  else if (b && !b.lastConnectedAt) parts.push('belum pernah terhubung sejak server dinyalakan');
  if (b?.reconnectAttempts) parts.push(`${b.reconnectAttempts} percobaan sambung ulang`);
  if (b?.lastError) parts.push(`galat terakhir: "${b.lastError.slice(0, 120)}"`);
  return [parts.join('; ')];
}

function relayLines(snap: SensorSnapshot, now: number): string[] {
  const lines = ['STATUS RELAY', '- Firmware tidak melaporkan status relay; status fisik pompa pupuk, kipas, dan lampu TIDAK DIKETAHUI.'];
  const topic = snap.topics?.relay;
  const known = Object.values(RELAY_COMMANDS).map((c) => `${c.on}/${c.off}`).join(', ');
  lines.push(`- Perintah yang dikenal firmware${topic ? ` (topik "${topic}")` : ''}: ${known}.`);
  if (!snap.relays) return lines;
  lines.push('- Perintah terakhir dari aplikasi sejak server dinyalakan:');
  for (const id of Object.keys(RELAY_COMMANDS) as RelayId[]) {
    const label = `${RELAY_COMMANDS[id].label} [${id}]`;
    const rec = snap.relays[id];
    if (!rec) {
      lines.push(`  - ${label}: belum ada perintah`);
      continue;
    }
    const when = `${formatTime(rec.requestedAt)} (${ago(rec.requestedAt, now)})`;
    const state =
      rec.status === 'published' ? 'DITERIMA BROKER — status fisik belum terkonfirmasi' :
      rec.status === 'sending' ? 'SEDANG DIKIRIM' :
      rec.error === 'publish_timeout' ? 'GAGAL dikonfirmasi broker (batas waktu) — perintah mungkin sampai, mungkin tidak' :
      'GAGAL dikirim ke broker';
    lines.push(`  - ${label}: "${rec.command}" pada ${when}: ${state}`);
  }
  return lines;
}

export function buildSensorContext(snap: SensorSnapshot, now = Date.now()): string {
  const lines: string[] = ['KONTEKS SISTEM (otomatis dari server, bukan tulisan operator)'];
  lines.push(`Waktu sekarang: ${formatTime(now)}`);
  lines.push(...brokerLines(snap, now));
  if (snap.topics) lines.push(`Topik MQTT: sensor "${snap.topics.sensor}", relay "${snap.topics.relay}"`);
  if (snap.ingest) {
    const { counters, lastRejection } = snap.ingest;
    const rej = lastRejection ? ` (alasan terakhir: ${lastRejection.reason}, ${ago(lastRejection.at, now)})` : '';
    lines.push(`Pesan sensor sejak server dinyalakan: ${counters.accepted} diterima, ${counters.rejected} ditolak${rej}, ${counters.duplicates} duplikat`);
  }

  lines.push('', 'DATA SENSOR');
  const { latest, freshness } = snap;
  if (!latest || freshness.state === 'none') {
    lines.push('Status data: TIDAK ADA — belum ada pembacaan sensor yang diterima. Kondisi greenhouse tidak diketahui.');
  } else {
    const ageSec = Math.round((freshness.ageMs ?? 0) / 1000);
    if (freshness.state === 'stale') {
      lines.push(`Status data: BASI — pembacaan terakhir ${ago(latest.receivedAt, now)} (batas segar ${Math.round(freshness.staleAfterMs / 1000)} detik). Kondisi saat ini TIDAK diketahui; angka di bawah hanya pembacaan terakhir.`);
    } else {
      lines.push(`Status data: SEGAR — pembacaan terakhir ${ageSec} detik lalu.`);
    }
    lines.push(`Waktu pembacaan terakhir: ${formatTime(latest.receivedAt)} (waktu diterima server; firmware tidak mengirim stempel waktu)`);
    lines.push(freshness.state === 'stale' ? 'Pembacaan terakhir (bukan kondisi saat ini):' : 'Pembacaan terkini:');
    for (const field of PRIMARY_FIELDS) lines.push(describeField(field, latest));
    lines.push('Catatan: field "temperature" dan "humidity" dari firmware adalah salinan suhu/kelembapan udara yang sama, bukan sensor terpisah (misalnya bukan suhu larutan).');
    if (latest.mirrorMismatch.length) {
      lines.push(`Peringatan: nilai salinan berbeda dari sumbernya (${latest.mirrorMismatch.join(', ')}); kemungkinan firmware berubah.`);
    }
    lines.push('Catatan kalibrasi: konversi pH dan TDS dari sinyal analog belum diverifikasi; perlakukan sebagai indikatif.');
    lines.push('Tidak ada sensor kelembapan tanah/media pada sistem ini.');
    const gapMs = Math.max(30_000, freshness.staleAfterMs);
    lines.push('Ringkasan 30 menit terakhir:');
    lines.push(...summarizeWindow(snap.recent, '30 menit', gapMs));
    // Only add the long window when it actually covers more than the short one.
    if (snap.longer && snap.longer.length > snap.recent.length) {
      lines.push(`Ringkasan ${LONG_WINDOW_LABEL} terakhir:`);
      lines.push(...summarizeWindow(snap.longer, LONG_WINDOW_LABEL, gapMs));
    }
  }

  lines.push('', ...relayLines(snap, now));
  return lines.join('\n');
}

export function buildProfileContext(profile?: PlantProfile): string {
  const p = profile ?? {};
  const val = (v?: string) => (v && v.trim() ? v.trim() : 'belum diisi');
  return [
    'PROFIL TANAMAN (diisi operator di Pengaturan)',
    `- Jenis tanaman: ${val(p.species)}`,
    `- Fase pertumbuhan: ${val(p.growthStage)}`,
    `- Media tanam / sistem nutrisi: ${val(p.medium)}`,
    `- Catatan: ${val(p.notes)}`,
  ].join('\n');
}

export function buildUserTurn(question: string, snap: SensorSnapshot, profile?: PlantProfile, now = Date.now()): string {
  return `${buildSensorContext(snap, now)}\n\n${buildProfileContext(profile)}\n\nPERTANYAAN OPERATOR:\n${question.trim()}`;
}
