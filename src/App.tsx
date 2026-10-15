import { useEffect, useState } from 'react'

import type { PreparedPassage } from './content/prepare'
import {
  loadPassage,
  loadPassageIndex,
  type PassageSummary,
} from './content/repository'

export default function App() {
  const [passages, setPassages] = useState<PassageSummary[]>([])
  const [passage, setPassage] = useState<PreparedPassage | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)

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
      </section>

      {error ? <p role="alert">{error}</p> : null}
      {!error && !passage ? <p role="status">지문을 불러오는 중입니다.</p> : null}

      {passage ? (
        <article className="passage" aria-label={`${passage.title} 지문`}>
          <h2>{passage.title}</h2>
          <div className="sentence-list">
            {passage.sentences.map((sentence) => (
              <p key={sentence.id} className="sentence-row">
                {sentence.english}
              </p>
            ))}
          </div>
        </article>
      ) : null}
    </main>
  )
}
