import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createRateLimitedSynthesizer, prepareContent, type PrepareContentOptions } from './prepare-content.js'

const roots: string[] = []
const wav = Buffer.from([
  ...Buffer.from('RIFF'), 38, 0, 0, 0, ...Buffer.from('WAVEfmt '), 16, 0, 0, 0,
  1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0,
  ...Buffer.from('data'), 2, 0, 0, 0, 0, 0,
])

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'prepare-content-'))
  roots.push(root)
  await mkdir(join(root, 'doc'), { recursive: true })
  await writeFile(join(root, 'doc', 'sample.txt'), '기존 번역\nHello.', 'utf8')
  await writeFile(join(root, 'doc', 'other.txt'), 'Other.', 'utf8')
  await seedPublic(root)
  return root
}

async function seedPublic(root: string) {
  await mkdir(join(root, 'public', 'content', 'sample', 'audio', 'sentences'), { recursive: true })
  await writeFile(join(root, 'public', 'content', 'sample', 'audio', 'sentences', '001.wav'), wav)
  await writeFile(join(root, 'public', 'content', 'sample', 'passage.json'), JSON.stringify({ id: 'sample', title: 'sample', sentences: [{ id: 1, english: 'Hello.', translation: '기존 번역', pronunciation: '헬로.', audioSrc: '/content/sample/audio/sentences/001.wav' }] }))
  await writeFile(join(root, 'public', 'content', 'index.json'), JSON.stringify({ passages: [{ id: 'sample', title: 'sample' }] }))
}

function options(root: string, overrides: Partial<PrepareContentOptions> = {}): PrepareContentOptions {
  return {
    projectRoot: root,
    enrichSentence: async ({ english }) => ({ translation: `번역 ${english}`, pronunciation: `발음 ${english}` }),
    synthesize: async () => wav,
    log: () => {},
    ...overrides,
  }
}

async function sampleSnapshot(root: string) {
  const files = ['passage.json', 'audio/sentences/001.wav']
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(join(root, 'public/content/sample', file))])))
}

