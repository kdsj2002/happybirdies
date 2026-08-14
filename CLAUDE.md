# 작업 방식

## 회귀 테스트는 물어보고 돌린다

전체 회귀 테스트(scratchpad의 `*-test.js` 15종)는 **먼저 물어보고** 돌린다.
바꾼 곳과 직접 관련된 테스트 하나, 문법 검사(`node --check`), 필요하면
스크린샷 한 장까지가 기본이다. 그 이상은 확인을 받는다.

전체를 돌리는 게 맞는 경우는 따로 말한다 — 여러 파일에 걸친 변경,
공용 함수(`render`·`tx`·`save`) 수정, 보안 규칙이 걸린 변경.

## 배포

- 자산 버전은 `public/index.html`·`public/manual.html`의 `?v=`와
  `state.js`의 `APP_VERSION`을 **함께** 올린다. 하나만 올리면
  `index.html`이 캐시된 기기에서 새 코드가 안 뜬다.
- `firestore.rules`는 사용자가 콘솔에 직접 붙여넣는다. 규칙이 바뀌면
  머지 전에 알린다.
- 배포 확인은 GitHub Actions API로 한다. 이 샌드박스에서는 프록시가
  `happybirdies.web.app` 접속을 403으로 막아 curl로 확인할 수 없다.
