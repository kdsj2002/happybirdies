/* =====================================================================
   첫 접속 화면 — 운영자 / 회원 / 게스트 선택
   ===================================================================== */
const Gate = (() => {
  const box = () => $('#gate');

  function open(html){ box().innerHTML = html; box().classList.add('on'); }
  function close(){ box().classList.remove('on'); }

  /* ── 회원 입장 보호 ───────────────────────────────────────────────
     예전에는 이 화면이 회원 명단을 이름 그대로 펼쳐 놓았다. 게스트가
     들어와 명단을 통째로 읽을 수 있었고, 아무 이름이나 눌러 남의 이름으로
     입장할 수도 있었다. 이제는 이름의 마지막 글자를 가려서 보여 주고
     (김철수 → 김철○), 그 한 글자를 정확히 입력해야 입장시킨다.
     3번 틀리면 이 기기에서 3분 동안 잠근다.

     한계는 분명히 해 둔다. 명단은 여전히 브라우저 메모리와 Firestore에
     그대로 있고, 익명 읽기가 열려 있는 한 마음먹은 사람은 읽을 수 있다.
     이건 "지나가다 남의 이름을 보거나 눌러 보는 것"을 막는 장치지 인증이
     아니다. 진짜로 막으려면 실제 로그인과 역할 문서가 필요하다.
     ───────────────────────────────────────────────────────────────── */
  const MAX_TRY = 3;
  const LOCK_MS = 3 * 60 * 1000;
  const LOCK_KEY = 'bmt:memberGate';

  const lockRead  = () => { try{ return JSON.parse(localStorage.getItem(LOCK_KEY)||'{}')||{}; }catch{ return {}; } };
  const lockWrite = s  => { try{ localStorage.setItem(LOCK_KEY, JSON.stringify(s)); }catch{} };
  // 새로고침으로 초기화되면 안 되므로 시도 횟수와 해제 시각은 localStorage에 둔다.
  const lockLeftMs = () => { const s=lockRead(); return (s.until && s.until>Date.now()) ? s.until-Date.now() : 0; };
  const triesLeft  = () => Math.max(0, MAX_TRY - (lockRead().fails||0));
  function noteFail(){
    const s = lockRead();
    s.fails = (s.fails||0) + 1;
    if(s.fails >= MAX_TRY){ s.fails = 0; s.until = Date.now() + LOCK_MS; }
    lockWrite(s);
  }
  const clearFails = () => lockWrite({});

  // 마지막 한 글자만 가린다. 한 글자짜리 이름은 가리면 아무것도 남지 않아 그대로 둔다.
  const chars    = n => [...String(n||'')];
  const maskName = n => { const a=chars(n); return a.length<2 ? a.join('') : a.slice(0,-1).join('')+'○'; };
  const lastChar = n => { const a=chars(n); return a.length ? a[a.length-1] : ''; };

  function screenHome(){
    open(`
      <div class="gate-card">
        <div class="gate-title">${esc(S.settings.clubName || '대진판')}</div>
        <div class="gate-sub">어떻게 입장하시겠어요?</div>
        <button class="gate-btn" data-go="admin">
          <b>운영자</b><span>대진 배정과 설정을 모두 관리합니다 · 비밀번호 필요</span></button>
        <button class="gate-btn" data-go="member">
          <b>회원</b><span>내 경기 알림을 받습니다 · 코트 수동 배정은 제한됩니다</span></button>
        <button class="gate-btn" data-go="guest">
          <b>게스트</b><span>처음 오셨나요? 회원 등록을 하거나 구경만 할 수 있습니다</span></button>
      </div>`);
    box().querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
      Sound.unlock(); Sound.play('tap');
      const g=b.dataset.go;
      if(g==='admin') screenAdmin();
      else if(g==='member') screenMember();
      else screenGuest();
    });
  }

  function screenAdmin(){
    open(`
      <div class="gate-card">
        <div class="gate-title">운영자 입장</div>
        <div class="gate-sub">관리 비밀번호를 입력하세요. 동시 접속은 2명까지입니다.</div>
        <input type="password" id="gPin" inputmode="numeric" maxlength="8" autocomplete="off"
               style="width:100%;height:56px;font-size:26px;letter-spacing:.4em;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="gOk" style="flex:2">입장</button>
        </div>
      </div>`);
    const inp=$('#gPin'); setTimeout(()=>inp&&inp.focus(),60);
    const go=async()=>{
      $('#gOk').disabled=true;
      const res=await Auth.loginAdmin(inp.value);
      $('#gOk').disabled=false;
      if(res.ok){
        Sound.play('confirm'); close(); enter();
        if(res.offline) toast('클라우드 미연결 — 동시 접속 제한은 적용되지 않습니다');
      }else if(res.reason==='full'){
        Sound.play('error');
        $('#gErr').textContent='운영자 2명이 이미 접속해 있습니다. 잠시 후 다시 시도하세요.';
      }else{
        Sound.play('error');
        $('#gErr').textContent='비밀번호가 맞지 않습니다'; inp.value=''; inp.focus();
      }
    };
    $('#gOk').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  function screenMember(){
    if(lockLeftMs() > 0) return screenLocked();
    const list=S.members.filter(m=>m.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!list.length){
      open(`<div class="gate-card"><div class="gate-title">회원 입장</div>
        <div class="gate-sub">아직 등록된 회원이 없습니다. 게스트로 입장해 등록해 주세요.</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="gGuest" style="flex:2">게스트로</button></div></div>`);
      $('#gBack').onclick=screenHome; $('#gGuest').onclick=screenGuest; return;
    }
    /* 가린 이름이 같은 사람들(김철수·김철민 → 둘 다 "김철○")은 한 줄로 묶는다.
       똑같이 생긴 줄이 여러 개면 어느 쪽이 나인지 고를 수가 없어서다.
       누구인지는 입력한 글자가 가린다. */
    const groups = new Map();
    list.forEach(m=>{
      const k = maskName(m.name);
      if(!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    });
    const keys = [...groups.keys()];

    open(`
      <div class="gate-card wide">
        <div class="gate-title">회원 입장</div>
        <div class="gate-sub">본인 이름을 고른 뒤, 가려진 마지막 글자를 입력하세요.</div>
        <input type="text" id="gQ" placeholder="보이는 부분으로 검색 (예: 김철 · ㄱㅊ)" style="width:100%">
        <div class="gate-list" id="gList"></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="gBack" style="width:100%">뒤로</button></div>
      </div>`);
    const draw=(q='')=>{
      const el=$('#gList');
      /* 검색도 가려진 글자를 뺀 부분에만 건다. 이름을 통째로 넣어 보면서
         맞는지 확인하는 우회로를 막기 위해서다. */
      const f=keys.filter(k=>matchQ(k.replace(/○$/,''), q.trim()));
      el.innerHTML = f.length? f.map(k=>`<button class="gate-name" data-k="${esc(k)}">${esc(k)}</button>`).join('')
                             : '<div class="gate-empty">일치하는 이름이 없습니다</div>';
      el.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{
        Sound.play('tap'); screenVerify(b.dataset.k, groups.get(b.dataset.k)||[]);
      });
    };
    draw();
    $('#gQ').oninput=e=>draw(e.target.value);
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* 가려진 마지막 글자를 확인한다. 맞아야만 그 사람으로 입장한다. */
  function screenVerify(masked, group){
    if(lockLeftMs() > 0) return screenLocked();
    // 한 글자 이름은 가릴 것이 없으니 확인할 것도 없다.
    if(group.length===1 && chars(group[0].name).length < 2) return passGate(group[0]);

    open(`
      <div class="gate-card">
        <div class="gate-title">본인 확인</div>
        <div class="gate-sub">가려진 마지막 글자 한 자를 입력하세요.</div>
        <div class="gate-mask">${esc(masked)}</div>
        <input type="text" id="vC" maxlength="1" autocomplete="off" autocorrect="off"
               style="width:100%;height:56px;font-size:30px;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="gate-tries">남은 시도 <b id="vLeft">${triesLeft()}</b>번 ·
          ${MAX_TRY}번 틀리면 3분 동안 잠깁니다</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="vOk" style="flex:2">입장</button>
        </div>
      </div>`);
    const inp=$('#vC'); setTimeout(()=>inp&&inp.focus(),60);
    const go=()=>{
      const v=(inp.value||'').trim();
      if(!v) return;
      const hit = group.find(m=>lastChar(m.name)===v);
      if(hit) return passGate(hit);
      noteFail();
      Sound.play('error');
      if(lockLeftMs() > 0) return screenLocked();
      $('#gErr').textContent='맞지 않습니다';
      $('#vLeft').textContent=triesLeft();
      inp.value=''; inp.focus();
    };
    $('#vOk').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenMember(); };
  }
  function passGate(m){
    clearFails();
    Sound.play('confirm');
    Auth.loginMember(m.id);
    screenCheckIn(m.id);
  }

  /* 3번 틀린 뒤의 잠금 화면. 남은 시간을 세어 보여 주고 0이 되면 스스로 풀린다. */
  function screenLocked(){
    open(`
      <div class="gate-card">
        <div class="gate-title">잠시 후 다시 시도해 주세요</div>
        <div class="gate-sub">본인 확인을 ${MAX_TRY}번 틀렸습니다.</div>
        <div class="gate-mask" id="lockLeft">—</div>
        <div class="hint" style="text-align:center;line-height:1.7">
          이 기기에서 회원 입장이 잠겼습니다.<br>급하시면 운영자에게 말씀하세요.</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="gBack" style="width:100%">뒤로</button></div>
      </div>`);
    const tick=()=>{
      const e=$('#lockLeft');
      if(!e){ clearInterval(t); return; }              // 다른 화면으로 넘어갔다
      const ms=lockLeftMs();
      if(ms<=0){ clearInterval(t); screenMember(); return; }
      const total=Math.ceil(ms/1000);
      e.textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
    };
    const t=setInterval(tick,500); tick();
    $('#gBack').onclick=()=>{ Sound.play('tap'); clearInterval(t); screenHome(); };
  }

  /* 입장 직후 출석 여부를 묻는다. 와서 앱을 여는 사람은 대개 지금 치러 온 사람이라
     기본을 "출석"으로 두되, 구경만 하러 온 경우도 있으니 고르게 한다. */
  function screenCheckIn(memberId){
    const m = S.members.find(x=>x.id===memberId) || {};
    const already = Object.values(S.att).some(a=>a.memberId===memberId);
    if(already){ close(); enter(); setTimeout(()=>toast(`${m.name} 님, 이미 출석 중입니다`),200); return; }
    open(`
      <div class="gate-card">
        <div class="gate-title">${esc(m.name||'')} 님</div>
        <div class="gate-sub">지금 출석 처리할까요? 출석하면 대기 인원에 올라가 경기 배정을 받습니다.</div>
        <button class="gate-btn" data-c="in"><b>네, 출석합니다</b><span>대기 인원에 바로 올라갑니다</span></button>
        <button class="gate-btn" data-c="no"><b>아니요, 나중에</b><span>구경만 합니다 · 나중에 상단 버튼으로 출석할 수 있습니다</span></button>
      </div>`);
    box().querySelector('[data-c="in"]').onclick=()=>{
      Sound.play('confirm');
      tx(()=>{ checkInMember(memberId); });
      close(); enter();
      setTimeout(()=>toast(`${m.name} 님, 출석했습니다`),200);
    };
    box().querySelector('[data-c="no"]').onclick=()=>{ Sound.play('tap'); close(); enter(); };
  }

  function screenGuest(){
    open(`
      <div class="gate-card">
        <div class="gate-title">게스트</div>
        <div class="gate-sub">회원으로 등록하시겠어요? 등록하면 내 경기 알림을 받을 수 있습니다.</div>
        <button class="gate-btn" data-g="reg"><b>회원 등록하기</b><span>이름과 성별만 입력하면 됩니다</span></button>
        <button class="gate-btn" data-g="view"><b>비회원으로 보기</b><span>대진표만 구경합니다 (수정 불가)</span></button>
        <div class="row" style="margin-top:12px"><button class="btn" id="gBack" style="width:100%">뒤로</button></div>
      </div>`);
    box().querySelector('[data-g="reg"]').onclick=()=>{ Sound.play('tap'); screenRegister(); };
    box().querySelector('[data-g="view"]').onclick=()=>{
      Sound.play('confirm'); Auth.loginViewer(); close(); enter();
    };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  function screenRegister(){
    open(`
      <div class="gate-card">
        <div class="gate-title">회원 등록</div>
        <div class="gate-sub">성별은 남복·여복·혼복 판정에 쓰입니다.</div>
        <label class="fl">이름<input type="text" id="rN" placeholder="이름"></label>
        <label class="fl" style="margin-top:10px">성별
          <select id="rS"><option value="">선택</option><option value="M">남</option><option value="F">여</option></select></label>
        <div class="row" style="gap:10px;margin-top:10px">
          <label class="fl" style="flex:1">출생년도(선택)<input type="number" id="rY" placeholder="1985"></label>
          <label class="fl" style="flex:1">급수<select id="rG"></select></label>
        </div>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="rOk" style="flex:2">등록하고 입장</button>
        </div>
      </div>`);
    $('#rG').innerHTML=S.settings.grades.map(g=>
      `<option value="${g.code}" ${g.code==='C'?'selected':''}>${esc(g.code)} ${esc(g.label)}</option>`).join('');
    $('#rOk').onclick=()=>{
      const n=$('#rN').value.trim(), sx=$('#rS').value;
      if(!n){ Sound.play('error'); return $('#gErr').textContent='이름을 입력하세요'; }
      if(!sx){ Sound.play('error'); return $('#gErr').textContent='성별을 선택하세요'; }
      if(S.members.some(m=>m.name===n && m.active!==false)){
        Sound.play('error'); return $('#gErr').textContent='같은 이름의 회원이 이미 있습니다. 회원 입장에서 선택해 주세요.';
      }
      const id=uid('m');
      S.members.push({id,name:n,gender:sx,birthYear:parseInt($('#rY').value)||null,
                      grade:$('#rG').value,active:true,lastSeen:0});
      save();
      Sound.play('confirm');
      Auth.loginMember(id);
      screenCheckIn(id);
      setTimeout(()=>toast(`${n} 님, 등록되었습니다`),300);
    };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenGuest(); };
  }

  /* 역할이 정해진 뒤 실제 화면으로 들어간다 */
  function enter(){
    applyRole();          // 명단이 보이는 탭을 감추는 것도 여기서 한다
    render();
  }

  return { start(){ screenHome(); }, close, enter,
           reopen(){ screenHome(); } };
})();

