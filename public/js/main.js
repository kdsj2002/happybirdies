/* =====================================================================
   부팅
   ===================================================================== */
(async function boot(){
  await Store.init();

  // 읽기가 하나라도 실패하면 안전 모드로 들어가 저장을 잠근다.
  // 반쪽 상태를 저장해 클라우드 데이터를 덮어쓰는 것이 가장 위험하다.
  // 설정과 회원 명단은 strict로 읽는다 — 오프라인 캐시가 "문서 없음"이라고
  // 답하는 것을 "데이터 없음"으로 받아들이지 않기 위해서다. 오늘 세션은
  // 아직 없는 것이 정상이므로(하루의 첫 접속) strict를 걸지 않는다.
  const rSet = await Store.getSafe(K('settings'), {strict:true});
  const rMem = await Store.getSafe(K('members'),  {strict:true});
  const rSes = await Store.getSafe(K('session:'+S.date));
  const failed = [!rSet.ok&&'설정', !rMem.ok&&'회원 명단', !rSes.ok&&'오늘 세션'].filter(Boolean);

  const st=rSet.value;
  if(st) S.settings=Object.assign(clone(DEFAULTS),st,{w:Object.assign({},DEFAULTS.w,st.w||{})});
  settingsTrusted = rSet.ok;    // 못 읽은 설정은 클라우드에 쓰지 않는다
  S.members=rMem.value||[];
  // 제대로 읽었을 때만 기준선을 잡는다. 기준선이 없으면 회원 문서에는
  // 아무것도 쓰지 않는다(actions.js의 save 참고).
  if(rMem.ok){
    setMembersBaseline(S.members);
    lastWritten.members = JSON.stringify(S.members);   // 읽은 그대로를 다시 쓸 필요는 없다
  }
  if(failed.length){
    setSafeMode(true, failed.join('·')+'을(를) 불러오지 못했습니다. 저장이 잠겼습니다 — 새로고침해 주세요');
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
  applyRole();
  render();
  if(!restored) Gate.start();
  else if(Auth.isAdmin && !S.members.length){ show('mem');
    setTimeout(()=>toast('회원을 먼저 등록하세요 — CSV 일괄등록이 빠릅니다'),500); }

  // 브라우저는 첫 사용자 조작 전에는 소리를 못 내게 막는다. 아무 터치에서 깨운다.
  ['pointerdown','keydown'].forEach(ev=>
    window.addEventListener(ev, ()=>Sound.unlock(), {once:true}));
  if(Store.mode!=='firebase'){
    const cfg = window.__fbReadCfg && window.__fbReadCfg();
    if(!cfg) setTimeout(()=>toast('설정 → 저장소에서 Firebase를 연결할 수 있습니다 (지금은 이 기기에만 저장됨)'),1200);
  }

  /* 다른 태블릿에서 같은 날짜 세션을 저장하면 실시간으로 반영한다.
     내가 방금 저장한 직후의 에코는 짧은 시간창으로 걸러 깜빡임을 막는다. */
  let lastLocalSave=0;
  const origSave=save;
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

  try{ if('wakeLock' in navigator){ let wl=await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange',async()=>{ if(document.visibilityState==='visible')
      try{wl=await navigator.wakeLock.request('screen');}catch{} }); } }catch{}
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
