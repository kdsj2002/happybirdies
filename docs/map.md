# 코드맵

새 세션이 대화 기록 없이도 바로 작업을 시작할 수 있게 하는 문서다.
**"왜 이렇게 했는가"는 대부분 해당 함수 바로 위 주석에 있다** — 이 문서는
그 주석을 찾아가는 색인이지, 내용을 다시 옮겨 적은 사본이 아니다. 코드가
바뀌면 주석도 함께 바뀌지만 이 문서는 그렇지 않으므로, 함수 이름으로
찾아가는 것을 원칙으로 하고 줄 번호는 쓰지 않는다.

작업을 시작하기 전에 이 문서를 먼저 읽고, 필요한 파일만 열 것.
전체 스캔(`Glob`/광범위 `Grep`)은 여기 없는 것을 찾을 때만 한다.

## 1. 파일 지도 (`public/js/`, 로드 순서대로)

| 파일 | 역할 | 찾아볼 이름 |
|---|---|---|
| `firebase-loader.js` | Firebase 초기화, 익명 로그인, `window.__fb` | — |
| `lang.js` | 언어 선택·저장, 번역 조회(`t()`) | `Lang.get`/`Lang.set`/`Lang.onLangChange`, 전역 `t` |
| `i18n-{ko,en,zh,ja}.js` | 화면 UI 문자열 사전(`window.I18N`) — `ko`가 원본 | — |
| `sound.js` | 효과음·진동 | `Sound.play`, `Sound.buzz` |
| `store.js` | 저장소 어댑터(Firestore/로컬), 클럽 식별자, 서버 시계 | `Store`, `CLUB`, `K()`, `clockSkew` |
| `state.js` | 전역 상태 `S`, 기본 설정, 파워 계산, 경기 기록 스키마, 결과 강제 | `S`, `DEFAULTS`, `now()`, `applyResult`, `applyRoster`, `isHeld`, `pendingResults` |
| `secret.js` | 운영자 비밀번호 확인(서버 확인 방식) | `Secret.verify`, `Secret.setAdminPassword` |
| `account.js` | 실계정 로그인(소유자용) | `Account.signInEmail`, `Account.roleIn` |
| `records.js` | 날짜별 경기 원장(세션과 분리) | `Records.sync`, `Records.warmUp`, `Records.stats` |
| `algo.js` | 자동 배치 알고리즘, 코트 시작/종료 | `autoAssign`, `startCourt`, `endCourt`, `poolIds` |
| `manual.js` | 도움말 조립기(언어별 콘텐츠를 골라 조립) | `Manual.html`, `Manual.footer` |
| `manual-{ko,en,zh,ja}.js` | 도움말 본문 — 언어별 콘텐츠 파일, `ko`가 원본 | `window.MANUAL_CONTENT` |
| `ui.js` | 렌더링, 파워 게이지, 유휴 관리(화면잠금/타이머) | `render`, `renderCourts`, `powerGauge`, `syncIdle` |
| `actions.js` | 상태 변경 트랜잭션, 이동/배치, 결과 기록 강제 훅 | `tx()`, `save()`, `moveTo`, `moveTeamTo`, `heldBlock`, `finishCourt` |
| `auth.js` | 역할·권한 판정 | `Auth.can`, `Auth.denyMsg`, `requirePerm` |
| `gate.js` | 입장 화면(현관·역할 선택) | `Gate.landing`, `Gate.start` |
| `interact.js` | 드래그앤드롭, 더블탭, 결과 입력 창 | `resultDialog`, `askPin`, `typeDialog` |
| `screens.js` | 탭별 화면(출석·회원·기록·설정) | `renderAtt`, `renderMem`, `renderHist`, `renderSet`, `renderStats` |
| `main.js` | 부팅, 실시간 구독, 내 경기 알림 | `boot()`, 세션/설정 `subscribe` |

CSS는 `public/css/app.css` 하나뿐. HTML은 `public/index.html`(앱)과
`public/manual.html`(설명서 단독 페이지)뿐 — 마크업을 더할 새 HTML 파일은
만들지 않는다.

`functions/index.js`는 클라이언트 코드가 아니라 Cloud Functions다. 보안
규칙이 못 하는 일(문서 개수 세기, 여러 문서를 트랜잭션으로 묶기)을
Admin SDK로 대신한다 — `createClub`(동호회 신청), `claimOwnership`
(구글 인증된 이메일로 소유자 확정). **Hosting과 별도로
`firebase deploy --only functions`를 사람이 직접 돌려야 반영된다** —
GitHub Actions는 Hosting만 배포한다.

## 2. 데이터가 어디 있는지

