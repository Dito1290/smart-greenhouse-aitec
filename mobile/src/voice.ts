/** Strip markdown so text-to-speech doesn't read symbols aloud. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/°C/g, ' derajat Celsius')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Remove heavy markdown for display while keeping line structure. */
export function cleanForDisplay(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').trim();
}

/** Split long text on sentence/line boundaries so each chunk fits the platform TTS limit. */
export function chunkForSpeech(text: string, max = 3000): string[] {
  const parts = text.split(/(?<=[.!?\n])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (p.length > max) {
      if (cur) chunks.push(cur);
      for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
      cur = '';
    } else if ((cur + ' ' + p).trim().length > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = (cur ? cur + ' ' : '') + p;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.filter((c) => c.trim().length > 0);
}
