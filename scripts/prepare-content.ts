import 'dotenv/config'

import { GoogleGenAI } from '@google/genai'
import { access, cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parsePassage } from '../src/content/parser.js'
import { preparePassage, sentenceAudioPath, type PreparedPassage, type PreparedSentence, type SentenceEnrichment } from '../src/content/prepare.js'
import { passageIdFromFilename } from '../src/content/passageId.js'

type CachedSentence = Pick<PreparedSentence, 'english' | 'translation' | 'pronunciation' | 'audioSrc'>
type CachedPassage = { id: string; title: string; sentences: CachedSentence[] }
type PassageList = { passages: Array<{ id: string; title: string }> }

export type PrepareContentOptions = {
  projectRoot: string
  force?: boolean
  enrichSentence: (sentence: { english: string; translation: string | null }) => Promise<SentenceEnrichment>
  synthesize: (sentence: { english: string; label: string }) => Promise<Buffer>
  log?: (message: string) => void
  move?: (from: string, to: string) => Promise<void>
  remove?: (path: string) => Promise<void>
  uniqueName?: (kind: 'content-stage' | 'content-backup' | 'content-residual', attempt: number) => string
  beforeValidate?: (stageRoot: string) => Promise<void> | void
}

const exists = async (path: string) => access(path).then(() => true, () => false)
const isWave = async (path: string) => {
  try {
    const bytes = await readFile(path)
    return bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from('RIFF')) && bytes.subarray(8, 12).equals(Buffer.from('WAVE'))
  } catch { return false }
}

function extractJson(text: string): SentenceEnrichment {
  const parsed: unknown = JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ''))
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { translation?: unknown }).translation !== 'string' || typeof (parsed as { pronunciation?: unknown }).pronunciation !== 'string') throw new Error('Gemini 보강 응답 형식이 올바르지 않습니다')
  return parsed as SentenceEnrichment
}

async function readJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, 'utf8')) as T } catch { return null } }

async function privatePath(root: string, kind: 'content-stage' | 'content-backup' | 'content-residual', uniqueName: NonNullable<PrepareContentOptions['uniqueName']>) {
  for (let attempt = 1; attempt < 10_000; attempt += 1) {
    const path = resolve(root, uniqueName(kind, attempt))
    if (relative(root, path).startsWith('..')) throw new Error('비공개 콘텐츠 경로가 프로젝트 루트를 벗어났습니다')
    if (!(await exists(path))) return path
  }
  throw new Error(`고유한 ${kind} 경로를 만들 수 없습니다`)
}

function sourceSentences(id: string, source: string) { return parsePassage(source).sentences.map((sentence) => ({ ...sentence, audioSrc: sentenceAudioPath(id, sentence.id) })) }
async function cacheFor(contentRoot: string, id: string) { return readJson<CachedPassage>(join(contentRoot, id, 'passage.json')) }

async function reusableSentence(contentRoot: string, id: string, expected: ReturnType<typeof sourceSentences>[number], cached: CachedSentence | undefined) {
  if (!cached || cached.english !== expected.english || !cached.translation.trim() || !cached.pronunciation.trim() || cached.audioSrc !== expected.audioSrc) return null
  const audioPath = resolve(contentRoot, id, 'audio', 'sentences', `${String(expected.id).padStart(3, '0')}.wav`)
  return (await isWave(audioPath)) ? cached : null
}

async function validateTree(root: string, expected: PreparedPassage[]) {
  const index = await readJson<PassageList>(join(root, 'index.json'))
  if (!index || !Array.isArray(index.passages) || JSON.stringify(index.passages) !== JSON.stringify(expected.map(({ id, title }) => ({ id, title })))) throw new Error('임시 콘텐츠 목록이 올바르지 않습니다')
  for (const passage of expected) {
    const actual = await readJson<PreparedPassage>(join(root, passage.id, 'passage.json'))
    if (!actual || actual.id !== passage.id || actual.title !== passage.title || !Array.isArray(actual.sentences) || actual.sentences.length !== passage.sentences.length) throw new Error(`임시 지문 JSON이 올바르지 않습니다: ${passage.id}`)
    for (const [offset, expectedSentenceData] of passage.sentences.entries()) {
      const sentence = actual.sentences[offset]
      if (!sentence || sentence.id !== offset + 1 || sentence.english !== expectedSentenceData.english || !sentence.translation.trim() || !sentence.pronunciation.trim() || sentence.audioSrc !== sentenceAudioPath(passage.id, offset + 1)) throw new Error(`임시 문장 데이터가 올바르지 않습니다: ${passage.id}/${offset + 1}`)
      if (!(await isWave(join(root, passage.id, 'audio', 'sentences', `${String(offset + 1).padStart(3, '0')}.wav`)))) throw new Error(`임시 WAV가 올바르지 않습니다: ${passage.id}/${offset + 1}`)
    }
  }
}

