import { useEffect, useState } from 'react'

import { useAudioPlayer } from './audio/useAudioPlayer'
import type { PreparedPassage } from './content/prepare'
import {
  loadPassage,
  loadPassageIndex,
  type PassageSummary,
} from './content/repository'
import { segmentEnglish } from './content/wordSegments'

export default function App() {
  const [passages, setPassages] = useState<PassageSummary[]>([])
  const [passage, setPassage] = useState<PreparedPassage | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [displayMode, setDisplayMode] = useState<'none' | 'translation' | 'pronunciation'>('none')
  const [error, setError] = useState<string | null>(null)
  const { activeKey, hasLastTarget, play, replay, stop } = useAudioPlayer()

  useEffect(() => {
    let active = true

    void loadPassageIndex()
      .then(async (items) => {
        if (!items.length) throw new Error('준비된 지문이 없습니다.')
        const first = items[0]
        const loaded = await loadPassage(first.id)
        if (!active) return
        setPassages(items)
        setSelectedId(first.id)
        setPassage(loaded)
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '콘텐츠를 불러오지 못했습니다.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function selectPassage(id: string) {
    stop()
    setSelectedId(id)
    setError(null)
    setPassage(null)

    try {
      setPassage(await loadPassage(id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '콘텐츠를 불러오지 못했습니다.')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">English reading practice</p>
        <h1>영어 읽기 도우미</h1>
        <p>문장을 듣고, 낱말을 눌러 발음을 확인하세요.</p>
      </header>

      <section className="control-panel" aria-label="읽기 설정">
        <label htmlFor="passage-select">지문 선택</label>
        <select
          id="passage-select"
          value={selectedId}
          onChange={(event) => void selectPassage(event.target.value)}
          disabled={!passages.length}
        >
          {passages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>

        <div className="toggle-group" aria-label="한국어 표시">
          <button
            type="button"
            aria-pressed={displayMode === 'translation'}
            onClick={() => setDisplayMode((mode) => (mode === 'translation' ? 'none' : 'translation'))}
          >
            번역 보기
          </button>
          <button
            type="button"
            aria-pressed={displayMode === 'pronunciation'}
            onClick={() => setDisplayMode((mode) => (mode === 'pronunciation' ? 'none' : 'pronunciation'))}
          >
            발음 보기
          </button>
        </div>

        <div className="audio-controls" aria-label="재생 제어">
          <button type="button" onClick={replay} disabled={!hasLastTarget}>
            다시 읽기
          </button>
          <button type="button" onClick={stop} disabled={!activeKey}>
            멈추기
          </button>
        </div>
      </section>

      {error ? <p role="alert">{error}</p> : null}
      {!error && !passage ? <p role="status">지문을 불러오는 중입니다.</p> : null}

      {passage ? (
        <article className="passage" aria-label={`${passage.title} 지문`}>
          <h2>{passage.title}</h2>
          <div className="sentence-list">
            {passage.sentences.map((sentence) => (
              <section key={sentence.id} className="sentence-row">
                <div className="sentence-heading">
                  <button
                    type="button"
                    className="sentence-play"
                    aria-label={`문장 ${sentence.id} 읽기`}
                    onClick={() =>
                      play({
                        key: `sentence-${sentence.id}`,
                        label: `문장 ${sentence.id}`,
                        audioSrc: sentence.audioSrc,
                      })
                    }
                  >
                    ▶
                  </button>
                  <p className="english-text">
                    {segmentEnglish(sentence.english).map((segment, index) => {
                      if (segment.type === 'text') return <span key={index}>{segment.value}</span>
                      const word = passage.words.find((item) => item.key === segment.key)
                      if (!word) return <span key={index}>{segment.display}</span>

                      return (
                        <button
                          key={index}
                          type="button"
                          className="word-button"
                          aria-label={`${segment.display} 단어 읽기`}
                          onClick={() =>
                            play({
                              key: `word-${segment.key}`,
                              label: `${segment.display} 단어`,
                              audioSrc: word.audioSrc,
                            })
                          }
                        >
                          {segment.display}
                        </button>
                      )
                    })}
                  </p>
                </div>
                {displayMode === 'translation' ? (
                  <p className="korean-text">{sentence.translation}</p>
                ) : null}
                {displayMode === 'pronunciation' ? (
                  <p className="korean-text">{sentence.pronunciation}</p>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {activeKey ? '음성을 재생 중입니다.' : ''}
      </p>
    </main>
  )
}
