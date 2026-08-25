/* =====================================================================
   변경 트랜잭션 — 모든 상태 변경은 여기를 거친다 (Undo + 저장)
   ===================================================================== */
function tx(fn, opts={}){
  undoStack.push(JSON.stringify({att:S.att,courts:S.courts,queues:S.queues,matches:S.matches,hist:S.hist}));
  if(undoStack.length>20) undoStack.shift();
  fn();
  if(opts.auto!==false) autoAssign();
  /* 순번 당기기는 자동 배치와 별개다. 사람을 새로 배정하는 게 아니라 줄의
     빈칸을 메우는 일이라, 자동 토글이 꺼져 있든 되돌리기({auto:false})든
     항상 돌아야 한다. 예전에는 autoAssign 안에만 있어서 Q1을 비워도 Q2가
     그 자리에 남아 있었다. */
  compactQueues();
  autoStartFullCourts();     // 4명이 차면 무조건 시작 — 어느 경로로 찼든
  syncPlayingMatches();      // 진행 중 경기의 팀이 바뀌었으면 기록도 맞춘다
  save(); render();
}

/* 코트가 4명이 되는 순간 경기를 시작한다. 설정이 아니라 규칙이다.
   "시작" 버튼을 누르는 단계를 없애 달라는 요구라서, 손으로 채우든
   자동 배치로 채우든 끌어다 놓든 여기 한 곳에서 일괄 처리한다. */
function autoStartFullCourts(){
  S.courts.forEach(c=>{
    if(c.disabled) return;
    if(c.status!=='PLAYING' && c.members.length===4) startCourt(c, true);
  });
}
/* 진행 중인 경기의 팀 구성이 바뀌면(사람을 끌어다 옮기는 등) 기록도 따라가야
   한다. 안 그러면 기록 화면에 시작 당시의 옛 팀이 남는다. */
function syncPlayingMatches(){
  S.courts.forEach(c=>{
    if(c.status!=='PLAYING' || !c.matchId) return;
    const m=S.matches.find(x=>x.id===c.matchId && !x.endedAt);
    if(!m) return;
    const nameOf=id=>(A(id)&&A(id).name)||'?';
    m.A=[...c.teams.A]; m.B=[...c.teams.B];
    m.An=m.A.map(nameOf); m.Bn=m.B.map(nameOf);
    m.type=c.matchType;
    /* 진행 중인 코트에 나중에 들어온 사람(교체 투입)은 addTo에서 FILLING으로
       들어온다. 코트는 이미 PLAYING인데 사람만 FILLING으로 남으면 상태가
       어긋나므로 여기서 맞춰 준다. */
    c.members.forEach(id=>{ if(A(id)) A(id).state='PLAYING'; });
  });
}
/* 경기를 없던 것으로 되돌린다. 팀을 통째로 다른 곳으로 옮겼을 때, 그리고
   코트에서 마지막 한 명까지 내려와 닫아 줄 사람이 없을 때 쓴다.
   (끝난 경기 기록은 절대 건드리지 않는다.) */
function abortMatch(c){
  if(c.status!=='PLAYING') return;
  const i=S.matches.findIndex(m=>m.id===c.matchId && !m.endedAt);
  if(i>=0) S.matches.splice(i,1);
  c.status='FILLING'; c.startedAt=null; c.matchId=null;
  c.members.forEach(id=>{ if(A(id)) A(id).state='FILLING'; });
}
function undo(){
  if(!undoStack.length) return;
  const s=JSON.parse(undoStack.pop());
  Object.assign(S,s); sel=null; save(); render(); toast(t('actions.undo.done'));
}
let saveT;
/* 마지막으로 저장한 내용을 기억해 두고 바뀐 것만 쓴다.
   예전에는 칩 하나 옮길 때마다 설정 + 회원 41명 배열 + 세션을 전부 다시 쓰고,
   거기에 세션 목록을 읽는 네트워크 요청까지 매번 했다. 2시간이면 수백 번이라
   Firestore 쿼터와 응답 속도 양쪽에 부담이었다. */
let lastWritten={settings:null,members:null,session:null};
let sessionsIdx=null;
function save(){
  if(SAFE_MODE) return;          // 데이터를 온전히 못 불러온 상태에서는 저장하지 않는다
  clearTimeout(saveT);
  saveT=setTimeout(async()=>{
    if(SAFE_MODE) return;
    /* 예전에는 여기서 "방금 저장했다"고 시각을 찍어 두고, 구독 쪽이 그 뒤
       1.5초 동안 오는 것을 전부 무시했다. 내 메아리를 거르려던 것인데 남의
       변경까지 함께 버려서 동기화가 깨졌다. 지금은 lastWritten의 내용과
       비교해 메아리를 가른다(main.js 구독 참고). */

    const st=JSON.stringify(S.settings);
    if(settingsTrusted && st!==lastWritten.settings){ await Store.set(K('settings'),S.settings); lastWritten.settings=st; }

    /* 회원이 사라지는 저장은 여기서 전부 막는다.
       회원 화면에서 한 명씩 지웠다면 그때마다 기준선이 갱신되므로 걸리지 않고,
       벌크 덮어쓰기는 비밀번호 확인을 받으면서 기준선을 갱신하므로 걸리지 않는다.
       걸리는 것은 "명단을 제대로 못 읽어 빈 채로 시작한 화면"이 그대로
       클라우드에 올라가려는 경우뿐이다. */
    const mem=JSON.stringify(S.members);
    if(mem!==lastWritten.members){
      const gone = droppedMembers(S.members);
      if(gone===null){
        console.warn('회원 명단 기준선이 없어 저장을 막았습니다');
        setSafeMode(true, t('actions.save.safeModeNoBaseline'));
      }else if(gone.length){
        console.warn('승인되지 않은 회원 삭제 — 저장을 막았습니다', gone.map(m=>m.name));
        setSafeMode(true, t('actions.save.safeModeMembersGone',
          {count:gone.length, from:loadedMembersCount, to:S.members.length}));
      }else{
        await Store.set(K('members'),S.members); lastWritten.members=mem;
        setMembersBaseline(S.members);          // 방금 쓴 내용이 곧 DB의 내용
      }
    }
    if(SAFE_MODE) return;          // 위에서 잠겼다면 세션도 쓰지 않는다

    const sess={date:S.date,startedAt:S.startedAt,att:S.att,courts:S.courts,queues:S.queues,matches:S.matches,hist:S.hist};
    const ss=JSON.stringify(sess);
    if(ss!==lastWritten.session){ await Store.set(K('session:'+S.date),sess); lastWritten.session=ss; }

    if(sessionsIdx===null) sessionsIdx=(await Store.get(K('sessions')))||[];
    if(!sessionsIdx.includes(S.date)){ sessionsIdx.push(S.date); await Store.set(K('sessions'),sessionsIdx); }

    /* 끝난 경기를 날짜별 원장에도 남긴다(records.js).
       세션 문서와 따로 두는 이유, 그리고 그 안의 덮어쓰기 규칙은 그 파일
       머리말에 적어 두었다. 여기서 부르는 이유는 하나다 — 경기가 어떤 길로
       끝나든(손으로·리매치·30분 자동 종료·나중에 결과 수정) 저장은 전부
       이 함수를 지나가므로, 원장에 빠지는 경로가 생기지 않는다. */
    await Records.sync();
  },300);
}

/* =====================================================================
   회원 명단 벌크 덮어쓰기 — 관리 비밀번호 확인 필수

   복원(백업 파일), CSV 일괄등록, 클라우드에서 다시 불러오기처럼 회원 문서
   전체를 한 번에 바꾸는 조작은 반드시 이 함수를 거친다. 순서는 이렇다.

     1. 지금 클라우드에 실제로 뭐가 들어 있는지 먼저 읽는다.
        못 읽으면(오프라인 캐시 미스, 통신 실패) 아예 진행하지 않는다.
        무엇을 덮어쓰는지 모르는 채로 덮어쓰지 않는다는 뜻이다.
     2. 지금 명단과 바뀔 명단을 비교해 누가 사라지고 누가 생기는지,
        그 결과가 무엇인지(모든 기기 반영·되돌리기 불가 등)를 전부 보여 준다.
     3. 관리 비밀번호를 받는다. 맞아야만 적용한다.

   확인을 통과하면 그 명단이 새 기준선이 되므로 save()의 삭제 방지 잠금에
   걸리지 않고 정상적으로 클라우드에 올라간다.
   ===================================================================== */
