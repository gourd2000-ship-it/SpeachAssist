# 구현 규칙

- 브라우저 코드(`src/`)는 Node 전용 모듈, `.env`, Gemini SDK를 import해서는 안 된다. 생성 서비스 의존성은 `scripts/`에만 둔다.
- `doc/`의 원본 텍스트와 `public/content/`의 생성 결과를 함께 유지한다. 원본 변경 뒤에는 `npm run prepare:content`를 실행해 JSON과 문장 WAV 참조를 다시 맞춘다.
- 문장 재생 대상의 파일 경로는 지문 ID와 문장 순번에서 결정되어야 한다. 단어는 브라우저 내장 TTS로 재생하며 임의 UUID나 실행 시각을 경로에 넣으면 안 된다.
- 동작 변경에는 먼저 실패하는 Vitest 검사를 추가하고, 변경 후 `npm test`, `npm run build`, 생성기 변경이면 `npx tsc --noEmit -p tsconfig.scripts.json`을 통과시킨다.
- 커밋 전에는 `.env`, `node_modules`, `dist`, 일시 로그가 추적 대상이 아닌지 확인한다.
