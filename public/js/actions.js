/* =====================================================================
   변경 트랜잭션 — 모든 상태 변경은 여기를 거친다 (Undo + 저장)
   ===================================================================== */
function tx(fn, opts={}){
  undoStack.push(JSON.stringify({att:S.att,courts:S.courts,queues:S.queues,matches:S.matches,hist:S.hist}));
  if(undoStack.length>20) undoStack.shift();
  fn();
  if(opts.auto!==false) autoAssign();
  save(); render();
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
                   status:'EMPTY',locked:false,startedAt:null,matchId:null});
}
function clearQueue(q){
  Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                   origin:'AUTO',locked:false,notice:null});
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
    q.members=c.members; q.teams=c.teams; q.matchType=c.matchType; q.typeSource=c.typeSource;
    q.origin='MANUAL'; q.locked=true; q.notice=null;   // 손으로 되돌린 팀은 자동 재구성에서 지킨다
    q.members.forEach(i=>A(i).state='QUEUED');
    clearCourt(c);
  },{auto:false});
  Sound.play('move');
  return true;
}

/* 코트에 올라간 팀을 전부 대기 인원으로 흩는다. */
function returnCourtToPool(c){
  if(!c.members.length) return false;
  c.members.forEach(flash);
  tx(()=>{ c.members.forEach(i=>A(i).state='POOL'); clearCourt(c); },{auto:false});
  Sound.play('move');
  return true;
}

/* 한 명만 대기 인원으로 뺀다. 코트가 비면 상태도 같이 되돌린다. */
function returnOneToPool(id){
  const L=locate(id);
  if(L.kind==='court' && L.obj.status==='PLAYING'){
    Sound.play('error'); toast('경기 중에는 뺄 수 없습니다'); return false;
  }
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

/* 대기 슬롯 팀을 끌어다 놓았을 때의 목적지 처리 */
function moveTeamTo(qIndex, target){
  const q=S.queues.find(x=>x.index===qIndex);
  if(!q || q.members.length!==4) return;
  const [kind,key]=String(target).split(':');
  if(kind==='court'){
    return void pushQueueToCourt(q, S.courts.find(c=>c.no===+key));
  }
  if(kind==='pool'){
    q.members.forEach(flash);
    tx(()=>{ q.members.forEach(i=>A(i).state='POOL'); clearQueue(q); },{auto:false});
    Sound.play('move');
    return;
  }
  if(kind==='queue'){
    const to=S.queues.find(x=>x.index===+key);
    if(!to || to===q) return;
    if(to.members.length){ Sound.play('error'); toast('그 슬롯은 이미 차 있습니다'); return; }
    q.members.forEach(flash);
    tx(()=>{
      to.members=q.members; to.teams=q.teams; to.matchType=q.matchType;
      to.typeSource=q.typeSource; to.origin=q.origin; to.locked=q.locked;
      to.pinnedType=to.pinnedType||null; to.notice=null;
      clearQueue(q);
    },{auto:false});
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
  o.members=o.members.filter(x=>x!==id);
  o.teams.A=o.teams.A.filter(x=>x!==id); o.teams.B=o.teams.B.filter(x=>x!==id);
  o.matchType = o.members.length===4? mtypeOf(o.members,o.teams):null;
  if(L.kind==='queue'&&!o.members.length) Object.assign(o,{origin:'AUTO',typeSource:'AUTO',locked:o.pinnedType?o.locked:false});
  A(id).state='POOL';
}
function addTo(id, target){
  const [kind,key,side,slotIdx]=target.split(':');
  if(kind==='pool'){ A(id).state='POOL'; return true; }
  const o = kind==='court'? S.courts.find(c=>c.no===+key) : S.queues.find(q=>q.index===+key);
  if(!o) return false;
  if(kind==='court'&&o.status==='PLAYING'){ toast('경기 중인 코트는 바꿀 수 없습니다'); return false; }
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
  o.locked=true;                                   // 수동 배치 → 자동 잠금
  o.origin='MANUAL'; o.notice=null;
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
    [sa,sb].forEach(o=>{ if(o){ o.matchType=o.members.length===4?mtypeOf(o.members,o.teams):null; o.locked=true; o.origin='MANUAL'; }});
    flash(a); flash(b);
  });
}