async function bulkOverwriteMembers(nextList, opt={}){
  /* 명단을 통째로 갈아끼우는 것은 이 앱에서 가장 파괴적인 조작이다 —
     되돌릴 수 없고, 모든 기기에 즉시 퍼진다. 그래서 소유자 전용으로 둔다.
     운영자에게도 열어 주면 소유자라는 역할이 이름뿐이 된다. */
  if(!requirePerm('membersBulk')) return;
  // 오래된 백업 파일에는 id가 없는 회원이 섞여 있을 수 있다. 비교의 기준이
  // id이므로 여기서 채워 둔다(없으면 전부 같은 사람으로 취급돼 버린다).
  const next = (Array.isArray(nextList) ? nextList : [])
    .map(m => m && m.id ? m : Object.assign({}, m, {id:uid('m')}));

  // 1) 클라우드의 현재 명단 확인 — 못 읽으면 덮어쓰지 않는다
  const r = opt.dbRead || await Store.getSafe(K('members'), {strict:true});
  if(!r.ok){
    Sound.play('error');
    openModal(`<h3>${t('actions.bulk.readFailTitle')}</h3>
      <div class="sub">${esc(opt.source||t('actions.bulk.defaultSource'))}</div>
      <div class="hint" style="line-height:1.8">
        ${t('actions.bulk.readFailBody',{error:esc(r.error||t('actions.bulk.readFailDefault'))})}</div>
      <div class="row end"><button class="btn primary" onclick="closeModal()">${t('actions.common.confirm')}</button></div>`);
    return;
  }
  const cur = r.value || [];
  const d   = diffMembers(cur, next);

  /* ── 크게 줄어드는 교체는 소유자 "계정"이 있어야 한다 ──────────────
     보안 규칙이 명단을 10% 넘게 줄이는 쓰기를 소유자 계정에게만 허용한다.
     비밀번호는 규칙이 확인할 수 없어서(모두가 똑같은 익명 계정이다) 여기서
     통과시켜도 서버가 거부한다.

     그런데 Store.set은 저장 실패를 console.warn으로만 남기고 삼킨다.
     그대로 두면 "덮어썼습니다"라고 알린 뒤 클라우드에는 아무것도 안 올라가고,
     이 기기만 다른 명단을 들고 있게 된다 — 조용히 갈라지는 것이 거부당하는
     것보다 훨씬 나쁘다. 그래서 시작 전에 미리 막는다.

     기준을 규칙(10%)보다 엄격한 8%로 잡은 이유: 규칙은 저장된 문자열
     길이를, 여기서는 자바스크립트 문자열 길이를 센다. 둘이 미세하게
     다를 수 있으므로 앱이 조금 더 보수적이어야 "앱은 통과시켰는데 서버가
     거부"하는 틈이 생기지 않는다. */
  const curSize = JSON.stringify(cur).length;
  const bigShrink = curSize > 0 && JSON.stringify(next).length < curSize * 0.92;
  if(bigShrink && Store.mode==='firebase'){
    const who = await Account.roleIn(CLUB);
    if(!who.ok || who.role !== 'owner'){
      Sound.play('error');
      const acc = Account.current();
      const roleMsg = !who.ok
        ? t('actions.bulk.roleUnknown')
        : acc
          ? t('actions.bulk.notOwnerAccount', {email: esc(acc.email||acc.name)})
          : t('actions.bulk.notLoggedIn');
      openModal(`<h3>${t('actions.bulk.ownerRequiredTitle')}</h3>
        <div class="sub">${esc(opt.source||t('actions.bulk.defaultSource'))}</div>
        <div class="hint" style="line-height:1.8">
          ${t('actions.bulk.ownerRequiredBody',{from:d.from,to:d.to,roleMsg})}
        </div>
        <div class="row end">
          <button class="btn" id="bulkBackup">${t('actions.bulk.downloadBackup')}</button>
          <button class="btn primary" onclick="closeModal()">${t('actions.common.confirm')}</button></div>`);
      const b=$('#bulkBackup'); if(b) b.onclick=()=>exportBackup();
      return;
    }
  }

  // 2) 결과 명기
  const names = arr => arr.slice(0,8).map(m=>esc(m.name)).join(', ')
                     + (arr.length>8 ? t('actions.bulk.andMore',{n:arr.length-8}) : '');
  const attHit = Object.values(S.att)
    .filter(a=>a.memberId && d.removed.some(m=>m.id===a.memberId));
  const offline = Store.mode==='firebase' && r.cached;
  const local   = Store.mode!=='firebase';

  const rows = [
    [t('actions.bulk.rowCurrentCloud'), t('actions.bulk.peopleCountPlain',{n:d.from})],
    [t('actions.bulk.rowAfterOverwrite'), t('actions.bulk.peopleCountPlain',{n:d.to})],
    [t('actions.bulk.rowRemoved'),  d.removed.length
        ? t('actions.bulk.peopleCountRemoved',{n:d.removed.length, names:names(d.removed)})
        : t('actions.bulk.noneStyled')],
    [t('actions.bulk.rowAdded'),  d.added.length
        ? t('actions.bulk.peopleCountAdded',{n:d.added.length, names:names(d.added)})
        : t('actions.bulk.noneStyled')],
    [t('actions.bulk.rowChanged'), d.changed.length
        ? t('actions.bulk.peopleCountChanged',{n:d.changed.length, names:names(d.changed)})
        : t('actions.bulk.noneStyled')]
  ];

  const results = [
    t('actions.bulk.resultReplace',{club:esc(CLUB)}),
    d.removed.length
      ? t('actions.bulk.resultRemoved',{n:d.removed.length})
      : t('actions.bulk.resultNoneRemoved'),
    t('actions.bulk.resultAllDevices'),
    t('actions.bulk.resultNoUndo'),
    t('actions.bulk.resultHistoryKept')
  ];
  if(attHit.length) results.push(
    t('actions.bulk.resultAttHit',{n:attHit.length, names:names(attHit)}));
  if(offline) results.push(
    t('actions.bulk.resultOffline'));
  if(local) results.push(
    t('actions.bulk.resultLocalOnly'));

  const bodyHtml = `
    <div class="kv" style="grid-template-columns:92px 1fr;gap:9px 12px;margin-bottom:14px">
      ${rows.map(([k,v])=>`<div class="k">${k}</div><div>${v}</div>`).join('')}
    </div>
    <div class="hint" style="margin-bottom:14px">
      <b style="color:var(--text)">${t('actions.bulk.resultHeading')}</b>
      <ul style="margin:6px 0 0;padding-left:18px">
        ${results.map(x=>`<li style="margin-bottom:4px">${x}</li>`).join('')}
      </ul>
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" id="pinBackup">${t('actions.bulk.downloadBackupFirst')}</button>
      <span class="hint">${t('actions.bulk.onlyBackupUndo')}</span>
    </div>`;

  /* 3) 마지막 확인
     예전에는 여기서 소유자 비밀번호를 받았다. 이제 그 비밀번호는 없다 —
     소유자는 계정으로만 들어오므로, 이 화면에 닿았다는 것 자체가 이미
     소유자 계정으로 로그인했다는 뜻이다(requirePerm('membersBulk') +
     위의 서버 확인). 비밀번호를 한 번 더 묻는 것은 확인이 아니라 의식이다.

     대신 무엇이 사라지는지 보여 주는 일은 그대로 둔다. 그게 진짜 확인이다. */
  openModal(`<h3>${t('actions.bulk.title')}</h3>
    <div class="sub">${esc(opt.source || t('actions.bulk.defaultSourceFull'))}</div>
    ${bodyHtml}
    <div class="row end">
      <button class="btn" id="bulkCancel">${t('actions.common.cancel')}</button>
      <button class="btn warn" id="bulkOk">${t('actions.bulk.overwriteBtn')}</button></div>`);
  const bk=$('#pinBackup'); if(bk) bk.onclick=()=>exportBackup();
  $('#bulkCancel').onclick=closeModal;
  $('#bulkOk').onclick=async()=>{
    closeModal();
    S.members = next;
    setMembersBaseline(next);        // 승인받은 내용이 새 기준선이 된다
    setSafeMode(false);
    lastWritten.members = null;      // 다음 저장에서 반드시 다시 쓰도록
    if(opt.applyExtra) await opt.applyExtra();
    save(); render();
    if(typeof renderMem==='function') renderMem();
    Sound.play('confirm');
    toast(t('actions.bulk.overwriteDone',{from:d.from, to:d.to}));
    if(opt.after) opt.after();
  };
}

