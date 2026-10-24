import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ApiError, apiRequest, normalizeBaseUrl } from '../api';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { Banner, Button, Card, SectionTitle, styles as ui } from '../components/ui';
import { formatAge, formatDateTime } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { useSettings } from '../state/settings';
import { colors, radius, space } from '../theme';
import type { PlantProfile, StatusResponse } from '../types';

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  hint,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  hint?: string;
  keyboardType?: 'url' | 'default';
}) {
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function DiagRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.diagRow}>
      <Text style={s.diagKey}>{k}</Text>
      <Text style={s.diagVal}>{v}</Text>
    </View>
  );
}

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const { status, link, dataAgeMs, refresh } = useGreenhouse();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [token, setToken] = useState(settings.token);
  const [profile, setProfile] = useState<PlantProfile>(settings.profile);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    setBaseUrl(settings.baseUrl);
    setToken(settings.token);
    setProfile(settings.profile);
  }, [settings.baseUrl, settings.token, settings.profile]);

  const saveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    const conn = { baseUrl: normalizeBaseUrl(baseUrl), token: token.trim() };
    try {
      if (!/^https?:\/\//.test(conn.baseUrl)) throw new ApiError('bad_url', 'Alamat harus diawali http:// atau https://');
      await apiRequest(conn, '/api/health', { auth: false, timeoutMs: 8000 });
      const st = await apiRequest<StatusResponse>(conn, '/api/status', { timeoutMs: 8000 });
      await update({ baseUrl: conn.baseUrl, token: conn.token });
      setTestResult({
        ok: true,
        text: `Server terjangkau dan token diterima. Broker MQTT: ${st.broker.connected ? 'terhubung' : 'TERPUTUS'}. Gemini: ${st.assistant.configured ? 'siap' : 'belum dikonfigurasi'}.`,
      });
      void refresh();
    } catch (err) {
      const e = err as ApiError;
      // Save anyway so the user isn't forced to retype; they can see the failure reason.
      await update({ baseUrl: conn.baseUrl, token: conn.token });
      setTestResult({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  };

  const saveProfile = async () => {
    await update({ profile });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const b = status?.broker;
  const d = status?.data;

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title} accessibilityRole="header">
        Pengaturan & perangkat
      </Text>

      <SectionTitle>Koneksi server</SectionTitle>
      <Card>
        <Text style={ui.muted}>
          Aplikasi tidak terhubung langsung ke broker MQTT. Semua data, perintah relay, dan Gemini melewati server gateway agar kredensial tetap di server.
        </Text>
        <Field
          label="Alamat server"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://contoh.ngrok-free.app atau http://192.168.1.10:5050"
          keyboardType="url"
        />
        <Field label="Token akses" value={token} onChange={setToken} secure placeholder="APP_ACCESS_TOKEN dari server" hint="Disimpan terenkripsi di perangkat (SecureStore)." />
        <Button label="Simpan & uji koneksi" icon="pulse-outline" onPress={() => void saveAndTest()} loading={testing} style={{ marginTop: space.lg }} />
        {testResult && (
          <View style={{ marginTop: space.md }}>
            <Banner tone={testResult.ok ? 'good' : 'danger'} icon={testResult.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} title={testResult.ok ? 'Berhasil' : 'Gagal'}>
              {testResult.text}
            </Banner>
          </View>
        )}
      </Card>

      <SectionTitle>Diagnostik</SectionTitle>
      <ConnectionPanel />
      <Card style={{ marginTop: space.md }}>
        <DiagRow k="Server terakhir merespons" v={link.lastOkAt ? formatDateTime(link.lastOkAt) : '—'} />
        <DiagRow k="Broker" v={b ? `${b.host}:${b.port}` : '—'} />
        <DiagRow k="Galat broker terakhir" v={b?.lastError ?? '—'} />
        <DiagRow k="Percobaan sambung ulang" v={b ? `${b.reconnectAttempts}${b.nextRetryMs ? ` · berikutnya ±${Math.round(b.nextRetryMs / 1000)} dtk` : ''}` : '—'} />
        <DiagRow k="Topik sensor / relay" v={status ? `${status.topics.sensor} / ${status.topics.relay}` : '—'} />
        <DiagRow k="Umur data" v={formatAge(dataAgeMs)} />
        <DiagRow k="Batas data basi" v={d ? `${Math.round(d.staleAfterMs / 1000)} dtk` : '—'} />
        <DiagRow k="Pesan diterima / duplikat / ditolak" v={d ? `${d.counters.accepted} / ${d.counters.duplicates} / ${d.counters.rejected}` : '—'} />
        <DiagRow k="Penolakan terakhir" v={d?.lastRejection ? `${d.lastRejection.reason} · ${formatDateTime(d.lastRejection.at)}` : '—'} />
        <DiagRow k="Gemini" v={status ? (status.assistant.configured ? `siap · ${status.assistant.model}` : 'belum dikonfigurasi') : '—'} />
      </Card>

      <SectionTitle>Profil tanaman</SectionTitle>
      <Card>
        <Text style={ui.muted}>Dikirim ke asisten bersama data sensor. Ambang yang tepat bergantung pada jenis, fase, dan media tanam.</Text>
        <Field label="Jenis tanaman" value={profile.species} onChange={(v) => setProfile((p) => ({ ...p, species: v }))} placeholder="mis. selada, tomat, cabai" />
        <Field label="Fase pertumbuhan" value={profile.growthStage} onChange={(v) => setProfile((p) => ({ ...p, growthStage: v }))} placeholder="mis. semai, vegetatif, berbunga" />
        <Field label="Media tanam / sistem nutrisi" value={profile.medium} onChange={(v) => setProfile((p) => ({ ...p, medium: v }))} placeholder="mis. NFT hidroponik, AB mix" />
        <Field label="Catatan" value={profile.notes} onChange={(v) => setProfile((p) => ({ ...p, notes: v }))} placeholder="mis. daun bawah menguning sejak 2 hari" />
        <Button label={profileSaved ? 'Tersimpan' : 'Simpan profil'} icon={profileSaved ? 'checkmark' : 'save-outline'} variant="secondary" onPress={() => void saveProfile()} style={{ marginTop: space.lg }} />
      </Card>

      <SectionTitle>Suara</SectionTitle>
      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Bacakan jawaban otomatis</Text>
            <Text style={s.hint}>Bila mati, tekan “Dengarkan” pada jawaban untuk memutar suara.</Text>
          </View>
          <Switch value={settings.autoSpeak} onValueChange={(v) => void update({ autoSpeak: v })} trackColor={{ true: colors.primary }} accessibilityLabel="Bacakan jawaban otomatis" />
        </View>
        <Text style={[ui.muted, { marginTop: space.md }]}>
          Ucapan direkam di HP (maks 30 detik, hanya saat tombol mikrofon aktif), lalu ditranskripsi oleh Gemini di server — butuh internet. Jawaban dibacakan oleh mesin text-to-speech HP.
        </Text>
      </Card>

      <SectionTitle>Keterbatasan sistem</SectionTitle>
      <Card style={{ gap: space.sm }}>
        <Text style={s.limit}>• Status fisik relay tidak dilaporkan firmware. “Terkirim” berarti broker menerima perintah, bukan relay pasti berubah.</Text>
        <Text style={s.limit}>• Kalibrasi pH dan TDS belum diverifikasi pada perangkat keras; nilai bersifat indikatif.</Text>
        <Text style={s.limit}>• Satuan UV, cahaya, tekanan, dan RH diasumsikan dari jenis sensor.</Text>
        <Text style={s.limit}>• Tidak ada sensor kelembapan media tanam. TDS tidak membedakan unsur hara.</Text>
        <Text style={s.limit}>• Jawaban AI adalah saran, bukan diagnosis. AI tidak dapat mengendalikan relay.</Text>
        <Text style={s.limit}>• Koneksi broker memakai MQTT tanpa enkripsi (port 1883).</Text>
      </Card>
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  label: { fontSize: 13.5, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  diagKey: { fontSize: 13, color: colors.textMuted, flex: 1 },
  diagVal: { fontSize: 13, color: colors.text, flex: 1.2, textAlign: 'right' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  limit: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
});
