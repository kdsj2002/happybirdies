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
/* 진행 중인 경기의 팀 구성이 바뀌면(팀 바꾸기 등) 기록도 따라가야 한다.
   안 그러면 기록 화면에 시작 당시의 옛 팀이 남는다. */
function syncPlayingMatches(){
  S.courts.forEach(c=>{
    if(c.status!=='PLAYING' || !c.matchId) return;
    const m=S.matches.find(x=>x.id===c.matchId && !x.endedAt);
    if(!m) return;
    const nameOf=id=>(A(id)&&A(id).name)||'?';
    m.A=[...c.teams.A]; m.B=[...c.teams.B];
    m.An=m.A.map(nameOf); m.Bn=m.B.map(nameOf);
    m.type=c.matchType;
  });
}
/* 경기 중인 코트에서 사람이 빠지면 그 경기는 성립하지 않는다.
   아직 안 끝난 기록을 지우고 코트를 채우는 중 상태로 되돌린다.
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
  Object.assign(S,s); sel=null; save(); render(); toast('되돌렸습니다');
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
    window.__markLocalSave && window.__markLocalSave();

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
        setSafeMode(true, '회원 명단을 확인하지 못한 상태입니다. 덮어쓰기를 막았습니다 — 새로고침해 주세요');
      }else if(gone.length){
        console.warn('승인되지 않은 회원 삭제 — 저장을 막았습니다', gone.map(m=>m.name));
        setSafeMode(true, `회원 ${gone.length}명이 화면에서 사라진 채로 저장되려 했습니다`
          + ` (${loadedMembersCount}명 → ${S.members.length}명). 덮어쓰기를 막았습니다`
          + ' — 새로고침하거나 설정 → 데이터 복구를 쓰세요');
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
  if(!requirePerm('membersEdit')) return;
  // 오래된 백업 파일에는 id가 없는 회원이 섞여 있을 수 있다. 비교의 기준이
  // id이므로 여기서 채워 둔다(없으면 전부 같은 사람으로 취급돼 버린다).
  const next = (Array.isArray(nextList) ? nextList : [])
    .map(m => m && m.id ? m : Object.assign({}, m, {id:uid('m')}));

  // 1) 클라우드의 현재 명단 확인 — 못 읽으면 덮어쓰지 않는다
  const r = opt.dbRead || await Store.getSafe(K('members'), {strict:true});
  if(!r.ok){
    Sound.play('error');
    openModal(`<h3>덮어쓸 수 없습니다</h3>
      <div class="sub">${esc(opt.source||'회원 명단 덮어쓰기')}</div>
      <div class="hint" style="line-height:1.8">
        클라우드에 지금 어떤 명단이 들어 있는지 확인하지 못했습니다
        (${esc(r.error||'읽기 실패')}).<br>
        무엇을 덮어쓰게 되는지 모르는 상태에서는 회원 명단을 바꾸지 않습니다.
        연결을 확인하고 다시 시도해 주세요.</div>
      <div class="row end"><button class="btn primary" onclick="closeModal()">확인</button></div>`);
    return;
  }
  const cur = r.value || [];
  const d   = diffMembers(cur, next);

  // 2) 결과 명기
  const names = arr => arr.slice(0,8).map(m=>esc(m.name)).join(', ')
                     + (arr.length>8 ? ` 외 ${arr.length-8}명` : '');
  const attHit = Object.values(S.att)
    .filter(a=>a.memberId && d.removed.some(m=>m.id===a.memberId));
  const offline = Store.mode==='firebase' && r.cached;
  const local   = Store.mode!=='firebase';

  const rows = [
    ['현재 클라우드', `<b class="num">${d.from}</b>명`],
    ['덮어쓴 뒤',     `<b class="num">${d.to}</b>명`],
    ['삭제',  d.removed.length
        ? `<b class="num" style="color:var(--cork)">${d.removed.length}</b>명 — ${names(d.removed)}`
        : '<span style="color:var(--muted2)">없음</span>'],
    ['추가',  d.added.length
        ? `<b class="num" style="color:var(--court)">${d.added.length}</b>명 — ${names(d.added)}`
        : '<span style="color:var(--muted2)">없음</span>'],
    ['정보 변경', d.changed.length
        ? `<b class="num">${d.changed.length}</b>명 — ${names(d.changed)}`
        : '<span style="color:var(--muted2)">없음</span>']
  ];

  const results = [
    `클라우드의 회원 문서(<span class="num">clubs/${esc(CLUB)}/kv/members</span>)가
     <b>통째로 교체</b>됩니다. 지금 값은 남지 않습니다.`,
    d.removed.length
      ? `회원 <b style="color:var(--cork)">${d.removed.length}명</b>이 DB에서 사라집니다.
         출석 목록·회원 화면·입장 화면에서 더 이상 고를 수 없게 됩니다.`
      : '삭제되는 회원은 없습니다.',
    `같은 클럽에 접속한 <b>모든 기기</b>(태블릿·휴대폰)에 그대로 반영됩니다.
     이 기기에서만 되돌릴 수 있는 조작이 아닙니다.`,
    `대진판의 <b>되돌리기(↩)로는 되돌아가지 않습니다.</b>
     되돌리려면 회원 화면의 <b>백업</b> 파일이 있어야 합니다.`,
    `지난 세션의 경기 기록은 지워지지 않지만, 삭제된 회원은 기록에 이름으로만 남고
     회원 정보와의 연결이 끊깁니다.`
  ];
  if(attHit.length) results.push(
    `<b style="color:var(--cork)">오늘 출석 중인 ${attHit.length}명(${names(attHit)})이 삭제 대상입니다.</b>
     이미 출석한 사람은 오늘 세션에서 그대로 뛰지만, 다음 세션부터는 명단에 없습니다.`);
  if(offline) results.push(
    `<b style="color:var(--cork)">지금 오프라인입니다.</b> 이 덮어쓰기는 일단 이 기기에만 적용되고,
     연결이 돌아오는 순간 위 내용 그대로 클라우드에 올라갑니다. 그 사이 다른 기기에서
     바뀐 내용이 있으면 그것까지 덮어씁니다.`);
  if(local) results.push(
    `Firebase에 연결돼 있지 않아 이 기기에만 적용됩니다.`);

  const bodyHtml = `
    <div class="kv" style="grid-template-columns:92px 1fr;gap:9px 12px;margin-bottom:14px">
      ${rows.map(([k,v])=>`<div class="k">${k}</div><div>${v}</div>`).join('')}
    </div>
    <div class="hint" style="margin-bottom:14px">
      <b style="color:var(--text)">이 동작의 결과</b>
      <ul style="margin:6px 0 0;padding-left:18px">
        ${results.map(t=>`<li style="margin-bottom:4px">${t}</li>`).join('')}
      </ul>
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" id="pinBackup">먼저 백업 내려받기</button>
      <span class="hint">되돌릴 수단은 이 백업 파일뿐입니다.</span>
    </div>`;

  // 3) 관리 비밀번호 확인
  askPin('회원 명단 덮어쓰기', opt.source || '회원 명단 전체를 바꿉니다', async ()=>{
    S.members = next;
    setMembersBaseline(next);        // 승인받은 내용이 새 기준선이 된다
    setSafeMode(false);
    lastWritten.members = null;      // 다음 저장에서 반드시 다시 쓰도록
    if(opt.applyExtra) await opt.applyExtra();
    save(); render();
    if(typeof renderMem==='function') renderMem();
    Sound.play('confirm');
    toast(`회원 명단을 덮어썼습니다 (${d.from}명 → ${d.to}명)`);
    if(opt.after) opt.after();
  }, { bodyHtml, okLabel:'덮어쓰기', onReady(){
    const b=$('#pinBackup'); if(b) b.onclick=()=>exportBackup();
  }});
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
function clearQueue(q){
  Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                   origin:'AUTO',notice:null});
}

/* 대기 슬롯 하나를 코트로 통째로 올린다. c를 안 주면 빈 코트를 찾는다. */
function pushQueueToCourt(q, c){
  if(!q || q.members.length!==4) return false;
  c = c || firstEmptyCourt();
  if(!c){ Sound.play('error'); toast('빈 코트가 없습니다'); return false; }
  if(c.disabled){ Sound.play('error'); toast(`${c.no}코트는 사용하지 않습니다`); return false; }
  if(c.status==='PLAYING'){ Sound.play('error'); toast('경기 중인 코트에는 넣을 수 없습니다'); return false; }
  if(c.members.length){ Sound.play('error'); toast(`${c.no}코트가 이미 차 있습니다`); return false; }
  q.members.forEach(flash);            // 네 명 모두 착지 애니메이션 (render 전에 걸어야 한다)
  tx(()=>{
    c.members=q.members; c.teams=q.teams; c.matchType=q.matchType; c.typeSource=q.typeSource;
    c.status='FILLING'; c.members.forEach(i=>A(i).state='FILLING');
    clearQueue(q);
  });
  Sound.play('move');
  return true;
}

