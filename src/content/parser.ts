export type ParsedSentence = {
  id: number
  english: string
  translation: string | null
}

export type ParsedPassage = {
  sentences: ParsedSentence[]
}

export type WordToken = {
  display: string
  key: string
}

const hasEnglishLetter = (line: string) => /[A-Za-z]/.test(line)

export function parsePassage(source: string): ParsedPassage {
  const sentences: ParsedSentence[] = []
  let pendingTranslation: string | null = null

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (!hasEnglishLetter(line)) {
      if (pendingTranslation) {
        throw new Error('영어 문장이 없는 한국어 번역')
      }
      pendingTranslation = line
      continue
    }

    sentences.push({
      id: sentences.length + 1,
      english: line,
      translation: pendingTranslation,
    })
    pendingTranslation = null
  }

  if (pendingTranslation) {
    throw new Error('영어 문장이 없는 한국어 번역')
  }

  if (!sentences.length) {
    throw new Error('읽을 영어 문장이 없습니다')
  }

  return { sentences }
}

export function tokenizeEnglish(sentence: string): WordToken[] {
  const matches = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? []

  return matches.map((display) => ({
    display,
    key: display.toLocaleLowerCase('en-US').replaceAll('’', "'"),
  }))
}