/* =====================================================================
   대기열 팀 ↔ 코트 (팀 단위)

   투입은 버튼과 드래그가 같은 길을 쓴다. 되돌리기는 예전에 아예 없어서,
   한 번 코트에 올라가면 칩을 하나씩 빼내는 수밖에 없었다.
   경기 중(PLAYING)인 코트는 건드리지 않는다 — 기록이 어긋난다.
   되돌린 직후 자동 배치가 그 자리를 곧바로 다시 채우면 되돌린 의미가
   없으므로, 되돌리기 트랜잭션은 전부 {auto:false}로 돈다.
   ===================================================================== */
function firstEmptyCourt(){ return S.courts.find(c=>c.status==='EMPTY'&&!c.disabled&&!c.members.length); }
function clearCourt(c){
  Object.assign(c,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                   status:'EMPTY',startedAt:null,matchId:null});
}
/* 두 코트를 통째로 맞바꾼다.

   사람만 옮기는 것이 아니라 경기 상태(시작 시각·기록 id)까지 함께 옮긴다.
   두 팀이 코트를 바꿔 앉았을 뿐 각자의 경기는 그대로 이어지기 때문이다 —
   여기서 시간이 0으로 돌아가면 20분 친 팀이 방금 시작한 것으로 보인다.

   코트 번호(no)와 사용 여부(disabled)는 코트에 붙은 성질이라 두고 간다.
   기록에 적힌 코트 번호는 사람을 따라가야 하므로 뒤에서 고쳐 준다. */
function swapCourts(a, b){
  ['members','teams','matchType','typeSource','status','startedAt','matchId']
    .forEach(k=>{ const t=a[k]; a[k]=b[k]; b[k]=t; });
  [a,b].forEach(c=>{
    if(!c.matchId) return;
    const m=S.matches.find(x=>x.id===c.matchId && !x.endedAt);
    if(m) m.court=c.no;
  });
}
function clearQueue(q){
  Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                   origin:'AUTO',notice:null});
}

/* 대기 슬롯 하나를 코트로 통째로 올린다. c를 안 주면 빈 코트를 찾는다. */
function pushQueueToCourt(q, c){
  if(!q || q.members.length!==4) return false;
  const held = q.members.find(i=>isHeld(i));
  if(held && heldBlock(held)) return false;
  c = c || firstEmptyCourt();
  if(!c){ Sound.play('error'); toast(t('actions.queue.noEmptyCourt')); return false; }
  if(c.disabled){ Sound.play('error'); toast(t('actions.queue.courtDisabled',{no:c.no})); return false; }
  if(c.status==='PLAYING'){ Sound.play('error'); toast(t('actions.queue.courtPlaying')); return false; }
  if(c.members.length){ Sound.play('error'); toast(t('actions.queue.courtFull',{no:c.no})); return false; }
  q.members.forEach(flash);            // 네 명 모두 착지 애니메이션 (render 전에 걸어야 한다)
  tx(()=>{
    c.members=q.members; c.teams=q.teams; c.matchType=q.matchType; c.typeSource=q.typeSource;
    c.status='FILLING'; c.members.forEach(i=>A(i).state='FILLING');
    clearQueue(q);
  });
  Sound.play('move');
  return true;
}

/* =====================================================================
   빈 코트 · 빈 대기 슬롯 더블탭 — 손으로 다시 채운다

   자동 배치가 꺼져 있거나('자동' 토글, 또는 설정의 '코트 자동 투입'만
   꺼둔 경우) 무언가가 비면 그대로 비어 있다. 이럴 때 매번 설정을 다시
   켰다 끄는 대신, 빈 자리를 두드리면 그 자리 하나만 즉석에서 채운다 —
   이 경로는 자동 배치 설정과 무관하게 항상 동작한다. 켜져 있든
   꺼져 있든, "지금 이 자리를 채워 달라"는 명시적 손동작이기 때문이다.
   ===================================================================== */

/* 빈 코트를 두드렸을 때. 대기열에 이미 다 채워진 팀이 있으면 그걸
   그대로 올린다(투입과 같은 동작). 없으면 대기 인원에서 새로 짜야
   하는데, 그건 "이번 한 번만" 하는 것인지 확인부터 받는다 — 매번
   자동으로 짜이길 바랐다면 애초에 '자동' 토글을 켜 뒀을 것이기 때문이다. */
function fillEmptyCourt(c){
  if(!c || c.disabled || c.status!=='EMPTY' || c.members.length) return;
  const q = S.queues.find(q=>q.members.length===4 && !q.members.some(isHeld));
  if(q) return void pushQueueToCourt(q, c);
  askOneOffAutoFill(c.no);
}
function askOneOffAutoFill(no){
  openModal(`<h3>${t('actions.fill.autoTitle',{no})}</h3>
    <div class="sub">${t('actions.fill.confirmOnce')}</div>
    <div class="row end">
      <button class="btn" id="fillCancel">${t('actions.common.cancel')}</button>
      <button class="btn primary" id="fillOk">${t('actions.fill.autoAssignBtn')}</button>
    </div>`);
  $('#fillCancel').onclick = closeModal;
  $('#fillOk').onclick = ()=>{ closeModal(); composeIntoCourt(no); };
}
/* 확인을 기다리는 동안 다른 기기가 이 코트를 채웠을 수 있으니 번호로
   다시 찾아 아직 비어 있는지 확인한 뒤에 짠다. */
function composeIntoCourt(no){
  const c = S.courts.find(x=>x.no===no);
  if(!c || c.disabled || c.status!=='EMPTY' || c.members.length){
    toast(t('actions.fill.courtChanged')); return;
  }
  const all=Object.values(S.att);
  const maxG=Math.max(...all.map(a=>a.games),0);
  const pool=poolIds();
  if(pool.length<4){ Sound.play('error'); toast(t('actions.fill.notEnoughPool')); return; }
  // 조건이 빡빡해 못 찾으면 후보를 넓혀 한 번 더(fillQueues와 같은 순서).
  let best=bestCombination(topCandidates(pool,maxG,S.settings.candidateK),4,[],null,maxG);
  if(!best) best=bestCombination(topCandidates(pool,maxG,20),4,[],null,maxG);
  if(!best){ Sound.play('error'); toast(t('actions.fill.noCombination')); return; }
  best.picked.forEach(flash);
  tx(()=>{
    c.members=best.picked; c.teams=best.teams; c.matchType=best.matchType; c.typeSource='AUTO';
    c.status='FILLING'; best.picked.forEach(i=>A(i).state='FILLING');
  });
  Sound.play('move');
  toast(t('actions.fill.oneOffDone',{no}));
}

/* 빈 대기 슬롯을 두드렸을 때 — 대기 인원에서 곧바로 한 팀을 짜 넣는다.
   코트와 달리 확인을 묻지 않는다. 대기열을 채우는 것은 경기를 시작하는
   일이 아니라서(코트에 올라가야 비로소 시작된다) 되돌리기 쉽고, 매번
   확인창을 띄우면 대기열 슬롯 여러 개를 연달아 채울 때 성가시다. */
function fillEmptyQueue(q){
  if(!q || q.members.length) return;
  const all=Object.values(S.att);
  const maxG=Math.max(...all.map(a=>a.games),0);
  const pool=eligibleFor(poolIds(), q);
  if(pool.length<4){ Sound.play('error'); toast(t('actions.fill.notEnoughPool')); return; }
  let best=bestCombination(topCandidates(pool,maxG,S.settings.candidateK),4,[],q.pinnedType,maxG);
  if(!best) best=bestCombination(topCandidates(pool,maxG,20),4,[],q.pinnedType,maxG);
  if(!best){ Sound.play('error'); toast(t('actions.fill.noCombination')); return; }
  best.picked.forEach(flash);
  tx(()=>{
    q.members=best.picked; q.teams=best.teams; q.matchType=best.matchType;
    q.notice=null; best.picked.forEach(i=>A(i).state='QUEUED');
  });
  Sound.play('move');
}

