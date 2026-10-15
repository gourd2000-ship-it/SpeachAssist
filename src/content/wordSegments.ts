export type EnglishSegment =
  | { type: 'text'; value: string }
  | { type: 'word'; display: string; key: string }

const wordPattern = /[A-Za-z]+(?:['’][A-Za-z]+)?/g

export function segmentEnglish(sentence: string): EnglishSegment[] {
  const segments: EnglishSegment[] = []
  let cursor = 0

  for (const match of sentence.matchAll(wordPattern)) {
    const index = match.index ?? cursor
    if (index > cursor) {
      segments.push({ type: 'text', value: sentence.slice(cursor, index) })
    }

    const display = match[0]
    segments.push({
      type: 'word',
      display,
      key: display.toLocaleLowerCase('en-US').replaceAll('’', "'"),
    })
    cursor = index + display.length
  }

  if (cursor < sentence.length) {
    segments.push({ type: 'text', value: sentence.slice(cursor) })
  }

  return segments
}