Firestore 경로는 전부 `clubs/{CLUB}/kv/{docId}`이고 값은
`{ v: JSON문자열, updatedAt: 서버시각 }`. 문서 이름 화이트리스트와 형식
검증은 `firestore.rules`의 `knownDoc()`/`validShape()`에 있다 — **새 kv
문서를 추가하면 그 화이트리스트도 함께 고쳐야 한다.**

| 문서 | 내용 | 스키마 주석 위치 |
|---|---|---|
| `kv/settings` | 클럽 설정 (`S.settings`) | `state.js` `DEFAULTS` 각 필드 옆 |
| `kv/members` | 회원 명단 | `screens.js` 회원 화면 근처 |
| `kv/session:YYYY-MM-DD` | 그날의 작업 상태(출석·코트·대기열·진행중 기록) | `state.js` `S` 선언부 |
| `kv/rec:YYYY-MM-DD` | 그날 **끝난** 경기의 굳은 사본(날짜별 원장) | `records.js` 머리말 |
| `kv/recIndex` | 원장이 있는 날짜 목록 | `records.js` `touchIndex` |
| `kv/adminAuth` / `secret/adminPin` | 운영자 비밀번호(salt/hash 분리) | `firestore.rules` 머리말 |
| `roles/{uid}` | 소유자·운영자 역할(실계정) | `firestore.rules` 해당 블록 |
| `registry/clubs` | 전체 동호회 정원 | `firestore.rules` 해당 블록 |
| `clubs/{id}/meta/club` | 동호회 신청서(나라·지역·소유자 정보), `status:'pending'` | `functions/index.js` `createClub` |
| `clubCreators/{uid}` | 계정당 동호회 개설 수 제한 | `functions/index.js` `createClub` |

**세션의 경기 기록(`S.matches[i]`)과 원장(`rec:*`)은 생김새가 다르다.**
세션 쪽은 참가자가 출석자 id 배열(`A`/`B`)이고, 원장 쪽은 그 순간의
이름·회원id·급수·성별까지 굳힌 객체 배열이다. 스키마는 각각
`state.js`의 "경기 기록과 결과" 주석과 `records.js`의 `freeze()`에 있다.

## 3. 핵심 흐름 — 처음 보면 헷갈리는 것들

**상태 변경은 전부 `tx(fn)`을 거친다** (`actions.js`). `fn` 실행 →
`autoAssign()` → `compactQueues()` → `autoStartFullCourts()` →
`syncPlayingMatches()` → `save()` → `render()` 순서로 자동으로 돈다.
직접 `render()`를 부를 필요가 거의 없다.

**`save()`는 세 가지를 따로 쓴다**: 설정(바뀌었을 때만), 회원 명단(삭제
방지 검사를 거쳐), 오늘 세션. 마지막에 `Records.sync()`를 불러 끝난
경기를 원장에 반영한다 — **경기가 끝나는 새 경로를 추가하면 반드시
`tx()`를 거치게 해야** 원장에 빠지지 않는다.

**기기 간 동기화**는 `main.js`의 `Store.subscribe(K('session:'+date), …)`.
시간창이 아니라 `hasPendingWrites`(내 쓰기 반영 전)와 `lastWritten.session`
(내 쓰기의 메아리) 비교로 내 것과 남의 것을 가른다. 설정 문서에도 같은
방식의 구독이 있다.

**경기 시간은 서버 시계 기준**. `state.js`의 `now()`가 `Date.now()`에
`Store.clockSkew()`를 더해 돌려준다. 기기 시계를 믿지 않는다 — 어떤
타임스탬프를 새로 계산에 쓸 때 `Date.now()`를 직접 쓰지 말고 `now()`를 쓸 것.
`clockSkew()`는 구독한 문서의 `updatedAt`이 **이전 값에서 바뀌는 순간**만
잰다(`store.js` `subscribe()`의 `_seenUpdated`) — 처음 보는 값은 언제
쓰였는지 알 수 없어 기준으로 삼지 않는다. 표시되는 경과 시간은 음수로
내려가지 않도록 화면 쪽에서 한 번 더 clamp한다(`ui.js` `courtElapsed`).

시계를 아직 못 맞춘 채(`Store.clockKnown()===false`) 코트가 시작되면
그 `startedAt`은 날것 기기 시계다 — `algo.js` `startCourt()`가 그 코트에
`c.startedRaw=true`를 남겨 두고, 시계가 **처음** 맞춰지는 순간
(`Store.onCalibrated` 콜백, `main.js` 등록부)에 그 코트와 대응하는
`S.matches[]` 기록의 시작 시각을 한 번만 소급 보정한다.

