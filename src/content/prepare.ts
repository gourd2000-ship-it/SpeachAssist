import { parsePassage, tokenizeEnglish } from './parser.js'

export type SentenceEnrichment = {
  translation: string
  pronunciation: string
}

export type PreparedSentence = {
  id: number
  english: string
  translation: string
  pronunciation: string
  audioSrc: string
}

export type PreparedWord = {
  key: string
  audioSrc: string
}

export type PreparedPassage = {
  id: string
  title: string
  sentences: PreparedSentence[]
  words: PreparedWord[]
}

export type PreparePassageOptions = {
  id: string
  title: string
  source: string
  enrichSentence: (sentence: {
    english: string
    translation: string | null
  }) => Promise<SentenceEnrichment>
}

const audioBasePath = (passageId: string) => `/content/${passageId}/audio`

export function wordAudioPath(passageId: string, wordKey: string): string {
  return `${audioBasePath(passageId)}/words/${encodeURIComponent(wordKey)}.wav`
}

export function sentenceAudioPath(passageId: string, sentenceId: number): string {
  return `${audioBasePath(passageId)}/sentences/${String(sentenceId).padStart(3, '0')}.wav`
}

export async function preparePassage({
  id,
  title,
  source,
  enrichSentence,
}: PreparePassageOptions): Promise<PreparedPassage> {
  const parsed = parsePassage(source)
  const words = new Set<string>()

  const sentences: PreparedSentence[] = []

  for (const sentence of parsed.sentences) {
    const enrichment = await enrichSentence(sentence)
    const translation = sentence.translation ?? enrichment.translation.trim()
    const pronunciation = enrichment.pronunciation.trim()

    if (!translation || !pronunciation) {
      throw new Error('AI 보강 결과가 비어 있습니다')
    }

    for (const token of tokenizeEnglish(sentence.english)) {
      words.add(token.key)
    }

    sentences.push({
      id: sentence.id,
      english: sentence.english,
      translation,
      pronunciation,
      audioSrc: sentenceAudioPath(id, sentence.id),
    })
  }

  return {
    id,
    title,
    sentences,
    words: [...words].map((key) => ({ key, audioSrc: wordAudioPath(id, key) })),
  }
}
