/* =====================================================================
   드래그앤드롭 (Pointer Events) + 탭-투-무브 대체 경로
   HTML5 DnD는 태블릿에서 신뢰할 수 없어 직접 구현한다.
   드래그가 실패해도 "칩 탭 → 목적지 탭"으로 항상 이동할 수 있다.
   ===================================================================== */
(function(){
  let sx=0,sy=0,src=null,drag=false,srcEl=null,lastDrop=null,holdT=null;
  let downAt=0;                  // 손가락이 닿은 시각. 스크롤과 끌기를 가르는 기준이다
  let moved=false;               // MOVE_TOL을 넘겨 실제로 움직였나
  let team=null;                 // 팀째 끌 때의 출발지 키('court:1'·'queue:3'). 개인 드래그면 null
  let touchMode=false;           // 손가락인가(마우스와 규칙이 다르다)
  const ghost=$('#ghost');

  /* ── 끌기와 스크롤을 어떻게 가르는가 ──────────────────────────────

     손가락 하나로 하는 같은 동작이라 무언가로는 갈라야 한다. 세 번째 방식이다.

       1세대 — 8px만 움직이면 끌기. 스크롤하려던 손이 전부 끌기로 잡혔다.
       2세대 — 300ms 동안 가만히 있어야 끌기. 정확했지만 매번 0.3초를
               기다려야 해서, 칩 하나 옮기는 데 손이 멈칫하는 느낌이 났다.
       3세대 — 지금. 기다리지 않고 "움직임의 성질"로 가른다.

     실제로 두 동작은 이렇게 다르다.

       스크롤 : 손을 대자마자 곧바로 움직인다. 그리고 세로로만 움직인다.
       끌기   : 집을 것을 겨냥하느라 아주 잠깐 멈췄다가 움직이고,
                가려는 곳이 옆이면 가로로도 움직인다.

     그래서 두 가지를 본다.

       가로가 세로보다 우세하면 → 곧바로 끌기.
         이 앱에서 굴러가는 것(코트·대기열·대기 인원)은 전부 세로다.
         가로로 가는 손가락은 스크롤일 수가 없다. 판단을 기다릴 이유가 없다.

       세로인데 SCROLL_MS 안에 움직이기 시작했으면 → 스크롤.
         "찍자마자 위아래"가 이것이다. 그 뒤에 움직였으면 겨냥한 것이므로 끌기다.

     결과적으로 겨냥해서 집는 손은 움직이는 그 순간 바로 집히고(기다림 0),
     굴리려는 손은 예전처럼 그대로 굴러간다.

     HOLD_MS는 남겨 둔다 — 움직이지 않고 누르고만 있어도 집히는 길이다.
     집혔다는 진동이 손에 먼저 오므로, 옮길지 말지 생각하는 동안 붙잡아
     두기에 좋다.

     마우스는 이 규칙에서 뺀다. 마우스로 굴릴 때는 휠을 쓰지 끌지 않으므로
     헷갈릴 일이 없고, 누르고 기다리게 하면 굼떠서 답답하다. */
  const HOLD_MS   = 220;   // 움직이지 않고 누르고만 있어도 이만큼이면 집힌다
  const SCROLL_MS = 130;   // 닿고 이 안에 세로로 움직이기 시작하면 스크롤이다
  const MOVE_TOL  = 8;     // 이 안의 흔들림은 아직 아무 뜻도 아니다
  const DIR_BIAS  = 1.15;  // 가로가 세로보다 이만큼 크면 스크롤이 아니다

  document.addEventListener('pointerdown',e=>{
    const c=e.target.closest('[data-chip]');
    if(c){
      const id=c.dataset.chip;
      const L=locate(id);
      // 운영자가 아니면 자기 칩만, 그것도 코트 밖에서만 잡을 수 있다
      if(!Auth.can('edit')){
        if(!Auth.can('selfQueue') || !Auth.isMe(id)) return;
        if(L.kind==='court') return;
      }
      sx=e.clientX; sy=e.clientY; src=id; srcEl=c; team=null; drag=false;
      downAt=Date.now(); moved=false;
      touchMode = e.pointerType !== 'mouse';
      holdT=setTimeout(()=>begin(e), touchMode?HOLD_MS:160);
      return;
    }
    /* 팀 박스(코트 카드·대기 슬롯)를 통째로 끌기. 박스 안의 버튼·아이콘을
       누른 것이면 그건 그 버튼의 일이므로 드래그를 시작하지 않는다. */
    const s=e.target.closest('[data-team]');
    if(!s) return;
    if(e.target.closest('button,.ic,.mt')) return;
    if(!Auth.can('edit') || !Auth.can('courtAssign')) return;
    sx=e.clientX; sy=e.clientY; src=null; srcEl=s; team=s.dataset.team; drag=false;
    downAt=Date.now(); moved=false;
    touchMode = e.pointerType !== 'mouse';
    holdT=setTimeout(()=>begin(e), touchMode?HOLD_MS:160);
  });
  function begin(e){
    if(drag || (!src && team===null)) return;
    drag=true;
    ghost.innerHTML='';
    if(team!==null){
      srcEl.classList.add('team-drag');
      const [k,n]=team.split(':');
      const o = k==='court' ? S.courts.find(c=>c.no===+n) : S.queues.find(q=>q.index===+n);
      const ids=(o.teams.A.length?[...o.teams.A,...o.teams.B]:o.members);
      const names=ids.map(i=>(A(i)||{}).name).filter(Boolean);
      const label = k==='court' ? t('interact.drag.courtLabel',{n}) : 'Q'+n;
      const g=el('div','ghost-team',
        `<b>${label} · ${t('interact.drag.peopleCount',{count:names.length})}</b>`
        +`<span>${names.map(esc).join(' · ')}</span>`);
      ghost.appendChild(g);
    }else{
      srcEl.classList.add('ghost');
      const g=chipEl(src,'ghost'); g.style.width='100%'; ghost.appendChild(g);
    }
    ghost.style.display='block'; move(e);
    // 집혔다는 신호. 손가락은 화면을 가리므로 눈보다 손이 먼저 안다.
    if(touchMode) Sound.buzz(18);
  }
  function move(e){
    ghost.style.left=(e.clientX-85)+'px'; ghost.style.top=(e.clientY-32)+'px';
    ghost.style.display='block';
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const d=under?.closest('[data-drop]');
    if(lastDrop&&lastDrop!==d) lastDrop.classList.remove('drop');
    if(d){ d.classList.add('drop'); lastDrop=d; }
  }
  document.addEventListener('pointermove',e=>{
    if(!src && team===null) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    // 집힌 뒤에 움직였는지도 세어야 한다(눌러서 집는 길이 따로 있으므로).
    if(!moved && Math.hypot(dx,dy) > MOVE_TOL) moved=true;
    if(!drag){
      if(!moved) return;
      if(touchMode){
        /* 가로가 우세하면 스크롤일 수 없다 — 이 앱에서 굴러가는 것은 전부
           세로다. 기다리지 않고 곧바로 집는다. */
        const sideways = Math.abs(dx) > Math.abs(dy)*DIR_BIAS;
        /* 세로인데 닿자마자 움직이기 시작했다 = 스크롤이다. 붙잡지 않고
           놓아 준다(preventDefault를 하지 않았으므로 브라우저가 굴린다). */
        if(!sideways && Date.now()-downAt < SCROLL_MS){ cleanup(); return; }
      }
      clearTimeout(holdT); begin(e);
    }
    e.preventDefault(); move(e);
  },{passive:false});

  /* 끌기가 시작된 뒤에는 화면이 따라 굴러가면 안 된다.
     iOS에서는 pointermove의 preventDefault로 스크롤이 멈추지 않는다.
     touchmove를 직접 막아야 한다(passive:false 필수). */
  document.addEventListener('touchmove',e=>{ if(drag) e.preventDefault(); },{passive:false});
  document.addEventListener('pointerup',e=>{
    clearTimeout(holdT);
    if(!src && team===null) return;
    /* 집히기는 했는데 한 번도 움직이지 않았다면 놓은 것이 아니라 그냥 누른
       것이다(HOLD_MS로 집힌 경우). 굴리려다 잠깐 멈춘 손가락이 제자리에서
       떼어질 때 칩이 엉뚱한 자리로 가면 안 된다. */
    if(drag && moved){
      const under=document.elementFromPoint(e.clientX,e.clientY);
      const d=under?.closest('[data-drop]');
      const t=team, s=src;
      cleanup();
      if(d){ if(t!==null) moveTeamTo(t, d.dataset.drop); else moveTo(s, d.dataset.drop); }
    } else if(src) {                           // 탭 = 선택 토글 (개인 칩만)
      if(sel===src){ sel=null; } else { sel=src; }
      cleanup(); render();
    } else cleanup();
  });
  document.addEventListener('pointercancel',cleanup);
  function cleanup(){
    clearTimeout(holdT);
    if(srcEl) srcEl.classList.remove('ghost','team-drag');
    if(lastDrop) lastDrop.classList.remove('drop');
    ghost.style.display='none'; src=null; srcEl=null; drag=false; lastDrop=null; team=null;
    moved=false;
  }
  /* 탭-투-무브: 선택된 칩이 있을 때 드롭 영역을 탭하면 이동 */
  document.addEventListener('click',e=>{
    if(!sel) return;
    if(e.target.closest('[data-chip]')) return;
    const d=e.target.closest('[data-drop]'); if(!d) return;
    const id=sel; sel=null; moveTo(id,d.dataset.drop);
  });

  /* ── 더블탭 / 더블클릭 = 다음 단계로 ──────────────────────────
     같은 대상을 340ms 안에 두 번 두드리면 advance로 넘긴다.
     마우스의 dblclick만 쓰면 태블릿에서 동작하지 않으므로 포인터
     이벤트로 직접 센다. 끌기가 있었던 직후는 세지 않는다. */
  const DOUBLE_MS=340;
  let tapKey=null, tapAt=0;
  function targetKey(e){
    if(e.target.closest('button,.ic,.mt,.seg,.tab,input,select,.grip')) return null;
    const c=e.target.closest('[data-chip]');
    if(c) return 'chip:'+c.dataset.chip;
    const box=e.target.closest('.court,.slot');
    if(box && box.dataset.drop) return 'box:'+box.dataset.drop;
    return null;
  }
  document.addEventListener('pointerup',e=>{
    if(drag){ tapKey=null; return; }          // 방금 끌었다면 탭이 아니다
    const k=targetKey(e);
    if(!k){ tapKey=null; return; }
    const t=Date.now();
    if(tapKey===k && t-tapAt<DOUBLE_MS){
      tapKey=null; sel=null;
      if(k.startsWith('chip:')) advanceChip(k.slice(5));
      else                      advanceTeam(k.slice(4));
      return;
    }
    tapKey=k; tapAt=t;
  });

  /* ── 아이패드 더블탭 확대 막기 ────────────────────────────────
     아이패드는 사파리든 크롬이든 속이 WebKit이라 똑같이 동작한다.
     막는 방법을 셋 다 써 봐야 한다.
       · <meta viewport>의 user-scalable=no → iOS 10부터 무시된다
       · CSS touch-action:manipulation      → iOS에서는 잘 안 먹는다
       · 두 번째 탭의 기본 동작을 직접 막기  → 이건 먹는다
     앞의 둘은 다른 기기(안드로이드·데스크톱)에서 값을 하므로 그대로 두고,
     여기서 마지막 하나를 더한다.

     같은 자리를 짧은 시간에 두 번 두드렸을 때만 막는다. 서로 다른 곳을
     빠르게 연달아 누르는 것까지 막으면 멀쩡한 조작이 씹힌다.
     입력칸과 글을 읽는 곳(도움말)은 건드리지 않는다 — 거기서 더블탭은
     단어 선택이라는 제 뜻이 있다.

     touchend의 기본 동작을 막으면 확대와 함께 뒤따르는 click 합성도
     사라진다. 이 앱에서 두 번째 탭은 "다음 단계로 보내기"라는 조작이고
     그 처리는 pointerup이 이미 했으므로, click이 한 번 덜 오는 편이 맞다. */
  let zAt=0, zX=0, zY=0;
  document.addEventListener('touchend', e=>{
    if(e.target.closest('input,textarea,select,.doc')) return;
    const p = e.changedTouches && e.changedTouches[0];
    if(!p) return;
    const t = Date.now();
    if(t-zAt < 400 && Math.abs(p.clientX-zX) < 32 && Math.abs(p.clientY-zY) < 32){
      e.preventDefault();
    }
    zAt=t; zX=p.clientX; zY=p.clientY;
  }, { passive:false });   // passive면 preventDefault가 무시된다
})();

