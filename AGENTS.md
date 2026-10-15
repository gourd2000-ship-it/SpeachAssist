# 영어 읽기 도우미

고정 영어 지문을 문장·단어 단위로 듣고, 필요할 때 번역 또는 한글 발음 표기를 확인하는 공개 정적 웹앱이다. 학습 중에는 외부 AI 호출과 계정이 필요 없으며, 콘텐츠 준비 단계에서만 Gemini를 사용해 저장 자료를 만든다.

```text
.
├── CLAUDE.md                    → 프로젝트 작업 규칙과 문서 안내
├── AGENTS.md                    → 다른 코딩 에이전트용 동일 안내
├── docs/
│   ├── architecture.md           → 구성 요소와 데이터 흐름
│   ├── business-rules.md         → 지문·보기·재생의 학습 규칙
│   ├── security.md               → 비밀 값과 정적 배포 보안 정책
│   ├── standards.md              → 코드·검증·경계 규칙
│   ├── engineering-notes.md      → 구현 시 주의할 함정과 점검법
│   ├── operations.md             → 설치·콘텐츠 준비·빌드 절차
│   ├── contracts.md              → 정적 콘텐츠 파일 형식 계약
│   └── tracking/
│       ├── status.md             → 구현 상태와 후속 범위
│       ├── findings.md           → 아직 해결하지 못한 문제
│       └── decisions/            → 장기적으로 영향을 주는 결정
├── src/
│   └── AGENTS.md                 → 브라우저 앱과 콘텐츠 코드 경계
└── scripts/
    └── AGENTS.md                 → 로컬 콘텐츠 생성 도구 경계
```

## 반드시 지킬 조건

- 브라우저 앱은 저장된 JSON과 WAV만 읽어야 하며, Gemini SDK나 `GEMINI_API_KEY`를 포함하거나 호출해서는 안 된다.
- `.env`는 로컬 생성용 비밀 값만 담고 절대 커밋하지 않는다.
- 원본에 있는 한국어 번역은 보존하고, 비어 있는 번역만 생성한다.
- 번역과 한글 발음 표기는 동시에 보이면 안 되며, 새 재생 대상은 이전 음성을 멈춰야 한다.

## 작업 전 확인

`docs/standards.md`, `docs/engineering-notes.md`, 관련 모듈의 `AGENTS.md`를 읽는다. 콘텐츠 생성이나 키 관련 변경 전에는 `docs/security.md`와 `scripts/AGENTS.md`를, 정적 JSON 형식 변경 전에는 `docs/contracts.md`를 먼저 읽는다.

## 문제 처리

비밀 값이 브라우저 번들·Git 이력·정적 배포물에 들어갈 가능성은 즉시 사용자에게 알린다. 지문 변환 오류, AI 응답 형식 오류, 재생 실패처럼 범위 안에서 재현 가능한 문제는 먼저 수정하고, 외부 서비스 제약처럼 현재 해결할 수 없는 문제만 `docs/tracking/findings.md`에 기록한다.