async function validateExistingSample(contentRoot: string, source: string) {
  const cached = await cacheFor(contentRoot, 'sample')
  if (!cached || cached.id !== 'sample') throw new Error('기존 sample 콘텐츠가 올바르지 않습니다')
  const expected = sourceSentences('sample', source)
  if (cached.sentences.length !== expected.length) throw new Error('기존 sample 문장 수가 올바르지 않습니다')
  for (const [index, sentence] of expected.entries()) {
    const prior = await reusableSentence(contentRoot, 'sample', sentence, cached.sentences[index])
    if (!prior || (sentence.translation && prior.translation !== sentence.translation)) throw new Error('기존 sample 콘텐츠가 올바르지 않습니다')
  }
}

const combinedError = (message: string, errors: unknown[]) => new Error([message, ...errors.map((error) => error instanceof Error ? error.message : String(error))].join('\n'))

export async function prepareContent(options: PrepareContentOptions): Promise<void> {
  const root = resolve(options.projectRoot)
  const contentRoot = join(root, 'public', 'content')
  const sourceRoot = join(root, 'doc')
  const move = options.move ?? rename
  const remove = options.remove ?? ((path: string) => rm(path, { recursive: true, force: true }))
  const uniqueName = options.uniqueName ?? ((kind, attempt) => `.${kind}-${process.pid}-${Date.now()}-${attempt}`)
  const stageRoot = await privatePath(root, 'content-stage', uniqueName)
  let stageCreated = false
  let published = false
  try {
    const filenames = (await readdir(sourceRoot)).filter((name) => extname(name).toLowerCase() === '.txt').sort((a, b) => a.localeCompare(b, 'ko'))
    if (!filenames.length) throw new Error('doc 폴더에 준비할 .txt 지문이 없습니다.')
    await mkdir(stageRoot); stageCreated = true
    const sources = await Promise.all(filenames.map(async (filename) => ({ filename, source: await readFile(join(sourceRoot, filename), 'utf8') })))
    const sampleSource = sources.find(({ filename }) => passageIdFromFilename(filename) === 'sample')
    if (sampleSource && !(await exists(join(contentRoot, 'sample')))) throw new Error('기존 sample 콘텐츠가 없습니다')
    if (sampleSource) { await validateExistingSample(contentRoot, sampleSource.source); await cp(join(contentRoot, 'sample'), join(stageRoot, 'sample'), { recursive: true, force: false, errorOnExist: true }) }
    const passages: PreparedPassage[] = []
    for (const { filename, source } of sources) {
      const id = passageIdFromFilename(filename)
      const title = basename(filename, extname(filename))
      if (id === 'sample') {
        const sample = await readJson<PreparedPassage>(join(stageRoot, id, 'passage.json'))
        if (!sample) throw new Error('기존 sample 콘텐츠가 올바르지 않습니다')
        passages.push(sample); continue
      }
      const expected = sourceSentences(id, source)
      const cached = options.force ? null : await cacheFor(contentRoot, id)
      const reusable = new Map<number, CachedSentence>()
      if (cached?.id === id && cached.title === title) for (const sentence of expected) {
        const prior = await reusableSentence(contentRoot, id, sentence, cached.sentences[sentence.id - 1])
        if (prior) reusable.set(sentence.id, prior)
      }
      const passage = await preparePassage({ id, title, source, enrichSentence: async (sentence) => {
        const sentenceId = expected.find((item) => item.english === sentence.english)?.id
        const prior = sentenceId ? reusable.get(sentenceId) : undefined
        return prior ?? options.enrichSentence(sentence)
      } })
      const passageRoot = join(stageRoot, id)
      await mkdir(join(passageRoot, 'audio', 'sentences'), { recursive: true })
      await writeFile(join(passageRoot, 'passage.json'), `${JSON.stringify(passage, null, 2)}\n`, 'utf8')
      for (const sentence of passage.sentences) {
        const output = join(passageRoot, 'audio', 'sentences', `${String(sentence.id).padStart(3, '0')}.wav`)
        const sourceAudio = join(contentRoot, id, 'audio', 'sentences', `${String(sentence.id).padStart(3, '0')}.wav`)
        if (reusable.has(sentence.id) && !options.force) await cp(sourceAudio, output, { force: false, errorOnExist: true })
        else {
          const bytes = await options.synthesize({ english: sentence.english, label: `${title} sentence ${sentence.id}` })
          if (!bytes.subarray(0, 4).equals(Buffer.from('RIFF')) || !bytes.subarray(8, 12).equals(Buffer.from('WAVE'))) throw new Error(`WAV 생성 결과가 올바르지 않습니다: ${title} sentence ${sentence.id}`)
          await writeFile(output, bytes)
        }
      }
      passages.push(passage)
    }
    await writeFile(join(stageRoot, 'index.json'), `${JSON.stringify({ passages: passages.map(({ id, title }) => ({ id, title })) }, null, 2)}\n`, 'utf8')
    await options.beforeValidate?.(stageRoot)
    await validateTree(stageRoot, passages)
    const backupRoot = await privatePath(root, 'content-backup', uniqueName)
    if (await exists(contentRoot)) { try { await move(contentRoot, backupRoot) } catch (error) { throw combinedError('기존 공개 콘텐츠를 백업하지 못했습니다', [error]) } }
    try { await move(stageRoot, contentRoot); stageCreated = false; published = true } catch (publishError) {
      const recoveryErrors: unknown[] = []
      let residualRoot: string | null = null
      if (await exists(contentRoot)) {
        residualRoot = await privatePath(root, 'content-residual', uniqueName)
        try { await move(contentRoot, residualRoot) } catch (error) { recoveryErrors.push(new Error(`잔존 공개 콘텐츠 격리 실패 (${contentRoot}): ${error instanceof Error ? error.message : String(error)}`)) }
      }
      if (await exists(backupRoot)) try { await move(backupRoot, contentRoot) } catch (error) { recoveryErrors.push(new Error(`백업 복구 실패 (${backupRoot} -> ${contentRoot}): ${error instanceof Error ? error.message : String(error)}`)) }
      if (residualRoot && await exists(residualRoot)) try { await remove(residualRoot) } catch (error) { recoveryErrors.push(new Error(`잔존 콘텐츠 정리 실패 (${residualRoot}): ${error instanceof Error ? error.message : String(error)}`)) }
      throw combinedError(`새 공개 콘텐츠 이동 실패: ${publishError instanceof Error ? publishError.message : String(publishError)}`, recoveryErrors)
    }
    if (await exists(backupRoot)) try { await remove(backupRoot) } catch (error) { throw combinedError(`새 공개 콘텐츠는 유지되었지만 백업 정리 실패 (${backupRoot})`, [error]) }
    options.log?.('콘텐츠 준비 완료')
  } catch (error) {
    const cleanupErrors: unknown[] = []
    if (stageCreated && !published && await exists(stageRoot)) try { await remove(stageRoot) } catch (cleanupError) { cleanupErrors.push(new Error(`임시 콘텐츠 정리 실패 (${stageRoot}): ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)) }
    if (cleanupErrors.length) throw combinedError(error instanceof Error ? error.message : String(error), cleanupErrors)
    throw error
  }
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds))
const retryDelay = (error: unknown) => { const seconds = /retry in (\d+)s/i.exec(error instanceof Error ? error.message : String(error))?.[1]; return seconds ? (Number(seconds) + 1) * 1_000 : null }

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY를 .env에 설정한 뒤 다시 실행하세요.')
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); let nextRequestTime = 0
  await prepareContent({ projectRoot, force: process.argv.includes('--force'), log: console.log,
    enrichSentence: async ({ english }) => { const response = await client.interactions.create({ model: 'gemini-3.8-flash', system_instruction: 'Return only a JSON object with translation and pronunciation Korean string fields.', input: `English sentence: ${JSON.stringify(english)}` }); if (!response.output_text) throw new Error(`보강 텍스트를 받지 못했습니다: ${english}`); return extractJson(response.output_text) },
    synthesize: async ({ english, label }) => { for (;;) { const wait = Math.max(0, nextRequestTime - Date.now()); if (wait) await sleep(wait); nextRequestTime = Date.now() + 6_500; try { const response = await client.interactions.create({ model: 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content: [{ type: 'text', text: english, annotations: [{ type: 'speech_metadata', style: 'Read naturally and clearly for an English learner.' }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: 'Kore' }] } }); if (!response.output_audio?.data) throw new Error(`음성 데이터를 받지 못했습니다: ${label}`); return Buffer.from(response.output_audio.data, 'base64') } catch (error) { const delay = retryDelay(error); if (delay === null) throw error; console.warn(`요청 한도 도달: ${Math.ceil(delay / 1000)}초 후 재시도합니다.`); await sleep(delay) } } },
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
