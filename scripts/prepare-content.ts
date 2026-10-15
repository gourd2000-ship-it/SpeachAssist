import 'dotenv/config'

import { GoogleGenAI } from '@google/genai'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  preparePassage,
  type PreparedPassage,
  type SentenceEnrichment,
} from '../src/content/prepare.js'
import { passageIdFromFilename } from '../src/content/passageId.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(projectRoot, 'doc')
const publicContentRoot = resolve(projectRoot, 'public/content')
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

async function readCachedPassage(passagePath: string): Promise<Map<string, CachedSentence>> {
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
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((filename) => extname(filename).toLocaleLowerCase('en-US') === '.txt')
    .sort((first, second) => first.localeCompare(second, 'ko'))

  if (!sourceFiles.length) {
    throw new Error('doc 폴더에 준비할 .txt 지문이 없습니다.')
  }

  let enrichedCount = 0
  const passages: PreparedPassage[] = []

  for (const filename of sourceFiles) {
    const id = passageIdFromFilename(filename)
    const title = basename(filename, extname(filename))
    const sourcePath = resolve(sourceDirectory, filename)
    const contentRoot = resolve(publicContentRoot, id)
    const passagePath = resolve(contentRoot, 'passage.json')
    const [source, cached] = await Promise.all([readFile(sourcePath, 'utf8'), readCachedPassage(passagePath)])

    const passage = await preparePassage({
      id,
      title,
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
    passages.push(passage)
  }

  await writeFile(
    indexPath,
    `${JSON.stringify(
      { passages: passages.map(({ id, title }) => ({ id, title })) },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const audioJobs = passages.flatMap((passage) => [
    ...passage.sentences.map((sentence) => ({
      label: `${passage.title} sentence ${sentence.id}`,
      text: sentence.english,
      audioSrc: sentence.audioSrc,
    })),
    ...passage.words.map((word) => ({
      label: `${passage.title} word ${word.key}`,
      text: word.key,
      audioSrc: word.audioSrc,
    })),
  ])

  const pendingJobs = [] as typeof audioJobs
  for (const job of audioJobs) {
    if (force || !(await pathExists(audioFilePath(job.audioSrc)))) pendingJobs.push(job)
  }

  let createdAudioCount = 0
  let nextJobIndex = 0
  async function createAudioWorker() {
    while (nextJobIndex < pendingJobs.length) {
      const job = pendingJobs[nextJobIndex]
      nextJobIndex += 1
      const outputPath = audioFilePath(job.audioSrc)

      await mkdir(dirname(outputPath), { recursive: true })
      createdAudioCount += 1
      console.log(`[audio ${createdAudioCount}/${pendingJobs.length}] ${job.label}`)
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
                    style: 'Read naturally and clearly for an English learner.',
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice }],
        },
      })

      if (!response.output_audio?.data) {
        throw new Error(`음성 데이터를 받지 못했습니다: ${job.label}`)
      }

      await writeFile(outputPath, Buffer.from(response.output_audio.data, 'base64'))
    }
  }

  await Promise.all([createAudioWorker(), createAudioWorker()])

  console.log(`완료: 텍스트 보강 ${enrichedCount}개, 새 음성 ${createdAudioCount}개`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
