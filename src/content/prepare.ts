import { parsePassage } from './parser.js'

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

export type PreparedPassage = {
  id: string
  title: string
  sentences: PreparedSentence[]
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

  const sentences: PreparedSentence[] = []

  for (const sentence of parsed.sentences) {
    const enrichment = await enrichSentence(sentence)
    const translation = sentence.translation ?? enrichment.translation.trim()
    const pronunciation = enrichment.pronunciation.trim()

    if (!translation || !pronunciation) {
      throw new Error('AI 보강 결과가 비어 있습니다')
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
  }
}
