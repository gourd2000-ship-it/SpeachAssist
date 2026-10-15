import { useCallback, useEffect, useRef, useState } from 'react'

export type AudioTarget = {
  key: string
  label: string
  audioSrc: string
}

export type SpeechTarget = {
  key: string
  label: string
  text: string
}

type PlaybackTarget = AudioTarget | SpeechTarget

function isAudioTarget(target: PlaybackTarget): target is AudioTarget {
  return 'audioSrc' in target
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [lastTarget, setLastTarget] = useState<PlaybackTarget | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
    utteranceRef.current = null
    window.speechSynthesis?.cancel()
    setActiveKey(null)
  }, [])

  const playAudio = useCallback(
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

  const speak = useCallback(
    (target: SpeechTarget) => {
      stop()
      setError(null)

      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        setError('이 브라우저는 단어 발음을 지원하지 않습니다.')
        return
      }

      const utterance = new SpeechSynthesisUtterance(target.text)
      utterance.lang = 'en-US'
      utteranceRef.current = utterance
      setLastTarget(target)
      setActiveKey(target.key)
      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null
          setActiveKey(null)
        }
      }
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null
          setActiveKey(null)
          setError('내장 음성으로 단어를 재생할 수 없습니다. 다시 시도해 주세요.')
        }
      }

      try {
        window.speechSynthesis.speak(utterance)
      } catch {
        utteranceRef.current = null
        setActiveKey(null)
        setError('내장 음성으로 단어를 재생할 수 없습니다. 다시 시도해 주세요.')
      }
    },
    [stop],
  )

  const replay = useCallback(() => {
    if (!lastTarget) return
    if (isAudioTarget(lastTarget)) {
      playAudio(lastTarget)
      return
    }
    speak(lastTarget)
  }, [lastTarget, playAudio, speak])

  useEffect(() => stop, [stop])

  return { activeKey, error, hasLastTarget: lastTarget !== null, playAudio, replay, speak, stop }
}