/* ── 역할별로 볼 수 있는 화면 ────────────────────────────────────
   게스트(뷰어)는 대진판 하나만 본다.

   처음에는 회원 명단이 있는 탭(회원·출석)만 가렸는데, 그것으로는 부족했다.
   기록에는 출석자 전원의 이름과 게임 수가 그대로 늘어서 있고, 설정에는
   클럽 운영 값이 다 들어 있다. 구경하러 온 사람에게 내줄 것이 아니다.

   대진판에 올라간 사람의 이름은 여전히 보인다. 그건 지금 코트에서 부르는
   이름이라 체육관에 서 있으면 어차피 들리는 것이고, 가리면 대진판이 대진판이
   아니게 된다. 가리는 것은 "등록된 회원 전체 명단"이다.
   ───────────────────────────────────────────────────────────── */
function allowedScreen(name){
  if(Auth.isViewer) return name==='board';
  if(name==='mem' || name==='att') return Auth.can('members');
  return true;
}

/* 역할에 따라 화면 요소를 켜고 끈다 */
function applyRole(){
  document.body.dataset.role = Auth.role;
  const lbl=$('#roleLbl');
  if(lbl) lbl.textContent = Auth.roleLabel() + (Auth.isMember && Auth.memberId
      ? ' · ' + ((S.members.find(m=>m.id===Auth.memberId)||{}).name || '') : '');

  $$('.tab').forEach(t=>{ t.style.display = allowedScreen(t.dataset.scr) ? '' : 'none'; });
  /* 탭이 하나만 남으면 탭 줄 자체를 치운다. 폰에서는 이 줄이 화면 아래를
     56px 차지하는 고정 바라, 누를 곳이 하나뿐인 바를 남겨 둘 이유가 없다.
     body에 표시를 남겨 폰에서 비워 둔 그 자리(padding)도 같이 걷는다. */
  const one = $$('.tab').filter(t=>t.style.display!=='none').length<=1;
  const tabs=document.querySelector('.tabs');
  if(tabs) tabs.style.display = one ? 'none' : '';
  document.body.classList.toggle('no-tabs', one);

  /* 역할이 바뀌는 순간(다시 입장하기) 볼 수 없는 화면이 켜져 있을 수 있다. */
  const cur = ($$('.screen').find(s=>s.classList.contains('on')) || {}).id || '';
  if(cur && !allowedScreen(cur.replace('scr-',''))) show('board');

  /* 뷰어는 탭이 대진판 하나뿐이라 설정 화면으로 갈 수 없다. 역할을 바꿀 길이
     아주 막히면 게스트로 한 번 들어온 기기는 영영 회원이 될 수 없으므로,
     상단에 입장 버튼을 따로 내준다. */
  const be=$('#btnEnter'); if(be) be.style.display = Auth.isViewer ? '' : 'none';
}
