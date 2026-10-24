import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { formatClock } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { colors, space } from '../theme';
import type { RelayAction, RelayId } from '../types';
import { Button, Card, Pill, type IconName } from './ui';

const RELAYS: { id: RelayId; label: string; icon: IconName; on: string; off: string }[] = [
  { id: 'fertilizer', label: 'Relay pupuk', icon: 'beaker-outline', on: 'pupuk_on', off: 'pupuk_off' },
  { id: 'exhaust', label: 'Kipas exhaust', icon: 'sync-outline', on: 'exhaust_on', off: 'exhaust_off' },
  { id: 'light', label: 'Lampu greenhouse', icon: 'bulb-outline', on: 'lampu_on', off: 'lampu_off' },
];

export function RelayControls() {
  const { relayUi, sendRelay, status, link } = useGreenhouse();
  const brokerUp = link.reachable === true && status?.broker.connected === true;

  const confirmAndSend = (id: RelayId, action: RelayAction, label: string) => {
    const verb = action === 'on' ? 'MENYALAKAN' : 'MEMATIKAN';
    const extra =
      id === 'fertilizer' && action === 'on'
        ? '\n\nESP32 sudah menjalankan otomasi pupuk berbasis TDS (target 800, relay ~10 detik). Menyalakan manual dapat bertabrakan dengan otomasi tersebut dan menyebabkan dosis berlebih. Pastikan Anda memantau larutan.'
        : '';
    Alert.alert(
      `${label}`,
      `Kirim perintah ${verb} ke perangkat?${extra}\n\nAplikasi hanya dapat memastikan perintah diterima broker, bukan bahwa relay benar-benar berubah.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: action === 'on' ? 'Nyalakan' : 'Matikan', style: action === 'on' && id === 'fertilizer' ? 'destructive' : 'default', onPress: () => void sendRelay(id, action) },
      ],
    );
  };

  return (
    <View style={{ gap: space.md }}>
      {!brokerUp && (
        <Text style={st.disabledNote}>Kontrol dinonaktifkan: server atau broker MQTT tidak terhubung, sehingga perintah tidak dapat dikirim.</Text>
      )}
      {RELAYS.map((r) => {
        const ui = relayUi[r.id];
        const server = status?.relays[r.id] ?? null;
        const busy = ui.pending !== null;
        return (
          <Card key={r.id}>
            <View style={st.head}>
              <View style={st.iconWrap}>
                <Ionicons name={r.icon} size={20} color={colors.primaryDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{r.label}</Text>
                <Text style={st.sub}>Status fisik: tidak terkonfirmasi</Text>
              </View>
              {busy ? (
                <Pill tone="info" icon="time-outline" label="Mengirim…" />
              ) : server?.status === 'published' ? (
                <Pill tone="neutral" icon="paper-plane-outline" label={`${server.action.toUpperCase()} terkirim`} />
              ) : server?.status === 'failed' ? (
                <Pill tone="danger" icon="alert-circle-outline" label="Gagal" />
              ) : null}
            </View>

            {server && !busy && (
              <Text style={st.sub}>
                Perintah terakhir: <Text style={st.code}>{server.command}</Text> · {formatClock(server.requestedAt)} ·{' '}
                {server.status === 'published' ? 'diterima broker, belum dikonfirmasi perangkat' : server.status === 'failed' ? 'gagal dikirim' : 'sedang dikirim'}
              </Text>
            )}
            {ui.lastResult && !busy && (
              <View style={st.result}>
                <Ionicons
                  name={ui.lastResult.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={16}
                  color={ui.lastResult.ok ? colors.primaryDark : colors.danger}
                />
                <Text style={[st.resultText, { color: ui.lastResult.ok ? colors.text : colors.danger }]}>{ui.lastResult.message}</Text>
              </View>
            )}

            <View style={st.buttons}>
              <Button
                label="Nyalakan"
                icon="power"
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!brokerUp || busy}
                loading={ui.pending === 'on'}
                accessibilityHint={`Mengirim perintah ${r.on}`}
                onPress={() => confirmAndSend(r.id, 'on', r.label)}
              />
              <Button
                label="Matikan"
                icon="stop-circle-outline"
                variant="secondary"
                style={{ flex: 1 }}
                disabled={!brokerUp || busy}
                loading={ui.pending === 'off'}
                accessibilityHint={`Mengirim perintah ${r.off}`}
                onPress={() => confirmAndSend(r.id, 'off', r.label)}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12.5, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  code: { fontFamily: 'monospace', color: colors.text },
  result: { flexDirection: 'row', gap: 6, marginTop: space.sm, alignItems: 'flex-start' },
  resultText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  disabledNote: { fontSize: 13, color: colors.warn, lineHeight: 18 },
});
