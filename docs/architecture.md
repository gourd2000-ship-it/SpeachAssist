# 구성

브라우저 앱은 Vite가 빌드한 React 정적 파일이며, `/content/index.json`에서 지문 목록을 읽고 선택된 지문의 `/content/{id}/passage.json`과 해당 WAV 파일을 요청한다. 앱은 `src/content/repository.ts`를 통해 저장 자료를 읽고, `src/audio/useAudioPlayer.ts`를 통해 브라우저 `Audio` 객체 하나만 재생한다.

로컬 준비 도구 `scripts/prepare-content.ts`는 `doc/*.txt` 원본을 읽어 문장·단어 자료를 만들고, 필요한 번역·한글 발음·음성을 Gemini에서 받아 `public/content/`에 저장한다. 준비 도구만 `.env`의 키를 읽고, 앱 코드와 배포 파일은 그 키를 읽지 않는다.

대표 흐름은 `doc/sample.txt` → 준비 도구 → `public/content/index.json`, 지문 JSON, WAV → 정적 호스팅 → 브라우저 지문 선택 → 문장 또는 단어 버튼 → 저장 WAV 재생 순서다. 지문 원문과 생성 결과의 경계는 준비 도구이며, 브라우저에서 원문을 변환하거나 생성 서비스로 전송하는 경로는 없다.