**결과 기록 강제**(`S.settings.requireResult`, 기본 꺼짐)가 켜지면
결과가 없는 경기의 참가자는 `isHeld(attId)`가 참이 되고, `poolIds()`
(자동 배치용)에서 빠지며, `moveTo`/`swap`/`moveTeamTo` 등 손으로 옮기는
모든 경로 앞에 `heldBlock(id)`가 걸린다. 새 이동 경로를 추가하면
`heldBlock`을 빠뜨리지 않아야 한다.

**경기 결과 입력**(`interact.js` `resultDialog`)은 두 단계뿐이다 —
① 팀 구성 확인(탭마다 셋 중 하나로 순환, `PAIRS`) → ② 세로 슬라이더에서
진 팀 이름을 위로 끌어 점수(10~29, 10 이하는 뭉쳐서 10)를 정하면
`pointerup`에서 **바로 커밋**된다(확인 버튼 없음). 이긴 팀 점수는 묻지
않고 `state.js` `winnerScore(lose)`가 고정 규칙(19이하→21, 20~24→25,
25이상→+1)으로 계산해 반대쪽 막대에 실시간으로 보여준다. 두 손가락
동시 커밋 방지용 `done` 플래그가 있다. `opts.onSave(result, roster)`로
콜백하며, 코트 종료·리매치·기록 화면 수정이 전부 이 함수를 공유한다.
클럽마다 다르게 정하던 '한 게임 점수'(`winPoint`) 설정은 이 고정 규칙이
생기면서 없앴다.

**새 동호회 신청**(`gate.js` `screenApply` → `screenApplyVerify` →
`screenApplyPassword`)은 인증 없이 대표 주소에서 시작한다. 3단계 모두
서버(Cloud Functions)를 부른다 — 클라이언트는 `Store.callFunction(name,
data)`로만 접근하고, 실제 검증(이메일 규격·정원·계정당 상한·구글 인증
이메일 일치)은 전부 `functions/index.js`에 있다. `roles/{uid}` 문서는
클라이언트가 못 쓰므로(규칙) `claimOwnership`이 유일한 문이고, 그 조건은
`req.auth.token.email`(구글이 검증, 클라이언트가 못 지어냄)과 신청서의
`ownerEmail`이 같은 것뿐이다.

**화면 언어(한/영/중/일)**는 두 층으로 나뉜다.
  - UI 문자열(버튼·토스트·다이얼로그)은 `t('키')`(`lang.js`) → `window.I18N.ko/en/zh/ja`
    (`i18n-*.js`)에서 찾는다. 새 문자열을 화면에 넣을 때는 **한국어를 직접 쓰지 말고**
    `i18n-ko.js`에 키를 하나 추가한 뒤 `t('그키')`를 부를 것 — 그래야 나머지 세 언어도
    빠짐없이 챙길 수 있다(빠뜨리면 그 언어에서만 한국어로 자동 대체되어 눈에 안 띄게 샌다).
  - 도움말 본문은 `manual-{ko,en,zh,ja}.js`에 언어별로 통째로 있다(문장 단위 키가 아니라
    섹션째 번역문) — `manual.js`가 `Lang.get()`에 맞는 파일을 골라 조립만 한다.
  - `Lang.set()`은 `Lang.onLangChange` 콜백 하나를 부른다(`main.js`에 등록) — 정적
    마크업(`index.html`의 `data-i18n`류)을 다시 채우고, `render()`와 지금 켜진 탭을
    다시 그린다. 언어 전환 버튼은 `index.html`의 `#langSwitch`(위치:고정, `#gate`보다
    z-index가 높다) 하나뿐 — 인증 여부와 무관하게 항상 뜬다.
  - **주의**: 이 앱은 `t`를 타이머 id·현재 시각·DOM 엘리먼트 등 지역 변수 이름으로도
    흔히 쓴다. 그런 함수 안에서 번역이 필요하면 지역 변수 쪽 이름을 바꿀 것 —
    `const t=now()` 뒤에 `t('키')`를 부르면 "t is not a function"으로 죽는다
    (실제로 한 번 났던 사고: `actions.js` `checkMatchTimeouts`).

**권한**은 `auth.js`의 `Auth.can(action)` 하나로 판정한다. action 이름과
뜻은 그 함수 바로 위 주석에 표로 있다(`view`/`selfQueue`/`edit`/
`courtAssign`/`membersBulk` 등). 새 조작을 추가하면 여기에 이름을 하나
정하고 표에 추가한다.

## 4. 보안 규칙 (`firestore.rules`)