/* =====================================================================
   보드 조작 이벤트
   ===================================================================== */
document.addEventListener('click',e=>{
  const t=e.target;
  const scr=t.closest('[data-scr]'); if(scr) return show(scr.dataset.scr);


  const clr=t.closest('[data-clear]');
  if(clr){ if(!requirePerm('edit')) return; Sound.play('tap');
    const q=S.queues.find(q=>q.index===+clr.dataset.clear);
    return tx(()=>{ q.members.forEach(i=>A(i).state='POOL');
      Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',notice:null}); }); }



  const mt=t.closest('[data-mt]');
  if(mt){ if(!requirePerm('edit')) return; Sound.play('tap');
    const [k,n]=mt.dataset.mt.split(':');
    const o=k==='court'?S.courts.find(c=>c.no===+n):S.queues.find(q=>q.index===+n);
    return typeDialog(o,k); }
});

$('#autoTgl').onclick=()=>{ if(!requirePerm('edit')) return;
  Sound.play('tap'); tx(()=>{S.settings.autoMode=!S.settings.autoMode;}); };
$('#btnSort').onclick=()=>{ if(!requirePerm('edit')) return; Sound.play('confirm'); tx(()=>{
  // 자동으로 만들어진 슬롯만 비우고 다시 짠다. 손으로 구성했거나(MANUAL),
  // 리벤지로 올렸거나, 유형 핀이 걸린 슬롯은 그대로 둔다.
  // (이전에는 조건이 정반대라 눌렀을 때 잠가 둔 팀이 오히려 부서졌다.)
  let n=0;
  S.queues.forEach(q=>{
    if(!q.members.length) return;
    if(q.origin!=='AUTO' || q.pinnedType) return;   // 손으로 짠 팀·리벤지·유형 지정은 건드리지 않는다
    q.members.forEach(i=>A(i).state='POOL');
    Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',notice:null});
    n++;
  });
  toast(n? t('interact.board.resortDone',{n}) : t('interact.board.resortNone'));
}); };
/* 회원 본인 출석/퇴장 */
$('#myBtn').onclick=()=>{
  if(!requirePerm('selfCheckIn')) return;
  const id=Auth.memberId; if(!id) return;
  const a=Auth.myAttendee();
  if(a){
    if(a.state==='PLAYING') return toast(t('interact.board.cannotLeaveWhilePlaying'));
    if(!confirm(t('interact.board.confirmCheckOut'))) return;
    Sound.play('tap'); tx(()=>checkOutMember(id));
    toast(t('interact.board.checkedOut'));
  }else{
    Sound.play('confirm'); tx(()=>checkInMember(id));
    toast(t('interact.board.checkedIn'));
  }
};

$('#btnUndo').onclick=()=>{ if(!requirePerm('edit')) return; Sound.play('tap'); undo(); };

/* 게스트 전용 — 회원·운영자로 다시 입장 */
$('#btnEnter').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };

/* ── 모달 ───────────────────────────────────────────────────────── */
function openModal(html){ $('#modal').innerHTML=html; $('#mask').classList.add('on'); }
function closeModal(){ $('#mask').classList.remove('on'); }

/* 비밀번호 확인이 실패한 이유별 안내. 게이트와 모달이 같이 쓴다. */
/* 게터로 둔다 — 값을 한 번만 굳히면 언어를 바꿔도(Lang.set) 이미 읽어 둔
   문구가 그대로 남는다. 접근할 때마다 t()를 다시 불러야 언어 전환이 먹는다. */
const ADMIN_ERR = {
  get wrong()  { return t('interact.pin.errWrong'); },
  get offline(){ return t('interact.pin.errOffline'); },
  get unset()  { return t('interact.pin.errUnset'); },
  get full()   { return t('interact.pin.errFull'); },
  get locked() { return t('interact.pin.errLocked'); }
};
const mmss = ms => { const secs=Math.ceil(ms/1000); return t('interact.pin.duration',{m:Math.floor(secs/60), s:secs%60}); };

/* 되돌릴 수 없는 조작 앞에 관리 비밀번호를 묻는다. 맞으면 onOk()를 부른다.
   opts.bodyHtml : 비밀번호 칸 위에 넣을 설명(이 조작이 어떤 결과를 낳는지).
                   여기 들어가는 HTML은 만드는 쪽에서 esc() 해서 넘긴다.
   opts.okLabel  : 확인 버튼 문구
   opts.onReady  : 모달이 그려진 뒤 불린다(설명 안의 버튼을 묶을 때 쓴다)
   opts.kind     : 'admin'(기본) | 'owner' — 어느 비밀번호로 확인할지 */
function askPin(title, desc, onOk, opts={}){
  openModal(`<h3>${esc(title)}</h3><div class="sub">${esc(desc)}</div>
    ${opts.bodyHtml||''}
    <div class="hint" style="text-align:center;margin-bottom:4px">${t('interact.pin.prompt')}</div>
    <!-- 네 자리 숫자 시절의 흔적(maxlength=8, 숫자 키패드)을 걷어냈다.
         그대로 두면 여덟 자를 넘는 비밀번호가 소리 없이 잘려서, 맞게 넣어도
         계속 "틀렸다"고 나온다. -->
    <div style="display:flex;justify-content:center;margin:6px 0 4px">
      <input type="password" id="pinIn" autocomplete="off" maxlength="64"
             style="width:260px;height:56px;font-size:20px;text-align:center">
    </div>
    <div id="pinErr" style="text-align:center;color:var(--cork);font-size:13px;font-weight:700;min-height:20px"></div>
    <div class="row end"><button class="btn" id="pinCancel">${t('interact.pin.cancel')}</button>
      <button class="btn warn" id="pinOk">${esc(opts.okLabel||t('interact.pin.confirm'))}</button></div>`);
  if(opts.onReady) opts.onReady();
  const inp=$('#pinIn');
  setTimeout(()=>inp&&inp.focus(),50);
  /* 확인은 서버에 물어본다(Secret.verify). 비밀번호가 틀린 것과 통신이
     안 되는 것을 반드시 구분한다 — 뭉뚱그리면 오프라인일 때 "비밀번호가
     틀렸다"고 거짓말을 하게 되고, 운영자가 멀쩡한 비번을 의심한다. */
  const submit=async()=>{
    const btn=$('#pinOk'); if(btn.disabled) return;
    btn.disabled=true; $('#pinErr').textContent=t('interact.pin.checking');
    const v = await Secret.verify(inp.value);
    btn.disabled=false;
    if(v.ok){ closeModal(); onOk(); return; }
    /* 시도 제한은 Secret이 센다(입장 화면과 같은 기록을 쓴다). 잠겼으면
       확인 버튼을 막고 남은 시간을 알려 준다 — 계속 누르게 두면 잠긴 줄
       모르고 "비밀번호가 틀렸나" 하며 애먼 비번을 의심한다. */
    if(v.reason==='locked'){
      btn.disabled=true;
      $('#pinErr').textContent = t('interact.pin.lockedRetry',{locked:ADMIN_ERR.locked, time:mmss(v.ms||0)});
      return;
    }
    $('#pinErr').textContent = ADMIN_ERR[v.reason] || t('interact.pin.errGeneric');
    inp.value=''; inp.focus();
  };
  $('#pinOk').onclick=submit;
  $('#pinCancel').onclick=closeModal;
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); });
}
$('#mask').addEventListener('click',e=>{ if(e.target===$('#mask')) closeModal(); });

