import { describe, expect, it } from 'vitest'

import { passageIdFromFilename } from './passageId'

describe('passageIdFromFilename', () => {
  it('keeps simple file names readable and stable', () => {
    expect(passageIdFromFilename('sample.txt')).toBe('sample')
    expect(passageIdFromFilename('Chapter 1.txt')).toBe('chapter-1')
  })

  it('creates a stable safe identifier for a non-Latin file name', () => {
    expect(passageIdFromFilename('서울 여행.txt')).toMatch(/^passage-[a-z0-9]+$/)
    expect(passageIdFromFilename('서울 여행.txt')).toBe(passageIdFromFilename('서울 여행.txt'))
  })
})
