/* =====================================================================
   부팅
   ===================================================================== */
(async function boot(){
  await Store.init();

  /* ── '/' 가 대진판인가 현관인가 ─────────────────────────────────
     원래 '/' 는 동호회 하나(default) 그 자체였다. 그 동호회가 제 주소로
     이관하고 clubs/default를 지우면, '/' 는 동호회를 찾아 주는 현관이
     되어야 한다. 그 전환을 설정 플래그로 두지 않고 데이터로 판정한다 —
     플래그를 쓰면 "지웠는데 아직 옛 화면이 뜬다"가 반드시 생기고,
     이관 순서를 사람이 기억해야 한다.

     판단이 안 될 때(오프라인)는 대진판 쪽으로 붙는다. 체육관에서 인터넷이
     끊겼다고 대진판 대신 현관이 뜨면 그날 운영이 멈춘다. */
  if(CLUB==='default' && !(await Store.legacyDefaultExists())){
    document.getElementById('app').style.display='none';
    Gate.landing();
    return;
  }

  /* 등록되지 않은 동호회면 여기서 멈춘다. 데이터를 읽지도, 최초 비밀번호
     설정 화면을 띄우지도 않는다 — 그게 예전에 아무나 새 동호회를 차지하던
     경로였다. 판단이 안 될 때(오프라인)는 막지 않고 그냥 진행한다. */
  const club = await Store.clubMeta();
  if(club.ok && !club.registered){
    document.getElementById('app').style.display='none';
    Gate.unknownClub();
    return;
  }

  // 읽기가 하나라도 실패하면 안전 모드로 들어가 저장을 잠근다.
  // 반쪽 상태를 저장해 클라우드 데이터를 덮어쓰는 것이 가장 위험하다.
  // 설정과 회원 명단은 strict로 읽는다 — 오프라인 캐시가 "문서 없음"이라고
  // 답하는 것을 "데이터 없음"으로 받아들이지 않기 위해서다. 오늘 세션은
  // 아직 없는 것이 정상이므로(하루의 첫 접속) strict를 걸지 않는다.
  const rSet = await Store.getSafe(K('settings'), {strict:true});
  const rMem = await Store.getSafe(K('members'),  {strict:true});
  const rSes = await Store.getSafe(K('session:'+S.date));
  // 가입 요청은 없는 것이 정상(아직 아무도 안 냈다)이라 strict를 걸지 않는다.
  S.joinRequests = (await Store.getSafe(K('joinRequests'))).value || [];
  const failed = [!rSet.ok&&'설정', !rMem.ok&&'회원 명단', !rSes.ok&&'오늘 세션'].filter(Boolean);

  const st=rSet.value;
  if(st) S.settings=Object.assign(clone(DEFAULTS),st,{w:Object.assign({},DEFAULTS.w,st.w||{})});
  settingsTrusted = rSet.ok;    // 못 읽은 설정은 클라우드에 쓰지 않는다
  // 현관에서 한 번에 다시 들어갈 수 있게 이 기기에 기록해 둔다.
  // 설정을 제대로 읽었을 때만 — 못 읽은 채로 적으면 이름이 '대진판'으로 굳는다.
  if(rSet.ok) rememberClub(CLUB, S.settings.clubName);
  S.members=rMem.value||[];
  // 제대로 읽었을 때만 기준선을 잡는다. 기준선이 없으면 회원 문서에는
  // 아무것도 쓰지 않는다(actions.js의 save 참고).
  if(rMem.ok){
    setMembersBaseline(S.members);
    lastWritten.members = JSON.stringify(S.members);   // 읽은 그대로를 다시 쓸 필요는 없다
  }
  if(failed.length){
    // 익명 로그인이 꺼져 있으면 보안 규칙이 전부 거부한다. 이 경우는
    // 새로고침해도 소용없으므로 무엇을 해야 하는지 정확히 알려 준다.
    setSafeMode(true, Store.fbState==='authFailed'
      ? '익명 로그인이 되지 않아 클라우드를 읽지 못했습니다 — Firebase 콘솔 → Authentication'
        + ' → 로그인 방법 → 익명을 켜 주세요. 저장은 잠갔습니다(데이터는 그대로입니다)'
      : failed.join('·')+'을(를) 불러오지 못했습니다. 저장이 잠겼습니다 — 새로고침해 주세요');
  }
  const sess=rSes.value;
  if(sess&&sess.courts&&sess.courts.length===S.settings.courtCount&&sess.queues?.length===S.settings.queueSlotCount){
    Object.assign(S,{startedAt:sess.startedAt||null,att:sess.att||{},courts:sess.courts,queues:sess.queues,matches:sess.matches||[],hist:sess.hist||[]});
    Object.values(S.att).forEach(a=>{ if(a.jit==null) a.jit=Math.random(); });
  } else initBoard();
  checkAutoClose();                                  // 12시간 지난 세션이면 바로 마감
  setInterval(()=>{ if(checkAutoClose()) render(); }, 60000);   // 이후 1분마다 확인

  /* Firebase가 늦게 준비된 경우(느린 네트워크 등) 이 기기 저장소로 굳어 버리면
     그날 조작이 클라우드에 안 올라간다. 아직 아무 것도 건드리지 않은 상태라면
     조용히 새로고침해서 클라우드 데이터로 다시 시작한다. 이미 조작을 시작했다면
     화면을 갈아엎지 않고 안내만 한다. */
  window.addEventListener('fb-ready', ()=>{
    if(Store.mode==='firebase') return;
    if(!(window.__fb && window.__fb.ready)) return;
    const untouched = !undoStack.length && !Object.keys(S.att).length;
    // 새로고침은 딱 한 번만. 계속 느린 네트워크에서 무한 새로고침이 되면 안 된다.
    let once=false;
    try{ once = sessionStorage.getItem('bmt:fbReloaded')==='1'; }catch{}
    if(untouched && !once){
      try{ sessionStorage.setItem('bmt:fbReloaded','1'); }catch{}
      location.reload();
    } else toast('클라우드 연결이 늦게 완료되었습니다. 새로고침하면 동기화됩니다');
  });

  $$('.tab').forEach(t=>t.onclick=()=>show(t.dataset.scr));
  const seg=(id,fn)=>$(id)?.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return;
    [...b.parentElement.children].forEach(x=>x.classList.toggle('on',x===b)); fn(b);});
  seg('#poolSort',b=>{poolSort=b.dataset.s;renderPool();});
  seg('#poolSex', b=>{poolSex=b.dataset.x;renderPool();});
  seg('#attSort', b=>{attSort=b.dataset.s;renderAtt();});
  seg('#attSex',  b=>{attSex=b.dataset.x;renderAtt();});
  seg('#mvSeg',   b=>{ $('#app').classList.toggle('mv-queues', b.dataset.mv==='queues'); });

  Sound.set(S.settings.sound !== false);
  const restored = await Auth.restore();
  // 내가 낸 가입 요청이 그새 승인됐는지 먼저 본다(승인됐다면 회원으로 들어간다).
  const joined = checkJoinApproved();
  applyRole();
  render();
  if(!restored && !joined) Gate.start();
  else if(Auth.isAdmin && !S.members.length){ show('mem');
    setTimeout(()=>toast('회원을 먼저 등록하세요 — CSV 일괄등록이 빠릅니다'),500); }

  /* 승인을 기다리는 기기는 회원 문서를 지켜본다. 운영자가 승인하는 순간
     화면에서 바로 회원으로 바뀐다 — "승인했으니 새로고침하세요"라고
     말해 줄 필요가 없게. 운영자 쪽에서는 새 요청이 오면 버튼에 숫자가 붙는다. */
  /* 실시간 구독은 화면을 벗어나도 붙여 둔다.
     떼면 밤새 무선을 덜 깨우지만, 깨어난 직후 서버 스냅샷이 도착하기 전에
     조작하면 낡은 상태를 덮어쓸 수 있다. 배터리 이득보다 그 위험이 크다고
     보고 그대로 뒀다(화면잠금·타이머·하트비트를 끈 것으로 충분하다). */
  const unsubMem = Store.subscribe(K('members'), remote=>{
    if(!Array.isArray(remote)) return;
    S.members = remote;
    setMembersBaseline(S.members);
    if(checkJoinApproved()) render();
  });
  const unsubJoin = Store.subscribe(K('joinRequests'), remote=>{
    S.joinRequests = Array.isArray(remote) ? remote : [];
    if($('#scr-mem').classList.contains('on')) renderMem(); else renderJoinBtn();
  });
  window.addEventListener('beforeunload', ()=>{ unsubMem&&unsubMem(); unsubJoin&&unsubJoin(); });

  // 브라우저는 첫 사용자 조작 전에는 소리를 못 내게 막는다. 아무 터치에서 깨운다.
  ['pointerdown','keydown'].forEach(ev=>
    window.addEventListener(ev, ()=>Sound.unlock(), {once:true}));
  // 설정 화면에 갈 수 있는 사람에게만 안내한다. 게스트에게는 설정 탭이
  // 아예 없어서 "설정 → 저장소로 가세요"가 갈 수 없는 곳을 가리켰다.
  if(Store.mode!=='firebase' && Auth.can('settings')){
    const cfg = window.__fbReadCfg && window.__fbReadCfg();
    if(!cfg) setTimeout(()=>toast('설정 → 저장소에서 Firebase를 연결할 수 있습니다 (지금은 이 기기에만 저장됨)'),1200);
  }

  /* 다른 태블릿에서 같은 날짜 세션을 저장하면 실시간으로 반영한다.
     내가 방금 저장한 직후의 에코는 짧은 시간창으로 걸러 깜빡임을 막는다. */
  let lastLocalSave=0;
  window.__markLocalSave = ()=>{ lastLocalSave=now(); };
  const unsub = Store.subscribe(K('session:'+S.date), remote=>{
    const prevPlaying = myPlayingCourt();
    if(now()-lastLocalSave < 1500) return;              // 내가 방금 쓴 것
    if(!remote || JSON.stringify(remote.queues)===JSON.stringify(S.queues) &&
       JSON.stringify(remote.courts)===JSON.stringify(S.courts)) return;
    Object.assign(S,{att:remote.att||{},courts:remote.courts,queues:remote.queues,
      matches:remote.matches||[],hist:remote.hist||[]});
    Object.values(S.att).forEach(a=>{ if(a.jit==null) a.jit=Math.random(); });
    sel=null; render();
    const nowPlaying = myPlayingCourt();
    if(nowPlaying && !prevPlaying) announceMyMatch(nowPlaying);
    else toast('다른 기기에서 변경되어 화면을 갱신했습니다');
  });
  window.addEventListener('beforeunload', ()=>unsub&&unsub());

  /* 화면 꺼짐 방지는 ui.js의 syncWake가 맡는다 — 출석자가 있는 동안만 걸고,
     세션이 끝나면 놓는다. 예전에는 여기서 조건 없이 걸고 푸는 코드가 없어,
     빈 대진판을 띄워 둔 태블릿의 화면이 밤새 켜져 있었다. */
  syncIdle();
  window.addEventListener('beforeunload',e=>{ if(Object.values(S.att).length){ e.preventDefault(); e.returnValue=''; } });
})();