/* 이 기기에서 마지막으로 고른 경기 점수(21/25). 한 동호회는 대개 한 가지로
   치므로, 다음 창에서 그 쪽을 미리 켜 두면 묻는 단계가 사실상 한 번 누르는
   것으로 끝난다. 저장하지 않는다 — 이 기기의 이번 실행에만 남는 습관이다. */
let lastWinTarget = null;

/* ── 경기 결과 입력 ──────────────────────────────────────────────
   경기를 마칠 때도, 묶인 사람을 풀 때도, 기록을 나중에 고칠 때도 이 창
   하나를 쓴다. m은 {A,B,An,Bn,win,sw,sl} 모양이면 무엇이든 된다.

   ── 왜 한 화면에 다 두지 않는가 ────────────────────────────────
   점수 버튼 15개 + 팀 구성 + 승자 버튼을 한 창에 쌓으니 폰에서 스크롤이
   생겼다. 스크롤이 생기는 순간 "다 채웠나"를 확인하려면 위아래로 훑어야
   하고, 그 확인이 귀찮아서 결과를 안 적게 된다. 그래서 한 번에 하나씩만
   묻는다. 창은 늘 작고, 눈은 늘 한 곳만 본다.

     1) 진 팀 점수는?      10~24 버튼 (그 밖은 직접 입력)
     2) 몇 점 경기였나?    20점 이하일 때만 — 21점제인지 25점제인지
     3) 이긴 팀은?         누르면 그대로 저장

   ── 2단계를 왜 묻는가 ──────────────────────────────────────────
   진 팀이 15점이면 이긴 팀은 21점일 수도 25점일 수도 있다. 진 팀 점수
   하나로는 정해지지 않는다. 21점 이상으로 졌다면 21점제에서는 듀스뿐이라
   설정값(한 게임 점수)으로 계산하고 묻지 않는다 — 흔치 않은 경우까지
   매번 물으면 그게 다시 마찰이 된다.

   ── 3단계의 팀 구성 ────────────────────────────────────────────
   네 사람을 둘씩 나누는 방법은 딱 세 가지뿐이다. 그래서 '팀 구성 바꾸기'는
   그 세 가지를 돌린다 — 실제로 친 짝이 보일 때까지 누르면 된다. 끌어다
   놓게 하는 것보다 이쪽이 훨씬 빠르고, 손가락이 빗나갈 일도 없다.

   opts.onSave(result, roster) — result.win이 null이면 승패 없이.
     roster는 팀 구성을 고쳤을 때만 온다({A:[{id,name}], B:[…]}), 아니면 null.
   ───────────────────────────────────────────────────────────── */
