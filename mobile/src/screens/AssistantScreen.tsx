import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, apiRequest } from '../api';
import { Banner } from '../components/ui';
import { formatAge, formatClock } from '../format';
import { useGreenhouse } from '../state/greenhouse';
import { useSettings } from '../state/settings';
import { colors, radius, space, toneColors } from '../theme';
import type { ChatResponse, Freshness } from '../types';
import { chunkForSpeech, cleanForDisplay, cleanForSpeech } from '../voice';

const RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  sampleRate: 16000,
  bitRate: 32000,
};
const MAX_RECORD_MS = 30_000;
const MIN_RECORD_MS = 700;
const HISTORY_TURNS = 12;

const EXAMPLES = [
  'Bagaimana kondisi greenhouse saya sekarang?',
  'Apa arti nilai TDS yang terbaca?',
  'Apakah suhu dan kelembapan saat ini perlu diperhatikan?',
  'Apa yang sebaiknya saya periksa sebelum mengambil tindakan?',
];

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  source?: 'voice' | 'text';
  context?: ChatResponse['context'];
  error?: string;
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking';

let idSeq = 0;
const newId = () => `${Date.now()}-${idSeq++}`;

const DATA_LABEL: Record<Freshness, string> = { fresh: 'segar', stale: 'BASI', none: 'tidak ada data' };

