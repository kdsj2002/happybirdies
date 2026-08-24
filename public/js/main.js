/* =====================================================================
   부팅
   ===================================================================== */
(async function boot(){
  await Store.init();

  /* ── 시계가 늦게 맞춰지면 그 전에 찍은 시작 시각을 고쳐 쓴다 ──────
     코트가 앱을 켜자마자(서버 시계를 아직 못 맞춘 채) 시작되면, 그때 찍힌
     startedAt은 날것 기기 시계다 — 기기 시계가 틀려 있었다면 그 오차가
     그대로 남는다. algo.js의 startCourt()가 그런 코트에 startedRaw
     표시를 남겨 두고, 여기서 시계가 "처음" 맞춰지는 순간(대개 이 세션
     문서 자체가 쓰이고 몇백 ms 뒤) 그 표시가 붙은 코트를 찾아 한 번만
     고쳐 쓴다. 표시가 없는 코트(시계가 이미 맞은 뒤 시작된 것)는 건드릴
     이유가 없다 — 애초에 틀릴 일이 없었다.

     같은 경기의 S.matches[] 기록도 함께 고친다. 둘이 따로 놀면 코트
     화면의 경과 시간과 기록 화면의 시작 시각이 어긋난다. */
  Store.onCalibrated(skew => {
    const raw = S.courts.filter(c => c.startedRaw);
    if(!raw.length) return;
    tx(() => {
      raw.forEach(c => {
        c.startedAt += skew;
        delete c.startedRaw;
        const m = S.matches.find(x => x.id===c.matchId && !x.endedAt);
        if(m) m.startedAt = c.startedAt;
      });
    }, {auto:false});
  });

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
  /* 오늘 원장을 먼저 읽어 둔다. 이걸 안 하면 새로고침한 기기가 오늘 경기를
     전부 다시 올리려 든다. 이어서 과거 이력도 설정한 만큼 불러 둔다 —
     매칭이 참조하는 값이라 첫 배치 전에 준비돼 있어야 한다. */
  await Records.seed();
  Records.warmUp(S.settings.historyDays).catch(()=>{});   // 실패해도 앱은 그대로 돈다

  checkAutoClose();                                  // 12시간 지난 세션이면 바로 마감
  checkMatchTimeouts();                              // 최대 경기 시간을 넘긴 코트도 바로 정리
  /* 1분마다 확인한다. 대진판을 보고 있을 때는 1초 타이머(ui.js tickCourts)가
     더 촘촘히 보지만, 다른 탭(기록·설정)에 가 있거나 화면이 꺼져 있었으면
     그 타이머가 멈춘다. 그래서 느슨한 타이머를 하나 더 둔다. */
  setInterval(()=>{ if(checkAutoClose()) render(); checkMatchTimeouts(); }, 60000);
  // 화면으로 돌아왔을 때, 안 보는 사이에 시간이 넘었다면 그 자리에서 마친다.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){ checkAutoClose(); checkMatchTimeouts(); }
  });

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

  /* ── 다른 태블릿의 변경을 받는다 ────────────────────────────────

     예전에는 "마지막 저장 후 1.5초 안에 온 것은 전부 무시"였다. 내가 쓴
     메아리를 거르려는 것이었는데, 그 1.5초 동안 **다른 태블릿이 보낸
     변경까지 통째로 버려졌다.** 두 사람이 번갈아 칩을 옮기면 저장이 계속
     겹쳐서 서로의 변경이 조용히 사라졌다 — 동기화가 안 되던 주된 원인이다.

     이제 시간이 아니라 내용으로 가른다.
       · 아직 서버에 안 올라간 내 쓰기(hasPendingWrites)는 건너뛴다
       · 방금 내가 쓴 그 내용과 똑같으면 메아리다 — 건너뛴다
       · 그 외에는 남이 바꾼 것이므로 언제 왔든 반드시 받는다

     비교 대상도 넓혔다. 예전에는 courts와 queues만 봐서, 출석·게임 수·
     경기 기록만 바뀐 변경(다른 기기에서 출석 체크, 결과 입력 등)은
     "달라진 게 없다"고 판단해 버렸다. 이제 세션 전체를 비교한다. */
  const unsub = Store.subscribe(K('session:'+S.date), (remote, info)=>{
    if(!remote || !remote.courts || !remote.queues) return;
    if(info && info.local) return;                    // 아직 서버에 안 올라간 내 쓰기
    const js = JSON.stringify(remote);
    if(js === lastWritten.session) return;            // 내가 쓴 것의 메아리
    const prevPlaying = myPlayingCourt();
    Object.assign(S,{startedAt:remote.startedAt||null, att:remote.att||{},
      courts:remote.courts, queues:remote.queues,
      matches:remote.matches||[], hist:remote.hist||[]});
    Object.values(S.att).forEach(a=>{ if(a.jit==null) a.jit=Math.random(); });
    /* 저쪽에서 코트 수를 바꿨다면 이 기기의 설정값도 맞춰 둔다. 안 맞으면
       화면은 새 코트를 그리는데 설정 화면은 옛 숫자를 말하게 된다.
       settingsTrusted는 건드리지 않는다 — 내가 정한 값이 아니라 받은
       값이므로 이 기기가 설정 문서를 되쓰지는 않는다. */
    S.settings.courtCount = remote.courts.length;
    S.settings.queueSlotCount = remote.queues.length;
    /* 받은 내용이 곧 지금 화면이다. 이걸 안 적어 두면 다음 저장이
       "바뀌었다"고 판단해 같은 내용을 서버에 되쓰고, 그 메아리가 다시
       돌아오는 헛돌이가 생긴다. */
    lastWritten.session = js;
    sel=null; render();
    const nowPlaying = myPlayingCourt();
    if(nowPlaying && !prevPlaying) announceMyMatch(nowPlaying);
    else toast('다른 기기에서 변경되어 화면을 갱신했습니다');
  });
  window.addEventListener('beforeunload', ()=>unsub&&unsub());

  /* 설정도 받는다. 코트 수·경기 시간·성별 정책은 클럽 전체의 규칙인데
     여태 구독이 없어서, 한 태블릿에서 바꾸면 다른 태블릿은 새로고침할
     때까지 옛 규칙으로 배치를 돌렸다. */
  const unsubSet = Store.subscribe(K('settings'), (remote, info)=>{
    if(!remote || (info && info.local)) return;
    const js = JSON.stringify(remote);
    if(js === lastWritten.settings) return;
    S.settings = Object.assign(clone(DEFAULTS), remote,
                               { w:Object.assign({}, DEFAULTS.w, remote.w||{}) });
    lastWritten.settings = js;
    Sound.set(S.settings.sound !== false);
    Records.warmUp(S.settings.historyDays).catch(()=>{});
    render();
    if($('#scr-set') && $('#scr-set').classList.contains('on')) renderSet();
  });
  window.addEventListener('beforeunload', ()=>unsubSet&&unsubSet());

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
