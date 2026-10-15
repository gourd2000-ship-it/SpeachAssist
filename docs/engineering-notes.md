# 구현 메모

Gemini Interactions API의 단일 화자 TTS는 `generation_config.speech_config`에 `[{ voice: 'Kore' }]` 형태를 사용한다. 화자 이름을 넣은 객체는 다화자 설정으로 해석되어 정확히 두 화자를 요구하는 400 오류가 난다. 단일 화자 요청에는 화자 이름 없이 스타일 메타데이터만 넣고, 첫 WAV 생성으로 요청 형식을 확인한다.

Vite의 브라우저 TypeScript 설정과 Node 스크립트 설정은 모듈 해석 규칙이 다르다. `scripts/`가 import하는 TypeScript 모듈은 NodeNext 규칙에 맞춰 상대 import에 `.js` 확장자를 써야 하며, 브라우저 테스트 import는 Vite 번들 해석을 사용한다. 생성기를 수정하면 별도 스크립트 타입 검사를 실행한다.

문장 안의 단어를 버튼으로 바꾸면 전체 문장 문자열은 여러 DOM 노드로 나뉜다. UI 검사는 전체 텍스트 일치 대신 단어 재생 버튼의 접근 가능한 이름을 찾아야 한다.