/* returnCourtToQueue()는 걷어냈다. 코트 팀을 대기열로 보내는 길은
   moveCourtTeamToQueue() 하나뿐이어야 한다. 아무 데서도 부르지 않는 채로
   남아 있었는데, 그대로 두면 나중에 누가 그것을 불러 리매치 여부를 묻는
   질문을 건너뛰고 조용히 경기를 무효로 만들 수 있다. */

/* 코트 팀의 다음 단계는 대기 인원이다. 여기가 중요한 갈림길이다.
     경기 중이었다  → 경기가 끝난 것으로 본다(게임 수 +1, 기록 저장).
     아직 안 찼다   → 그냥 되돌린다.
   종료 버튼을 없앴으므로 "대기 인원으로 보내는 것"이 곧 종료다.
   다른 코트로 옮기는 것은 끝난 게 아니므로 경기를 무효로 하고 옮긴다.
   대기열로 옮기는 것만은 둘 중 어느 쪽인지 알 수 없어서 물어본다
   (askCourtToQueue) — 리매치일 수도, 잘못 올린 것을 무르는 것일 수도 있다. */
function advanceCourtTeam(c){
  if(!c || !c.members.length) return false;
  if(c.status==='PLAYING'){
    /* 여기가 경기가 끝나는 유일한 지점이다. 그래서 결과를 여기서 묻는다 —
       방금 끝난 판을 가장 잘 아는 사람은 지금 코트 앞에 서 있는 운영자다.
       나중에 기록 화면에서 채워 넣거나 고칠 수도 있지만, 그때는 이미
       어느 코트가 몇 대 몇이었는지 기억에 의존해야 한다.

       묻기만 하고 여기서 끝내지는 않는다. 실제 종료는 확인을 받은 뒤
       finishCourt()가 한다 — 취소하면 경기는 그대로 이어진다.

       단, '결과 기록 강제'가 켜져 있으면 여기서는 묻지 않는다. 그때는
       창을 띄우는 대신 네 사람을 묶어 두고, 다음에 그들을 쓰려 할 때
       그 자리에서 받는다(heldBlock). 창을 띄워 봐야 '나중에'를 누르게
       되고, 그 '나중에'가 결국 안 적히는 이유였다. */
    if(S.settings.requireResult){ finishCourt(c.no, null); return true; }
    askMatchResult(c);
    return true;
  }
  return returnCourtToPool(c);
}

/* 결과 창에서 확인을 받은 뒤 실제로 경기를 마친다.
   창이 떠 있는 동안에도 다른 기기가 판을 바꿀 수 있으므로, 코트를 번호로
   다시 찾고 아직 경기 중인지 확인한 다음에 손을 댄다. */
function finishCourt(no, result, roster){
  const c = S.courts.find(x=>x.no===no);
  if(!c || c.status!=='PLAYING'){ toast('그 사이 경기가 바뀌어 종료하지 못했습니다'); return false; }
  c.members.slice().forEach(flash);
  tx(()=>{ fixCourtRoster(c, roster); endCourt(c,'POOL',result); },{auto:false});
  Sound.play('end');
  toast(result && result.win ? `${no}코트 — ${resultLabel(result)}`
      : S.settings.requireResult ? `${no}코트 경기를 마쳤습니다 — 결과를 적어야 네 사람이 다시 뜁니다`
      : `${no}코트 경기를 마쳤습니다`);
  return true;
}

/* 결과 창에서 팀 구성을 바로잡았으면 코트와 진행 중인 기록에 함께 반영한다.
   코트를 안 고치고 기록만 고치면, 곧 이어지는 endCourt가 코트의 옛 유형을
   기록에 다시 덮어쓴다. 두 곳이 같은 값을 들고 있어야 한다. */
function fixCourtRoster(c, roster){
  if(!c || !roster) return false;
  const ids = [...roster.A.map(p=>p.id), ...roster.B.map(p=>p.id)];
  // 이 창은 맞교체만 하므로 사람이 늘거나 줄 수 없다. 그래도 한 번 확인한다.
  if(ids.length!==c.members.length || !ids.every(i=>c.members.includes(i))) return false;
  c.teams = { A: roster.A.map(p=>p.id), B: roster.B.map(p=>p.id) };
  c.matchType = mtypeOf(c.members, c.teams);
  c.typeSource = 'MANUAL';
  const m = S.matches.find(x=>x.id===c.matchId && !x.endedAt);
  if(m) applyRoster(m, roster);
  return true;
}

/* 종료 직전에 뜨는 결과 입력 창. 창 자체는 interact.js의 resultDialog가
   그린다(기록 화면에서 나중에 고칠 때도 같은 창을 쓴다). */
function askMatchResult(c){
  const mins = c.startedAt ? Math.max(0, Math.round((now()-c.startedAt)/60000)) : null;
  resultDialog(
    { A:[...c.teams.A], B:[...c.teams.B], win:null, sw:null, sl:null },
    { title: `${c.no}코트 경기 결과`,
      sub:   `${MT_LBL[c.matchType||'UNKNOWN']}${mins!=null?` · ${mins}분`:''}`
             + ' — 이긴 팀을 고르세요. 안 골라도 종료할 수 있습니다',
      okLabel:'결과 남기고 종료', noneLabel:'승패 없이 종료',
      onSave(r, roster){ finishCourt(c.no, r, roster); } });
}

/* =====================================================================
   최대 경기 시간 — 닿으면 스스로 마친다

   설정의 '최대 경기 시간'(기본 30분)에 닿은 코트는 운영자를 기다리지 않고
   끝난 것으로 처리한다. 네 명 모두 게임 수가 1 오르고 기록에 남으며,
   대기 인원으로 내려간다 — 운영자가 대기 인원으로 보냈을 때와 똑같다.

   결과는 비워 둔다(승패 없음). 30분이 지났다는 사실만으로는 누가 이겼는지
   알 수 없고, 여기서 아무 값이나 적으면 그건 기록이 아니라 거짓이다.
   나중에 기록 화면의 '결과' 칸에서 채워 넣을 수 있다.

   확인은 1초 타이머(ui.js tickCourts)와 1분 타이머(main.js), 그리고 화면에
   돌아올 때 함께 한다. 대진판을 안 보고 있는 동안에는 타이머가 멈추므로,
   돌아왔을 때 이미 시간이 넘었다면 그 자리에서 마친다.
   ===================================================================== */
let timeoutBusy = false;
function checkMatchTimeouts(){
  const max = S.settings.maxMatchMinutes;
  if(!max || max<=0 || timeoutBusy) return false;
  const limit = max*60000, t = now();
  const over = S.courts.filter(c=>c.status==='PLAYING' && c.startedAt && t-c.startedAt >= limit);
  if(!over.length) return false;
  timeoutBusy = true;                 // tx가 render를 부르고 render가 다시 여기로 오는 것을 막는다
  try{
    over.forEach(c=>{
      c.members.slice().forEach(flash);
      /* 자동 배치를 막지 않는다. 손으로 마칠 때와 달리 여기는 사람이 보고
         있지 않을 수 있어서, 빈 코트를 그대로 두면 판이 멈춘다. */
      tx(()=>endCourt(c,'POOL',null));
    });
  } finally { timeoutBusy = false; }
  Sound.play('end');
  toast(`${over.map(c=>c.no).join('·')}코트 — ${max}분이 지나 자동으로 마쳤습니다`);
  return true;
}

/* =====================================================================
   경기 중인 팀을 대기열로 — 리매치인가, 무른 것인가

   같은 손동작이 두 가지 뜻을 가진다.
     리매치   방금 한 판을 다 쳤고, 그 팀 그대로 다음 차례를 기다린다.
              → 경기는 "끝난 것"이다. 게임 수가 오르고 기록에 남는다.
     경기 취소 잘못 올렸거나 코트를 급히 비워야 한다.
              → 경기는 "없던 일"이다. 진행 중이던 기록을 지운다.

   화면만 보고는 어느 쪽인지 알 수 없다. 예전에는 늘 취소로 처리했는데,
   그러면 리매치를 할 때마다 네 명분 게임 수와 그 판의 기록이 통째로
   사라졌다. 짐작해서 하나를 고르는 대신 한 번 물어본다.
   ===================================================================== */
