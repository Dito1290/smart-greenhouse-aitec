import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { RelayControls } from '../components/RelayControl';
import { SensorTile } from '../components/SensorTile';
import { Banner, Card, SectionTitle, styles as ui } from '../components/ui';
import { PRIMARY_FIELDS } from '../fields';
import { formatAge, formatDateTime } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { useSettings } from '../state/settings';
import { summarize } from '../summary';
import { colors, space, toneColors } from '../theme';

export function DashboardScreen({ onOpenAssistant, onOpenSettings }: { onOpenAssistant: () => void; onOpenSettings: () => void }) {
  const { configured } = useSettings();
  const { latest, status, link, dataState, dataAgeMs, refresh } = useGreenhouse();
  const [refreshing, setRefreshing] = useState(false);
  const reading = latest?.reading ?? null;
  const fields = latest?.fields ?? PRIMARY_FIELDS;
  const summary = summarize({
    backendReachable: link.reachable,
    brokerConnected: status ? status.broker.connected : null,
    dataState,
    dataAgeMs,
    reading,
  });
  const tone = toneColors[summary.tone];

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={s.title} accessibilityRole="header">
        Greenhouse
      </Text>
      <Text style={ui.muted}>
        {reading ? `Pembaruan terakhir ${formatDateTime(reading.receivedAt)} (${formatAge(dataAgeMs)})` : 'Belum ada pembacaan sensor'}
      </Text>

      {!configured && (
        <View style={{ marginTop: space.md }}>
          <Banner tone="info" icon="settings-outline" title="Atur koneksi server terlebih dulu">
            Masukkan alamat server dan token akses di Pengaturan.
          </Banner>
          <Pressable onPress={onOpenSettings} accessibilityRole="button">
            <Text style={s.link}>Buka Pengaturan →</Text>
          </Pressable>
        </View>
      )}

      <SectionTitle>Koneksi</SectionTitle>
      <ConnectionPanel compact />

      <Card style={[s.summary, { borderColor: tone.fg + '40' }]}>
        <Text style={[s.summaryHead, { color: tone.fg }]}>{summary.headline}</Text>
        {summary.items.map((it, i) => (
          <View key={i} style={s.summaryItem}>
            <View style={[s.bullet, { backgroundColor: toneColors[it.tone].fg }]} />
            <Text style={s.summaryText}>{it.text}</Text>
          </View>
        ))}
        <Text style={s.footnote}>Ringkasan ini menilai kualitas data, bukan kesehatan tanaman. Tanyakan asisten untuk analisis.</Text>
      </Card>

      <Pressable onPress={onOpenAssistant} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <View style={s.ctaIcon}>
          <Ionicons name="mic" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.ctaTitle}>Tanya asisten tanaman</Text>
          <Text style={s.ctaSub}>Bicara atau ketik — jawaban memakai data sensor terkini</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </Pressable>

      <SectionTitle right={dataState === 'stale' ? <Text style={s.staleTag}>DATA BASI</Text> : undefined}>Pembacaan sensor</SectionTitle>
      <View style={s.grid}>
        {fields.map((f) => (
          <SensorTile key={f.key} field={f} reading={reading} stale={dataState === 'stale'} />
        ))}
      </View>
      <Text style={[ui.muted, { marginTop: space.sm }]}>
        * Satuan diasumsikan dari jenis sensor, belum diverifikasi pada firmware. Suhu & kelembapan berasal dari satu sensor lingkungan.
      </Text>

      <SectionTitle>Kontrol relay</SectionTitle>
      <RelayControls />
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  link: { color: colors.primaryDark, fontWeight: '700', fontSize: 15, paddingVertical: space.sm },
  summary: { marginTop: space.lg, gap: space.sm },
  summaryHead: { fontSize: 17, fontWeight: '800' },
  summaryItem: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bullet: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  summaryText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  footnote: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  cta: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  ctaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ctaSub: { color: '#E3F1E8', fontSize: 12.5, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  staleTag: { fontSize: 11, fontWeight: '800', color: colors.warn, letterSpacing: 0.5 },
});