**사용자가 Firebase 콘솔에 직접 붙여넣는다** — 이 저장소를 고쳐도 그
자체로는 적용되지 않는다. 규칙을 고쳤으면 반드시 사용자에게 보여 주고
머지 전에 알릴 것. 에뮬레이터 테스트는 `/tmp/.../scratchpad/*-rules-test.js`
(세션마다 스크래치패드 경로가 바뀌므로 세션 시작 시 그 안에 test 파일이
있는지 먼저 확인) — **규칙을 고쳤으면 묻지 않고 돌린다**(CLAUDE.md).

## 5. 배포 체크리스트

- `public/index.html`·`public/manual.html`의 모든 `?v=`와 `state.js`의
  `APP_VERSION`을 **함께** 올린다(하나만 올리면 캐시된 기기에 새 코드가
  안 뜬다). `sed -i 's/구버전/신버전/g' public/index.html public/manual.html public/js/state.js`
  로 한 번에 처리한다.
- 규칙이 바뀌었으면 위 4번대로.
- 배포 확인은 GitHub Actions API로 한다 — 이 샌드박스 프록시가
  `happybirdies.web.app`을 403으로 막아 curl로 확인할 수 없다.

## 6. 최근 설계 결정 (요약 — 이유의 전문은 코드 주석에)

| 결정 | 위치 |
|---|---|
| 코트↔코트 이동은 항상 경기 유지(무효화 안 함) | `actions.js` `moveTeamTo` |
| 대기열로의 이동만 리매치/취소를 물어봄 | `actions.js` `askCourtToQueue` |
| 최대 경기 시간 도달 시 자동 종료(결과는 비움) | `actions.js` `checkMatchTimeouts` |
| 배정 직후 10초 코트 테두리 깜박임 | `ui.js` `justAssigned` |
| 결과는 진 팀 점수만 받고 이긴 팀은 고정 규칙으로 계산(클럽별 설정 없앰) | `state.js` `winnerScore` |
| 결과 입력은 세로 슬라이더, 손을 떼는 순간(pointerup) 확인 없이 즉시 커밋 | `interact.js` `resultDialog` `wireSliders` |
| 결과 기록 강제는 물어보지 않고 막는 방식 | `actions.js` `heldBlock`/`heldSet` |
| 끝난 경기는 세션과 별개로 날짜별 원장에 영구 보관 | `records.js` 머리말 |
| 중복 회피에 지난 날짜 이력 참고(기본 꺼짐) | `algo.js` `pastPairPenalty` |
| 코트 수 변경은 대진판을 초기화하지 않고 앞/뒤만 조정 | `state.js` `resizeBoard` |
| 끌기/스크롤 구분은 시간 대기 없이 움직임 방향으로 판정 | `interact.js` 파일 머리말 |
| 결과 창 팀 구성 수정은 드래그 대신 3분할 순환 버튼 | `interact.js` `resultDialog` `PAIRS` |
| 경기 시간은 서버 시계 기준(기기 시계 오차 보정) | `store.js` `noteServerTime` |
| 동기화는 시간창이 아니라 내용 비교로 메아리 판정 | `main.js` 세션 구독 주석 |
| 소유자 비밀번호 없음 — 소유자는 실계정으로만 | `firestore.rules` 머리말 |
| `App Check` 사용 안 함(사용자 결정, 온라인 무차별 대입 미완화) | `firestore.rules` ⚠ 항목 |
| 시계가 늦게 맞으면 그 전 startedAt을 소급 보정(한 번만) | `store.js` `onCalibrated` / `main.js` 등록부 |
| 빈 코트·빈 대기 슬롯 더블탭은 자동 배치 설정과 무관하게 항상 채움 | `actions.js` `fillEmptyCourt`/`fillEmptyQueue` |
| 새 동호회는 무인증으로 신청 즉시 열림(`status:'pending'`은 표시일 뿐) | `functions/index.js` `createClub` |
| 소유자 자리는 신청서 이메일이 아니라 그 이메일의 구글 인증으로만 확정 | `functions/index.js` `claimOwnership` |
| `#gate` 카드는 화면보다 길어질 수 있어 자신이 스크롤 컨테이너 | `app.css` `#gate` 규칙 |
| 화면 언어는 4개(한/영/중/일), 기기별 저장, 기본은 브라우저 언어로 추측 | `lang.js` `detect()` |
| UI 문자열은 키 기반(`t()`), 도움말은 언어별 파일 통째 번역 — 방식이 다른 이유는 전자가 잦은 수정에, 후자가 산문 번역 품질에 최적 | `lang.js` 머리말, `manual.js` 머리말 |

이 표는 "무엇을, 어디서"만 담는다. 왜 그렇게 했는지는 표에 적힌 위치의
주석을 읽을 것 — 중복해서 옮겨 적지 않는다(옮겨 적으면 코드가 바뀔 때
이 문서만 낡는다).
