window.I18N = window.I18N || {};
window.I18N.ko = Object.assign(window.I18N.ko || {}, {

/* ── interact.js ── */

/* drag (드래그로 팀을 통째로 옮길 때 손가락 밑에 뜨는 미리보기) */
'interact.drag.courtLabel': '{n}코트',
'interact.drag.peopleCount': '{count}명',

/* board (보드 조작 이벤트 — 다시 구성, 본인 출석/퇴장) */
'interact.board.resortDone': '대기 {n}개 팀을 다시 구성했습니다',
'interact.board.resortNone': '다시 구성할 자동 슬롯이 없습니다',
'interact.board.cannotLeaveWhilePlaying': '경기 중에는 퇴장할 수 없습니다',
'interact.board.confirmCheckOut': '출석을 취소할까요? 대기열에서도 빠집니다.',
'interact.board.checkedOut': '출석을 취소했습니다',
'interact.board.checkedIn': '출석했습니다',

/* pin (askPin — 운영자 비밀번호 확인 모달) */
'interact.pin.errWrong': '비밀번호가 맞지 않습니다',
'interact.pin.errOffline': '클라우드에 연결되지 않아 확인할 수 없습니다 — 연결을 확인해 주세요',
'interact.pin.errUnset': '운영자 비밀번호가 아직 설정되지 않았습니다',
'interact.pin.errFull': '운영자 2명이 이미 접속해 있습니다. 잠시 후 다시 시도하세요.',
'interact.pin.errLocked': '여러 번 틀려서 이 기기에서 잠겼습니다',
'interact.pin.duration': '{m}분 {s}초',
'interact.pin.prompt': '확인하려면 운영자 비밀번호를 입력하세요',
'interact.pin.cancel': '취소',
'interact.pin.confirm': '확인',
'interact.pin.checking': '확인 중...',
'interact.pin.lockedRetry': '{locked} — {time} 뒤에 다시 시도하세요',
'interact.pin.errGeneric': '확인하지 못했습니다',

/* result (resultDialog — 경기 결과 입력의 각 단계) */
'interact.result.defaultTitle': '경기 결과',
'interact.result.scoreQuestion': '진 팀 점수는?',
'interact.result.customInput': '직접 입력',
'interact.result.confirmScore': '확인',
'interact.result.noScore': '점수 없이 →',
'interact.result.cancel': '취소',
'interact.result.gameQuestion': '몇 점 경기였나요?',
'interact.result.gameHint': '진 팀 <b class="num">{lose}</b>점 — 이긴 팀 점수가 달라지므로 한 번만 확인합니다',
'interact.result.gameLabel': '{gt}점 경기',
'interact.result.back': '← 뒤로',
'interact.result.winnerQuestion': '이긴 팀은?',
'interact.result.noScoreRecord': '점수 없이 승패만 기록합니다',
'interact.result.teamTag': '{team}팀',
'interact.result.swapTeams': '⇄ 팀 구성 바꾸기',
'interact.result.swapHint': '짝이 실제와 다르면 누르세요 ({n}/3)',
'interact.result.noneDefault': '승패 없이',
'interact.result.saveQuestion': '이대로 저장할까요?',
'interact.result.winMark': '승',
'interact.result.loseMark': '패',
'interact.result.summaryNoResult': '<b>승패를 적지 않습니다.</b> 게임 수와 경기 시간은 그대로 기록됩니다.',
'interact.result.summaryWinNoScore': '<b>{team}팀 승</b> — 점수는 적지 않습니다.',
'interact.result.summaryWinScore': '<b>{team}팀 승 {sw} : {sl}</b>',
'interact.result.rosterChangedNote': '<br><b style="color:var(--cork)">팀 구성도 고쳐서 저장합니다.</b>',
'interact.result.saveDefault': '저장',
'interact.result.saveNoneDefault': '승패 없이 저장',

/* type (typeDialog — 경기 유형 지정 모달) */
'interact.type.slotTitle': '대기 슬롯 유형 지정',
'interact.type.slotDesc': '지정하면 자동 충원이 해당 성별만 채웁니다. 인원이 부족하면 비워 둡니다.',
'interact.type.noneOption': '지정 안 함',
'interact.type.close': '닫기',
'interact.type.reasonFemale': '여성 {f}명 포함',
'interact.type.reasonMale': '남성 {m}명 포함',
'interact.type.reasonNotMixed': '남2·여2가 아님',
'interact.type.reasonSameGender': '동성 4명',
'interact.type.dialogTitle': '{label} 경기 유형',
'interact.type.unavailable': '불가 — {reason}',
'interact.type.cancel': '취소',

});
