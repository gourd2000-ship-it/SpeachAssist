import type { PreparedPassage } from './prepare'

export type PassageSummary = Pick<PreparedPassage, 'id' | 'title'>

type PassageIndex = {
  passages: PassageSummary[]
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`콘텐츠를 불러오지 못했습니다. (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function loadPassageIndex(): Promise<PassageSummary[]> {
  const index = await loadJson<PassageIndex>('/content/index.json')
  return index.passages
}

export function loadPassage(id: string): Promise<PreparedPassage> {
  return loadJson<PreparedPassage>(`/content/${encodeURIComponent(id)}/passage.json`)
}