function resultDialog(m, opts={}){
  const clubTarget = S.settings.winPoint || 21;
  const BTNS = Array.from({length:15},(_,i)=>10+i);      // 10~24
  const nameAt = (arr,names,i) => (names&&names[i]) || (A(arr[i])&&A(arr[i]).name) || '?';
  const origA = (m.A||[]).map((id,i)=>({id, name:nameAt(m.A, m.An, i)}));
  const origB = (m.B||[]).map((id,i)=>({id, name:nameAt(m.B, m.Bn, i)}));
  const people = [...origA, ...origB];
  const canPair = people.length===4;
  // 넷을 둘씩 나누는 세 가지 방법. 첫 번째가 지금 기록된 구성이다.
  const PAIRS = [[[0,1],[2,3]], [[0,2],[1,3]], [[0,3],[1,2]]];

  let pairIdx = 0;
  let win = null;                    // 마지막 확인 단계에서만 쓴다
  let lose = (m.sl==null) ? null : +m.sl;
  // 이미 적힌 기록을 여는 경우에는 그 점수에서 경기 점수를 되짚는다.
  let target = (m.sw!=null && m.sl!=null && m.sw>=25 && m.sl<=20) ? 25
             : (lastWinTarget || clubTarget);
  let step = 1, custom = false;

  const rosterNow = () => canPair
      ? { A: PAIRS[pairIdx][0].map(k=>people[k]), B: PAIRS[pairIdx][1].map(k=>people[k]) }
      : { A: origA.slice(), B: origB.slice() };
  const rosterOut = () => pairIdx ? rosterNow() : null;
  const swOf = () => lose==null ? null : winnerScore(lose, target);
  const nameLine = arr => arr.map(p=>esc(p.name)).join(' · ') || '—';

  const head = sub => `<h3>${esc(opts.title||t('interact.result.defaultTitle'))}</h3>
                       <div class="sub">${sub}</div>`;

  /* 몇 단계짜리 흐름인가. 20점 이하로 졌을 때만 '몇 점 경기' 단계가 끼므로
     번호가 흔들린다. 화면에 적히는 숫자는 실제 흐름과 맞아야 한다. */
  const hasGameStep = () => lose!=null && lose<=20;
  const total = () => hasGameStep() ? 4 : 3;
  const stepNo = () => step<=2 ? step : (hasGameStep() ? step : step-1);
  const tag = () => `<b>${stepNo()}/${total()}</b>`;

  function draw(){
    const box = $('#modal');
    if(step===1) box.innerHTML = head(`<b>1/${total()}</b> ${t('interact.result.scoreQuestion')}`) + `
      <div class="sgrid">
        ${BTNS.map(n=>`<button class="btn sm sc${!custom&&lose===n?' on':''}" data-sc="${n}">${n}</button>`).join('')}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm${custom?' on':''}" id="rsCustom">${t('interact.result.customInput')}</button>
        ${custom?`<input type="number" id="scIn" inputmode="numeric" min="0" max="40"
                    value="${lose==null?'':lose}" style="width:92px;text-align:center">
                  <button class="btn sm primary" id="scOk">${t('interact.result.confirmScore')}</button>`:''}
        <span class="spacer"></span>
        <button class="btn sm" id="rsNoScore">${t('interact.result.noScore')}</button>
      </div>
      <div class="row end"><button class="btn" id="rsCancel">${t('interact.result.cancel')}</button></div>`;

    else if(step===2) box.innerHTML = head(`${tag()} ${t('interact.result.gameQuestion')}`) + `
      <div class="hint" style="margin-bottom:10px">${t('interact.result.gameHint',{lose})}</div>
      <div class="wpick">
        ${[21,25].map(gt=>`<button class="btn wbtn${target===gt?' on':''}" data-t="${gt}">
            <span class="wsub">${t('interact.result.gameLabel',{gt})}</span>
            <b class="num">${winnerScore(lose,gt)} : ${lose}</b></button>`).join('')}
      </div>
      <div class="row end">
        <button class="btn" id="rsBack">${t('interact.result.back')}</button>
        <button class="btn" id="rsCancel">${t('interact.result.cancel')}</button></div>`;

    else if(step===3){
      const r = rosterNow();
      box.innerHTML = head(`${tag()} ${t('interact.result.winnerQuestion')}`) + `
      <div class="hint" style="margin-bottom:10px">
        ${lose==null ? t('interact.result.noScoreRecord')
                     : `<b class="num" style="font-size:19px;color:var(--text)">${swOf()} : ${lose}</b>`}</div>
      <div class="wteam">
        ${['A','B'].map(s=>`<button class="btn wbtn big" data-win="${s}">
            <span class="wtag">${t('interact.result.teamTag',{team:s})}</span>
            <span class="wnm">${nameLine(r[s])}</span></button>`).join('')}
      </div>
      ${canPair?`<div class="row" style="margin-top:10px">
          <button class="btn sm" id="rsPair">${t('interact.result.swapTeams')}</button>
          <span class="hint">${t('interact.result.swapHint',{n:pairIdx+1})}</span></div>`:''}
      <div class="row end">
        <button class="btn" id="rsBack">${t('interact.result.back')}</button>
        <button class="btn" id="rsNone">${esc(opts.noneLabel||t('interact.result.noneDefault'))}</button>
        <button class="btn" id="rsCancel">${t('interact.result.cancel')}</button></div>`;
    }

    /* 마지막 확인. 여기서 저장을 누르는 순간 경기가 끝나거나 기록이
       바뀐다 — 되돌릴 길(↩·기록 화면)이 있어도, 되돌려야 할 일을 아예
       만들지 않는 편이 낫다. 무엇이 저장되는지 한 화면에 다 보여 준다. */
    else {
      const r = rosterNow();
      box.innerHTML = head(`${tag()} ${t('interact.result.saveQuestion')}`) + `
      <div class="wteam">
        ${['A','B'].map(s=>`<div class="wrow${win===s?' win':''}">
            <span class="wtag">${t('interact.result.teamTag',{team:s})}</span>
            <span class="wnm">${nameLine(r[s])}</span>
            <span class="wsc num">${
              win==null ? '' : (s===win ? (swOf()==null?t('interact.result.winMark'):swOf()) : (lose==null?t('interact.result.loseMark'):lose))
            }</span></div>`).join('')}
      </div>
      <div class="hint" style="margin-top:10px">
        ${win==null ? t('interact.result.summaryNoResult')
          : lose==null ? t('interact.result.summaryWinNoScore',{team:win})
          : t('interact.result.summaryWinScore',{team:win, sw:swOf(), sl:lose})}
        ${pairIdx ? t('interact.result.rosterChangedNote') : ''}
      </div>
      <div class="row end">
        <button class="btn" id="rsBack">${t('interact.result.back')}</button>
        <button class="btn primary" id="rsSave">${
          esc(win ? (opts.okLabel||t('interact.result.saveDefault')) : (opts.noneLabel||t('interact.result.saveNoneDefault')))
        }</button></div>`;
    }
    bind();
  }

  /* 점수를 정하면 다음 단계로 넘어간다. 20점 이하일 때만 경기 점수를
     한 번 더 묻는다(21점제인지 25점제인지). */
  function chose(n){
    lose = n;
    Sound.play('tap');
    step = (n!=null && n<=20) ? 2 : 3;
    if(step===3 && n!=null) target = lastWinTarget || clubTarget;
    draw();
  }

  function bind(){
    const cancel = $('#rsCancel'); if(cancel) cancel.onclick = closeModal;
    const back = $('#rsBack');
    if(back) back.onclick = ()=>{
      step = step===4 ? 3 : (step===3 && hasGameStep()) ? 2 : 1;
      draw();
    };

    if(step===1){
      $$('#modal .btn.sc').forEach(b=>b.onclick=()=>{ custom=false; chose(+b.dataset.sc); });
      $('#rsNoScore').onclick = ()=>{ custom=false; chose(null); };
      $('#rsCustom').onclick  = ()=>{ custom=!custom; draw();
        const i=$('#scIn'); if(i) setTimeout(()=>i.focus(),40); };
      const inp=$('#scIn');
      if(inp){
        const ok = ()=>{ const v=inp.value.trim();
          chose(v==='' ? null : Math.max(0, Math.min(40, Math.round(+v)||0))); };
        $('#scOk').onclick = ok;
        inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); });
      }
    }
    else if(step===2){
      $$('#modal .wbtn').forEach(b=>b.onclick=()=>{
        target = +b.dataset.t; lastWinTarget = target;
        Sound.play('tap'); step=3; draw();
      });
    }
    else if(step===3){
      $$('#modal .wbtn').forEach(b=>b.onclick=()=>{
        win = b.dataset.win; Sound.play('tap'); step=4; draw();
      });
      const p=$('#rsPair');
      if(p) p.onclick=()=>{ pairIdx=(pairIdx+1)%3; Sound.play('move'); draw(); };
      // 승패 없이도 확인 단계를 거친다 — 저장은 한 곳에서만 일어난다.
      $('#rsNone').onclick = ()=>{ win=null; Sound.play('tap'); step=4; draw(); };
    }
    else {
      $('#rsSave').onclick = ()=>{
        closeModal();
        /* skipOnNone — '승패 없이'가 단순한 빈칸이 아니라 "안 적기로 했다"는
           선택이 되는 경우. 결과 기록 강제에서 묶인 사람을 푸는 유일한
           구멍이라 그 표시(skip)를 함께 넘긴다. */
        opts.onSave && opts.onSave(
          win ? { win, sw: swOf(), sl: lose }
              : { win:null, sw:null, sl:null, skip:!!opts.skipOnNone },
          rosterOut());
      };
    }
  }

  openModal('');
  draw();
}