export function AssistantScreen({ active, onOpenSettings }: { active: boolean; onOpenSettings: () => void }) {
  const { settings, configured, update } = useSettings();
  const { dataState, dataAgeMs, status } = useGreenhouse();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [voiceError, setVoiceError] = useState<{ text: string; settings?: boolean } | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [hasIndonesianVoice, setHasIndonesianVoice] = useState<boolean | null>(null);
  const recorder = useAudioRecorder(RECORDING);
  const recState = useAudioRecorderState(recorder, 250);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenIds = useRef(new Set<string>());
  const listRef = useRef<FlatList<Message>>(null);
  // Read through a ref so callbacks captured by timers (auto-stop) see the current conversation.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const busy = phase !== 'idle';

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then((v) => setHasIndonesianVoice(v.length === 0 ? null : v.some((x) => x.language?.toLowerCase().startsWith('id'))))
      .catch(() => setHasIndonesianVoice(null));
  }, []);

  // Stop talking when the user leaves the assistant tab.
  useEffect(() => {
    if (!active) {
      void Speech.stop();
      setSpeakingId(null);
    }
  }, [active]);

  const stopSpeaking = useCallback(() => {
    void Speech.stop();
    setSpeakingId(null);
  }, []);

  const speak = useCallback((msg: Message) => {
    void Speech.stop();
    const chunks = chunkForSpeech(cleanForSpeech(msg.text), Math.min(Speech.maxSpeechInputLength || 3000, 3000));
    if (!chunks.length) return;
    spokenIds.current.add(msg.id);
    setSpeakingId(msg.id);
    const done = () => setSpeakingId((cur) => (cur === msg.id ? null : cur));
    chunks.forEach((c, i) =>
      Speech.speak(c, {
        language: 'id-ID',
        rate: 1.0,
        onDone: i === chunks.length - 1 ? done : undefined,
        onStopped: done,
        onError: done,
      }),
    );
  }, []);

  const send = useCallback(
    async (raw: string, source: 'voice' | 'text') => {
      const text = raw.trim();
      if (!text || phase === 'thinking') return;
      if (!configured) {
        setVoiceError({ text: 'Server belum diatur. Buka Pengaturan untuk mengisi alamat server dan token.' });
        return;
      }
      stopSpeaking();
      const userMsg: Message = { id: newId(), role: 'user', text, source };
      // History = prior successful exchanges only; failed questions are not sent as context.
      const history = messagesRef.current
        .filter((m) => !m.error)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setPhase('thinking');
      try {
        const res = await apiRequest<ChatResponse>(settings, '/api/assistant/chat', {
          method: 'POST',
          body: { message: text, history, profile: settings.profile },
          timeoutMs: 60000,
        });
        const reply: Message = { id: newId(), role: 'model', text: res.reply };
        setMessages((prev) => [...prev.map((m) => (m.id === userMsg.id ? { ...m, context: res.context } : m)), reply]);
        if (settings.autoSpeak && !spokenIds.current.has(reply.id)) speak(reply);
      } catch (err) {
        const e = err as ApiError;
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, error: e.message } : m)));
        // Preserve the question so the user can resend or edit it.
        setInput((cur) => cur || text);
      } finally {
        setPhase('idle');
      }
    },
    [phase, configured, settings, speak, stopSpeaking],
  );

  const retry = (msg: Message) => {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    setInput('');
    void send(msg.text, msg.source ?? 'text');
  };

  const finishRecording = useCallback(
    async (discard = false) => {
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
      const duration = recorder.currentTime * 1000;
      try {
        await recorder.stop();
      } catch {
        // Already stopped.
      }
      // Leave record mode so TTS plays through the speaker at full volume (iOS).
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (discard) {
        setPhase('idle');
        return;
      }
      const uri = recorder.uri;
      if (!uri || duration < MIN_RECORD_MS) {
        setPhase('idle');
        setVoiceError({ text: 'Rekaman terlalu singkat. Tekan mikrofon, bicara, lalu tekan lagi untuk mengirim.' });
        return;
      }
      setPhase('transcribing');
      try {
        const audioBase64 = await new File(uri).base64();
        const res = await apiRequest<{ text: string }>(settings, '/api/assistant/transcribe', {
          method: 'POST',
          body: { audioBase64, mimeType: 'audio/mp4' },
          timeoutMs: 45000,
        });
        setPhase('idle');
        setInput(res.text);
        await send(res.text, 'voice');
      } catch (err) {
        setPhase('idle');
        setVoiceError({ text: `${(err as ApiError).message ?? 'Transkripsi gagal.'} Anda tetap bisa mengetik pertanyaan.` });
      }
    },
    [recorder, settings, send],
  );

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    stopSpeaking();
    if (!configured) {
      setVoiceError({ text: 'Server belum diatur. Buka Pengaturan untuk mengisi alamat server dan token.' });
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setVoiceError({
          text: perm.canAskAgain
            ? 'Izin mikrofon ditolak. Ketik pertanyaan Anda, atau tekan mikrofon lagi untuk memberi izin.'
            : 'Izin mikrofon ditolak permanen. Aktifkan di pengaturan HP, atau ketik pertanyaan Anda.',
          settings: !perm.canAskAgain,
        });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      autoStopTimer.current = setTimeout(() => void finishRecording(), MAX_RECORD_MS);
    } catch {
      setPhase('idle');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setVoiceError({ text: 'Mikrofon tidak dapat digunakan saat ini. Silakan ketik pertanyaan Anda.' });
    }
  }, [configured, recorder, finishRecording, stopSpeaking]);

  useEffect(
    () => () => {
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
      void Speech.stop();
    },
    [],
  );

  const onMic = () => {
    if (phase === 'recording') void finishRecording();
    else if (phase === 'idle') void startRecording();
  };

  const ctxTone = dataState === 'fresh' ? 'good' : dataState === 'stale' ? 'warn' : 'neutral';
  const missingProfile = !settings.profile.species.trim();

  const renderItem = ({ item }: { item: Message }) => {
    if (item.role === 'user') {
      return (
        <View style={s.userWrap}>
          <View style={s.userBubble}>
            <Text style={s.userText}>{item.text}</Text>
          </View>
          <View style={s.userMeta}>
            {item.source === 'voice' && <Ionicons name="mic-outline" size={12} color={colors.textMuted} />}
            {item.context ? (
              <Text style={s.metaText}>
                Data sensor terlampir · {DATA_LABEL[item.context.dataState]}
                {item.context.readingAt ? ` · ${formatClock(item.context.readingAt)}` : ''}
              </Text>
            ) : !item.error ? (
              <Text style={s.metaText}>Mengirim dengan data sensor…</Text>
            ) : null}
          </View>
          {item.error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{item.error}</Text>
              <Pressable onPress={() => retry(item)} style={s.retry} accessibilityRole="button" disabled={busy}>
                <Ionicons name="refresh" size={14} color={colors.danger} />
                <Text style={s.retryText}>Coba lagi</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    }
    const speaking = speakingId === item.id;
    return (
      <View style={s.botBubble}>
        <Text style={s.botText} selectable>
          {cleanForDisplay(item.text)}
        </Text>
        <View style={s.botFooter}>
          <Text style={s.metaText}>Saran AI · bukan diagnosis pasti</Text>
          <Pressable
            onPress={() => (speaking ? stopSpeaking() : speak(item))}
            style={s.speakBtn}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Hentikan suara' : 'Bacakan jawaban'}
          >
            <Ionicons name={speaking ? 'stop-circle' : 'volume-high-outline'} size={18} color={colors.primaryDark} />
            <Text style={s.speakText}>{speaking ? 'Hentikan' : 'Dengarkan'}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} accessibilityRole="header">
            Asisten tanaman
          </Text>
          <Text style={s.sub}>Gemini · {status?.assistant.configured === false ? 'belum dikonfigurasi di server' : status?.assistant.model ?? '—'}</Text>
        </View>
        <View style={s.autoSpeak}>
          <Text style={s.autoSpeakLabel}>Bacakan otomatis</Text>
          <Switch
            value={settings.autoSpeak}
            onValueChange={(v) => {
              if (!v) stopSpeaking();
              void update({ autoSpeak: v });
            }}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Bacakan jawaban otomatis"
          />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="leaf-outline" size={36} color={colors.primary} />
            <Text style={s.emptyTitle}>Tanyakan kondisi greenhouse Anda</Text>
            <Text style={s.emptySub}>
              Setiap pertanyaan otomatis dilampiri pembacaan sensor terbaru. Tekan mikrofon untuk bertanya dengan suara.
            </Text>
            {missingProfile && (
              <Pressable onPress={onOpenSettings} style={s.profileHint} accessibilityRole="button">
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={s.profileHintText}>Isi jenis & fase tanaman di Pengaturan agar saran lebih tepat →</Text>
              </Pressable>
            )}
            {EXAMPLES.map((q) => (
              <Pressable key={q} onPress={() => void send(q, 'text')} style={s.example} disabled={busy} accessibilityRole="button">
                <Text style={s.exampleText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        }
      />

      <View style={s.composer}>
        {voiceError && (
          <Banner tone="warn" icon="mic-off-outline" title="Input suara">
            {voiceError.text}
            {voiceError.settings ? (
              <Text style={s.inlineLink} onPress={() => void Linking.openSettings()}>
                {'  '}Buka pengaturan HP
              </Text>
            ) : null}
          </Banner>
        )}
        {hasIndonesianVoice === false && settings.autoSpeak && (
          <Text style={s.hint}>Suara Bahasa Indonesia tidak ditemukan di HP; jawaban dibacakan dengan suara bawaan. Pasang paket suara Indonesia di pengaturan Text-to-Speech.</Text>
        )}

        <View style={s.statusRow}>
          {phase === 'recording' ? (
            <View style={[s.state, { backgroundColor: toneColors.danger.bg }]}>
              <View style={s.recDot} />
              <Text style={[s.stateText, { color: colors.danger }]}>
                Mendengarkan… {Math.floor(recState.durationMillis / 1000)} dtk (maks {MAX_RECORD_MS / 1000})
              </Text>
              <Pressable onPress={() => void finishRecording(true)} accessibilityRole="button" style={s.cancelRec}>
                <Text style={s.cancelRecText}>Batal</Text>
              </Pressable>
            </View>
          ) : phase === 'transcribing' ? (
            <View style={[s.state, { backgroundColor: toneColors.info.bg }]}>
              <ActivityIndicator size="small" color={colors.info} />
              <Text style={[s.stateText, { color: colors.info }]}>Mengubah suara menjadi teks…</Text>
            </View>
          ) : phase === 'thinking' ? (
            <View style={[s.state, { backgroundColor: toneColors.info.bg }]}>
              <ActivityIndicator size="small" color={colors.info} />
              <Text style={[s.stateText, { color: colors.info }]}>Asisten menganalisis data…</Text>
            </View>
          ) : speakingId ? (
            <View style={[s.state, { backgroundColor: toneColors.good.bg }]}>
              <Ionicons name="volume-high" size={16} color={colors.primaryDark} />
              <Text style={[s.stateText, { color: colors.primaryDark }]}>Membacakan jawaban…</Text>
              <Pressable onPress={stopSpeaking} accessibilityRole="button" style={s.cancelRec}>
                <Text style={[s.cancelRecText, { color: colors.primaryDark }]}>Hentikan</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[s.state, { backgroundColor: toneColors[ctxTone].bg }]}>
              <Ionicons name="attach" size={15} color={toneColors[ctxTone].fg} />
              <Text style={[s.stateText, { color: toneColors[ctxTone].fg }]}>
                {dataState === 'none'
                  ? 'Belum ada data sensor untuk dilampirkan'
                  : `Data sensor ${DATA_LABEL[dataState]} (${formatAge(dataAgeMs)}) akan dilampirkan`}
              </Text>
            </View>
          )}
        </View>

        <View style={s.inputRow}>
          <Pressable
            onPress={onMic}
            disabled={phase === 'transcribing' || phase === 'thinking'}
            style={[s.mic, phase === 'recording' && s.micOn, (phase === 'transcribing' || phase === 'thinking') && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel={phase === 'recording' ? 'Selesai bicara dan kirim' : 'Mulai bicara'}
          >
            <Ionicons name={phase === 'recording' ? 'stop' : 'mic'} size={24} color={phase === 'recording' ? '#fff' : colors.primaryDark} />
          </Pressable>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ketik pertanyaan…"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            editable={phase !== 'recording'}
            accessibilityLabel="Pertanyaan untuk asisten"
          />
          <Pressable
            onPress={() => void send(input, 'text')}
            disabled={busy || !input.trim()}
            style={[s.send, (busy || !input.trim()) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Kirim pertanyaan"
          >
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  autoSpeak: { alignItems: 'center' },
  autoSpeakLabel: { fontSize: 11, color: colors.textMuted },
  list: { padding: space.lg, paddingTop: space.sm, gap: space.md, flexGrow: 1 },
  empty: { alignItems: 'center', paddingTop: space.lg, gap: space.sm },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: space.sm },
  emptySub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: space.sm },
  profileHint: { flexDirection: 'row', gap: 6, backgroundColor: colors.infoSoft, padding: space.sm, borderRadius: radius.sm, alignItems: 'center' },
  profileHintText: { fontSize: 12.5, color: colors.info, flexShrink: 1 },
  example: { alignSelf: 'stretch', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, minHeight: 48, justifyContent: 'center' },
  exampleText: { fontSize: 14, color: colors.primaryDark },
  userWrap: { alignItems: 'flex-end' },
  userBubble: { backgroundColor: colors.primary, borderRadius: radius.lg, borderBottomRightRadius: 4, padding: space.md, maxWidth: '88%' },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  userMeta: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: 11.5, color: colors.textMuted },
  errorBox: { marginTop: 6, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: space.sm, maxWidth: '88%' },
  errorText: { fontSize: 13, color: colors.danger },
  retry: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 6, minHeight: 32 },
  retryText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  botBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, borderBottomLeftRadius: 4, padding: space.md, maxWidth: '94%' },
  botText: { fontSize: 15, lineHeight: 22, color: colors.text },
  botFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm, gap: space.sm },
  speakBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 6 },
  speakText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg, padding: space.md, gap: space.sm },
  hint: { fontSize: 12, color: colors.textMuted },
  statusRow: { flexDirection: 'row' },
  state: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm },
  stateText: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  cancelRec: { paddingHorizontal: 6, minHeight: 28, justifyContent: 'center' },
  cancelRecText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  mic: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.danger },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 15,
    color: colors.text,
  },
  send: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  inlineLink: { color: colors.info, fontWeight: '700' },
});
