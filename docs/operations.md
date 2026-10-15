# 실행 절차

Node.js 20.19 이상 또는 22.12 이상을 설치한 뒤 프로젝트 루트에서 `npm install`을 실행한다. `.env.example`을 참고해 `.env`에 `GEMINI_API_KEY`를 넣는다. `.env`는 Git에 추가하지 않는다.

지문은 `doc/`에 UTF-8 `.txt` 파일로 넣는다. 각 파일은 한국어 줄 다음 영어 줄을 사용하고, 번역을 생성하려면 영어 줄만 단독으로 둔다. `npm run prepare:content`를 실행하면 모든 `.txt` 파일의 JSON과 문장 WAV가 `public/content/`에 생성된다. 단어는 브라우저 내장 TTS로 재생하므로 생성하지 않는다. 이미 생성된 동일 문장 보강과 WAV는 건너뛴다. 원본과 보조 자료를 의도적으로 새로 만들 때만 `npm run prepare:content -- --force`를 사용한다.

개발 서버는 `npm run dev`, 전체 검사는 `npm test`, 정적 배포 빌드는 `npm run build`다. 배포할 대상은 `dist/`이며, 배포 전 `dist/`와 Git 상태에서 `.env` 또는 키 문자열이 없는지 확인한다.
