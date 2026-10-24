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
  recent: Reading[];
  brokerConnected: boolean;
}

export const SYSTEM_INSTRUCTION = `Anda adalah asisten kesehatan tanaman untuk operator greenhouse di Indonesia.
Jawab dalam Bahasa Indonesia yang wajar dan jelaskan istilah teknis secara singkat.

Data yang Anda terima berasal dari sensor ESP32 nyata dan disertakan di setiap pertanyaan dalam blok KONTEKS SENSOR.

Aturan wajib:
- Bedakan dengan jelas FAKTA TERUKUR (angka dari konteks sensor beserta waktunya) dan DUGAAN/HIPOTESIS.
- Jangan pernah mengarang angka sensor. Sensor bertanda "TIDAK TERSEDIA" berarti tidak ada data; jangan menganggapnya nol atau normal.
- Jika status data "BASI" atau "TIDAK ADA", katakan bahwa kondisi saat ini tidak diketahui dan jangan menilai kondisi terkini dari data lama.
- Jangan mendiagnosis penyakit tertentu hanya dari data lingkungan. Paling jauh, sebut kondisi yang dapat meningkatkan risiko, dan sarankan pemeriksaan visual.
- TDS hanya mengukur total padatan terlarut; TDS tidak mengidentifikasi unsur hara tertentu (N, P, K, dll.).
- Sistem ini TIDAK memiliki sensor kelembapan tanah/media; jangan menyimpulkan kelembapan media.
- Jangan mengarang ambang batas agronomis. Jika ambang bergantung pada jenis tanaman, varietas, fase tumbuh, media tanam, atau metode pengukuran, nyatakan ketergantungan itu dan sebutkan rentang hanya sebagai acuan umum yang perlu dicek ke referensi tanaman tersebut.
- Bila jenis tanaman belum diketahui dan itu memengaruhi rekomendasi, tanyakan jenis tanamannya.
- Anda TIDAK dapat dan TIDAK BOLEH mengendalikan relay, pompa, kipas, lampu, atau pemupukan. Jangan pernah mengatakan bahwa Anda telah menyalakan/mematikan sesuatu. Anda hanya boleh menyarankan operator memeriksa atau bertindak sendiri.
- Firmware ESP32 sudah menjalankan otomasi pupuk sendiri (target TDS 800, pita ~750–850, relay pupuk menyala ~10 detik). Itu konfigurasi perangkat, bukan rekomendasi agronomis. Jangan menyarankan pemupukan manual berulang tanpa pemeriksaan, karena bisa bertabrakan dengan otomasi tersebut.
- Kalibrasi sensor pH dan TDS belum diverifikasi; sebutkan keterbatasan ini bila jawaban bergantung pada nilai tersebut.

Untuk pertanyaan tentang kondisi atau kesehatan tanaman, gunakan struktur berikut (judul bernomor, teks biasa tanpa tabel dan tanpa format markdown berat):
1. Penilaian umum: salah satu dari "Normal", "Perlu perhatian", "Kritis", atau "Data tidak cukup".
2. Hasil pengukuran: angka yang relevan beserta waktu pembacaannya.
3. Potensi masalah yang didukung data.
4. Tingkat keyakinan dan keterbatasan.
5. Pemeriksaan berikutnya yang disarankan.
6. Tindakan praktis yang aman dilakukan operator.
7. Perlu konsultasi ahli pertanian/penyuluh atau tidak, dan kapan.

Untuk pertanyaan singkat atau penjelasan istilah, jawab langsung dan ringkas tanpa harus memakai struktur lengkap.
Jaga jawaban tetap padat (umumnya di bawah 250 kata) karena jawaban juga dibacakan dengan suara.`;

const TZ = 'Asia/Jakarta';

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

function describeField(field: SensorField, latest: Reading): string {
  const meta = FIELD_META[field];
  const value = latest.values[field];
  const unit = meta.unit ? ` ${meta.unit}${meta.unitVerified ? '' : ' (satuan diasumsikan)'}` : '';
  if (value === null) {
    const issue = latest.issues[field];
    const reason =
      issue === 'out_of_range' ? 'nilai di luar rentang wajar sensor, dibuang' :
      issue === 'not_a_number' ? 'nilai bukan angka' :
      issue === 'missing' ? 'field tidak dikirim' : 'nilai kosong';
    return `- ${meta.label} [${field}]: TIDAK TERSEDIA (${reason})`;
  }
  return `- ${meta.label} [${field}]: ${fmt(value)}${unit}`;
}

