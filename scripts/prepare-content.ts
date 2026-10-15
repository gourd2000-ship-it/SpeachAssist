import 'dotenv/config'

import { GoogleGenAI } from '@google/genai'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  preparePassage,
  type PreparedPassage,
  type SentenceEnrichment,
} from '../src/content/prepare.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(projectRoot, 'doc/sample.txt')
const contentRoot = resolve(projectRoot, 'public/content/sample')
const passagePath = resolve(contentRoot, 'passage.json')
const indexPath = resolve(projectRoot, 'public/content/index.json')
const force = process.argv.includes('--force')

const textModel = 'gemini-3.8-flash'
const speechModel = 'gemini-3.8-flash-tts'
const voice = 'Kore'

type CachedSentence = {
  english: string
  translation: string
  pronunciation: string
}

function extractJson(text: string): SentenceEnrichment {
  const json = text.trim().replace(/^```json\s*|\s*```$/g, '')
  const parsed: unknown = JSON.parse(json)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { translation?: unknown }).translation !== 'string' ||
    typeof (parsed as { pronunciation?: unknown }).pronunciation !== 'string'
  ) {
    throw new Error('Gemini 보강 응답 형식이 올바르지 않습니다')
  }

  return {
    translation: (parsed as { translation: string }).translation,
    pronunciation: (parsed as { pronunciation: string }).pronunciation,
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readCachedPassage(): Promise<Map<string, CachedSentence>> {
  if (!(await pathExists(passagePath))) return new Map()

  const cached = JSON.parse(await readFile(passagePath, 'utf8')) as PreparedPassage
  return new Map(cached.sentences.map((sentence) => [sentence.english, sentence]))
}

function audioFilePath(audioSrc: string): string {
  return resolve(projectRoot, 'public', `.${audioSrc}`)
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY를 .env에 설정한 뒤 다시 실행하세요.')
  }

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const [source, cached] = await Promise.all([readFile(sourcePath, 'utf8'), readCachedPassage()])
  let enrichedCount = 0

  const passage = await preparePassage({
    id: 'sample',
    title: 'sample',
    source,
    enrichSentence: async ({ english }) => {
      const prior = cached.get(english)
      if (!force && prior?.translation && prior.pronunciation) {
        return prior
      }

      enrichedCount += 1
      console.log(`[text ${enrichedCount}] ${english}`)
      const response = await client.interactions.create({
        model: textModel,
        system_instruction: [
          'You prepare Korean study data for English learners.',
          'Return only a JSON object with exactly translation and pronunciation string fields.',
          'translation must be a natural Korean translation.',
          'pronunciation must be Korean Hangul that represents how the English sentence sounds, not a translation.',
          'Do not include Markdown, explanations, or English words in pronunciation.',
        ].join(' '),
        input: `English sentence: ${JSON.stringify(english)}`,
      })

      if (!response.output_text) {
        throw new Error(`보강 텍스트를 받지 못했습니다: ${english}`)
      }

      return extractJson(response.output_text)
    },
  })

  await mkdir(contentRoot, { recursive: true })
  await writeFile(passagePath, `${JSON.stringify(passage, null, 2)}\n`, 'utf8')
  await writeFile(
    indexPath,
    `${JSON.stringify({ passages: [{ id: passage.id, title: passage.title }] }, null, 2)}\n`,
    'utf8',
  )

  const audioJobs = [
    ...passage.sentences.map((sentence) => ({
      label: `sentence ${sentence.id}`,
      text: sentence.english,
      audioSrc: sentence.audioSrc,
    })),
    ...passage.words.map((word) => ({
      label: `word ${word.key}`,
      text: word.key,
      audioSrc: word.audioSrc,
    })),
  ]

  let createdAudioCount = 0
  for (const job of audioJobs) {
    const outputPath = audioFilePath(job.audioSrc)
    if (!force && (await pathExists(outputPath))) continue

    await mkdir(dirname(outputPath), { recursive: true })
    createdAudioCount += 1
    console.log(`[audio ${createdAudioCount}/${audioJobs.length}] ${job.label}`)
    const response = await client.interactions.create({
      model: speechModel,
      input: [
        {
          type: 'user_input',
          content: [
            {
              type: 'text',
              text: job.text,
              annotations: [
                {
                  type: 'speech_metadata',
                  speaker: 'reader',
                  style: 'Read naturally and clearly for an English learner.',
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: {
          speakers: [{ speaker: 'reader', voice, language: 'en-US' }],
        },
      },
    })

    if (!response.output_audio?.data) {
      throw new Error(`음성 데이터를 받지 못했습니다: ${job.label}`)
    }

    await writeFile(outputPath, Buffer.from(response.output_audio.data, 'base64'))
  }

  console.log(`완료: 텍스트 보강 ${enrichedCount}개, 새 음성 ${createdAudioCount}개`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