function askCourtToQueue(c, q){
  const mins = c.startedAt ? Math.max(0, Math.round((now()-c.startedAt)/60000)) : 0;
  const names = [...c.teams.A, ...c.teams.B].map(i=>esc((A(i)||{}).name||'?')).join(' · ');
  openModal(`<h3>${c.no}코트 → Q${q.index}</h3>
    <div class="sub">${names} — ${mins}분째 경기 중입니다. 이 경기를 어떻게 할까요?</div>
    <div class="opt" data-a="rematch"><div>
      <div class="t">리매치 — 경기를 마치고 같은 팀으로 대기</div>
      <div class="d">한 판 친 것으로 칩니다. 네 명 모두 게임 수가 1 오르고 기록에 남습니다.
        이어서 결과(승패·점수)를 물어봅니다.</div></div></div>
    <div class="opt" data-a="cancel"><div>
      <div class="t">경기 취소 — 없던 일로 하고 대기</div>
      <div class="d">게임 수도 기록도 남지 않습니다. 잘못 올렸거나 코트를 비워야 할 때 쓰세요.</div></div></div>
    <div class="row end"><button class="btn" id="cq_no">그만두기</button></div>`);
  $('#cq_no').onclick=closeModal;
  $$('#modal .opt[data-a]').forEach(e=>e.onclick=()=>{
    const a=e.dataset.a;
    closeModal(); Sound.play('tap');
    if(a==='cancel') return void moveCourtTeamToQueue(c.no, q.index, null);
    /* 리매치는 종료 처리를 그대로 태운다 — 대기 인원으로 보낼 때와 같은
       결과 창, 같은 endCourt다. 다른 것은 네 명이 흩어지지 않고 그 슬롯에
       팀째로 남는다는 것뿐이다. */
    resultDialog(
      { A:[...c.teams.A], B:[...c.teams.B], win:null, sw:null, sl:null },
      { title:`${c.no}코트 경기 결과`,
        sub: `${MT_LBL[c.matchType||'UNKNOWN']} · ${mins}분 — 마친 뒤 Q${q.index}에 같은 팀으로 올립니다`,
        okLabel:'결과 남기고 리매치', noneLabel:'승패 없이 리매치',
        /* 결과 기록 강제가 켜져 있으면 '승패 없이'도 "안 적기로 했다"는
           표시를 남겨야 한다. 안 그러면 리매치 팀이 대기열에서 묶여
           코트에 올라가지 못한다. */
        skipOnNone: !!S.settings.requireResult,
        onSave(r, roster){ moveCourtTeamToQueue(c.no, q.index, r, roster); } });
  });
}

/* 코트 팀을 대기 슬롯으로 옮긴다.
   result가 있으면(리매치) 경기를 마치고 옮기고, null이면 무효로 하고 옮긴다.
   창이 떠 있는 사이 판이 바뀌었을 수 있으므로 번호로 다시 찾아 확인한다. */
function moveCourtTeamToQueue(no, qIndex, result, roster){
  const c = S.courts.find(x=>x.no===no);
  const q = S.queues.find(x=>x.index===qIndex);
  if(!c || !q || !c.members.length){ toast('그 사이 판이 바뀌어 옮기지 못했습니다'); return false; }
  if(q.members.length){ Sound.play('error'); toast(`Q${qIndex}가 그 사이 채워졌습니다`); return false; }
  /* 놓은 자리가 곧 최종 자리는 아니다. tx가 대기열의 빈칸을 앞으로 당기므로
     (compactQueues) Q5에 놓아도 앞이 비었으면 Q3로 간다. 안내에는 실제로
     선 자리를 적어야 해서, 옮긴 뒤에 사람을 보고 찾는다. */
  const ids = c.members.slice();
  const landed = () => (S.queues.find(x=>x.members.includes(ids[0])) || q).index;
  ids.forEach(flash);
  if(result){
    if(c.status!=='PLAYING'){ toast('그 사이 경기가 끝나 리매치로 올리지 못했습니다'); return false; }
    // 팀 구성을 고쳤으면 여기서 반영한다 — 리매치는 그 팀 그대로 다음 판을
    // 치는 것이라, 고친 구성이 대기 슬롯에도 그대로 올라가야 한다.
    tx(()=>{ fixCourtRoster(c, roster); endCourt(c,'REMATCH',result,q); },{auto:false});
    Sound.play('end');
    toast(`${no}코트 리매치 → Q${landed()}`
      + (result.win ? ` · ${resultLabel(result)}` : ''));
  }else{
    tx(()=>{
      abortMatch(c);
      q.members=c.members; q.teams=c.teams; q.matchType=c.matchType; q.typeSource=c.typeSource;
      q.origin='MANUAL'; q.notice=null;
      q.members.forEach(i=>A(i).state='QUEUED');
      clearCourt(c);
    },{auto:false});
    Sound.play('move');
    toast(`${no}코트 경기를 취소하고 Q${landed()}로 옮겼습니다`);
  }
  return true;
}

/* 코트에 올라간 팀을 전부 대기 인원으로 흩는다(경기로 치지 않는다). */
function returnCourtToPool(c){
  if(!c.members.length) return false;
  c.members.forEach(flash);
  tx(()=>{ abortMatch(c); c.members.forEach(i=>A(i).state='POOL'); clearCourt(c); },{auto:false});
  Sound.play('move');
  return true;
}

/* 한 명만 대기 인원으로 뺀다. 코트가 비면 상태도 같이 되돌린다. */
function returnOneToPool(id){
  const L=locate(id);
  flash(id);
  tx(()=>{
    removeFrom(id);
    // removeFrom은 인원만 덜어낸다. 코트가 비었으면 상태까지 EMPTY로 돌려놔야
    // 자동 투입이 그 코트를 다시 쓸 수 있다.
    if(L.kind==='court' && !L.obj.members.length) clearCourt(L.obj);
  },{auto:false});
  Sound.play('move');
  return true;
}

/* 팀 박스(코트 카드 · 대기 슬롯)를 끌어다 놓았을 때의 목적지 처리.
   출발지도 목적지도 코트·대기열·대기 인원 어디든 될 수 있다. */
