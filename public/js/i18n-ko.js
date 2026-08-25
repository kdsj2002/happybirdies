/* 일반 UI 문자열(한국어 원문) — gate.js/screens.js/ui.js/interact.js/actions.js/auth.js에서
   t('키') 형태로 끌어다 쓴다. 여기가 원본이고, 다른 언어는 이 파일의 번역이다.
   (채워지는 중 — 아직은 비어 있어도 화면 문구는 각 파일에 남은 한국어 그대로 보인다.) */
window.I18N = window.I18N || {};
window.I18N.ko = Object.assign(window.I18N.ko || {}, {

/* ── auth.js ── */
'auth.role.owner': '소유자',
'auth.role.admin': '운영자',
'auth.role.member': '회원',
'auth.role.viewer': '뷰어',
'auth.deny.viewer': '보기 전용으로 입장했습니다',
'auth.deny.selfQueue': '대기열에는 본인 이름만 올리고 뺄 수 있습니다',
'auth.deny.courtAssign': '코트 배정은 운영자만 할 수 있습니다',
'auth.deny.settings': '설정 변경은 운영자만 할 수 있습니다',
'auth.deny.membersEdit': '회원 정보 수정은 운영자만 할 수 있습니다',
'auth.deny.closeSess': '세션 마감은 운영자만 할 수 있습니다',
'auth.deny.membersBulk': '회원 명단을 통째로 바꾸는 것은 소유자만 할 수 있습니다',
'auth.deny.default': '경기 운영은 운영자만 할 수 있습니다',

/* ── index.html 정적 마크업 (data-i18n / data-i18n-ph / data-i18n-title) ── */
'app.title': '배드민턴 대진판',
'app.tab.board': '대진판',
'app.tab.att': '출석',
'app.tab.mem': '회원',
'app.tab.hist': '기록',
'app.tab.set': '설정',
'app.tab.help': '도움말',
'app.btnEnter': '입장하기',
'app.cloudDotTitle': '저장소 상태',
'app.autoToggle': '자동',
'app.btnSort': '정렬',
'app.queueTitle': '대기열',
'app.poolTitle': '대기 인원',
'app.sort.pri': '순번',
'app.sort.game': '게임수',
'app.sort.name': '이름',
'app.sort.alpha': 'ㄱㄴㄷ',
'app.sort.grade': '급수',
'app.sort.recent': '최근',
'app.sex.all': '전체',
'app.sex.male': '♂ 남',
'app.sex.female': '♀ 여',
'app.att.searchPh': '이름 · 초성 검색',
'app.att.addGuest': '게스트 추가',
'app.att.toBoard': '대진판 →',
'app.mem.searchPh': '이름 검색',
'app.mem.joinRequests': '가입 요청',
'app.mem.csv': 'CSV 일괄등록',
'app.mem.backup': '백업',
'app.mem.restore': '복원',
'app.mem.addMember': '＋ 회원 추가',
'app.reload': '새로고침',

/* ── main.js ── */
'main.boot.settings': '설정',
'main.boot.members': '회원 명단',
'main.boot.session': '오늘 세션',
'main.boot.authFailed': '익명 로그인이 되지 않아 클라우드를 읽지 못했습니다 — Firebase 콘솔 → Authentication → 로그인 방법 → 익명을 켜 주세요. 저장은 잠갔습니다(데이터는 그대로입니다)',
'main.boot.loadFailed': '{list}을(를) 불러오지 못했습니다. 저장이 잠겼습니다 — 새로고침해 주세요',
'main.fbLate': '클라우드 연결이 늦게 완료되었습니다. 새로고침하면 동기화됩니다',
'main.noMembersYet': '회원을 먼저 등록하세요 — CSV 일괄등록이 빠릅니다',
'main.connectFirebaseHint': '설정 → 저장소에서 Firebase를 연결할 수 있습니다 (지금은 이 기기에만 저장됨)',
'main.remoteChanged': '다른 기기에서 변경되어 화면을 갱신했습니다',
'main.callout.court': '{n}코트',
'main.callout.started': '경기 시작입니다',
'main.callout.ok': '확인',

});
