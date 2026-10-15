import { describe, expect, it } from 'vitest'

import { preparePassage } from './prepare'

describe('preparePassage', () => {
  it('keeps supplied translations, fills missing translations, and creates stable audio paths', async () => {
    const requested: string[] = []

    const passage = await preparePassage({
      id: 'sample',
      title: 'Sample',
      source: '안녕하세요.\nHello, friend!\n\nI\'m here.',
      enrichSentence: async ({ english }) => {
        requested.push(english)
        return {
          translation: english === "I'm here." ? '저는 여기 있어요.' : '생성된 번역',
          pronunciation: english === "I'm here." ? '아임 히어.' : '헬로, 프렌드!',
        }
      },
    })

    expect(requested).toEqual(['Hello, friend!', "I'm here."])
    expect(passage.sentences).toEqual([
      {
        id: 1,
        english: 'Hello, friend!',
        translation: '안녕하세요.',
        pronunciation: '헬로, 프렌드!',
        audioSrc: '/content/sample/audio/sentences/001.wav',
      },
      {
        id: 2,
        english: "I'm here.",
        translation: '저는 여기 있어요.',
        pronunciation: '아임 히어.',
        audioSrc: '/content/sample/audio/sentences/002.wav',
      },
    ])
    expect(passage).not.toHaveProperty('words')
  })

  it('rejects an empty generated translation or pronunciation', async () => {
    await expect(
      preparePassage({
        id: 'sample',
        title: 'Sample',
        source: 'Only English.',
        enrichSentence: async () => ({ translation: '', pronunciation: '' }),
      }),
    ).rejects.toThrow('AI 보강 결과가 비어 있습니다')
  })
})