function moveTeamTo(from, target){
  const [fk,fn]=String(from||'').split(':');
  const [tk,tn]=String(target||'').split(':');
  if(fk===tk && fn===tn) return;
  const src = fk==='court' ? S.courts.find(c=>c.no===+fn) : S.queues.find(q=>q.index===+fn);
  if(!src || !src.members.length) return;
  // 팀 안에 결과를 안 적어 묶인 사람이 있으면 팀째로도 못 옮긴다.
  const heldOne = src.members.find(i=>isHeld(i));
  if(heldOne && heldBlock(heldOne)) return;

  if(tk==='pool'){
    if(fk==='court') return void advanceCourtTeam(src);       // 코트 → 대기 인원 = 경기 종료
    src.members.forEach(flash);
    tx(()=>{ src.members.forEach(i=>A(i).state='POOL'); clearQueue(src); },{auto:false});
    Sound.play('move');
    return;
  }

  if(tk==='court'){
    const to=S.courts.find(c=>c.no===+tn);
    if(!to || to.disabled){ Sound.play('error'); toast('그 코트는 쓸 수 없습니다'); return; }

    /* ── 코트 ↔ 코트는 언제나 통째로 맞바꾼다 ──────────────────────
       목적지가 비어 있으면 그냥 옮겨지는 것이고, 사람이 있으면 서로
       자리를 바꾼다. 둘은 같은 조작의 두 모습이라 한 갈래로 둔다.

       어느 쪽이든 경기는 이어진다. 코트를 옮긴 것이지 끝난 것이 아니기
       때문이다 — 시간도, 진행 중인 기록도 사람을 따라간다(swapCourts).
       예전에는 빈 코트로 옮길 때만 경기를 무효로 했는데, 옆 코트에 사람이
       있으면 유지되고 비어 있으면 사라지는 것은 설명할 수 없는 차이였다.
       비 오는 날 물이 새서 코트를 옮기는 것은 그 판을 무르는 일이 아니다. */
    if(fk==='court'){
      const swapping = to.members.length>0;
      [...src.members, ...to.members].forEach(flash);
      tx(()=>{ swapCourts(src, to); });
      Sound.play('move');
      toast(swapping ? `${src.no}코트 ↔ ${to.no}코트 맞바꿨습니다`
                     : `${src.no}코트 → ${to.no}코트로 옮겼습니다 (경기는 그대로)`);
      return;
    }

    if(to.members.length + src.members.length > 4){
      Sound.play('error'); toast(`${to.no}코트에 자리가 모자랍니다`); return;
    }
    // 여기 오면 출발지는 대기 슬롯이다(코트에서 온 것은 위에서 끝났다).
    if(src.members.length===4 && !to.members.length) return void pushQueueToCourt(src, to);
    // 4명이 아니거나 코트에 이미 몇 명 있으면 한 명씩 채워 넣는다
    const ids=src.members.slice();
    ids.forEach(flash);
    tx(()=>{ ids.forEach(i=>{ removeFrom(i); addTo(i,`court:${to.no}`); }); });
    Sound.play('move');
    return;
  }

  if(tk==='queue'){
    const to=S.queues.find(q=>q.index===+tn);
    if(!to || to===src) return;
    if(to.members.length){ Sound.play('error'); toast('그 대기 슬롯은 이미 차 있습니다'); return; }
    /* 경기 중인 팀이 대기열로 내려오는 것은 리매치일 수도, 무르는 것일 수도
       있다. 짐작하지 않고 물어본다 — 그 뒤는 moveCourtTeamToQueue가 맡는다. */
    if(fk==='court' && src.status==='PLAYING') return void askCourtToQueue(src, to);
    src.members.forEach(flash);
    tx(()=>{
      if(fk==='court') abortMatch(src);                        // 옮기는 것은 종료가 아니다
      to.members=src.members; to.teams=src.teams; to.matchType=src.matchType;
      to.typeSource=src.typeSource; to.origin='MANUAL'; to.notice=null;
      to.members.forEach(i=>A(i).state='QUEUED');
      if(fk==='court') clearCourt(src); else clearQueue(src);
    },{auto:false});
    Sound.play('move');
  }
}

/* =====================================================================
   더블탭 = 다음 단계로 보내기

   대기 인원 → 대기열 → 코트 → 대기 인원 의 순환이다. 어디를 두드리든
   "지금 있는 곳의 다음 칸"으로 간다. 칩을 두드리면 그 사람만, 코트나
   대기 슬롯의 빈 곳을 두드리면 그 팀 전체가 움직인다.

   빈자리는 언제나 "앞에서부터" 고른다(선입선출). 한때 랜덤으로 골랐는데,
   대기열은 Q1부터 순서대로 나가는 줄이라 무작위로 꽂히면 순서가 무너지고
   운영자가 다음에 나갈 팀을 눈으로 짐작할 수 없었다.
   ===================================================================== */

/* ── 결과를 안 적어 묶인 사람 ────────────────────────────────────
   설정의 '결과 기록 강제'가 켜져 있으면, 결과가 적히지 않은 경기의 네 명은
   아무 데로도 못 움직인다(state.js의 '결과 기록 강제' 참고).

   막기만 하면 운영자는 왜 안 되는지 모른 채 손가락만 반복한다. 그래서
   막는 그 자리에서 적을 창을 띄운다 — 하려던 일(이 사람을 쓰는 것)에서
   해야 할 일(결과 적기)까지가 한 동작이 된다. */
function heldBlock(id){
  const m = holdingMatchOf(id);
  if(!m) return false;
  Sound.play('error');
  const who = (A(id)||{}).name || '이 사람';
  toast(`${who} — ${m.court}코트 결과를 먼저 적어야 움직일 수 있습니다`);
  if(Auth.can('edit')) openResultFor(m);
  return true;
}
/* 끝난 경기 하나의 결과를 적는 창. 묶인 사람을 풀 때도, 기록 화면에서
   나중에 고칠 때도 같은 창이다. */
function openResultFor(m, opts={}){
  if(!m) return;
  const held = S.settings.requireResult && resultPending(m);
  resultDialog(m, {
    title: `${m.court}코트 경기 결과`,
    sub: `${MT_LBL[m.type||'UNKNOWN']} · ${new Date(m.startedAt).toTimeString().slice(0,5)} 시작`
         + (held ? ' — 이 결과를 적어야 네 사람이 다시 뜁니다' : ' — 나중에 다시 고칠 수 있습니다'),
    okLabel: '저장',
    // 강제가 켜져 있을 때만 "안 적기로 했다"는 표시를 남긴다. 그래야 풀린다.
    noneLabel: held ? '모름 — 기록 없이 풀기' : '결과 지우기',
    skipOnNone: held,
    onSave(r, roster){
      let fixed = false;
      tx(()=>{ fixed = applyRoster(m, roster); applyResult(m,r); },{auto:false});
      if(opts.after) opts.after();
      toast((r.win ? `${m.court}코트 — ${resultLabel(m)}`
                   : held ? '결과 없이 풀었습니다' : '결과를 지웠습니다')
            + (fixed ? ' · 팀 구성도 고쳤습니다' : ''));
    }
  });
}

function advanceChip(id){
  if(!A(id) || !requirePerm('edit')) return;
  if(heldBlock(id)) return;
  const L=locate(id);
  if(L.kind==='court'){                       // 코트 → 대기 인원
    if(!requirePerm('courtAssign')) return;
    return void returnOneToPool(id);
  }
  if(L.kind==='queue') return void chipToCourt(id);   // 대기열 → 빈 코트 자리
  return void chipToQueue(id);                        // 대기 인원 → 대기열
}

/* 자리가 남은 코트 중 가장 앞 번호를 고른다. 경기 중인 코트는 건드리지 않는다. */
function chipToCourt(id){
  if(!requirePerm('courtAssign')) return;
  const c=S.courts.find(c=>!c.disabled && c.status!=='PLAYING' && c.members.length<4);
  if(!c){ Sound.play('error'); toast('빈 코트 자리가 없습니다'); return; }
  flash(id);
  tx(()=>{ removeFrom(id); addTo(id,`court:${c.no}`); });
  Sound.play('move');
}
/* 자리가 남은 대기 슬롯 중 가장 앞(Q1 쪽)을 고른다 — 선입선출. */
function chipToQueue(id){
  const q=S.queues.find(q=>q.members.length<4);
  if(!q){ Sound.play('error'); toast('빈 대기 자리가 없습니다'); return; }
  flash(id);
  tx(()=>{ removeFrom(id); addTo(id,`queue:${q.index}`); });
  Sound.play('move');
}

/* 팀 영역(코트 카드 / 대기 슬롯)을 두드렸을 때 — 개인과 같은 방향으로 통째로.
   비어 있는 코트·대기 슬롯을 두드리면 다음 단계로 갈 사람이 없으니, 대신
   그 자리를 채운다(fillEmptyCourt·fillEmptyQueue) — "다음 단계로"라는
   방향은 같다. 채울 사람이 아직 이 자리에 없을 뿐이다. */
function advanceTeam(target){
  const [kind,key]=String(target||'').split(':');
  if(!requirePerm('edit')) return;
  if(kind==='court'){
    if(!requirePerm('courtAssign')) return;
    const c=S.courts.find(c=>c.no===+key);
    if(c && c.status==='EMPTY' && !c.disabled && !c.members.length) return void fillEmptyCourt(c);
    return void advanceCourtTeam(c);   // 코트 → 대기 인원(=종료)
  }
  if(kind==='queue'){
    if(!requirePerm('courtAssign')) return;
    const q=S.queues.find(q=>q.index===+key);
    if(q && !q.members.length) return void fillEmptyQueue(q);
    if(!q || !q.members.length) return;
    if(q.members.length===4) return void pushQueueToCourt(q);   // 4명이면 통째로
    // 아직 4명이 아니면 있는 사람만 빈 코트 자리로 옮긴다
    const c=S.courts.find(c=>!c.disabled && c.status!=='PLAYING' && c.members.length<4);
    if(!c){ Sound.play('error'); toast('빈 코트 자리가 없습니다'); return; }
    const ids=q.members.slice();
    const heldOne = ids.find(i=>isHeld(i));      // 여기도 묶인 사람은 못 올라간다
    if(heldOne && heldBlock(heldOne)) return;
    ids.forEach(flash);
    tx(()=>{ ids.forEach(i=>{ if(c.members.length<4){ removeFrom(i); addTo(i,`court:${c.no}`); } }); });
    Sound.play('move');
  }
}

