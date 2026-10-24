import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatClock } from '../format';
import { colors } from '../theme';

export interface Point {
  t: number;
  v: number | null;
}

const PAD = { top: 8, bottom: 18, left: 0, right: 0 };

/**
 * Single-series time chart. The line breaks at nulls and at gaps longer than `gapMs`
 * so missing data is never drawn as if it had been measured.
 */
export function LineChart({
  points,
  height = 120,
  gapMs = 60_000,
  formatY,
  startT,
  endT,
}: {
  points: Point[];
  height?: number;
  gapMs?: number;
  formatY: (v: number) => string;
  startT: number;
  endT: number;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const valid = points.filter((p): p is { t: number; v: number } => p.v !== null);

  const geo = useMemo(() => {
    if (!width || valid.length === 0) return null;
    let min = Math.min(...valid.map((p) => p.v));
    let max = Math.max(...valid.map((p) => p.v));
    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      min -= pad;
      max += pad;
    }
    const span = Math.max(1, endT - startT);
    const innerH = height - PAD.top - PAD.bottom;
    const x = (t: number) => ((t - startT) / span) * width;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;

    let d = '';
    let prevT: number | null = null;
    for (const p of points) {
      if (p.v === null) {
        prevT = null;
        continue;
      }
      const cmd = prevT === null || p.t - prevT > gapMs ? 'M' : 'L';
      d += `${cmd}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      prevT = p.t;
    }
    return { d, x, y, min, max };
  }, [width, points, valid, height, gapMs, startT, endT]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pick = (e: GestureResponderEvent) => {
    if (!geo || !valid.length) return;
    const tx = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < valid.length; i++) {
      if (Math.abs(geo.x(valid[i].t) - tx) < Math.abs(geo.x(valid[best].t) - tx)) best = i;
    }
    setActive(best);
  };

  const shown = active !== null ? valid[active] : valid.at(-1);

  return (
    <View>
      <View style={s.readout}>
        <Text style={s.readoutValue}>{shown ? formatY(shown.v) : '—'}</Text>
        <Text style={s.readoutTime}>{shown ? (active !== null ? formatClock(shown.t) : `terakhir ${formatClock(shown.t)}`) : ''}</Text>
      </View>
      <View
        onLayout={onLayout}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
        accessible
        accessibilityLabel={
          valid.length
            ? `Grafik ${valid.length} pembacaan, minimum ${formatY(Math.min(...valid.map((p) => p.v)))}, maksimum ${formatY(Math.max(...valid.map((p) => p.v)))}`
            : 'Tidak ada data pada rentang ini'
        }
      >
        {geo ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={PAD.top} y2={PAD.top} stroke={colors.grid} strokeWidth={1} />
            <Line x1={0} x2={width} y1={height - PAD.bottom} y2={height - PAD.bottom} stroke={colors.grid} strokeWidth={1} />
            <Path d={geo.d} stroke={colors.chartLine} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {shown && (
              <>
                {active !== null && (
                  <Line x1={geo.x(shown.t)} x2={geo.x(shown.t)} y1={PAD.top} y2={height - PAD.bottom} stroke={colors.textFaint} strokeWidth={1} />
                )}
                <Circle cx={geo.x(shown.t)} cy={geo.y(shown.v)} r={4.5} fill={colors.chartLine} stroke={colors.surface} strokeWidth={2} />
              </>
            )}
          </Svg>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyText}>Tidak ada pembacaan pada rentang ini</Text>
          </View>
        )}
        {geo && (
          <>
            <Text style={[s.axis, { top: 0, left: 0 }]}>{formatY(geo.max)}</Text>
            <Text style={[s.axis, { bottom: PAD.bottom + 2, left: 0 }]}>{formatY(geo.min)}</Text>
          </>
        )}
      </View>
      <View style={s.timeRow}>
        <Text style={s.axisTime}>{formatClock(startT, false)}</Text>
        <Text style={s.axisTime}>{formatClock(endT, false)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  readoutValue: { fontSize: 20, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  readoutTime: { fontSize: 12, color: colors.textMuted },
  axis: { position: 'absolute', fontSize: 10.5, color: colors.textFaint, backgroundColor: colors.surface + 'CC', paddingHorizontal: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -14 },
  axisTime: { fontSize: 10.5, color: colors.textFaint },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 8 },
  emptyText: { fontSize: 12.5, color: colors.textMuted },
});
