# 정적 콘텐츠 계약

`/content/index.json`은 `{ "passages": [{ "id": string, "title": string }] }` 형식이다. `id`는 URL·폴더에 안전한 안정 식별자이고, `title`은 원본 파일명에서 확장자를 뺀 표시 이름이다. 목록이 비어 있으면 앱은 지문을 시작할 수 없다.

`/content/{id}/passage.json`은 `id`, `title`, `sentences`를 가진다. 각 `sentences` 항목은 1부터 시작하는 `id`, `english`, `translation`, `pronunciation`, `audioSrc`를 갖는다. `audioSrc`는 사이트 루트 기준 경로이며 브라우저가 요청 가능한 문장 WAV를 가리켜야 한다. 단어는 JSON에 WAV 경로를 저장하지 않고 브라우저 내장 TTS로 재생한다.

앱은 목록·지문 요청이 실패하면 오류를 표시하고, 오디오 재생이 실패하면 현재 지문을 숨기지 않은 채 재생 오류를 알린다. 콘텐츠 생성기는 잘못된 원본이나 AI의 비정상 응답에 대해 JSON을 정상 결과처럼 쓰면 안 된다.