/* =====================================================================
   이동 / 배치
   ===================================================================== */
function locate(id){
  for(const c of S.courts) if(c.members.includes(id)) return {kind:'court',obj:c};
  for(const q of S.queues) if(q.members.includes(id)) return {kind:'queue',obj:q};
  return {kind:'pool',obj:null};
}
/* 한 판으로 쳐 주는 최소 시간. 이 아래면 잘못 올렸다 내린 것으로 본다. */
const MIN_PLAY_MS = 60000;

/* 진행 중인 코트에서 한 명이 내려올 때 게임 수를 매겨 준다.

   예전에는 여기서 abortMatch를 불러 경기를 통째로 없앴다. 그래서 20분을
   친 코트에서 한 명만 빼도 넷 다 게임 수를 못 받고, 기록에서도 그 경기가
   사라졌다. 게다가 코트가 FILLING으로 돌아가 다음 사람이 채워지는 순간
   새 경기가 시작되면서 남은 셋의 시간이 0부터 다시 갔다.

   지금은 이렇게 본다 — 내려온 사람은 그만큼 쳤으니 한 판으로 치고,
   코트에 남은 사람들의 경기는 계속 돌아간다(그들의 시간도 이어진다).
   나중에 그 경기가 끝나면 남은 사람들은 endCourt에서 각자 받는다.

   1분을 못 채웠으면 세지 않는다. 자리를 잘못 잡아 올렸다 내리는 일이
   흔한데 그것까지 한 판으로 세면 게임 수가 금방 엉킨다. */
function creditLeaver(court, id){
  if(!court || court.status!=='PLAYING' || !court.startedAt) return false;
  if(now() - court.startedAt < MIN_PLAY_MS) return false;
  const a=A(id); if(!a) return false;
  a.games++; a.lastEnd=now();
  return true;
}

/* opts.credit — 진행 중인 코트에서 내려올 때 게임 수를 매길지.
   기본은 매긴다. 다른 코트로 자리를 옮기는 것(=아직 안 끝났다)만 끈다. */
function removeFrom(id, opts={}){
  const L=locate(id);
  if(L.kind==='pool') return;
  const o=L.obj;

  if(L.kind==='court'){
    if(opts.credit!==false) creditLeaver(o, id);
    /* 코트에 아무도 안 남으면 그 경기는 닫을 사람이 없다. 열린 기록을
       그대로 두면 기록 화면에 끝나지 않은 경기로 영영 남으므로 지운다.
       (내려온 사람들은 위에서 이미 각자 받았다.) */
    if(o.members.length<=1) abortMatch(o);
  }

  o.members=o.members.filter(x=>x!==id);
  o.teams.A=o.teams.A.filter(x=>x!==id); o.teams.B=o.teams.B.filter(x=>x!==id);
  o.matchType = o.members.length===4? mtypeOf(o.members,o.teams):null;
  if(L.kind==='queue'&&!o.members.length) Object.assign(o,{origin:'AUTO',typeSource:'AUTO'});
  A(id).state='POOL';
}
function addTo(id, target){
  const [kind,key,side,slotIdx]=target.split(':');
  if(kind==='pool'){ A(id).state='POOL'; return true; }
  const o = kind==='court'? S.courts.find(c=>c.no===+key) : S.queues.find(q=>q.index===+key);
  if(!o) return false;
  if(o.members.length>=4) return false;
  o.members.push(id); A(id).state=kind==='court'?'FILLING':'QUEUED';
  if(kind==='court'&&side){                       // 지정 자리에 삽입
    const arr=o.teams[side]; const k=+slotIdx;
    if(arr.length<2) arr.splice(Math.min(k,arr.length),0,id); else arr.push(id);
  }else if(o.teams.A.length+o.teams.B.length<4){
    (o.teams.A.length<=o.teams.B.length? o.teams.A:o.teams.B).push(id);
  }
  if(o.members.length===4){
    if(o.teams.A.length!==2||o.teams.B.length!==2){
      const sp=bestSplit(o.members,o.pinnedType||defaultTarget(o.members));
      if(sp) o.teams=sp.teams;
    }
    o.matchType=mtypeOf(o.members,o.teams);
  } else o.matchType=null;
  o.origin='MANUAL'; o.notice=null;     // 잠금 기능은 없앴다. 손으로 짠 팀은 origin으로 지킨다
  flash(id);
  return true;
}
/* 이 이동이 허용되는지 판정한다.
   운영자 : 전부 가능
   회원   : 자기 이름을, 대기 인원(풀) ↔ 대기열 사이에서만. 코트는 손대지 못한다.
   뷰어   : 전부 불가 */
function canMove(id, target){
  const kind = target.split(':')[0];
  const from = locate(id);
  if(Auth.can('edit')){
    if((kind==='court' || from.kind==='court') && !Auth.can('courtAssign')) return 'courtAssign';
    return null;
  }
  if(Auth.can('selfQueue')){
    if(!Auth.isMe(id))            return 'selfQueue';
    if(kind==='court')            return 'courtAssign';
    if(from.kind==='court')       return 'courtAssign';
    return null;                  // 풀 ↔ 대기열 이동만 허용
  }
  return 'edit';
}

function moveTo(id, target){
  const [kind,key]=target.split(':');
  if(heldBlock(id)) return;
  const deny = canMove(id, target);
  if(deny){ Sound.play('error'); toast(Auth.denyMsg(deny)); return; }
  const dest = kind==='court'? S.courts.find(c=>c.no===+key) : kind==='queue'? S.queues.find(q=>q.index===+key):null;
  if(dest){
    /* 사람 위에 놓았으면 그 사람과 맞바꾼다.

       예전에는 이 판정 위에 "이미 그 통에 있으면 돌려보낸다"가 있었다.
       그래서 같은 코트 안에서 넷을 서로 돌리는 것도, 같은 대기 슬롯 안에서
       자리를 바꾸는 것도 아예 시작조차 못 했다 — 맞교체가 안 되던 원인이
       바로 이 한 줄이다. 같은 통인지가 아니라 "놓인 자리에 사람이 있는지"로
       판단해야 맞다. */
    const occ = occupantAt(target);
    if(occ === id) return;                     // 제 자리에 도로 놓았다
    if(occ) return swap(id, occ);              // 사람 위 = 맞교체
    // 자리를 짚지 않고 제가 있는 통에 그냥 놓은 것은 아무 뜻이 없다
    if(dest.members.includes(id) && !target.split(':')[2]) return;
    if(!dest.members.includes(id) && dest.members.length>=4){
      /* 꽉 찬 코트의 빈 곳에 놓으면 누구와 바꿀지 알 수 없다. 막는 게 아니라
         어디에 놓아야 하는지 알려 준다 — 사람 위에 놓으면 그 사람과 바뀐다. */
      Sound.play('error');
      toast('그 코트는 4명이 다 찼습니다 — 바꿀 사람 위에 놓으세요'); return;
    }
  }
  /* 대기열·대기 인원으로 내리면 한 판 친 것으로 본다(1분 이상일 때).
     다른 코트로 옮기는 것은 아직 끝난 게 아니므로 세지 않는다 —
     "다음 단계로 가면 종료, 옆으로 옮기면 무효"라는 이 앱의 원칙 그대로다. */
  tx(()=>{ removeFrom(id, { credit: kind!=='court' }); addTo(id,target); });
  Sound.play('move');
}
function occupantAt(target){
  const p=target.split(':');
  if(p[0]==='court'&&p[2]!=null){ const c=S.courts.find(c=>c.no===+p[1]); return c?.teams[p[2]]?.[+p[3]]||null; }
  if(p[0]==='queue'&&p[2]!=null){ const q=S.queues.find(q=>q.index===+p[1]);
    const order=q.teams.A.length?[...q.teams.A,...q.teams.B]:q.members; return order[+p[2]]||null; }
  return null;
}
/* ── 자리 교체 ──────────────────────────────────────────────────────
   운영자가 손으로 옮기는 것에는 상황 제약을 두지 않는다. 경기 중인 코트의
   네 명을 서로 바꾸는 것도, 치고 있는 사람을 대기 인원과 맞바꾸는 것도
   된다. 체육관에서는 다치거나 급한 일이 생겨 판 도중에 사람을 바꾸는 일이
   실제로 일어나고, 그때 앱이 막아서면 운영자는 앱을 우회해 종이에 적는다.

   예전에는 "경기 중인 코트는 바꿀 수 없습니다"로 막았다. 데이터가 깨질까
   봐 둔 잠금이었는데, 실제로는 tx()가 매번 syncPlayingMatches()를 돌려
   기록의 팀 구성을 코트에 맞춰 주므로 깨지지 않는다.

   남는 제약은 역할뿐이다 — 상대방까지 움직이는 조작이라 회원에게는 열지
   않는다. 그건 상황이 아니라 권한의 문제다. */