function typeDialog(o,kind){
  if(o.members.length!==4){
    const opts=['MD','WD','XD','MX'];
    return openModal(`<h3>${t('interact.type.slotTitle')}</h3>
      <div class="sub">${t('interact.type.slotDesc')}</div>
      ${opts.map(mt=>`<div class="opt ${o.pinnedType===mt?'on':''}" data-p="${mt}"><div class="t">${MT_LBL[mt]}</div></div>`).join('')}
      <div class="opt ${!o.pinnedType?'on':''}" data-p=""><div class="t">${t('interact.type.noneOption')}</div></div>
      <div class="row end"><button class="btn" onclick="closeModal()">${t('interact.type.close')}</button></div>`),
      $$('#modal .opt').forEach(e=>e.onclick=()=>{ closeModal();
        tx(()=>{ o.pinnedType=e.dataset.p||null; o.notice=null;
          if(o.pinnedType&&o.members.length){ o.members.forEach(i=>A(i).state='POOL');
            Object.assign(o,{members:[],teams:{A:[],B:[]},matchType:null,pinnedType:o.pinnedType}); } }); });
  }
  const ids=o.members, [m,f]=counts(ids);
  const avail={ MD:m===4, WD:f===4, XD:(m===2&&f===2), MX:!(m===4||f===4) };
  const why={ MD:m===4?'':t('interact.type.reasonFemale',{f}), WD:f===4?'':t('interact.type.reasonMale',{m}),
              XD:(m===2&&f===2)?'':t('interact.type.reasonNotMixed'), MX:(m===4||f===4)?t('interact.type.reasonSameGender'):'' };
  const prev=mt=>{ const sp=bestSplit(ids,mt==='MD'||mt==='WD'?null:mt); if(!sp) return '';
    return sp.teams.A.map(i=>esc(A(i).name)).join('·')+' vs '+sp.teams.B.map(i=>esc(A(i).name)).join('·'); };
  const label = kind==='court' ? t('interact.drag.courtLabel',{n:o.no}) : 'Q'+o.index;
  openModal(`<h3>${t('interact.type.dialogTitle',{label})}</h3>
    <div class="sub">${ids.map(i=>`${A(i).gender==='M'?'♂':A(i).gender==='F'?'♀':'?'}${esc(A(i).name)}`).join('  ')}</div>
    ${['MD','WD','XD','MX'].map(mt=>`
      <div class="opt ${o.matchType===mt?'on':''} ${avail[mt]?'':'off'}" ${avail[mt]?`data-t="${mt}"`:''}>
        <div><div class="t">${MT_LBL[mt]}</div>
        <div class="d">${avail[mt]?prev(mt):t('interact.type.unavailable',{reason:why[mt]})}</div></div></div>`).join('')}
    <div class="row end"><button class="btn" onclick="closeModal()">${t('interact.type.cancel')}</button></div>`);
  $$('#modal .opt[data-t]').forEach(e=>e.onclick=()=>{ const t=e.dataset.t; closeModal();
    tx(()=>{ const sp=bestSplit(ids,t==='MD'||t==='WD'?null:t);
      if(sp){o.teams=sp.teams;} o.matchType=mtypeOf(ids,o.teams); o.typeSource='MANUAL'; },{auto:false}); });
}
