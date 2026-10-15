import { describe, expect, it } from 'vitest'

import { segmentEnglish } from './wordSegments'

describe('segmentEnglish', () => {
  it('preserves punctuation and exposes clickable English words', () => {
    expect(segmentEnglish("Hello, I'm here!")).toEqual([
      { type: 'word', display: 'Hello', key: 'hello' },
      { type: 'text', value: ', ' },
      { type: 'word', display: "I'm", key: "i'm" },
      { type: 'text', value: ' ' },
      { type: 'word', display: 'here', key: 'here' },
      { type: 'text', value: '!' },
    ])
  })
})
