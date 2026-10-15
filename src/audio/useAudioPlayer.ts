import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioTarget = {
  key: string
  label: string
  audioSrc: string
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [lastTarget, setLastTarget] = useState<AudioTarget | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
    setActiveKey(null)
  }, [])

  const play = useCallback(
    (target: AudioTarget) => {
      stop()
      setError(null)
      const audio = new Audio(target.audioSrc)
      audioRef.current = audio
      setLastTarget(target)
      setActiveKey(target.key)
      audio.addEventListener('ended', () => {
        if (audioRef.current === audio) {
          audioRef.current = null
          setActiveKey(null)
        }
      })
      void audio.play().catch(() => {
        if (audioRef.current === audio) {
          audioRef.current = null
          setActiveKey(null)
          setError('음성을 재생할 수 없습니다. 다시 시도해 주세요.')
        }
      })
    },
    [stop],
  )

  const replay = useCallback(() => {
    if (lastTarget) play(lastTarget)
  }, [lastTarget, play])

  useEffect(() => stop, [stop])

  return { activeKey, error, hasLastTarget: lastTarget !== null, play, replay, stop }
}