/* 코트에 올라간 팀을 통째로 대기열로 되돌린다(팀 유지). */
function returnCourtToQueue(c){
  if(!c.members.length) return false;
  const q=S.queues.find(x=>!x.members.length);
  if(!q){ Sound.play('error'); toast('비어 있는 대기 슬롯이 없습니다'); return false; }
  c.members.forEach(flash);
  tx(()=>{
    abortMatch(c);          // 진행 중이었다면 그 경기 기록은 무효 (removeFrom을 안 거치므로 직접)
    q.members=c.members; q.teams=c.teams; q.matchType=c.matchType; q.typeSource=c.typeSource;
    q.origin='MANUAL'; q.notice=null;     // 손으로 되돌린 팀은 origin으로 자동 재구성에서 지킨다
    q.members.forEach(i=>A(i).state='QUEUED');
    clearCourt(c);
  },{auto:false});
  Sound.play('move');
  return true;
}

/* 코트 팀의 다음 단계는 대기 인원이다. 여기가 중요한 갈림길이다.
     경기 중이었다  → 경기가 끝난 것으로 본다(게임 수 +1, 기록 저장).
     아직 안 찼다   → 그냥 되돌린다.
   종료 버튼을 없앴으므로 "대기 인원으로 보내는 것"이 곧 종료다.
   반대로 대기열이나 다른 코트로 옮기는 것은 끝난 게 아니므로 경기를
   무효로 하고 옮긴다(abortMatch). */