function summarizeRecent(recent: Reading[]): string[] {
  if (recent.length < 2) return ['- Riwayat terbaru tidak cukup untuk melihat tren.'];
  const lines: string[] = [];
  const span = recent.at(-1)!.receivedAt - recent[0].receivedAt;
  lines.push(`- ${recent.length} pembacaan dalam ${Math.round(span / 60000)} menit terakhir (${formatTime(recent[0].receivedAt)} s.d. ${formatTime(recent.at(-1)!.receivedAt)}).`);
  for (const field of PRIMARY_FIELDS) {
    const vals = recent.map((r) => r.values[field]).filter((v): v is number => v !== null);
    if (vals.length < 2) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const first = vals[0];
    const last = vals.at(-1)!;
    lines.push(`- ${FIELD_META[field].label}: min ${fmt(min)}, maks ${fmt(max)}, rata-rata ${fmt(avg)}, awal ${fmt(first)} → akhir ${fmt(last)} (n=${vals.length})`);
  }
  let gaps = 0;
  for (let i = 1; i < recent.length; i++) if (recent[i].receivedAt - recent[i - 1].receivedAt > 30000) gaps++;
  if (gaps) lines.push(`- Terdapat ${gaps} jeda data lebih dari 30 detik pada periode ini.`);
  return lines;
}

export function buildSensorContext(snap: SensorSnapshot, now = Date.now()): string {
  const lines: string[] = ['KONTEKS SENSOR (otomatis dari sistem, bukan dari pengguna)'];
  lines.push(`Waktu sekarang: ${formatTime(now)}`);
  lines.push(`Broker MQTT: ${snap.brokerConnected ? 'terhubung' : 'TIDAK terhubung'}`);

  const { latest, freshness } = snap;
  if (!latest || freshness.state === 'none') {
    lines.push('Status data: TIDAK ADA — belum ada pembacaan sensor yang diterima. Kondisi greenhouse tidak diketahui.');
    return lines.join('\n');
  }

  const ageSec = Math.round((freshness.ageMs ?? 0) / 1000);
  if (freshness.state === 'stale') {
    lines.push(`Status data: BASI — pembacaan terakhir ${ageSec} detik lalu (batas ${Math.round(freshness.staleAfterMs / 1000)} detik). Jangan anggap ini kondisi saat ini.`);
  } else {
    lines.push(`Status data: SEGAR — pembacaan terakhir ${ageSec} detik lalu.`);
  }
  lines.push(`Waktu pembacaan terakhir: ${formatTime(latest.receivedAt)} (waktu diterima server; firmware tidak mengirim stempel waktu)`);
  lines.push('Pembacaan terakhir:');
  for (const field of PRIMARY_FIELDS) lines.push(describeField(field, latest));
  lines.push('Catatan: field "temperature" dan "humidity" dari firmware adalah salinan suhu/kelembapan udara yang sama, bukan sensor terpisah (misalnya bukan suhu larutan).');
  if (latest.mirrorMismatch.length) {
    lines.push(`Peringatan: nilai salinan berbeda dari sumbernya (${latest.mirrorMismatch.join(', ')}); kemungkinan firmware berubah.`);
  }
  lines.push('Catatan kalibrasi: konversi pH dan TDS dari sinyal analog belum diverifikasi; perlakukan sebagai indikatif.');
  lines.push('Status relay: firmware tidak melaporkan status relay; status fisik pompa pupuk, kipas, dan lampu tidak diketahui.');
  lines.push('Ringkasan 30 menit terakhir:');
  lines.push(...summarizeRecent(snap.recent));
  return lines.join('\n');
}

export function buildProfileContext(profile?: PlantProfile): string {
  const p = profile ?? {};
  const val = (v?: string) => (v && v.trim() ? v.trim() : 'belum diisi');
  return [
    'PROFIL TANAMAN (diisi operator)',
    `- Jenis tanaman: ${val(p.species)}`,
    `- Fase pertumbuhan: ${val(p.growthStage)}`,
    `- Media tanam / sistem nutrisi: ${val(p.medium)}`,
    `- Catatan: ${val(p.notes)}`,
  ].join('\n');
}

export function buildUserTurn(question: string, snap: SensorSnapshot, profile?: PlantProfile, now = Date.now()): string {
  return `${buildSensorContext(snap, now)}\n\n${buildProfileContext(profile)}\n\nPERTANYAAN OPERATOR:\n${question.trim()}`;
}