/* ── 회원용 내 경기 알림 ──────────────────────────────────────────
   회원으로 입장하면 자기 이름이 코트에 올라가 경기가 시작될 때
   화면 가운데에 크게 띄우고 소리와 진동으로 알려 준다. */
function myAttendeeId(){
  if(!Auth.isMember || !Auth.memberId) return null;
  const a = Object.values(S.att).find(a=>a.memberId===Auth.memberId);
  return a? a.id : null;
}
function myPlayingCourt(){
  const id = myAttendeeId(); if(!id) return null;
  return S.courts.find(c=>c.status==='PLAYING' && c.members.includes(id)) || null;
}
let announceT=null;
function announceMyMatch(court){
  Sound.play('notify'); Sound.buzz([90,60,90]);
  const mate = (court.teams.A.includes(myAttendeeId())? court.teams.A : court.teams.B)
                 .filter(i=>i!==myAttendeeId()).map(i=>(A(i)||{}).name).filter(Boolean);
  const foe  = (court.teams.A.includes(myAttendeeId())? court.teams.B : court.teams.A)
                 .map(i=>(A(i)||{}).name).filter(Boolean);
  const el=$('#callout');
  el.innerHTML=`<div class="callout-in">
      <div class="callout-court">${court.no}코트</div>
      <div class="callout-msg">경기 시작입니다</div>
      <div class="callout-team">${esc(mate.join(' · ')||'—')} <span>vs</span> ${esc(foe.join(' · '))}</div>
      <button class="btn primary" id="calloutOk">확인</button>
    </div>`;
  el.classList.add('on');
  $('#calloutOk').onclick=()=>{ Sound.play('tap'); el.classList.remove('on'); };
  clearTimeout(announceT);
  announceT=setTimeout(()=>el.classList.remove('on'), 20000);
}