async function treeSnapshot(root: string, relative = ''): Promise<Record<string, Buffer>> {
  const directory = join(root, relative)
  const entries = await readdir(directory, { withFileTypes: true })
  const snapshots = await Promise.all(entries.flatMap(async (entry) => {
    const path = join(relative, entry.name)
    return entry.isDirectory() ? Object.entries(await treeSnapshot(root, path)) : [[path, await readFile(join(root, path))] as const]
  }))
  return Object.fromEntries(snapshots.flat())
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('prepareContent', () => {
  it('publishes only a complete validated tree and retains sample bytes', async () => {
    const root = await fixture()
    const sampleBefore = await sampleSnapshot(root)
    await prepareContent(options(root))
    expect(JSON.parse(await readFile(join(root, 'public/content/index.json'), 'utf8')).passages).toEqual([{ id: 'other', title: 'other' }, { id: 'sample', title: 'sample' }])
    expect(await sampleSnapshot(root)).toEqual(sampleBefore)
  })

  it('refuses to publish when the existing sample is invalid', async () => {
    const root = await fixture()
    await writeFile(join(root, 'public/content/sample/audio/sentences/001.wav'), Buffer.concat([wav.subarray(0, 12), Buffer.from('fmt ')]))
    const before = await treeSnapshot(join(root, 'public/content'))
    await expect(prepareContent(options(root))).rejects.toThrow('기존 sample 콘텐츠가 올바르지 않습니다')
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
  })

  it.each([
    ['audio format', (bytes: Buffer) => bytes.writeUInt16LE(3, 20)],
    ['channel count', (bytes: Buffer) => bytes.writeUInt16LE(0, 22)],
    ['sample rate', (bytes: Buffer) => bytes.writeUInt32LE(0, 24)],
    ['byte rate', (bytes: Buffer) => bytes.writeUInt32LE(1, 28)],
    ['block alignment', (bytes: Buffer) => bytes.writeUInt16LE(1, 32)],
    ['bit depth', (bytes: Buffer) => bytes.writeUInt16LE(12, 34)],
    ['data alignment', (bytes: Buffer) => bytes.writeUInt32LE(1, 40)],
  ])('rejects a sample WAV with invalid PCM %s without changing public content', async (_name, corrupt) => {
    const root = await fixture()
    const invalid = Buffer.from(wav)
    corrupt(invalid)
    await writeFile(join(root, 'public/content/sample/audio/sentences/001.wav'), invalid)
    const before = await treeSnapshot(join(root, 'public/content'))
    await expect(prepareContent(options(root))).rejects.toThrow('기존 sample 콘텐츠가 올바르지 않습니다')
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
  })

  it.each([
    ['id', 'wrong-id'],
    ['title', 'wrong-title'],
    ['title', 42],
  ])('rejects a sample cache with an invalid %s', async (field, value) => {
    const root = await fixture()
    const path = join(root, 'public/content/sample/passage.json')
    const content = JSON.parse(await readFile(path, 'utf8'))
    content[field] = value
    await writeFile(path, JSON.stringify(content))
    await expect(prepareContent(options(root))).rejects.toThrow('기존 sample 콘텐츠가 올바르지 않습니다')
  })

  it('uses original Korean translation over cache and regenerates a corrupt non-sample WAV', async () => {
    const root = await fixture()
    await mkdir(join(root, 'public/content/other/audio/sentences'), { recursive: true })
    await writeFile(join(root, 'public/content/other/passage.json'), JSON.stringify({ id: 'other', title: 'other', sentences: [{ id: 1, english: 'Other.', translation: '캐시 번역', pronunciation: '아더.', audioSrc: '/content/other/audio/sentences/001.wav' }] }))
    await writeFile(join(root, 'public/content/other/audio/sentences/001.wav'), 'not a wav')
    let audioCalls = 0
    await prepareContent(options(root, { synthesize: async () => { audioCalls += 1; return wav } }))
    expect(audioCalls).toBeGreaterThan(0)
  })

  it('prefers an original Korean translation to an otherwise reusable cache', async () => {
    const root = await fixture()
    const sampleBefore = await sampleSnapshot(root)
    await writeFile(join(root, 'doc/other.txt'), '원본 번역\nOther.', 'utf8')
    await mkdir(join(root, 'public/content/other/audio/sentences'), { recursive: true })
    await writeFile(join(root, 'public/content/other/passage.json'), JSON.stringify({ id: 'other', title: 'other', sentences: [{ id: 1, english: 'Other.', translation: '캐시 번역', pronunciation: '아더.', audioSrc: '/content/other/audio/sentences/001.wav' }] }))
    await writeFile(join(root, 'public/content/other/audio/sentences/001.wav'), wav)
    await prepareContent(options(root, { synthesize: async () => { throw new Error('should reuse audio') } }))
    const other = JSON.parse(await readFile(join(root, 'public/content/other/passage.json'), 'utf8'))
    expect(other.sentences[0].translation).toBe('원본 번역')
    expect(await sampleSnapshot(root)).toEqual(sampleBefore)
  })

  it('reuses repeated English sentences by sequence number without mixing cached enrichment', async () => {
    const root = await fixture()
    await writeFile(join(root, 'doc/other.txt'), 'Repeat.\nRepeat.', 'utf8')
    await mkdir(join(root, 'public/content/other/audio/sentences'), { recursive: true })
    await writeFile(join(root, 'public/content/other/passage.json'), JSON.stringify({ id: 'other', title: 'other', sentences: [
      { id: 1, english: 'Repeat.', translation: '첫 번역', pronunciation: '첫 발음', audioSrc: '/content/other/audio/sentences/001.wav' },
      { id: 2, english: 'Repeat.', translation: '둘 번역', pronunciation: '둘 발음', audioSrc: '/content/other/audio/sentences/002.wav' },
    ] }))
    await writeFile(join(root, 'public/content/other/audio/sentences/001.wav'), wav)
    await writeFile(join(root, 'public/content/other/audio/sentences/002.wav'), wav)
    await prepareContent(options(root, { enrichSentence: async () => { throw new Error('should not enrich') }, synthesize: async () => { throw new Error('should not synthesize') } }))
    const other = JSON.parse(await readFile(join(root, 'public/content/other/passage.json'), 'utf8'))
    expect(other.sentences.map((sentence: { translation: string; pronunciation: string }) => [sentence.translation, sentence.pronunciation])).toEqual([['첫 번역', '첫 발음'], ['둘 번역', '둘 발음']])
  })

  it('keeps sample file bytes unchanged even with forced regeneration', async () => {
    const root = await fixture()
    const before = await sampleSnapshot(root)
    await prepareContent(options(root, { force: true }))
    expect(await sampleSnapshot(root)).toEqual(before)
  })

  it('does not publish when enrichment or WAV generation fails, and leaves prior content intact', async () => {
    const root = await fixture()
    const before = await treeSnapshot(join(root, 'public/content'))
    await expect(prepareContent(options(root, { enrichSentence: async () => { throw new Error('enrich failed') } }))).rejects.toThrow('enrich failed')
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
    await expect(prepareContent(options(root, { synthesize: async () => Buffer.from('bad') }))).rejects.toThrow(/WAV/)
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
  })

  it('rejects incomplete temporary content before publication', async () => {
    const root = await fixture()
    await expect(prepareContent(options(root, { synthesize: async () => Buffer.from('RIFF----NOPE') }))).rejects.toThrow(/WAV/)
    expect(JSON.parse(await readFile(join(root, 'public/content/index.json'), 'utf8')).passages).toEqual([{ id: 'sample', title: 'sample' }])
  })

  it('rejects invalid index, JSON, sentence fields, sequence, and WAV before publication', async () => {
    const corruptions = [
      async (stage: string) => writeFile(join(stage, 'index.json'), '{}'),
      async (stage: string) => writeFile(join(stage, 'other/passage.json'), '{}'),
      async (stage: string) => { const path = join(stage, 'other/passage.json'); const value = JSON.parse(await readFile(path, 'utf8')); value.sentences[0].id = 2; await writeFile(path, JSON.stringify(value)) },
      async (stage: string) => { const path = join(stage, 'other/passage.json'); const value = JSON.parse(await readFile(path, 'utf8')); value.sentences[0].pronunciation = ''; await writeFile(path, JSON.stringify(value)) },
      async (stage: string) => writeFile(join(stage, 'other/audio/sentences/001.wav'), 'bad'),
    ]
    for (const beforeValidate of corruptions) {
      const root = await fixture()
      const before = await treeSnapshot(join(root, 'public/content'))
      await expect(prepareContent(options(root, { beforeValidate }))).rejects.toThrow(/임시/)
      expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
    }
  })

  it('uses unique private staging names when temporary and backup names collide', async () => {
    const root = await fixture()
    await mkdir(join(root, '.content-stage-1'))
    await mkdir(join(root, '.content-backup-1'))
    await prepareContent(options(root, { uniqueName: (kind, attempt) => `.${kind}-${attempt}` }))
    expect(await readFile(join(root, 'public/content/index.json'), 'utf8')).toContain('other')
  })

  it('reports backup move failure without changing public content', async () => {
    const root = await fixture()
    const before = await treeSnapshot(join(root, 'public/content'))
    await expect(prepareContent(options(root, { move: async (from, to) => { if (to.includes('.content-backup-')) throw new Error('backup move failed'); await rename(from, to) } }))).rejects.toThrow('backup move failed')
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
  })

  it('restores the backup if moving new public content fails', async () => {
    const root = await fixture()
    const before = await treeSnapshot(join(root, 'public/content'))
    await expect(prepareContent(options(root, { move: async (from, to) => { if (from.includes('.content-stage-') && to.endsWith('public\\content')) throw new Error('publish move failed'); await rename(from, to) } }))).rejects.toThrow('publish move failed')
    expect(await treeSnapshot(join(root, 'public/content'))).toEqual(before)
  })

  it('reports failed residual isolation and failed backup recovery with remaining locations', async () => {
    const root = await fixture()
    await expect(prepareContent(options(root, { move: async (from, to) => {
      if (from.includes('.content-stage-') && to.endsWith('public\\content')) { await rename(from, to); throw new Error('publish move failed') }
      if (to.includes('.content-residual-')) throw new Error('isolation failed')
      if (from.includes('.content-backup-')) throw new Error('recovery failed')
      await rename(from, to)
    } }))).rejects.toThrow(/publish move failed[\s\S]*isolation failed[\s\S]*recovery failed/)
  })

  it('keeps the new public content but reports backup cleanup and staging cleanup failures', async () => {
    const root = await fixture()
    await expect(prepareContent(options(root, { remove: async (target) => { if (target.includes('.content-backup-')) throw new Error(`cleanup failed ${target}`); await rm(target, { recursive: true, force: true }) } }))).rejects.toThrow(/cleanup failed/)
    expect(await readFile(join(root, 'public/content/index.json'), 'utf8')).toContain('other')
  })

  it('includes the remaining staging location when cleanup after an earlier failure fails', async () => {
    const root = await fixture()
    await expect(prepareContent(options(root, { enrichSentence: async () => { throw new Error('enrichment failed') }, remove: async (target) => { throw new Error(`cannot remove ${target}`) } }))).rejects.toThrow(/enrichment failed[\s\S]*임시 콘텐츠 정리 실패/)
  })

  it('resets the request interval after a retry delay', async () => {
    const sleeps: number[] = []
    let requestCount = 0
    const now = [0, 0, 1_000, 1_000]
    const synthesize = createRateLimitedSynthesizer({
      request: async () => {
        requestCount += 1
        if (requestCount === 1) throw new Error('retry in 0s')
        return wav
      },
      now: () => now.shift() ?? 1_000,
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
      intervalMs: 6_500,
    })
    await synthesize({ english: 'First.', label: 'first' })
    await synthesize({ english: 'Second.', label: 'second' })
    expect(sleeps).toEqual([1_000, 6_500])
  })
})
