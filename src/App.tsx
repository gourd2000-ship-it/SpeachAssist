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
  const { activeKey, error: audioError, hasLastTarget, playAudio, replay, speak, stop } = useAudioPlayer()

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
    setDisplayMode('none')
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
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true">Aa</span>
          <p className="eyebrow">English reading practice</p>
        </div>
        <h1>영어 읽기 도우미</h1>
        <p className="header-description">문장을 듣고, 낱말을 눌러 발음을 확인하세요.</p>
      </header>

      <section className="control-panel controls-sticky" aria-label="읽기 설정">
        <div className="setting-field passage-field">
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
        </div>

        <div className="setting-field display-field">
          <span className="field-label">한국어 표시</span>
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
        </div>

        <div className="audio-controls" aria-label="재생 제어">
          <button type="button" className="replay-button" onClick={replay} disabled={!hasLastTarget}>
            <span aria-hidden="true">↻</span> 다시 읽기
          </button>
          <button type="button" className="stop-button" onClick={stop} disabled={!activeKey}>
            <span aria-hidden="true">■</span> 멈추기
          </button>
        </div>
      </section>

      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      {audioError ? <p className="notice notice-error" role="alert">{audioError}</p> : null}
      {!error && !passage ? <p className="notice" role="status">지문을 불러오는 중입니다.</p> : null}

      {passage ? (
        <article className="passage" aria-label={`${passage.title} 지문`}>
          <header className="passage-header">
            <div>
              <p className="passage-kicker">오늘의 읽기</p>
              <h2>{passage.title}</h2>
            </div>
            <span className="sentence-count">{passage.sentences.length} 문장</span>
          </header>
          <p className="passage-hint">왼쪽 재생 버튼은 문장을, 밑줄 친 단어는 단어만 읽어 줍니다.</p>
          <div className="sentence-list">
            {passage.sentences.map((sentence) => (
              <section
                key={sentence.id}
                className={`sentence-row${activeKey === `sentence-${sentence.id}` ? ' is-playing' : ''}`}
              >
                <div className="sentence-heading">
                  <button
                    type="button"
                    className="sentence-play"
                    aria-label={`문장 ${sentence.id} 읽기`}
                    onClick={() =>
                      playAudio({
                        key: `sentence-${sentence.id}`,
                        label: `문장 ${sentence.id}`,
                        audioSrc: sentence.audioSrc,
                      })
                    }
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                  <span className="sentence-number" aria-hidden="true">{String(sentence.id).padStart(2, '0')}</span>
                  <p className="english-text">
                    {segmentEnglish(sentence.english).map((segment, index) => {
                      if (segment.type === 'text') return <span key={index}>{segment.value}</span>
                      return (
                        <button
                          key={index}
                          type="button"
                          className={`word-button${activeKey === `word-${segment.key}` ? ' is-playing' : ''}`}
                          aria-label={`${segment.display} 단어 읽기`}
                          onClick={() =>
                            speak({
                              key: `word-${segment.key}`,
                              label: `${segment.display} 단어`,
                              text: segment.display,
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
