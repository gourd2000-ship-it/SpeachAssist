import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const passage = {
  id: 'sample',
  title: 'sample',
  sentences: [
    {
      id: 1,
      english: 'Hello, friend!',
      translation: '안녕하세요.',
      pronunciation: '헬로, 프렌드!',
      audioSrc: '/content/sample/audio/sentences/001.wav',
    },
  ],
  words: [{ key: 'hello', audioSrc: '/content/sample/audio/words/hello.wav' }],
}

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('loads the saved passage and exposes a passage selector', async () => {
    const fetch = vi.fn(async (input: string) => {
      const body = input.endsWith('index.json')
        ? { passages: [{ id: 'sample', title: 'sample' }] }
        : passage
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)

    render(<App />)

    expect(await screen.findByRole('heading', { name: '영어 읽기 도우미' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Hello 단어 읽기' })).toBeInTheDocument()
    expect(screen.getByLabelText('지문 선택')).toHaveValue('sample')
    expect(fetch).toHaveBeenCalledWith('/content/index.json')
    expect(fetch).toHaveBeenCalledWith('/content/sample/passage.json')
  })

  it('shows either the translation or Korean pronunciation below English', async () => {
    const fetch = vi.fn(async (input: string) => {
      const body = input.endsWith('index.json')
        ? { passages: [{ id: 'sample', title: 'sample' }] }
        : passage
      return new Response(JSON.stringify(body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    render(<App />)

    await screen.findByRole('button', { name: 'Hello 단어 읽기' })
    expect(screen.queryByText('안녕하세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('헬로, 프렌드!')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '번역 보기' }))
    expect(screen.getByText('안녕하세요.')).toBeInTheDocument()
    expect(screen.queryByText('헬로, 프렌드!')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '발음 보기' }))
    expect(screen.queryByText('안녕하세요.')).not.toBeInTheDocument()
    expect(screen.getByText('헬로, 프렌드!')).toBeInTheDocument()
  })

  it('resets Korean display to English-only when the passage changes', async () => {
    const otherPassage = {
      ...passage,
      id: 'other',
      title: 'other',
      sentences: [{ ...passage.sentences[0], english: 'Next sentence.', translation: '다음 문장입니다.' }],
      words: [{ key: 'next', audioSrc: '/content/other/audio/words/next.wav' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.endsWith('index.json')) {
          return new Response(
            JSON.stringify({
              passages: [
                { id: 'sample', title: 'sample' },
                { id: 'other', title: 'other' },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify(input.includes('/other/') ? otherPassage : passage), {
          status: 200,
        })
      }),
    )
    render(<App />)

    await screen.findByRole('button', { name: '번역 보기' })
    fireEvent.click(screen.getByRole('button', { name: '번역 보기' }))
    expect(screen.getByText('안녕하세요.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('지문 선택'), { target: { value: 'other' } })
    await screen.findByRole('button', { name: 'Next 단어 읽기' })
    expect(screen.queryByText('다음 문장입니다.')).not.toBeInTheDocument()
  })

  it('plays, stops, and replays a selected sentence audio file', async () => {
    const audio = {
      currentTime: 0,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    }
    const Audio = vi.fn(function MockAudio() {
      return audio
    })
    vi.stubGlobal('Audio', Audio)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const body = input.endsWith('index.json')
          ? { passages: [{ id: 'sample', title: 'sample' }] }
          : passage
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '문장 1 읽기' }))
    expect(Audio).toHaveBeenCalledWith('/content/sample/audio/sentences/001.wav')
    expect(audio.play).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '멈추기' }))
    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(audio.currentTime).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(Audio).toHaveBeenCalledTimes(2)
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('plays only the chosen word audio file', async () => {
    const audio = {
      currentTime: 0,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    }
    const Audio = vi.fn(function MockAudio() {
      return audio
    })
    vi.stubGlobal('Audio', Audio)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const body = input.endsWith('index.json')
          ? { passages: [{ id: 'sample', title: 'sample' }] }
          : passage
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Hello 단어 읽기' }))
    expect(Audio).toHaveBeenCalledWith('/content/sample/audio/words/hello.wav')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('announces an audio playback failure without hiding the passage', async () => {
    const audio = {
      currentTime: 0,
      pause: vi.fn(),
      play: vi.fn().mockRejectedValue(new Error('blocked')),
      addEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'Audio',
      vi.fn(function MockAudio() {
        return audio
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const body = input.endsWith('index.json')
          ? { passages: [{ id: 'sample', title: 'sample' }] }
          : passage
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '문장 1 읽기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('음성을 재생할 수 없습니다.')
    expect(screen.getByRole('button', { name: 'Hello 단어 읽기' })).toBeInTheDocument()
  })
})
