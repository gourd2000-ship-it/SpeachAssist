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
    expect(await screen.findByText('Hello, friend!')).toBeInTheDocument()
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

    await screen.findByText('Hello, friend!')
    expect(screen.queryByText('안녕하세요.')).not.toBeInTheDocument()
    expect(screen.queryByText('헬로, 프렌드!')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '번역 보기' }))
    expect(screen.getByText('안녕하세요.')).toBeInTheDocument()
    expect(screen.queryByText('헬로, 프렌드!')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '발음 보기' }))
    expect(screen.queryByText('안녕하세요.')).not.toBeInTheDocument()
    expect(screen.getByText('헬로, 프렌드!')).toBeInTheDocument()
  })
})
