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

  /* ── 등록되지 않은 동호회 ──────────────────────────────────────
     주소창에 없는 이름을 친 경우다. 예전에는 여기서 빈 동호회가 생기고
     먼저 연 사람이 운영자 비밀번호까지 차지했다. 이제는 서버가 만들어 준
     동호회만 열리고, 새로 만들려면 신청을 거친다.

     주소를 잘못 친 사람이 대부분이므로 문책하는 말투를 쓰지 않는다. */
  function screenUnknownClub(){
    open(`
      <div class="gate-card">
        <div class="gate-title">없는 주소입니다</div>
        <div class="gate-sub"><span class="doc-k">${esc(CLUB)}</span> 라는 동호회를 찾지 못했습니다.
          주소를 다시 확인해 주세요.</div>
        <div class="hint" style="line-height:1.7;margin-bottom:14px">
          동호회 주소는 운영자에게 받은 링크를 그대로 여는 것이 가장 확실합니다.<br>
          새 동호회를 열고 싶으시면 대표 주소에서 신청할 수 있습니다.
        </div>
        <div id="quotaNote"></div>
        <a class="gate-btn" href="/" style="text-decoration:none;display:block">
          <b>대표 주소로 가기</b><span>여기서 동호회를 찾거나 새로 신청합니다</span></a>
      </div>`);
    /* 정원이 찼으면 헛걸음하지 않게 미리 알려 준다. */
    Store.clubQuota().then(q=>{
      const el=$('#quotaNote'); if(!el || !q.ok) return;
      el.innerHTML = q.full
        ? `<div class="hint" style="color:var(--cork);font-weight:700;margin-bottom:12px">
             지금은 신규 동호회 정원(${q.limit}개)이 다 찼습니다. 자리가 나면 다시 열립니다.</div>`
        : `<div class="hint" style="margin-bottom:12px">
             현재 <b>${q.count}</b> / ${q.limit}개 동호회가 열려 있습니다.</div>`;
    });
  }

  /* ── 대표 주소 현관 ────────────────────────────────────────────
     '/' 는 원래 동호회 하나(default)의 대진판이었다. 그 동호회가 제 주소로
     이관해 clubs/default가 비면, 여기는 "어느 동호회로 가시나요"를 묻는
     현관이 된다. 전환에 플래그를 두지 않은 이유는 main.js에 적어 뒀다.

     여기서는 동호회를 만들지 않는다. 코드가 맞는지 확인해서 보내 줄 뿐이다 —
     주소를 치면 동호회가 생기던 예전 동작이 남용의 통로였다. */
  function screenLanding(){
    const recent = (typeof recentClubs==='function') ? recentClubs() : [];
    open(`
      <div class="gate-card wide">
        <div class="gate-title">배드민턴 대진판</div>
        <div class="gate-sub">동호회 코드를 입력하시면 그 동호회 대진판으로 갑니다.</div>
        <input type="text" id="cCode" placeholder="예: teambailey" autocomplete="off"
               autocapitalize="off" autocorrect="off" spellcheck="false"
               style="width:100%;height:52px;font-size:20px;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="cGo" style="width:100%">들어가기</button>
        </div>
        ${recent.length?`<div class="gate-sub" style="margin:16px 0 6px">최근에 들어간 동호회</div>
          <div class="gate-list">${recent.map(c=>
            `<button class="gate-name" data-c="${esc(c.id)}">${esc(c.name||c.id)}</button>`).join('')}</div>`:''}
        <div class="hint" style="margin-top:18px;line-height:1.7">
          코드는 운영자에게 받은 링크의 주소 조각입니다
          (<span class="doc-k">happybirdies.web.app/<b>teambailey</b>/</span>).<br>
          <span id="quotaNote"></span>
        </div>
        <div class="hint" style="margin-top:10px">
          <a href="/manual.html">사용 설명서 보기 →</a>
        </div>
      </div>`);

    const inp=$('#cCode'); setTimeout(()=>inp&&inp.focus(),60);
    const go=async()=>{
      const btn=$('#cGo'); if(btn.disabled) return;
      const code=(inp.value||'').trim().toLowerCase();
      if(!code) return;
      btn.disabled=true; $('#gErr').textContent='찾는 중...';
      const r=await Store.lookupClub(code);
      btn.disabled=false;
      if(r.ok && r.found){
        Sound.play('confirm');
        location.href = '/' + r.id + '/';
        return;
      }
      Sound.play('error');
      // 못 찾은 것과 못 물어본 것은 다르다. 오프라인에서 "없는 동호회"라고
      // 말하면 멀쩡한 코드를 의심하게 된다.
      $('#gErr').textContent = r.bad ? '영문 소문자·숫자·하이픈만 쓸 수 있습니다'
                              : r.ok ? '그런 동호회를 찾지 못했습니다'
                                     : '지금은 확인할 수 없습니다 — 연결을 확인해 주세요';
    };
    $('#cGo').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    box().querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{
      Sound.play('tap'); location.href = '/' + b.dataset.c + '/';
    });

    Store.clubQuota().then(q=>{
      const el=$('#quotaNote'); if(!el || !q.ok) return;
      el.innerHTML = q.full
        ? `새 동호회는 지금 정원(${q.limit}개)이 다 차서 받지 못합니다.`
        : `새 동호회를 열고 싶으시면 운영자에게 문의해 주세요 (현재 <b>${q.count}</b>/${q.limit}개).`;
    });
  }

  function screenHome(){
    open(`
      <div class="gate-card">
        <div class="gate-title">${esc(S.settings.clubName || '대진판')}</div>
        <div class="gate-sub">어떻게 입장하시겠어요?</div>
        <button class="gate-btn" data-go="owner">
          <b>소유자</b><span>이 동호회의 주인입니다 · 소유자 비밀번호 필요</span></button>
        <button class="gate-btn" data-go="admin">
          <b>운영자</b><span>대진 배정과 설정을 관리합니다 · 관리 비밀번호 필요</span></button>
        <button class="gate-btn" data-go="member">
          <b>회원</b><span>내 경기 알림을 받습니다 · 코트 수동 배정은 제한됩니다</span></button>
        <button class="gate-btn" data-go="guest">
          <b>게스트</b><span>처음 오셨나요? 회원 등록을 하거나 구경만 할 수 있습니다</span></button>
      </div>`);
    box().querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
      Sound.unlock(); Sound.play('tap');
      const g=b.dataset.go;
      if(g==='admin') screenAdmin();
      else if(g==='owner') screenAdmin('owner');
      else if(g==='member') screenMember();
      else screenGuest();
    });
  }

  /* 운영자 입장. 비밀번호가 아직 없으면(새 DB·초기화 직후) 설정 화면으로
     넘긴다. 그 판정은 서버가 한다 — 오프라인 캐시가 "없다"고 답한 것은
     믿지 않는다(Secret.state가 'unknown'을 돌려준다). */
  /* kind: 'admin' | 'owner'. 저장 구조도 화면도 같고 어느 비밀번호를 쓰느냐만
     다르다. 소유자 비밀번호를 따로 두는 것이 이 역할 구분의 전부다 — 같은
     비밀번호를 쓰면 화면만 다르고 권한은 같아서, 구분하는 척이 된다. */
  const ROLE_TITLE = { admin:'운영자', owner:'소유자' };

  /* 비밀번호 시도 제한은 Secret이 센다(비밀번호를 묻는 곳이 세 군데라
     화면마다 세면 한 군데가 우회로가 된다). 여기서는 잠긴 동안 남은 시간을
     보여 주기만 한다. 무엇을 막고 못 막는지는 secret.js에 적어 뒀다. */
  function screenPinLocked(kind){
    const label = ROLE_TITLE[kind];
    open(`
      <div class="gate-card">
        <div class="gate-title">잠시 후 다시 시도해 주세요</div>
        <div class="gate-sub">${label} 비밀번호를 ${Secret.MAX_TRY}번 틀렸습니다.</div>
        <div class="gate-mask" id="pinLeft">—</div>
        <div class="hint" style="text-align:center;line-height:1.7">
          이 기기에서 ${label} 입장이 잠겼습니다.<br>
          비밀번호를 잊으셨다면 소유자에게 문의하세요.</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="gBack" style="width:100%">뒤로</button></div>
      </div>`);
    const tick=()=>{
      const e=$('#pinLeft');
      if(!e){ clearInterval(t); return; }            // 다른 화면으로 넘어갔다
      const ms=Secret.lockLeft(kind);
      if(ms<=0){ clearInterval(t); screenAdmin(kind); return; }
      const t2=Math.ceil(ms/1000);
      e.textContent=`${Math.floor(t2/60)}:${String(t2%60).padStart(2,'0')}`;
    };
    const t=setInterval(tick,500); tick();
    $('#gBack').onclick=()=>{ Sound.play('tap'); clearInterval(t); screenHome(); };
  }

  async function screenAdmin(kind='admin'){
    const label = ROLE_TITLE[kind];
    if(Secret.lockLeft(kind) > 0) return screenPinLocked(kind);
    open(`<div class="gate-card"><div class="gate-title">${label} 입장</div>
      <div class="gate-sub">확인 중...</div></div>`);
    const st = await Secret.state(kind);
    if(st==='unset') return screenSetPin(kind);
    if(st==='unknown'){
      open(`<div class="gate-card">
        <div class="gate-title">연결을 확인해 주세요</div>
        <div class="gate-sub">${label} 확인은 클라우드에 물어봅니다. 지금은 연결되지 않아
          비밀번호를 확인할 수 없습니다. 이미 이 기기로 운영자 입장을 한 적이 있다면
          그대로 유지되니, 연결이 돌아온 뒤 다시 시도하세요.</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="gRetry" style="flex:2">다시 확인</button></div></div>`);
      $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
      $('#gRetry').onclick=()=>{ Sound.play('tap'); screenAdmin(kind); };
      return;
    }
    open(`
      <div class="gate-card">
        <div class="gate-title">${label} 입장</div>
        <div class="gate-sub">${kind==='owner'?'소유자':'관리'} 비밀번호를 입력하세요.
          운영자 자리는 동시 2명까지입니다.</div>
        <input type="password" id="gPin" maxlength="64" autocomplete="off"
               style="width:100%;height:56px;font-size:22px;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="gate-tries">남은 시도 <b id="pinTries">${Secret.triesLeft(kind)}</b>번 ·
          ${Secret.MAX_TRY}번 틀리면 이 기기에서 잠깁니다</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="gOk" style="flex:2">입장</button>
        </div>
      </div>`);
    const inp=$('#gPin'); setTimeout(()=>inp&&inp.focus(),60);
    const go=async()=>{
      if($('#gOk').disabled) return;
      if(Secret.lockLeft(kind) > 0) return screenPinLocked(kind);
      $('#gOk').disabled=true; $('#gErr').textContent='확인 중...';
      const res=await Auth.loginAs(kind, inp.value);
      $('#gOk').disabled=false;
      if(res.ok){
        Sound.play('confirm'); close(); enter();
        if(res.offline) toast('클라우드 미연결 — 동시 접속 제한은 적용되지 않습니다');
        return;
      }
      Sound.play('error');
      if(res.reason === 'locked') return screenPinLocked(kind);
      const t=$('#pinTries'); if(t) t.textContent = Secret.triesLeft(kind);
      $('#gErr').textContent = ADMIN_ERR[res.reason] || '확인하지 못했습니다';
      inp.value=''; inp.focus();
    };
    $('#gOk').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* ── 최초 운영자 비밀번호 설정 ──────────────────────────────────
     DB가 비어 있거나(첫 배포) 콘솔에서 kv/adminAuth를 지운 직후에 뜬다.

     이 화면이 떠 있는 동안은 먼저 여는 사람이 임자다. 그래서 예전
     설정에 평문 PIN이 남아 있으면 그것부터 확인한다 — 새로 배포한
     날 지나가던 사람이 운영자 자리를 차지하는 것을 막는 잠금이다.
     (평문 PIN은 어차피 공개돼 있던 값이라 강한 잠금은 아니다.
      그래서 설정을 마치는 즉시 settings에서 지운다.) */
  function screenSetPin(kind='admin'){
    const label = ROLE_TITLE[kind];
    // 옛 평문 PIN 확인은 운영자 비밀번호를 처음 정할 때만 의미가 있다.
    const legacy = (kind==='admin' && S.settings && S.settings.adminPin)
                     ? String(S.settings.adminPin) : null;
    open(`
      <div class="gate-card wide">
        <div class="gate-title">최초 ${label} 비밀번호 설정</div>
        <div class="gate-sub">이 동호회에는 아직 ${label} 비밀번호가 없습니다.
          지금 정하면 클라우드에 <b>되돌릴 수 없는 형태로만</b> 저장됩니다 —
          앱도, 콘솔도, 누구도 원래 값을 다시 볼 수 없습니다.</div>
        ${legacy?`<label class="fl">기존 비밀번호(확인용)
          <input type="password" id="pOld" autocomplete="off"></label>
          <div class="hint" style="margin:6px 0 12px">지금까지 쓰던 관리 비밀번호를 넣어 주세요.
            엉뚱한 사람이 운영자 자리를 가져가는 것을 막기 위한 확인입니다.</div>`:''}
        <label class="fl">새 비밀번호<input type="password" id="pNew" autocomplete="new-password"></label>
        <label class="fl" style="margin-top:10px">한 번 더<input type="password" id="pNew2" autocomplete="new-password"></label>
        <div class="hint" style="margin-top:10px;line-height:1.7">
          네 자리 숫자는 쉽게 뚫립니다. <b>8자 이상</b>으로 정하고 어딘가에 적어 두세요.
          잊어버리면 Firebase 콘솔에서
          <span class="doc-k">clubs/${esc(CLUB)}/kv/${kind==='owner'?'ownerAuth':'adminAuth'}</span>
          문서를 지워야 다시 정할 수 있습니다.
          ${kind==='owner'?'<br><b>소유자 비밀번호는 운영자 비밀번호와 달라야 의미가 있습니다.</b> 대진을 돌리는 사람과 나눠 쓰지 마세요.':''}
        </div>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="pOk" style="flex:2">설정하고 입장</button>
        </div>
      </div>`);
    setTimeout(()=>{ const f=$(legacy?'#pOld':'#pNew'); f&&f.focus(); },60);
    $('#pOk').onclick=async()=>{
      const err=$('#gErr');
      if(legacy && $('#pOld').value !== legacy){
        Sound.play('error'); return err.textContent='기존 비밀번호가 맞지 않습니다';
      }
      const a=$('#pNew').value, b=$('#pNew2').value;
      if(a.length<8){ Sound.play('error'); return err.textContent='8자 이상으로 정해 주세요'; }
      if(a!==b){ Sound.play('error'); return err.textContent='두 번 입력한 값이 다릅니다'; }
      $('#pOk').disabled=true; err.textContent='설정 중...';
      const r=await Secret.bootstrap(a, kind);
      $('#pOk').disabled=false;
      if(!r.ok){
        Sound.play('error');
        err.textContent = r.reason==='taken'
          ? '방금 다른 기기에서 먼저 설정했습니다. 뒤로 가서 그 비밀번호로 입장하세요.'
          : '설정하지 못했습니다 — 클라우드 연결과 보안 규칙 배포를 확인해 주세요';
        return;
      }
      /* 평문 PIN은 더 이상 쓰지 않는다. 남겨 두면 공개된 settings 문서에
         계속 실려 다니므로 여기서 지우고 저장한다. */
      if(kind==='admin' && S.settings && S.settings.adminPin!=null){
        delete S.settings.adminPin; settingsTrusted = true; save();
      }
      const res = await Auth.loginAs(kind, a);
      Sound.play('confirm');
      if(res.ok){ close(); enter(); toast(`${label} 비밀번호를 설정했습니다`); }
      else { screenAdmin(kind); }
    };
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
        <div class="hint" style="margin-top:10px;line-height:1.7">
          가입은 <b>운영자 승인</b>을 거칩니다. 운영자가 옆에 계시면 아래
          <b>운영자 확인 후 바로 등록</b>으로 즉시 처리할 수 있습니다.
        </div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn primary" id="rOk" style="width:100%">승인 요청 보내기</button>
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn" id="rNow" style="flex:2">운영자 확인 후 바로 등록</button>
        </div>
      </div>`);
    $('#rG').innerHTML=S.settings.grades.map(g=>
      `<option value="${g.code}" ${g.code==='C'?'selected':''}>${esc(g.code)} ${esc(g.label)}</option>`).join('');

    /* 입력값을 모아 검증한다. 통과하면 {name,gender,birthYear,grade}. */
    const collect=()=>{
      const n=$('#rN').value.trim(), sx=$('#rS').value;
      if(!n){ Sound.play('error'); $('#gErr').textContent='이름을 입력하세요'; return null; }
      if(!sx){ Sound.play('error'); $('#gErr').textContent='성별을 선택하세요'; return null; }
      /* 이미 회원인 이름은 돌려보낸다. 이 안내가 "그 이름이 명단에 있다"는
         것을 알려 주는 것은 사실이다(가입 화면의 어쩔 수 없는 한계).
         대신 여기서 걸러야 같은 이름이 두 번 올라가지 않는다. */
      if(S.members.some(m=>m.name===n && m.active!==false)){
        Sound.play('error');
        $('#gErr').textContent='같은 이름의 회원이 이미 있습니다. 회원 입장에서 선택해 주세요.';
        return null;
      }
      return { name:n, gender:sx, birthYear:parseInt($('#rY').value)||null, grade:$('#rG').value };
    };

    // ① 승인 요청 — 운영자가 자리에 없어도 접수된다
    $('#rOk').onclick=async()=>{
      const info=collect(); if(!info) return;
      const btn=$('#rOk'); btn.disabled=true; $('#gErr').textContent='보내는 중...';
      try{
        const req=await submitJoinRequest(info);
        writePending({ id:req.id, name:req.name });
        Sound.play('confirm');
        screenPending(req.name);
      }catch(e){
        Sound.play('error');
        $('#gErr').textContent='요청을 보내지 못했습니다 — 연결을 확인해 주세요';
      }finally{ btn.disabled=false; }
    };

    // ② 운영자가 옆에 있을 때 — 비밀번호를 받고 바로 등록
    $('#rNow').onclick=()=>{
      const info=collect(); if(!info) return;
      Sound.play('tap');
      close();
      askPin('운영자 확인', `${info.name} 님을 지금 바로 회원으로 등록합니다.`, ()=>{
        const id=uid('m');
        S.members.push({id,name:info.name,gender:info.gender,birthYear:info.birthYear,
                        grade:info.grade,active:true,lastSeen:0});
        setMembersBaseline(S.members);
        save();
        writePending(null);
        Sound.play('confirm');
        Auth.loginMember(id);
        box().classList.add('on');
        screenCheckIn(id);
        setTimeout(()=>toast(`${info.name} 님, 등록되었습니다`),300);
      }, { okLabel:'등록', bodyHtml:'<div class="hint" style="text-align:center;margin-bottom:10px">'
           + '운영자가 직접 입력해 주세요. 옆에 없다면 <b>승인 요청</b>으로 접수하세요.</div>' });
      // 비밀번호 창을 닫으면 게이트로 돌아온다
      $('#pinCancel').onclick=()=>{ closeModal(); box().classList.add('on'); screenRegister(); };
    };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenGuest(); };
  }

  /* 승인 대기 화면. 여기서 기다릴 필요는 없고, 뷰어로 구경하고 있으면
     승인되는 순간 이 기기가 알아채고 회원으로 바꿔 준다(checkJoinApproved). */
  function screenPending(name){
    Auth.loginViewer();
    open(`
      <div class="gate-card">
        <div class="gate-title">가입 요청을 보냈습니다</div>
        <div class="gate-sub"><b>${esc(name)}</b> 님으로 접수했습니다.
          운영자가 승인하면 자동으로 회원으로 전환됩니다 — 앱을 닫았다 열 필요 없습니다.</div>
        <div class="hint" style="line-height:1.7;margin-bottom:14px">
          지금은 대진판을 구경할 수 있습니다. 운영자가 옆에 계시면 승인해 달라고
          말씀하세요. 승인되면 화면에 알려 드립니다.
        </div>
        <button class="gate-btn" data-p="view"><b>대진판 보기</b><span>승인될 때까지 구경합니다</span></button>
        <div class="row" style="margin-top:10px"><button class="btn" id="gBack" style="width:100%">처음으로</button></div>
      </div>`);
    box().querySelector('[data-p="view"]').onclick=()=>{ Sound.play('tap'); close(); enter(); };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* 역할이 정해진 뒤 실제 화면으로 들어간다 */
  function enter(){
    applyRole();          // 명단이 보이는 탭을 감추는 것도 여기서 한다
    render();
  }

  return { start(){ screenHome(); }, close, enter,
           unknownClub(){ screenUnknownClub(); },
           landing(){ screenLanding(); },
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

   도움말은 예외로 열어 둔다. 설명서에는 클럽 데이터가 한 줄도 없고, 처음 온
   사람이 회원 등록하는 법을 읽어야 할 곳이 바로 거기다. 가려서 얻는 것이 없다.
   ───────────────────────────────────────────────────────────── */
function allowedScreen(name){
  if(Auth.isViewer) return name==='board' || name==='help';
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

  /* 역할이 바뀌는 순간(다시 입장하기) 볼 수 없는 화면이 켜져 있을 수 있다. */
  const cur = ($$('.screen').find(s=>s.classList.contains('on')) || {}).id || '';
  if(cur && !allowedScreen(cur.replace('scr-',''))) show('board');

  /* 뷰어는 탭이 대진판 하나뿐이라 설정 화면으로 갈 수 없다. 역할을 바꿀 길이
     아주 막히면 게스트로 한 번 들어온 기기는 영영 회원이 될 수 없으므로,
     상단에 입장 버튼을 따로 내준다. */
  const be=$('#btnEnter'); if(be) be.style.display = Auth.isViewer ? '' : 'none';
}
