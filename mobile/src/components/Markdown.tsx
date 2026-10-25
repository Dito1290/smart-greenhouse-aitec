import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { parseMarkdown, type Inline } from '../markdown';
import { colors, radius, space } from '../theme';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) => (
        <Text key={i} style={[it.bold && s.bold, it.italic && s.italic, it.code && s.inlineCode]}>
          {it.text}
        </Text>
      ))}
    </>
  );
}

/** Renders the Markdown subset described in ../markdown.ts. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={s.root}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} style={[s.body, s.heading, i > 0 && { marginTop: space.xs }]} accessibilityRole="header" selectable>
                <Inlines items={b.inlines} />
              </Text>
            );
          case 'bullet':
          case 'ordered':
            return (
              <View key={i} style={[s.item, { paddingLeft: b.depth * 14 }]}>
                <Text style={[s.body, s.marker]}>{b.type === 'bullet' ? '•' : b.marker}</Text>
                <Text style={[s.body, s.itemText]} selectable>
                  <Inlines items={b.inlines} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <ScrollView key={i} horizontal style={s.codeBox} contentContainerStyle={{ padding: space.sm }}>
                <Text style={s.code} selectable>
                  {b.text}
                </Text>
              </ScrollView>
            );
          case 'rule':
            return <View key={i} style={s.rule} />;
          default:
            return (
              <Text key={i} style={s.body} selectable>
                <Inlines items={b.inlines} />
              </Text>
            );
        }
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 6 },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  heading: { fontWeight: '800', color: colors.primaryDark },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: MONO, fontSize: 13.5, backgroundColor: colors.surfaceAlt },
  item: { flexDirection: 'row', gap: 6 },
  marker: { minWidth: 18, color: colors.textMuted },
  itemText: { flex: 1 },
  codeBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  code: { fontFamily: MONO, fontSize: 13, lineHeight: 19, color: colors.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xs },
});
