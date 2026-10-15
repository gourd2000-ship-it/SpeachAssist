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
        }
      })
    },
    [stop],
  )

  const replay = useCallback(() => {
    if (lastTarget) play(lastTarget)
  }, [lastTarget, play])

  useEffect(() => stop, [stop])

  return { activeKey, hasLastTarget: lastTarget !== null, play, replay, stop }
}