function advanceCourtTeam(c){
  if(!c || !c.members.length) return false;
  if(c.status==='PLAYING'){
    const ids=c.members.slice();
    ids.forEach(flash);
    tx(()=>endCourt(c,'POOL'),{auto:false});
    Sound.play('end');
    toast(`${c.no}코트 경기를 마쳤습니다`);
    return true;
  }
  return returnCourtToPool(c);
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
    if(to.members.length + src.members.length > 4){
      Sound.play('error'); toast(`${to.no}코트에 자리가 모자랍니다`); return;
    }
    if(fk==='queue'){
      if(src.members.length===4 && !to.members.length) return void pushQueueToCourt(src, to);
      // 4명이 아니거나 코트에 이미 몇 명 있으면 한 명씩 채워 넣는다
      const ids=src.members.slice();
      ids.forEach(flash);
      tx(()=>{ ids.forEach(i=>{ removeFrom(i); addTo(i,`court:${to.no}`); }); });
      Sound.play('move');
      return;
    }
    if(to.members.length){ Sound.play('error'); toast(`${to.no}코트가 이미 차 있습니다`); return; }
    // 코트 → 다른 코트: 끝난 게 아니므로 경기는 무효로 하고 옮긴다
    src.members.forEach(flash);
    tx(()=>{
      abortMatch(src);
      to.members=src.members; to.teams=src.teams; to.matchType=src.matchType;
      to.typeSource=src.typeSource; to.status='FILLING';
      to.members.forEach(i=>A(i).state='FILLING');
      clearCourt(src);
    });
    Sound.play('move');
    return;
  }

  if(tk==='queue'){
    const to=S.queues.find(q=>q.index===+tn);
    if(!to || to===src) return;
    if(to.members.length){ Sound.play('error'); toast('그 대기 슬롯은 이미 차 있습니다'); return; }
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

function advanceChip(id){
  if(!A(id) || !requirePerm('edit')) return;
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

/* 팀 영역(코트 카드 / 대기 슬롯)을 두드렸을 때 — 개인과 같은 방향으로 통째로 */
function advanceTeam(target){
  const [kind,key]=String(target||'').split(':');
  if(!requirePerm('edit')) return;
  if(kind==='court'){
    if(!requirePerm('courtAssign')) return;
    return void advanceCourtTeam(S.courts.find(c=>c.no===+key));   // 코트 → 대기 인원(=종료)
  }
  if(kind==='queue'){
    if(!requirePerm('courtAssign')) return;
    const q=S.queues.find(q=>q.index===+key);
    if(!q || !q.members.length) return;
    if(q.members.length===4) return void pushQueueToCourt(q);   // 4명이면 통째로
    // 아직 4명이 아니면 있는 사람만 빈 코트 자리로 옮긴다
    const c=S.courts.find(c=>!c.disabled && c.status!=='PLAYING' && c.members.length<4);
    if(!c){ Sound.play('error'); toast('빈 코트 자리가 없습니다'); return; }
    const ids=q.members.slice();
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
function removeFrom(id){
  const L=locate(id);
  if(L.kind==='pool') return;
  const o=L.obj;
  if(L.kind==='court') abortMatch(o);   // 진행 중이었다면 그 경기는 무효

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
  const deny = canMove(id, target);
  if(deny){ Sound.play('error'); toast(Auth.denyMsg(deny)); return; }
  const from=locate(id);
  const dest = kind==='court'? S.courts.find(c=>c.no===+key) : kind==='queue'? S.queues.find(q=>q.index===+key):null;
  if(dest && dest.members.includes(id)) return;
  if(dest && dest.members.length>=4){
    const occ = occupantAt(target);
    if(occ) return swap(id,occ);
    toast('자리가 가득 찼습니다'); return;
  }
  tx(()=>{ removeFrom(id); addTo(id,target); });
  Sound.play('move');
}
function occupantAt(target){
  const p=target.split(':');
  if(p[0]==='court'&&p[2]!=null){ const c=S.courts.find(c=>c.no===+p[1]); return c?.teams[p[2]]?.[+p[3]]||null; }
  if(p[0]==='queue'&&p[2]!=null){ const q=S.queues.find(q=>q.index===+p[1]);
    const order=q.teams.A.length?[...q.teams.A,...q.teams.B]:q.members; return order[+p[2]]||null; }
  return null;
}
function swap(a,b){
  if(a===b) return;
  // 자리 교체는 상대방까지 움직이는 조작이라 회원에게는 열지 않는다.
  if(!requirePerm('edit')) return;
  const La=locate(a), Lb=locate(b);
  if((La.kind==='court'||Lb.kind==='court') && !requirePerm('courtAssign')) return;
  if((La.kind==='court'&&La.obj.status==='PLAYING')||(Lb.kind==='court'&&Lb.obj.status==='PLAYING')){
    toast('경기 중인 코트는 바꿀 수 없습니다'); return; }
  tx(()=>{
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
