# 배드민턴 대진판 — 배포 안내

## 폴더 구조

```
.
├── firebase.json              Firebase Hosting 설정
└── public/                    실제로 배포되는 폴더
    ├── index.html
    ├── firebase-config.json   Firebase 연결 정보 (이미 채워져 있음)
    ├── css/
    │   └── app.css
    └── js/
        ├── firebase-loader.js  Firebase SDK 로딩 (모듈)
        ├── sound.js            효과음 (WebAudio 합성)
        ├── store.js            저장소 어댑터 (Firestore / 로컬)
        ├── state.js            설정 기본값, 상태, 세션 마감
        ├── algo.js             자동 배치 알고리즘
        ├── ui.js               화면 그리기
        ├── actions.js          저장·되돌리기·이동/교체
        ├── auth.js             역할과 권한, 운영자 동시접속 제한
        ├── gate.js             첫 접속 입장 화면
        ├── interact.js         드래그앤드롭, 버튼 이벤트, 모달
        ├── screens.js          출석·회원·기록·설정 화면
        └── main.js             부팅, 실시간 동기화, 경기 알림
```

## 배포

압축을 푼 폴더에서:

```bash
firebase deploy --only hosting
```

프로젝트가 아직 연결되지 않았다면 한 번만:

```bash
firebase login
firebase use --add        # ohmycock 프로젝트 선택
firebase deploy --only hosting
```

## 파일을 고칠 때

**스크립트 로드 순서에 의존합니다.** `index.html`의 `<script>` 순서를 바꾸지 마세요.
고칠 부분만 해당 파일을 열면 됩니다.

| 하고 싶은 것 | 열어야 할 파일 |
|---|---|
| 배치 규칙, 가중치, 성별 정책 | `js/algo.js`, `js/state.js` |
| 화면 배치·색·글꼴 | `css/app.css` |
| 권한 규칙 | `js/auth.js` |
| 입장 화면 문구 | `js/gate.js` |
| 효과음 | `js/sound.js` |

## 배포가 반영됐는지 확인하는 법

**설정 → 버전 → 앱 버전**을 보세요. 현재 배포본은 `2026.08.11a` 입니다.
재배포했는데 이 숫자가 그대로면 브라우저가 옛 파일을 쓰고 있는 것입니다.
새로고침(모바일은 탭을 닫았다 다시 열기)하세요.

파일을 고쳐서 재배포할 때는 `js/state.js`의 `APP_VERSION`과
`index.html`의 `?v=` 값을 같이 올려 주세요. 캐시가 자동으로 갈립니다.

## 데이터가 비어 보일 때

새로고침이나 재배포 직후 회원 명단이 비어 보이면 **아무것도 조작하지 마세요.**
조작하면 빈 상태가 저장되면서 클라우드 데이터를 덮어쓸 수 있습니다.

1. 화면 위에 붉은 띠(저장 잠금)가 떠 있으면 이미 저장이 잠긴 상태입니다. 새로고침하세요.
2. 띠가 없는데도 비어 있으면 **설정 → 데이터 복구 → 지금 다시 불러오기**를 누르세요.
   클라우드(Firestore) 원본을 그대로 다시 읽어 옵니다.
3. 그래도 안 되면 Firebase 콘솔 → Firestore → `clubs/default/kv/members` 문서를
   직접 확인하세요. 값이 있으면 데이터는 살아 있는 것입니다.

## 역할별 권한

| | 운영자 | 회원 | 뷰어 |
|---|:---:|:---:|:---:|
| 화면 보기 | ○ | ○ | ○ |
| 내 출석 / 퇴장 | ○ | ○ | ✕ |
| **내 이름만** 대기열에 넣고 빼기 | ○ | ○ | ✕ |
| 다른 사람 배치, 시작·종료, 정렬, 잠금 | ○ | ✕ | ✕ |
| 코트 배정 | ○ | ✕ | ✕ |
| 회원 명단 보기 | ○ | ○ | ✕ |
| 회원 추가·수정, CSV, 복원 | ○ | ✕ | ✕ |
| 설정 변경 | ○ | ✕ | ✕ |
| 세션 마감 | ○ | ✕ | ✕ |

회원은 입장할 때 출석 여부를 묻고, 이후에는 상단의 **출석하기 / 출석 중** 버튼으로
직접 바꿉니다. 코트에 배정된 뒤에는 본인도 빠질 수 없습니다(운영자에게 요청).

회원 로그인은 세션을 마감해도 유지됩니다. 다시 고르려면
설정 → **다시 입장하기**를 누르세요.

## 운영 메모

- **관리 비밀번호**: `0116` (설정 → 관리 비밀번호에서 변경)
- **운영자 동시 접속**: 최대 2명
- **자동 마감**: 첫 경기 시작 후 12시간
- **firebase-config.json**은 공개 저장소(GitHub 등)에 올리지 마세요.
  Firebase 웹 키는 원래 클라이언트에 노출되는 값이지만, 실제 보안은
  Firestore 보안 규칙이 담당하므로 규칙을 반드시 설정하세요.

## Firestore 보안 규칙 (권장)

테스트 모드는 30일 후 만료됩니다. 콘솔 → Firestore → 규칙에 아래를 넣으세요.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clubs/{club}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

익명 로그인이 켜져 있어야 합니다 (콘솔 → Authentication → 로그인 방법 → 익명).
