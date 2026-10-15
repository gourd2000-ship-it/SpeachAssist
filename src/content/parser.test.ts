import { describe, expect, it } from 'vitest'
import { parsePassage, tokenizeEnglish } from './parser'

describe('parsePassage', () => {
  it('keeps a Korean line with the English sentence that follows it', () => {
    const passage = parsePassage('안녕하세요.\nHello.\n\n좋은 아침이에요.\nGood morning.')

    expect(passage.sentences).toEqual([
      { id: 1, english: 'Hello.', translation: '안녕하세요.' },
      { id: 2, english: 'Good morning.', translation: '좋은 아침이에요.' },
    ])
  })

  it('treats an English-only line as a sentence whose translation must be generated', () => {
    const passage = parsePassage('Hello. My name is 준서.\n\nI’m going to Seoul.')

    expect(passage.sentences).toEqual([
      { id: 1, english: 'Hello. My name is 준서.', translation: null },
      { id: 2, english: 'I’m going to Seoul.', translation: null },
    ])
  })

  it('rejects a Korean line that is never followed by an English sentence', () => {
    expect(() => parsePassage('번역만 있는 줄')).toThrow('영어 문장이 없는 한국어 번역')
  })
})

describe('tokenizeEnglish', () => {
  it('normalizes case and apostrophes, and splits hyphenated words', () => {
    expect(tokenizeEnglish('I’m well-known, FRIEND!')).toEqual([
      { display: 'I’m', key: "i'm" },
      { display: 'well', key: 'well' },
      { display: 'known', key: 'known' },
      { display: 'FRIEND', key: 'friend' },
    ])
  })
})
