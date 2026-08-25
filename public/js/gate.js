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
        <div class="gate-title">${t('gate.unknownClub.title')}</div>
        <div class="gate-sub">${t('gate.unknownClub.sub', {club: esc(CLUB)})}</div>
        <div class="hint" style="line-height:1.7;margin-bottom:14px">
          ${t('gate.unknownClub.hint')}
        </div>
        <div id="quotaNote"></div>
        <a class="gate-btn" href="/" style="text-decoration:none;display:block">
          <b>${t('gate.unknownClub.homeLink')}</b><span>${t('gate.unknownClub.homeLinkSub')}</span></a>
      </div>`);
    /* 정원이 찼으면 헛걸음하지 않게 미리 알려 준다. */
    Store.clubQuota().then(q=>{
      const el=$('#quotaNote'); if(!el || !q.ok) return;
      el.innerHTML = q.full
        ? `<div class="hint" style="color:var(--cork);font-weight:700;margin-bottom:12px">${t('gate.unknownClub.quotaFull', {limit:q.limit})}</div>`
        : `<div class="hint" style="margin-bottom:12px">${t('gate.unknownClub.quotaOpen', {count:q.count, limit:q.limit})}</div>`;
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
        <div class="gate-title">${t('gate.landing.title')}</div>
        <div class="gate-sub">${t('gate.landing.sub')}</div>
        <input type="text" id="cCode" placeholder="${t('gate.landing.codePlaceholder')}" autocomplete="off"
               autocapitalize="off" autocorrect="off" spellcheck="false"
               style="width:100%;height:52px;font-size:20px;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="cGo" style="width:100%">${t('gate.landing.enterBtn')}</button>
        </div>
        ${recent.length?`<div class="gate-sub" style="margin:16px 0 6px">${t('gate.landing.recentLabel')}</div>
          <div class="gate-list">${recent.map(c=>
            `<button class="gate-name" data-c="${esc(c.id)}">${esc(c.name||c.id)}</button>`).join('')}</div>`:''}
        <div class="hint" style="margin-top:18px;line-height:1.7">
          ${t('gate.landing.hint')}<br>
          <span id="quotaNote"></span>
        </div>
        <div class="row" style="margin-top:18px">
          <button class="btn" id="cApply" style="width:100%">${t('gate.landing.applyBtn')}</button>
        </div>
        <div class="hint" style="margin-top:10px">
          <a href="/manual.html">${t('gate.landing.manualLink')}</a>
        </div>
      </div>`);

    const inp=$('#cCode'); setTimeout(()=>inp&&inp.focus(),60);
    $('#cApply').onclick=()=>{ Sound.play('tap'); screenApply(); };
    const go=async()=>{
      const btn=$('#cGo'); if(btn.disabled) return;
      const code=(inp.value||'').trim().toLowerCase();
      if(!code) return;
      btn.disabled=true; $('#gErr').textContent=t('gate.landing.searching');
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
      $('#gErr').textContent = r.bad ? t('gate.landing.errBadCode')
                              : r.ok ? t('gate.landing.errNotFound')
                                     : t('gate.landing.errOffline');
    };
    $('#cGo').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    box().querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{
      Sound.play('tap'); location.href = '/' + b.dataset.c + '/';
    });

    Store.clubQuota().then(q=>{
      const el=$('#quotaNote'); if(!el || !q.ok) return;
      el.innerHTML = q.full
        ? t('gate.landing.quotaFull', {limit:q.limit})
        : t('gate.landing.quotaOpen', {count:q.count, limit:q.limit});
    });
  }

  /* ── 새 동호회 신청 ─────────────────────────────────────────────
     여기서 만든 동호회는 신청 즉시 정상적으로 열린다 — 승인이 나기 전까지
     막아 두는 것이 아니다. 신청서의 status는 'pending'으로 남지만, 그건
     운영진이 나중에 훑어보는 표시일 뿐 이용을 막는 값이 아니다
     (functions/index.js createClub 머리말 참고). 신청자가 곧 소유자이니
     자기 동호회를 바로 시험 운영해 볼 수 있어야 한다.

     소유자 자리는 신청서에 적은 이메일만으로 주어지지 않는다. 그 이메일로
     실제 구글 로그인을 마쳐야(다음 화면) 진짜 소유자가 된다 — 아무 이메일이나
     적어 놓고 남의 동호회를 만드는 것을 막기 위해서다. */
  const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const FN_ERR = {
    'already-exists':     'gate.apply.err.alreadyExists',
    'resource-exhausted': 'gate.apply.err.resourceExhausted',
    'permission-denied':  'gate.apply.err.permissionDenied',
    'invalid-argument':   'gate.apply.err.invalidArgument',
    'unauthenticated':    'gate.apply.err.unauthenticated'
  };
  // FN_ERR는 코드→번역키 매핑이다. t()는 보여줄 때마다 새로 부르므로
  // 나중에 언어를 바꿔도 그 순간의 언어로 나온다.
  const fnErr = code => FN_ERR[code] ? t(FN_ERR[code]) : null;

  function screenApply(){
    open(`
      <div class="gate-card wide">
        <div class="gate-title">${t('gate.apply.title')}</div>
        <div class="gate-sub">${t('gate.apply.sub')}</div>
        <div class="row" style="gap:10px">
          <label class="fl" style="flex:1">${t('gate.apply.countryLabel')}<input type="text" id="aCountry" placeholder="${t('gate.apply.countryPlaceholder')}"></label>
          <label class="fl" style="flex:1">${t('gate.apply.areaLabel')}<input type="text" id="aArea" placeholder="${t('gate.apply.areaPlaceholder')}"></label>
        </div>
        <label class="fl" style="margin-top:10px">${t('gate.apply.nameLabel')}<input type="text" id="aName" placeholder="${t('gate.apply.namePlaceholder')}"></label>
        <label class="fl" style="margin-top:10px">${t('gate.apply.codeLabel')}
          <input type="text" id="aCode" placeholder="${t('gate.apply.codePlaceholder')}" autocomplete="off"
                 autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <div class="hint" style="margin-top:4px">${t('gate.apply.codeHint')}</div>
        <div class="row" style="gap:10px;margin-top:10px">
          <label class="fl" style="flex:1">${t('gate.apply.ownerNameLabel')}<input type="text" id="aOwner" placeholder="${t('gate.apply.ownerNamePlaceholder')}"></label>
          <label class="fl" style="flex:1">${t('gate.apply.contactLabel')}<input type="text" id="aContact" placeholder="${t('gate.apply.contactPlaceholder')}"></label>
        </div>
        <label class="fl" style="margin-top:10px">${t('gate.apply.emailLabel')}
          <input type="email" id="aEmail" placeholder="${t('gate.apply.emailPlaceholder')}" autocomplete="off"
                 autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <div class="hint" style="margin-top:4px">${t('gate.apply.emailHint')}</div>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.apply.backBtn')}</button>
          <button class="btn primary" id="aOk" style="flex:2">${t('gate.apply.submitBtn')}</button>
        </div>
      </div>`);

    const collect=()=>{
      const v = id => $(id).value.trim();
      const country=v('#aCountry'), area=v('#aArea'), name=v('#aName'),
            code=v('#aCode').toLowerCase(), ownerName=v('#aOwner'),
            contact=v('#aContact'), ownerEmail=v('#aEmail').toLowerCase();
      const err = $('#gErr');
      if(!country || !name || !ownerName || !contact){
        err.textContent=t('gate.apply.errEmpty'); return null;
      }
      if(!CODE_RE.test(code)){
        err.textContent=t('gate.apply.errCodeFormat'); return null;
      }
      if(!EMAIL_RE.test(ownerEmail)){
        err.textContent=t('gate.apply.errEmailFormat'); return null;
      }
      return { country, area, name, code, ownerName, contact, ownerEmail };
    };

    $('#aOk').onclick=async()=>{
      $('#gErr').textContent='';
      const info=collect(); if(!info) return;
      const btn=$('#aOk'); btn.disabled=true; $('#gErr').textContent=t('gate.apply.submitting');
      const r=await Store.callFunction('createClub', {
        id:info.code, name:info.name, country:info.country, area:info.area,
        ownerName:info.ownerName, contact:info.contact, ownerEmail:info.ownerEmail
      });
      btn.disabled=false;
      if(!r.ok){
        Sound.play('error');
        $('#gErr').textContent = fnErr(r.code) || r.error || t('gate.apply.errGeneric');
        return;
      }
      Sound.play('confirm');
      screenApplyVerify(info.code, info.ownerEmail, info.name);
    };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenLanding(); };
  }

  /* 신청서의 이메일로 구글 인증. 성공하면 서버가 그 계정을 이 동호회의
     소유자로 확정한다(claimOwnership) — roles 문서는 클라이언트가 못
     쓰므로 이 서버 확인이 유일한 문이다. */
  function screenApplyVerify(code, ownerEmail, clubName){
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.applyVerify.title')}</div>
        <div class="gate-sub">${t('gate.applyVerify.sub', {clubName: esc(clubName), code: esc(code), ownerEmail: esc(ownerEmail)})}</div>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" id="vGoogle" style="width:100%">${t('gate.applyVerify.googleBtn')}</button>
        </div>
        <div class="hint" style="margin-top:14px;line-height:1.7">
          ${t('gate.applyVerify.hint', {code: esc(code)})}
        </div>
      </div>`);

    $('#vGoogle').onclick=async()=>{
      const btn=$('#vGoogle'); if(btn.disabled) return;
      btn.disabled=true; $('#gErr').textContent=t('gate.applyVerify.verifying');
      const g=await Account.signInGoogle();
      if(!g.ok){
        btn.disabled=false; Sound.play('error');
        $('#gErr').textContent=g.error; return;
      }
      const acc=Account.current();
      // 서버가 최종 확인한다 — 여기서는 헛걸음을 줄이려고 미리 한 번 본다.
      if(!acc || (acc.email||'').toLowerCase() !== ownerEmail){
        btn.disabled=false; Sound.play('error');
        $('#gErr').textContent = t('gate.applyVerify.errMismatch', {email: esc(acc?acc.email:''), ownerEmail: esc(ownerEmail)});
        showSwitchAccount();
        return;
      }
      const r=await Store.callFunction('claimOwnership', { club: code });
      btn.disabled=false;
      if(!r.ok){
        Sound.play('error');
        $('#gErr').textContent = r.code==='permission-denied'
          ? t('gate.applyVerify.errWrongAccount')
          : (fnErr(r.code) || r.error || t('gate.applyVerify.errGeneric'));
        showSwitchAccount();
        return;
      }
      Sound.play('confirm');
      screenApplyPassword(code, clubName);
    };
    function showSwitchAccount(){
      if($('#vSwitch')) return;
      const row=el('div','row'); row.style.marginTop='8px';
      row.id='vSwitchRow';
      row.innerHTML=`<button class="btn" id="vSwitch" style="width:100%">${t('gate.applyVerify.switchBtn')}</button>`;
      $('#gErr').insertAdjacentElement('afterend', row);
      $('#vSwitch').onclick=async()=>{ Sound.play('tap'); await Account.signOut(); screenApplyVerify(code, ownerEmail, clubName); };
    }
  }

  /* 소유자 인증까지 끝났다 — Secret.setAdminPassword는 서버 규칙이
     isOwner(club)만 확인하므로(roles 문서가 방금 생겼다) 앱 안의 역할
     상태와 무관하게 바로 통과한다. 여기서 정하고 나면 그 자리에서
     운영자로 들어가 시험 운영을 시작할 수 있다. */
  function screenApplyPassword(code, clubName){
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.applyPassword.title')}</div>
        <div class="gate-sub">${t('gate.applyPassword.sub', {clubName: esc(clubName)})}</div>
        <label class="fl">${t('gate.applyPassword.pwLabel')}
          <input type="password" id="pA" autocomplete="new-password"></label>
        <label class="fl" style="margin-top:10px">${t('gate.applyPassword.pwConfirmLabel')}
          <input type="password" id="pB" autocomplete="new-password"></label>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" id="pOk" style="width:100%">${t('gate.applyPassword.submitBtn')}</button>
        </div>
      </div>`);
    const inp=$('#pA'); setTimeout(()=>inp&&inp.focus(),60);
    const go=async()=>{
      const btn=$('#pOk'); if(btn.disabled) return;
      const a=$('#pA').value, b=$('#pB').value, err=$('#gErr');
      if(a.length<8){ Sound.play('error'); err.textContent=t('gate.applyPassword.errTooShort'); return; }
      if(a!==b){ Sound.play('error'); err.textContent=t('gate.applyPassword.errMismatch'); return; }
      btn.disabled=true; err.textContent=t('gate.applyPassword.setting');
      const r=await Secret.setAdminPassword(a);
      btn.disabled=false;
      if(!r.ok){
        Sound.play('error');
        err.textContent = r.reason==='denied'
          ? t('gate.applyPassword.errDenied')
          : t('gate.applyPassword.errFail');
        return;
      }
      // 방금 정한 비밀번호로 그대로 운영자 입장. 다시 입력하게 하지 않는다.
      const res=await Auth.loginAdmin(a);
      if(res.ok){
        Sound.play('confirm'); close(); enter();
        toast(t('gate.applyPassword.toastEnter', {clubName}));
        return;
      }
      // 비밀번호는 정해졌는데 입장만 실패한 드문 경우 — 수동 입장으로 보낸다.
      toast(t('gate.applyPassword.toastManual'));
      screenAdmin();
    };
    $('#pOk').onclick=go;
    $('#pB').addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
  }

  function screenHome(){
    open(`
      <div class="gate-card">
        <div class="gate-title">${esc(S.settings.clubName || t('gate.home.defaultClubName'))}</div>
        <div class="gate-sub">${t('gate.home.sub')}</div>
        <button class="gate-btn" data-go="owner">
          <b>${t('gate.home.ownerTitle')}</b><span>${t('gate.home.ownerDesc')}</span></button>
        <button class="gate-btn" data-go="admin">
          <b>${t('gate.home.adminTitle')}</b><span>${t('gate.home.adminDesc')}</span></button>
        <button class="gate-btn" data-go="member">
          <b>${t('gate.home.memberTitle')}</b><span>${t('gate.home.memberDesc')}</span></button>
        <button class="gate-btn" data-go="guest">
          <b>${t('gate.home.guestTitle')}</b><span>${t('gate.home.guestDesc')}</span></button>
      </div>`);
    box().querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
      Sound.unlock(); Sound.play('tap');
      const g=b.dataset.go;
      if(g==='admin') screenAdmin();
      else if(g==='owner') screenAccount();   // 소유자는 계정으로만 들어온다
      else if(g==='member') screenMember();
      else screenGuest();
    });
  }

  /* 비밀번호 시도 제한은 Secret이 센다(비밀번호를 묻는 곳이 두 군데라
     화면마다 세면 한 군데가 우회로가 된다). 여기서는 잠긴 동안 남은 시간을
     보여 주기만 한다. 무엇을 막고 못 막는지는 secret.js에 적어 뒀다. */
  function screenPinLocked(){
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.pinLocked.title')}</div>
        <div class="gate-sub">${t('gate.pinLocked.sub', {max: Secret.MAX_TRY})}</div>
        <div class="gate-mask" id="pinLeft">—</div>
        <div class="hint" style="text-align:center;line-height:1.7">
          ${t('gate.pinLocked.hint')}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="gBack" style="width:100%">${t('gate.pinLocked.backBtn')}</button></div>
      </div>`);
    const tick=()=>{
      const e=$('#pinLeft');
      if(!e){ clearInterval(timer); return; }            // 다른 화면으로 넘어갔다
      const ms=Secret.lockLeft();
      if(ms<=0){ clearInterval(timer); screenAdmin(); return; }
      const t2=Math.ceil(ms/1000);
      e.textContent=`${Math.floor(t2/60)}:${String(t2%60).padStart(2,'0')}`;
    };
    const timer=setInterval(tick,500); tick();
    $('#gBack').onclick=()=>{ Sound.play('tap'); clearInterval(timer); screenHome(); };
  }

  /* ── 운영자 입장 ────────────────────────────────────────────────
     아이디는 동호회 이름으로 고정이라 입력받지 않고 보여 주기만 한다.
     동호회마다 비밀번호가 따로이므로 아이디가 실제로 고르는 값이 아니다 —
     칸을 만들어 두면 뭘 넣어야 하나 망설이게만 한다.

     비밀번호는 소유자가 정한다(설정 → 운영자 비밀번호). 예전에는 "비어
     있으면 먼저 여는 사람이 임자"였는데, 그건 새로 배포한 날 지나가던
     사람이 운영자 자리를 차지할 수 있다는 뜻이었다. 이제 아직 정해지지
     않았으면 소유자에게 요청하라고 안내하고 끝낸다. */
  async function screenAdmin(){
    if(Secret.lockLeft() > 0) return screenPinLocked();
    open(`<div class="gate-card"><div class="gate-title">${t('gate.admin.title')}</div>
      <div class="gate-sub">${t('gate.admin.checking')}</div></div>`);
    const st = await Secret.state();

    if(st==='unset'){
      open(`<div class="gate-card">
        <div class="gate-title">${t('gate.admin.unset.title')}</div>
        <div class="gate-sub">${t('gate.admin.unset.sub')}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.admin.unset.backBtn')}</button>
          <button class="btn primary" id="gAcct" style="flex:2">${t('gate.admin.unset.acctBtn')}</button>
        </div></div>`);
      $('#gAcct').onclick=()=>{ Sound.play('tap'); screenAccount(); };
      $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
      return;
    }
    if(st==='unknown'){
      open(`<div class="gate-card">
        <div class="gate-title">${t('gate.admin.unknown.title')}</div>
        <div class="gate-sub">${t('gate.admin.unknown.sub')}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.admin.unknown.backBtn')}</button>
          <button class="btn primary" id="gRetry" style="flex:2">${t('gate.admin.unknown.retryBtn')}</button></div></div>`);
      $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
      $('#gRetry').onclick=()=>{ Sound.play('tap'); screenAdmin(); };
      return;
    }

    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.admin.title')}</div>
        <div class="gate-sub">${t('gate.admin.form.sub')}</div>
        <label class="fl">${t('gate.admin.form.idLabel')}
          <input type="text" id="gId" value="${esc(CLUB)}" readonly
                 style="background:var(--line-soft);color:var(--muted)"></label>
        <label class="fl" style="margin-top:10px">${t('gate.admin.form.pwLabel')}
          <input type="password" id="gPin" maxlength="64" autocomplete="current-password"></label>
        <div id="gErr" class="gate-err"></div>
        <div class="gate-tries">${t('gate.admin.form.tries', {left: Secret.triesLeft(), max: Secret.MAX_TRY})}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.admin.form.backBtn')}</button>
          <button class="btn primary" id="gOk" style="flex:2">${t('gate.admin.form.enterBtn')}</button>
        </div>
        <div class="hint" style="margin-top:14px;text-align:center">
          <a href="#" id="gAcct">${t('gate.admin.form.acctLink')}</a>
        </div>
      </div>`);
    $('#gAcct').onclick=(e)=>{ e.preventDefault(); Sound.play('tap'); screenAccount(); };
    const inp=$('#gPin'); setTimeout(()=>inp&&inp.focus(),60);
    const go=async()=>{
      if($('#gOk').disabled) return;
      if(Secret.lockLeft() > 0) return screenPinLocked();
      $('#gOk').disabled=true; $('#gErr').textContent=t('gate.admin.checking');
      const res=await Auth.loginAdmin(inp.value);
      $('#gOk').disabled=false;
      if(res.ok){
        Sound.play('confirm'); close(); enter();
        if(res.offline) toast(t('gate.admin.form.toastOffline'));
        return;
      }
      Sound.play('error');
      if(res.reason === 'locked') return screenPinLocked();
      const triesEl=$('#pinTries'); if(triesEl) triesEl.textContent = Secret.triesLeft();
      $('#gErr').textContent = ADMIN_ERR[res.reason] || t('gate.admin.form.errGeneric');
      inp.value=''; inp.focus();
    };
    $('#gOk').onclick=go;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* ── 계정으로 입장 (소유자·운영자) ──────────────────────────────
     비밀번호가 아니라 실제 계정으로 들어온다. 역할은 서버의 roles 문서가
     정하므로, 어느 버튼으로 왔든 서버가 준 역할을 그대로 쓴다.

     비밀번호 경로를 없애지 않고 나란히 둔 이유는 account.js 머리말에 적었다 —
     roles 문서가 아직 없는 동호회의 운영자가 잠기면 안 된다. */
  async function screenAccount(){
    // 이미 로그인돼 있으면 비밀번호를 다시 묻지 않는다.
    if(Account.current()) return accountEnter();

    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.account.title')}</div>
        <div class="gate-sub">${t('gate.account.sub')}</div>
        <label class="fl">${t('gate.account.emailLabel')}
          <input type="email" id="aEm" autocomplete="username" autocapitalize="off"
                 autocorrect="off" spellcheck="false"></label>
        <label class="fl" style="margin-top:10px">${t('gate.account.pwLabel')}
          <input type="password" id="aPw" autocomplete="current-password"></label>
        <div id="gErr" class="gate-err"></div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.account.backBtn')}</button>
          <button class="btn primary" id="aOk" style="flex:2">${t('gate.account.loginBtn')}</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn" id="aGoogle" style="width:100%">${t('gate.account.googleBtn')}</button>
        </div>
      </div>`);
    setTimeout(()=>{ const f=$('#aEm'); f&&f.focus(); },60);

    const run = async (fn, btn) => {
      const b=$(btn); if(b.disabled) return;
      b.disabled=true; $('#gErr').textContent=t('gate.account.loggingIn');
      const r=await fn();
      b.disabled=false;
      if(!r.ok){ Sound.play('error'); $('#gErr').textContent=r.error; return; }
      accountEnter();
    };
    $('#aOk').onclick=()=>run(()=>Account.signInEmail($('#aEm').value,$('#aPw').value),'#aOk');
    $('#aGoogle').onclick=()=>run(()=>Account.signInGoogle(),'#aGoogle');
    $('#aPw').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#aOk').click(); });
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* 로그인은 됐다. 이 동호회에서 무슨 역할인지 서버에 묻고 들여보낸다. */
  async function accountEnter(){
    const acc=Account.current();
    open(`<div class="gate-card"><div class="gate-title">${t('gate.accountEnter.title')}</div>
      <div class="gate-sub">${esc(acc?acc.email||acc.name:'')}</div></div>`);
    const res=await Auth.loginWithAccount();
    if(res.ok){
      Sound.play('confirm'); close(); enter();
      toast(t('gate.accountEnter.toastWelcome', {role: Auth.roleLabel()}));
      if(res.offline) toast(t('gate.accountEnter.toastOffline'));
      return;
    }
    Sound.play('error');
    /* 권한이 없는 것과 확인을 못 한 것을 구분해 말한다. 뭉뚱그리면
       와이파이가 나쁜 날 멀쩡한 운영자가 자기 계정을 의심하게 된다. */
    const msg = res.reason==='norole'
        ? t('gate.accountEnter.errNoRole', {email: esc(acc?acc.email:'')})
      : res.reason==='offline'
        ? t('gate.accountEnter.errOffline')
      : res.reason==='full'
        ? t('gate.accountEnter.errFull')
        : t('gate.accountEnter.errGeneric');
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.accountEnter.deniedTitle')}</div>
        <div class="gate-sub">${msg}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gOut" style="flex:1">${t('gate.accountEnter.logoutBtn')}</button>
          <button class="btn primary" id="gRetry" style="flex:2">${t('gate.accountEnter.retryBtn')}</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn" id="gBack" style="width:100%">${t('gate.accountEnter.homeBtn')}</button></div>
      </div>`);
    $('#gRetry').onclick=()=>{ Sound.play('tap'); accountEnter(); };
    $('#gOut').onclick=async()=>{ Sound.play('tap'); await Account.signOut(); screenAccount(); };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
  }

  /* 최초 운영자 비밀번호 설정 화면은 없앴다.
     예전에는 kv/adminAuth가 비어 있으면 여기서 아무나 비밀번호를 정할 수
     있었다 — 새로 배포한 날 지나가던 사람이 운영자 자리를 차지할 수
     있다는 뜻이었다. 지금은 소유자가 설정 화면에서 정한다(screens.js).
     소유자는 계정으로만 들어오므로 서버가 그 자격을 확인할 수 있다. */


  function screenMember(){
    if(lockLeftMs() > 0) return screenLocked();
    const list=S.members.filter(m=>m.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!list.length){
      open(`<div class="gate-card"><div class="gate-title">${t('gate.member.title')}</div>
        <div class="gate-sub">${t('gate.member.emptySub')}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.member.backBtn')}</button>
          <button class="btn primary" id="gGuest" style="flex:2">${t('gate.member.guestBtn')}</button></div></div>`);
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
        <div class="gate-title">${t('gate.member.title')}</div>
        <div class="gate-sub">${t('gate.member.sub')}</div>
        <input type="text" id="gQ" placeholder="${t('gate.member.searchPlaceholder')}" style="width:100%">
        <div class="gate-list" id="gList"></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="gBack" style="width:100%">${t('gate.member.backBtn')}</button></div>
      </div>`);
    const draw=(q='')=>{
      const el=$('#gList');
      /* 검색도 가려진 글자를 뺀 부분에만 건다. 이름을 통째로 넣어 보면서
         맞는지 확인하는 우회로를 막기 위해서다. */
      const f=keys.filter(k=>matchQ(k.replace(/○$/,''), q.trim()));
      el.innerHTML = f.length? f.map(k=>`<button class="gate-name" data-k="${esc(k)}">${esc(k)}</button>`).join('')
                             : `<div class="gate-empty">${t('gate.member.noMatch')}</div>`;
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
        <div class="gate-title">${t('gate.verify.title')}</div>
        <div class="gate-sub">${t('gate.verify.sub')}</div>
        <div class="gate-mask">${esc(masked)}</div>
        <input type="text" id="vC" maxlength="1" autocomplete="off" autocorrect="off"
               style="width:100%;height:56px;font-size:30px;text-align:center">
        <div id="gErr" class="gate-err"></div>
        <div class="gate-tries">${t('gate.verify.tries', {left: triesLeft(), max: MAX_TRY})}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.verify.backBtn')}</button>
          <button class="btn primary" id="vOk" style="flex:2">${t('gate.verify.enterBtn')}</button>
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
      $('#gErr').textContent=t('gate.verify.errWrong');
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
        <div class="gate-title">${t('gate.locked.title')}</div>
        <div class="gate-sub">${t('gate.locked.sub', {max: MAX_TRY})}</div>
        <div class="gate-mask" id="lockLeft">—</div>
        <div class="hint" style="text-align:center;line-height:1.7">
          ${t('gate.locked.hint')}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="gBack" style="width:100%">${t('gate.locked.backBtn')}</button></div>
      </div>`);
    const tick=()=>{
      const e=$('#lockLeft');
      if(!e){ clearInterval(timer); return; }              // 다른 화면으로 넘어갔다
      const ms=lockLeftMs();
      if(ms<=0){ clearInterval(timer); screenMember(); return; }
      const total=Math.ceil(ms/1000);
      e.textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
    };
    const timer=setInterval(tick,500); tick();
    $('#gBack').onclick=()=>{ Sound.play('tap'); clearInterval(timer); screenHome(); };
  }

  /* 입장 직후 출석 여부를 묻는다. 와서 앱을 여는 사람은 대개 지금 치러 온 사람이라
     기본을 "출석"으로 두되, 구경만 하러 온 경우도 있으니 고르게 한다. */
  function screenCheckIn(memberId){
    const m = S.members.find(x=>x.id===memberId) || {};
    const already = Object.values(S.att).some(a=>a.memberId===memberId);
    if(already){ close(); enter(); setTimeout(()=>toast(t('gate.checkin.alreadyIn', {name: m.name})),200); return; }
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.checkin.title', {name: esc(m.name||'')})}</div>
        <div class="gate-sub">${t('gate.checkin.sub')}</div>
        <button class="gate-btn" data-c="in"><b>${t('gate.checkin.yesTitle')}</b><span>${t('gate.checkin.yesDesc')}</span></button>
        <button class="gate-btn" data-c="no"><b>${t('gate.checkin.noTitle')}</b><span>${t('gate.checkin.noDesc')}</span></button>
      </div>`);
    box().querySelector('[data-c="in"]').onclick=()=>{
      Sound.play('confirm');
      tx(()=>{ checkInMember(memberId); });
      close(); enter();
      setTimeout(()=>toast(t('gate.checkin.toastDone', {name: m.name})),200);
    };
    box().querySelector('[data-c="no"]').onclick=()=>{ Sound.play('tap'); close(); enter(); };
  }

  function screenGuest(){
    open(`
      <div class="gate-card">
        <div class="gate-title">${t('gate.guest.title')}</div>
        <div class="gate-sub">${t('gate.guest.sub')}</div>
        <button class="gate-btn" data-g="reg"><b>${t('gate.guest.regTitle')}</b><span>${t('gate.guest.regDesc')}</span></button>
        <button class="gate-btn" data-g="view"><b>${t('gate.guest.viewTitle')}</b><span>${t('gate.guest.viewDesc')}</span></button>
        <div class="row" style="margin-top:12px"><button class="btn" id="gBack" style="width:100%">${t('gate.guest.backBtn')}</button></div>
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
        <div class="gate-title">${t('gate.register.title')}</div>
        <div class="gate-sub">${t('gate.register.sub')}</div>
        <label class="fl">${t('gate.register.nameLabel')}<input type="text" id="rN" placeholder="${t('gate.register.namePlaceholder')}"></label>
        <label class="fl" style="margin-top:10px">${t('gate.register.genderLabel')}
          <select id="rS"><option value="">${t('gate.register.genderSelect')}</option><option value="M">${t('gate.register.genderM')}</option><option value="F">${t('gate.register.genderF')}</option></select></label>
        <div class="row" style="gap:10px;margin-top:10px">
          <label class="fl" style="flex:1">${t('gate.register.yearLabel')}<input type="number" id="rY" placeholder="${t('gate.register.yearPlaceholder')}"></label>
          <label class="fl" style="flex:1">${t('gate.register.gradeLabel')}<select id="rG"></select></label>
        </div>
        <div id="gErr" class="gate-err"></div>
        <div class="hint" style="margin-top:10px;line-height:1.7">
          ${t('gate.register.hint')}
        </div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn primary" id="rOk" style="width:100%">${t('gate.register.submitBtn')}</button>
        </div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn" id="gBack" style="flex:1">${t('gate.register.backBtn')}</button>
          <button class="btn" id="rNow" style="flex:2">${t('gate.register.nowBtn')}</button>
        </div>
      </div>`);
    $('#rG').innerHTML=S.settings.grades.map(g=>
      `<option value="${g.code}" ${g.code==='C'?'selected':''}>${esc(g.code)} ${esc(g.label)}</option>`).join('');

    /* 입력값을 모아 검증한다. 통과하면 {name,gender,birthYear,grade}. */
    const collect=()=>{
      const n=$('#rN').value.trim(), sx=$('#rS').value;
      if(!n){ Sound.play('error'); $('#gErr').textContent=t('gate.register.errNoName'); return null; }
      if(!sx){ Sound.play('error'); $('#gErr').textContent=t('gate.register.errNoGender'); return null; }
      /* 이미 회원인 이름은 돌려보낸다. 이 안내가 "그 이름이 명단에 있다"는
         것을 알려 주는 것은 사실이다(가입 화면의 어쩔 수 없는 한계).
         대신 여기서 걸러야 같은 이름이 두 번 올라가지 않는다. */
      if(S.members.some(m=>m.name===n && m.active!==false)){
        Sound.play('error');
        $('#gErr').textContent=t('gate.register.errDuplicate');
        return null;
      }
      return { name:n, gender:sx, birthYear:parseInt($('#rY').value)||null, grade:$('#rG').value };
    };

    // ① 승인 요청 — 운영자가 자리에 없어도 접수된다
    $('#rOk').onclick=async()=>{
      const info=collect(); if(!info) return;
      const btn=$('#rOk'); btn.disabled=true; $('#gErr').textContent=t('gate.register.sending');
      try{
        const req=await submitJoinRequest(info);
        writePending({ id:req.id, name:req.name });
        Sound.play('confirm');
        screenPending(req.name);
      }catch(e){
        Sound.play('error');
        $('#gErr').textContent=t('gate.register.errSendFail');
      }finally{ btn.disabled=false; }
    };

    // ② 운영자가 옆에 있을 때 — 비밀번호를 받고 바로 등록
    $('#rNow').onclick=()=>{
      const info=collect(); if(!info) return;
      Sound.play('tap');
      close();
      askPin(t('gate.register.pinTitle'), t('gate.register.pinBody', {name: info.name}), ()=>{
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
        setTimeout(()=>toast(t('gate.register.toastDone', {name: info.name})),300);
      }, { okLabel:t('gate.register.pinOkLabel'), bodyHtml:t('gate.register.pinHint') });
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
        <div class="gate-title">${t('gate.pending.title')}</div>
        <div class="gate-sub">${t('gate.pending.sub', {name: esc(name)})}</div>
        <div class="hint" style="line-height:1.7;margin-bottom:14px">
          ${t('gate.pending.hint')}
        </div>
        <button class="gate-btn" data-p="view"><b>${t('gate.pending.viewTitle')}</b><span>${t('gate.pending.viewDesc')}</span></button>
        <div class="row" style="margin-top:10px"><button class="btn" id="gBack" style="width:100%">${t('gate.pending.homeBtn')}</button></div>
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