function swap(a,b){
  if(a===b) return;
  if(!requirePerm('edit')) return;
  // 맞교체는 두 사람을 다 움직인다. 상대가 묶여 있으면 그쪽도 막아야 한다.
  if(heldBlock(a) || heldBlock(b)) return;
  const La=locate(a), Lb=locate(b);
  if((La.kind==='court'||Lb.kind==='court') && !requirePerm('courtAssign')) return;

  /* 경기 중인 코트에서 내려와 코트 밖(대기열·대기 인원)으로 가는 사람은
     그만큼 친 것이므로 한 판으로 쳐 준다 — 개별 이동(removeFrom)과 같은
     규칙이다. 코트끼리 맞바꾸는 것은 자리를 옮긴 것이지 끝난 게 아니라
     세지 않는다. */
  const leaving = (from, to) =>
    from.kind==='court' && to.kind!=='court' ? from.obj : null;
  const ca = leaving(La, Lb), cb = leaving(Lb, La);

  tx(()=>{
    if(ca) creditLeaver(ca, a);
    if(cb) creditLeaver(cb, b);
    const rep=(o,x,y)=>{ if(!o) return;
      o.members=o.members.map(v=>v===x?y:v);
      o.teams.A=o.teams.A.map(v=>v===x?y:v); o.teams.B=o.teams.B.map(v=>v===x?y:v); };
    const sa=La.obj, sb=Lb.obj;
    if(sa===sb&&sa){ rep(sa,a,'__T'); rep(sa,b,a); rep(sa,'__T',b); }
    else { rep(sa,a,b); rep(sb,b,a); const t=A(a).state; A(a).state=A(b).state; A(b).state=t; }
    [sa,sb].forEach(o=>{ if(o){ o.matchType=o.members.length===4?mtypeOf(o.members,o.teams):null; o.origin='MANUAL'; }});
    flash(a); flash(b);
  });
}

/* =====================================================================
   회원 가입 요청 — 게스트가 내고, 운영자가 승인한다

   예전에는 게스트가 등록 화면에서 이름만 넣으면 곧바로 회원 명단에
   올라갔다. 아무나 명단에 이름을 밀어 넣을 수 있었다는 뜻이고, 그렇게
   들어온 이름은 입장 화면의 회원 목록에도 그대로 노출됐다.

   이제 두 갈래다.
     1) 승인 요청 — kv/joinRequests에 쌓이고, 운영자가 회원 화면에서
        승인해야 members로 넘어간다. 운영자가 자리에 없어도 접수는 된다.
     2) 운영자 비번으로 즉시 등록 — 운영자가 옆에 있을 때. 비밀번호는
        서버가 확인하므로 이 기기에 남지 않는다.

   요청 문서는 members와 따로 둔다. 그래야 승인 전 이름이 명단(과 그
   명단을 쓰는 입장 화면·출석 화면)에 섞이지 않는다.

   동시성: 두 사람이 같은 순간에 요청을 내면 나중 것이 앞 것을 지울 수
   있다. 그래서 읽고-고치고-쓰기를 트랜잭션으로 감싼다.
   ===================================================================== */
const JOIN_KEY = () => K('joinRequests');

/* joinRequests 문서 하나만 읽고-고치고-쓴다. 세션이나 회원 문서는 건드리지
   않는다 — 게스트 기기는 명단을 온전히 못 들고 있을 수 있어서, save()의
   전체 저장 경로를 태우면 오히려 위험하다. */
async function mutateJoinRequests(fn){
  const F = (Store.mode==='firebase') ? Store._fb : null;
  if(!F || !F.runTransaction){
    const cur = (await Store.get(JOIN_KEY())) || [];
    const next = fn(cur.slice());
    await Store.set(JOIN_KEY(), next);
    S.joinRequests = next;
    return next;
  }
  const ref = F.doc(F.db,'clubs',CLUB,'kv','joinRequests');
  const next = await F.runTransaction(F.db, async tr=>{
    const snap = await tr.get(ref);
    let cur = [];
    if(snap.exists()){ try{ cur = JSON.parse(snap.data().v) || []; }catch{} }
    const out = fn(cur.slice());
    tr.set(ref, { v: JSON.stringify(out), updatedAt: new Date() });
    return out;
  });
  S.joinRequests = next;
  return next;
}

/* 게스트가 요청을 낸다. 성공하면 요청 id를 돌려준다. */
async function submitJoinRequest(info){
  const req = { id: uid('j'), name: info.name, gender: info.gender,
                birthYear: info.birthYear || null, grade: info.grade || 'C', at: now() };
  await mutateJoinRequests(list=>{
    // 같은 이름으로 이미 대기 중이면 덮어쓴다(두 번 눌렀거나 오타 수정).
    const rest = list.filter(r=>r.name!==req.name);
    rest.push(req);
    return rest.slice(-200);       // 무한정 쌓이지 않게 상한을 둔다
  });
  return req;
}

/* 운영자가 승인한다. 회원으로 올리고 요청 목록에서 뺀다.
   joinReqId를 회원 기록에 남겨 두면, 요청을 낸 기기가 승인된 것을 알아채고
   스스로 회원으로 입장할 수 있다. */
async function approveJoinRequest(id){
  if(!requirePerm('membersEdit')) return null;
  const req = S.joinRequests.find(r=>r.id===id);
  if(!req) return null;
  if(S.members.some(m=>m.name===req.name && m.active!==false)){
    await mutateJoinRequests(list=>list.filter(r=>r.id!==id));
    toast(`${req.name} 님은 이미 회원입니다 — 요청만 정리했습니다`);
    return null;
  }
  const m = { id: uid('m'), name: req.name, gender: req.gender, birthYear: req.birthYear,
              grade: req.grade, active: true, lastSeen: 0, joinReqId: req.id };
  S.members.push(m);
  setMembersBaseline(S.members);   // 추가는 삭제가 아니므로 잠금에 걸리지 않는다
  save();
  await mutateJoinRequests(list=>list.filter(r=>r.id!==id));
  return m;
}

async function rejectJoinRequest(id){
  if(!requirePerm('membersEdit')) return;
  await mutateJoinRequests(list=>list.filter(r=>r.id!==id));
}

/* ── 요청을 낸 기기 쪽 ──────────────────────────────────────────
   승인되기를 기다리는 동안 이 기기가 스스로 알아채고 회원으로 들어간다.
   운영자가 "승인했으니 새로고침하세요"라고 말해 줄 필요가 없게. */
const PENDING_KEY = () => `bmt:${CLUB}:joinPending`;
const readPending  = () => { try{ return JSON.parse(localStorage.getItem(PENDING_KEY())||'null'); }catch{ return null; } };
const writePending = v => { try{ v? localStorage.setItem(PENDING_KEY(),JSON.stringify(v))
                                 : localStorage.removeItem(PENDING_KEY()); }catch{} };

/* 승인됐으면 그 회원으로 입장시키고 true를 돌려준다. */
function checkJoinApproved(){
  const p = readPending(); if(!p) return false;
  const m = S.members.find(x=>x.joinReqId===p.id)
         || S.members.find(x=>x.name===p.name && x.active!==false);
  if(!m) return false;
  writePending(null);
  Auth.loginMember(m.id);
  applyRole();
  Sound.play('confirm');
  toast(`${m.name} 님, 가입이 승인되었습니다`);
  return true;
}
