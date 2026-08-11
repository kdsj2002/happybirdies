/* =====================================================================
   첫 접속 화면 — 운영자 / 회원 / 게스트 선택
   ===================================================================== */
const Gate = (() => {
  const box = () => $('#gate');

  function open(html){ box().innerHTML = html; box().classList.add('on'); }
  function close(){ box().classList.remove('on'); }

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
    const list=S.members.filter(m=>m.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!list.length){
      open(`<div class="gate-card"><div class="gate-title">회원 입장</div>
        <div class="gate-sub">아직 등록된 회원이 없습니다. 게스트로 입장해 등록해 주세요.</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn" id="gBack" style="flex:1">뒤로</button>
          <button class="btn primary" id="gGuest" style="flex:2">게스트로</button></div></div>`);
      $('#gBack').onclick=screenHome; $('#gGuest').onclick=screenGuest; return;
    }
    open(`
      <div class="gate-card wide">
        <div class="gate-title">회원 입장</div>
        <div class="gate-sub">본인 이름을 선택하세요.</div>
        <input type="text" id="gQ" placeholder="이름 · 초성 검색" style="width:100%">
        <div class="gate-list" id="gList"></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="gBack" style="width:100%">뒤로</button></div>
      </div>`);
    const draw=(q='')=>{
      const el=$('#gList');
      const f=list.filter(m=>matchQ(m.name,q.trim()));
      el.innerHTML = f.length? f.map(m=>`<button class="gate-name" data-id="${m.id}">${esc(m.name)}</button>`).join('')
                             : '<div class="gate-empty">일치하는 이름이 없습니다</div>';
      el.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{
        Sound.play('confirm'); Auth.loginMember(b.dataset.id); close(); enter();
      });
    };
    draw();
    $('#gQ').oninput=e=>draw(e.target.value);
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenHome(); };
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
      Auth.loginMember(id); close(); enter();
      setTimeout(()=>toast(`${n} 님, 등록되었습니다`),300);
    };
    $('#gBack').onclick=()=>{ Sound.play('tap'); screenGuest(); };
  }

  /* 역할이 정해진 뒤 실제 화면으로 들어간다 */
  function enter(){
    applyRole();
    render();
    if(Auth.isViewer && $('#scr-mem').classList.contains('on')) show('board');
  }

  return { start(){ screenHome(); }, close, enter,
           reopen(){ screenHome(); } };
})();

/* 역할에 따라 화면 요소를 켜고 끈다 */
function applyRole(){
  document.body.dataset.role = Auth.role;
  const lbl=$('#roleLbl');
  if(lbl) lbl.textContent = Auth.roleLabel() + (Auth.isMember && Auth.memberId
      ? ' · ' + ((S.members.find(m=>m.id===Auth.memberId)||{}).name || '') : '');
  // 뷰어는 회원 명단 탭 자체를 감춘다
  const memTab=[...$$('.tab')].find(t=>t.dataset.scr==='mem');
  if(memTab) memTab.style.display = Auth.can('members') ? '' : 'none';
}
