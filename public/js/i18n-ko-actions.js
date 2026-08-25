window.I18N = window.I18N || {};
window.I18N.ko = Object.assign(window.I18N.ko || {}, {

/* ── actions.js ── */
'actions.undo.done': '되돌렸습니다',

'actions.save.safeModeNoBaseline': '회원 명단을 확인하지 못한 상태입니다. 덮어쓰기를 막았습니다 — 새로고침해 주세요',
'actions.save.safeModeMembersGone': '회원 {count}명이 화면에서 사라진 채로 저장되려 했습니다 ({from}명 → {to}명). 덮어쓰기를 막았습니다 — 새로고침하거나 설정 → 데이터 복구를 쓰세요',

'actions.bulk.readFailTitle': '덮어쓸 수 없습니다',
'actions.bulk.defaultSource': '회원 명단 덮어쓰기',
'actions.bulk.readFailBody': '클라우드에 지금 어떤 명단이 들어 있는지 확인하지 못했습니다 ({error}).<br> 무엇을 덮어쓰게 되는지 모르는 상태에서는 회원 명단을 바꾸지 않습니다. 연결을 확인하고 다시 시도해 주세요.',
'actions.bulk.readFailDefault': '읽기 실패',
'actions.common.confirm': '확인',

'actions.bulk.ownerRequiredTitle': '소유자 계정이 필요합니다',
'actions.bulk.roleUnknown': '지금은 역할을 확인하지 못했습니다 — 연결을 확인하고 다시 시도해 주세요.',
'actions.bulk.notOwnerAccount': '지금 로그인된 계정(<b>{email}</b>)은 이 동호회의 소유자가 아닙니다.',
'actions.bulk.notLoggedIn': '지금은 계정으로 로그인되어 있지 않습니다. 상단 <b>입장하기</b> → 소유자 → <b>계정으로 로그인</b>으로 들어온 뒤 다시 시도해 주세요.',
'actions.bulk.ownerRequiredBody': '회원이 <b style="color:var(--cork)">{from}명 → {to}명</b>으로 크게 줄어드는 교체입니다. 이런 조작은 서버가 <b>소유자 계정</b>에게만 허용합니다.<br><br>{roleMsg}<br><br><b style="color:var(--text)">소유자 비밀번호만으로는 되지 않습니다.</b> 비밀번호는 앱 안에서만 확인되고, 서버는 그것을 볼 수 없기 때문입니다.',
'actions.bulk.downloadBackup': '백업 내려받기',

'actions.bulk.andMore': ' 외 {n}명',
'actions.bulk.rowCurrentCloud': '현재 클라우드',
'actions.bulk.rowAfterOverwrite': '덮어쓴 뒤',
'actions.bulk.rowRemoved': '삭제',
'actions.bulk.rowAdded': '추가',
'actions.bulk.rowChanged': '정보 변경',
'actions.bulk.peopleCountPlain': '<b class="num">{n}</b>명',
'actions.bulk.peopleCountRemoved': '<b class="num" style="color:var(--cork)">{n}</b>명 — {names}',
'actions.bulk.peopleCountAdded': '<b class="num" style="color:var(--court)">{n}</b>명 — {names}',
'actions.bulk.peopleCountChanged': '<b class="num">{n}</b>명 — {names}',
'actions.bulk.noneStyled': '<span style="color:var(--muted2)">없음</span>',

'actions.bulk.resultReplace': '클라우드의 회원 문서(<span class="num">clubs/{club}/kv/members</span>)가 <b>통째로 교체</b>됩니다. 지금 값은 남지 않습니다.',
'actions.bulk.resultRemoved': '회원 <b style="color:var(--cork)">{n}명</b>이 DB에서 사라집니다. 출석 목록·회원 화면·입장 화면에서 더 이상 고를 수 없게 됩니다.',
'actions.bulk.resultNoneRemoved': '삭제되는 회원은 없습니다.',
'actions.bulk.resultAllDevices': '같은 클럽에 접속한 <b>모든 기기</b>(태블릿·휴대폰)에 그대로 반영됩니다. 이 기기에서만 되돌릴 수 있는 조작이 아닙니다.',
'actions.bulk.resultNoUndo': '대진판의 <b>되돌리기(↩)로는 되돌아가지 않습니다.</b> 되돌리려면 회원 화면의 <b>백업</b> 파일이 있어야 합니다.',
'actions.bulk.resultHistoryKept': '지난 세션의 경기 기록은 지워지지 않지만, 삭제된 회원은 기록에 이름으로만 남고 회원 정보와의 연결이 끊깁니다.',
'actions.bulk.resultAttHit': '<b style="color:var(--cork)">오늘 출석 중인 {n}명({names})이 삭제 대상입니다.</b> 이미 출석한 사람은 오늘 세션에서 그대로 뛰지만, 다음 세션부터는 명단에 없습니다.',
'actions.bulk.resultOffline': '<b style="color:var(--cork)">지금 오프라인입니다.</b> 이 덮어쓰기는 일단 이 기기에만 적용되고, 연결이 돌아오는 순간 위 내용 그대로 클라우드에 올라갑니다. 그 사이 다른 기기에서 바뀐 내용이 있으면 그것까지 덮어씁니다.',
'actions.bulk.resultLocalOnly': 'Firebase에 연결돼 있지 않아 이 기기에만 적용됩니다.',

'actions.bulk.resultHeading': '이 동작의 결과',
'actions.bulk.downloadBackupFirst': '먼저 백업 내려받기',
'actions.bulk.onlyBackupUndo': '되돌릴 수단은 이 백업 파일뿐입니다.',

'actions.bulk.title': '회원 명단 덮어쓰기',
'actions.bulk.defaultSourceFull': '회원 명단 전체를 바꿉니다',
'actions.common.cancel': '취소',
'actions.bulk.overwriteBtn': '덮어쓰기',
'actions.bulk.overwriteDone': '회원 명단을 덮어썼습니다 ({from}명 → {to}명)',

'actions.queue.noEmptyCourt': '빈 코트가 없습니다',
'actions.queue.courtDisabled': '{no}코트는 사용하지 않습니다',
'actions.queue.courtPlaying': '경기 중인 코트에는 넣을 수 없습니다',
'actions.queue.courtFull': '{no}코트가 이미 차 있습니다',

'actions.fill.autoTitle': '{no}코트 자동 배정',
'actions.fill.confirmOnce': '대기열에 다 채워진 팀이 없습니다. 대기 인원에서 지금 한 번만 자동으로 팀을 짜서 이 코트에 넣을까요?',
'actions.fill.autoAssignBtn': '자동 배정',
'actions.fill.courtChanged': '그 사이 코트 상태가 바뀌어 넣지 못했습니다',
'actions.fill.notEnoughPool': '대기 인원이 4명이 안 됩니다',
'actions.fill.noCombination': '조건에 맞는 조합을 찾지 못했습니다',
'actions.fill.oneOffDone': '{no}코트에 한 번만 자동으로 팀을 짜 넣었습니다',

'actions.finish.matchChanged': '그 사이 경기가 바뀌어 종료하지 못했습니다',
'actions.finish.withResult': '{no}코트 — {label}',
'actions.finish.doneNeedResult': '{no}코트 경기를 마쳤습니다 — 결과를 적어야 네 사람이 다시 뜁니다',
'actions.finish.done': '{no}코트 경기를 마쳤습니다',

'actions.result.courtTitle': '{no}코트 경기 결과',
'actions.result.minsSuffix': ' · {mins}분',
'actions.result.pickWinnerHint': ' — 이긴 팀을 고르세요. 안 골라도 종료할 수 있습니다',
'actions.result.saveAndEnd': '결과 남기고 종료',
'actions.result.noneEnd': '승패 없이 종료',

'actions.timeout.autoFinished': '{courts}코트 — {max}분이 지나 자동으로 마쳤습니다',

'actions.askQueue.title': '{no}코트 → Q{qIndex}',
'actions.askQueue.sub': '{names} — {mins}분째 경기 중입니다. 이 경기를 어떻게 할까요?',
'actions.askQueue.rematchTitle': '리매치 — 경기를 마치고 같은 팀으로 대기',
'actions.askQueue.rematchDesc': '한 판 친 것으로 칩니다. 네 명 모두 게임 수가 1 오르고 기록에 남습니다. 이어서 결과(승패·점수)를 물어봅니다.',
'actions.askQueue.cancelTitle': '경기 취소 — 없던 일로 하고 대기',
'actions.askQueue.cancelDesc': '게임 수도 기록도 남지 않습니다. 잘못 올렸거나 코트를 비워야 할 때 쓰세요.',
'actions.askQueue.giveUp': '그만두기',
'actions.askQueue.rematchSub': ' — 마친 뒤 Q{qIndex}에 같은 팀으로 올립니다',
'actions.askQueue.saveAndRematch': '결과 남기고 리매치',
'actions.askQueue.noneRematch': '승패 없이 리매치',

'actions.move.stateChanged': '그 사이 판이 바뀌어 옮기지 못했습니다',
'actions.move.queueFilled': 'Q{qIndex}가 그 사이 채워졌습니다',
'actions.move.matchEndedNoRematch': '그 사이 경기가 끝나 리매치로 올리지 못했습니다',
'actions.move.rematchDone': '{no}코트 리매치 → Q{q}',
'actions.move.cancelToQueue': '{no}코트 경기를 취소하고 Q{q}로 옮겼습니다',
'actions.move.courtUnavailable': '그 코트는 쓸 수 없습니다',
'actions.move.swapped': '{from}코트 ↔ {to}코트 맞바꿨습니다',
'actions.move.movedKeepMatch': '{from}코트 → {to}코트로 옮겼습니다 (경기는 그대로)',
'actions.move.notEnoughRoom': '{no}코트에 자리가 모자랍니다',
'actions.move.queueSlotFull': '그 대기 슬롯은 이미 차 있습니다',
'actions.move.courtFullSwapHint': '그 코트는 4명이 다 찼습니다 — 바꿀 사람 위에 놓으세요',

'actions.held.defaultWho': '이 사람',
'actions.held.blockedMsg': '{who} — {court}코트 결과를 먼저 적어야 움직일 수 있습니다',

'actions.result.startedAtSuffix': ' · {time} 시작',
'actions.result.needResultHint': ' — 이 결과를 적어야 네 사람이 다시 뜁니다',
'actions.result.editLaterHint': ' — 나중에 다시 고칠 수 있습니다',
'actions.common.save': '저장',
'actions.result.unknownRelease': '모름 — 기록 없이 풀기',
'actions.result.clearResult': '결과 지우기',
'actions.result.releasedNoResult': '결과 없이 풀었습니다',
'actions.result.clearedResult': '결과를 지웠습니다',
'actions.result.alsoFixedRoster': ' · 팀 구성도 고쳤습니다',

'actions.chip.noCourtSpace': '빈 코트 자리가 없습니다',
'actions.chip.noQueueSpace': '빈 대기 자리가 없습니다',

'actions.join.alreadyMember': '{name} 님은 이미 회원입니다 — 요청만 정리했습니다',
'actions.join.approved': '{name} 님, 가입이 승인되었습니다',

});
