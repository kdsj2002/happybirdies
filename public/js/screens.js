/* =====================================================================
   화면 전환
   ===================================================================== */
function show(name){
  // 탭을 감추는 것만으로는 부족하다. show()를 직접 부르는 경로(버튼·콘솔)도
  // 있으므로 여기서 한 번 더 막는다.
  if(!allowedScreen(name)) name='board';
  $$('.screen').forEach(s=>s.classList.toggle('on',s.id==='scr-'+name));
  $$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.scr===name));
  if(name==='att') renderAtt();
  if(name==='mem') renderMem();
  if(name==='hist') renderHist();
  if(name==='set') renderSet();
  if(name==='help') renderHelp();
  // 대진판을 벗어나면 1초 타이머가 필요 없다. 판단은 syncIdle이 한다.
  syncIdle();
}

/* ── 도움말 ─────────────────────────────────────────────────────
   글은 js/manual.js에 있다. 여기서는 지금 역할을 넘겨 "내 역할" 표시만
   붙이고, 따로 열어 링크로 뿌릴 수 있는 manual.html 안내를 덧붙인다. */
function renderHelp(){
  $('#helpBody').innerHTML = Manual.html({role:Auth.role})
    + `<div class="doc" style="padding-top:0">
         <div class="doc-note">
           이 설명서는 따로 열어 링크로 보낼 수도 있습니다 —
           <!-- 절대 경로여야 한다. 동호회 주소(/hanul/) 아래에서 상대 경로로
                걸면 /hanul/manual.html이 되는데, 그건 실제 파일이 아니라
                호스팅 rewrite가 대진판(index.html)으로 되돌려 버린다. -->
           <a href="/manual.html" target="_blank" rel="noopener"><b>설명서만 새 창으로 열기 →</b></a><br>
           단톡방에 붙여 두거나 인쇄해서 체육관에 붙여 두세요.
         </div>
       </div>`;
}

/* ── 초성 검색 ─────────────────────────────────────────────────── */
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initials(s){ return [...s].map(ch=>{const c=ch.charCodeAt(0)-0xAC00;
  return (c>=0&&c<11172)? CHO[Math.floor(c/588)] : ch; }).join(''); }
function matchQ(name,q){ if(!q) return true;
  return name.includes(q) || initials(name).includes(q) || initials(name).includes(initials(q)); }

/* ── 출석 ───────────────────────────────────────────────────────── */
let attSort='name', attSex='', attQ='';
function attendeeOf(memberId){ return Object.values(S.att).find(a=>a.memberId===memberId); }
function renderAtt(){
  const box=$('#attGrid'); box.innerHTML='';
  /* 출석 화면은 회원 명단을 이름 그대로 펼쳐 놓는 곳이다. 게스트(뷰어)에게는
     명단 자체가 보이면 안 되므로 회원 화면과 똑같이 막는다. 탭도 감추지만
     (applyRole) 화면 함수에서도 한 번 더 막는다 — CSS나 탭이 어떤 이유로
     반영되지 않아도 명단이 새지 않게. */
  if(!Auth.can('members')){
    box.innerHTML='<div class="hint">회원 명단은 회원과 운영자만 볼 수 있습니다.<br>'
      + '본인 이름으로 입장하면 출석을 직접 관리할 수 있습니다.</div>';
    $('#attStat').textContent='';
    return;
  }
  let list=S.members.filter(m=>m.active!==false);
  if(attSex) list=list.filter(m=>m.gender===attSex);
  list=list.filter(m=>matchQ(m.name,attQ.trim()));
  if(attSort==='name')  list.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  if(attSort==='grade') list.sort((a,b)=>gw(b.grade)-gw(a.grade)||a.name.localeCompare(b.name,'ko'));
  if(attSort==='recent')list.sort((a,b)=>(b.lastSeen||0)-(a.lastSeen||0)||a.name.localeCompare(b.name,'ko'));
  for(const m of list){
    const a=attendeeOf(m.id);
    const c=el('div','acard'+(a?' in':''));
    c.innerHTML=`<div class="ck">✓</div>
      <div class="nm">${esc(m.name)}</div>
      ${a?`<div class="sub">${a.games}게임</div>`:''}`;
    c.onclick=()=>toggleAtt(m);
    box.appendChild(c);
  }
  // 게스트
  Object.values(S.att).filter(a=>a.guest).forEach(a=>{
    const c=el('div','acard in');
    c.innerHTML=`<div class="ck">✓</div><div class="nm">${esc(a.name)}</div>
      <div class="sub" style="color:var(--gold)">게스트 · ${a.games}게임</div>`;
    c.onclick=()=>{ if(confirm(`${a.name} 게스트를 삭제할까요?`)) tx(()=>{removeFrom(a.id); delete S.att[a.id];}); renderAtt(); };
    box.appendChild(c);
  });
  const all=Object.values(S.att);
  $('#attStat').innerHTML=`출석 <b>${all.length}</b> (♂${all.filter(isM).length} · ♀${all.filter(isF).length}) / 회원 ${S.members.filter(m=>m.active!==false).length}`;
}
function toggleAtt(m){
  // 운영자는 전원을, 회원은 본인만 출석 처리할 수 있다.
  if(!Auth.can('edit')){
    if(!(Auth.can('selfCheckIn') && m.id === Auth.memberId)){
      Sound.play('error'); toast('본인 출석만 변경할 수 있습니다'); return;
    }
  }
  const a=attendeeOf(m.id);
  if(a){
    if(a.state==='PLAYING'&&!confirm(`${m.name} 님은 경기 중입니다. 출석을 해제하면 코트에서 빠집니다. 진행할까요?`)) return;
    tx(()=>{ removeFrom(a.id); delete S.att[a.id]; });
  } else {
    Sound.play('tap');
    tx(()=>{ const id=uid('a');
      S.att[id]={id,memberId:m.id,name:m.name,grade:m.grade,gender:m.gender,birthYear:m.birthYear,
                 guest:false,games:0,lastEnd:null,state:'POOL',jit:Math.random()};
      m.lastSeen=now(); });
  }
  renderAtt();
}
$('#attQ').oninput=e=>{attQ=e.target.value;renderAtt();};
$('#btnGuest').onclick=()=>{
  if(!requirePerm('edit')) return;
  openModal(`<h3>게스트 추가</h3><div class="sub">당일만 사용하고 회원 명단에는 저장하지 않습니다.</div>
    <div class="row"><label class="fl" style="flex:1">이름<input type="text" id="gN"></label>
    <label class="fl">성별<select id="gS"><option value="M">♂ 남</option><option value="F">♀ 여</option></select></label>
    <label class="fl">급수<select id="gG">${S.settings.grades.map(g=>`<option value="${g.code}" ${g.code==='C'?'selected':''}>${g.code} ${g.label}</option>`).join('')}</select></label></div>
    <div class="row end"><button class="btn" onclick="closeModal()">취소</button>
    <button class="btn primary" id="gOk">추가</button></div>`);
  $('#gOk').onclick=()=>{ const n=$('#gN').value.trim(); if(!n) return toast('이름을 입력하세요');
    closeModal(); tx(()=>{ const id=uid('a');
      S.att[id]={id,memberId:null,name:n,grade:$('#gG').value,gender:$('#gS').value,birthYear:null,
                 guest:true,games:0,lastEnd:null,state:'POOL',jit:Math.random()}; }); renderAtt(); };
};

/* ── 회원 ───────────────────────────────────────────────────────── */
let memQ='';
function renderMem(){
  if(!Auth.can('members')){
    $('#memTbl').innerHTML=''; $('#memStat').textContent='';
    $('#scr-mem').querySelector('.pad').innerHTML='<div class="hint">회원 명단은 회원/운영자만 볼 수 있습니다.</div>';
    return;
  }
  const t=$('#memTbl');
  let list=S.members.filter(m=>matchQ(m.name,memQ.trim()));
  list.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  t.innerHTML=`<tr><th>이름</th><th>성별</th><th>출생년도</th><th>급수</th><th>상태</th><th></th></tr>`
    + list.map(m=>`<tr><td style="font-weight:700;font-size:16px">${esc(m.name)}</td>
      <td>${sexIcon(m.gender)}</td><td class="num">${m.birthYear||'—'}</td>
      <td><b style="color:${G(m.grade).color}">${esc(m.grade)}</b> <span style="color:var(--muted)">${esc(G(m.grade).label)}</span></td>
      <td style="color:${m.active===false?'var(--muted2)':'var(--court)'}">${m.active===false?'비활성':'활성'}</td>
      <td style="text-align:right"><button class="btn sm" data-edit="${m.id}">수정</button></td></tr>`).join('');
  // 복원 버튼은 설정을 덮어쓰므로 운영자에게만 보인다
  const imp=$('#btnImport'); if(imp) imp.style.display = Auth.can('settings')? '' : 'none';
  renderJoinBtn();
  ['#btnAddMem','#btnCsv'].forEach(sel=>{ const b=$(sel);
    if(b) b.style.display = Auth.can('membersEdit')? '' : 'none'; });
  const act=S.members.filter(m=>m.active!==false);
  const noG=S.members.filter(m=>m.gender!=='M'&&m.gender!=='F').length;
  $('#memStat').innerHTML=`전체 <b>${S.members.length}</b> · 활성 <b>${act.length}</b> (♂${act.filter(isM).length} · ♀${act.filter(isF).length})`
    + (noG?` · <span style="color:var(--cork)">성별 미입력 ${noG}</span>`:'');
  t.onclick=e=>{ const b=e.target.closest('[data-edit]'); if(!b) return;
    if(!requirePerm('membersEdit')) return;
    memDialog(S.members.find(m=>m.id===b.dataset.edit)); };
}
/* ── 가입 요청 승인 ──────────────────────────────────────────────
   게스트가 낸 요청은 members가 아니라 joinRequests에 쌓인다. 승인해야
   회원이 되고, 그때서야 입장 화면·출석 화면의 명단에 나타난다. */
function renderJoinBtn(){
  const b=$('#btnJoin'); if(!b) return;
  const n=(S.joinRequests||[]).length;
  b.style.display = (Auth.can('membersEdit') && n) ? '' : 'none';
  b.textContent = `가입 요청 ${n}`;
  b.classList.toggle('warn', n>0);
}
function joinDialog(){
  if(!requirePerm('membersEdit')) return;
  const list=(S.joinRequests||[]).slice().sort((a,b)=>a.at-b.at);
  if(!list.length){ closeModal(); return toast('대기 중인 가입 요청이 없습니다'); }
  openModal(`<h3>가입 요청 ${list.length}건</h3>
    <div class="sub">승인하면 회원 명단에 올라가고, 그 사람 기기는 자동으로 회원으로 전환됩니다.</div>
    ${list.map(r=>`<div class="opt" style="cursor:default">
      <div style="flex:1">
        <div class="t">${esc(r.name)} <span style="color:${G(r.grade).color}">${esc(r.grade)}</span></div>
        <div class="d">${r.gender==='M'?'♂ 남':'♀ 여'}${r.birthYear?' · '+r.birthYear:''}
          · ${new Date(r.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button class="btn sm" data-rej="${esc(r.id)}">거절</button>
      <button class="btn sm primary" data-app="${esc(r.id)}">승인</button>
    </div>`).join('')}
    <div class="row end"><button class="btn" onclick="closeModal()">닫기</button></div>`);
  $$('#modal [data-app]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const m=await approveJoinRequest(b.dataset.app);
    Sound.play('confirm');
    if(m) toast(`${m.name} 님을 회원으로 등록했습니다`);
    renderMem(); joinDialog();
  });
  $$('#modal [data-rej]').forEach(b=>b.onclick=async()=>{
    const r=(S.joinRequests||[]).find(x=>x.id===b.dataset.rej);
    if(!confirm(`${r?r.name:'이 요청'} 님의 가입 요청을 거절할까요?`)) return;
    b.disabled=true;
    await rejectJoinRequest(b.dataset.rej);
    Sound.play('tap'); renderMem(); joinDialog();
  });
}
$('#btnJoin').onclick=()=>{ Sound.play('tap'); joinDialog(); };
$('#memQ').oninput=e=>{memQ=e.target.value;renderMem();};
$('#btnAddMem').onclick=()=>{ if(!requirePerm('membersEdit')) return; Sound.play('tap'); memDialog(null); };
function memDialog(m){
  const isNew=!m;
  openModal(`<h3>${isNew?'회원 추가':'회원 수정'}</h3><div class="sub">성별은 경기 유형 판정에 쓰이므로 필수입니다.</div>
    <div class="row"><label class="fl" style="flex:1">이름<input type="text" id="mN" value="${esc(m?.name||'')}"></label>
    <label class="fl">성별<select id="mS">
      <option value="">선택</option>
      <option value="M" ${m?.gender==='M'?'selected':''}>♂ 남</option>
      <option value="F" ${m?.gender==='F'?'selected':''}>♀ 여</option></select></label>
    <label class="fl">출생년도<input type="number" id="mY" style="width:110px" value="${m?.birthYear||''}" placeholder="1985"></label>
    <label class="fl">급수<select id="mG">${S.settings.grades.map(g=>`<option value="${g.code}" ${m?.grade===g.code?'selected':''}>${g.code} ${g.label}</option>`).join('')}</select></label></div>
    ${isNew?'':`<label class="row" style="margin-top:14px;cursor:pointer"><input type="checkbox" id="mA" ${m.active!==false?'checked':''} style="width:20px;height:20px"> 활성 (해제하면 출석 목록에서 숨겨집니다)</label>`}
    <div class="row end">${isNew?'':'<button class="btn ghost" id="mDel" style="margin-right:auto;color:var(--cork)">삭제</button>'}
    <button class="btn" onclick="closeModal()">취소</button><button class="btn primary" id="mOk">저장</button></div>`);
  $('#mOk').onclick=()=>{
    const n=$('#mN').value.trim(), g=$('#mS').value;
    if(!n) return toast('이름을 입력하세요');
    if(!g) return toast('성별을 선택하세요');
    const y=parseInt($('#mY').value)||null;
    if(isNew) S.members.push({id:uid('m'),name:n,gender:g,birthYear:y,grade:$('#mG').value,active:true,lastSeen:0});
    else Object.assign(m,{name:n,gender:g,birthYear:y,grade:$('#mG').value,active:$('#mA').checked});
    closeModal(); save(); renderMem(); toast('저장했습니다');
  };
  /* 한 명 삭제는 이름을 눈으로 확인하고 지우는 조작이라 비밀번호까지는 받지 않는다.
     대신 기준선을 같이 내려 준다 — 그래야 save()의 회원 삭제 방지 잠금을 통과한다.
     (여러 명이 한꺼번에 사라지는 저장은 그 잠금에 걸려 아예 올라가지 않는다.) */
  if(!isNew) $('#mDel').onclick=()=>{
    if(!confirm(`${m.name} 님을 클럽 명단에서 삭제할까요?\n\n`
      + '· 클라우드에서 지워지고 모든 기기에 반영됩니다\n'
      + '· 되돌리기(↩)로는 되돌아가지 않습니다\n'
      + "· 기록 보존을 위해 보통은 '활성' 해제를 권합니다")) return;
    S.members=S.members.filter(x=>x.id!==m.id);
    setMembersBaseline(S.members);
    closeModal(); save(); renderMem(); };
}
$('#btnCsv').onclick=()=>{
  if(!requirePerm('membersEdit')) return;
  openModal(`<h3>CSV 일괄 등록</h3><div class="sub">헤더 포함. 형식: 이름,출생년도,급수,성별</div>
    <textarea id="csv" rows="12" placeholder="이름,출생년도,급수,성별&#10;김철수,1982,B,M&#10;박영희,1990,C,여"></textarea>
    <div class="row end"><button class="btn" onclick="closeModal()">취소</button><button class="btn primary" id="csvOk">가져오기</button></div>`);
  $('#csvOk').onclick=()=>{
    const lines=$('#csv').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const add=[], err=[];
    const codes=S.settings.grades.map(g=>g.code);
    lines.forEach((ln,i)=>{
      if(i===0&&/이름/.test(ln)) return;
      const p=ln.split(',').map(x=>x.trim());
      const [name,by,gr,sx]=p;
      if(!name) return err.push(`${i+1}행: 이름 없음`);
      const gender = /^(M|m|남)/.test(sx||'')?'M' : /^(F|f|여)/.test(sx||'')?'F' : null;
      if(!gender) return err.push(`${i+1}행 ${name}: 성별 없음`);
      let grade=(gr||'').toUpperCase();
      if(!codes.includes(grade)){ const byLabel=S.settings.grades.find(g=>g.label===gr); grade=byLabel?byLabel.code:'C'; }
      const dup = m => m.name===name && String(m.birthYear||'')===String(by||'');
      if(S.members.some(dup)||add.some(dup)) return err.push(`${i+1}행 ${name}: 중복`);
      add.push({id:uid('m'),name,gender,birthYear:parseInt(by)||null,grade,active:true,lastSeen:0});
    });
    closeModal();
    const showErr = ()=>{ if(!err.length) return;
      setTimeout(()=>openModal(`<h3>가져오기 결과</h3><div class="sub">등록 ${add.length}건 · 오류 ${err.length}건</div>
        <div class="hint">${err.map(esc).join('<br>')}</div>
        <div class="row end"><button class="btn primary" onclick="closeModal()">확인</button></div>`),300); };
    if(!add.length){ toast(`등록할 회원이 없습니다${err.length?` / 오류 ${err.length}건`:''}`); return showErr(); }
    // 여러 명을 한 번에 회원 문서에 쓰는 조작이므로 비밀번호 확인을 거친다.
    bulkOverwriteMembers(S.members.concat(add),
      { source:`CSV 일괄등록 — ${add.length}명 추가`, after:showErr });
  };
};
/* 백업 내려받기. 덮어쓰기 확인 창에서도 부르므로 이름을 붙여 둔다. */
async function exportBackup(){
  const idx=(await Store.get(K('sessions')))||[];
  const sessions={};
  for(const d of idx) sessions[d]=await Store.get(K('session:'+d));
  const blob=new Blob([JSON.stringify({v:1,club:CLUB,settings:S.settings,members:S.members,sessions},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`배드민턴_백업_${todayStr()}.json`; a.click(); toast('백업 파일을 내려받았습니다');
}
$('#btnExport').onclick=exportBackup;
$('#btnImport').onclick=()=>{
  // 복원 파일에는 설정도 들어 있어 이걸 허용하면 설정 제한이 무의미해진다.
  if(!requirePerm('settings')) return;
  Sound.play('tap'); $('#fileIn').click();
};
$('#fileIn').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
    const d=JSON.parse(r.result);
    if(!d || !Array.isArray(d.members)) return toast('회원 명단이 들어 있는 백업 파일이 아닙니다');
    /* 복원은 회원 문서를 파일 내용으로 통째로 갈아끼우는 조작이다.
       비밀번호 확인을 통과한 뒤에야 설정·세션까지 함께 적용한다. */
    bulkOverwriteMembers(d.members, {
      source:`백업 파일 복원 — ${f.name}`,
      async applyExtra(){
        S.settings=Object.assign(clone(DEFAULTS),d.settings||{});
        settingsTrusted = true;                 // 파일에서 통째로 받은 값이다
        if(d.sessions) for(const [k,v] of Object.entries(d.sessions)) if(v) await Store.set(K('session:'+k),v);
        await Store.set(K('sessions'),Object.keys(d.sessions||{}));
        sessionsIdx = null;                     // 세션 목록을 다음 저장 때 다시 읽게 한다
        const cur=d.sessions?.[S.date];
        if(cur) Object.assign(S,{att:cur.att||{},courts:cur.courts,queues:cur.queues,matches:cur.matches||[],hist:cur.hist||[]});
      },
      after(){ renderSet(); toast('복원했습니다 — 설정과 세션 기록도 파일 내용으로 바뀌었습니다'); }
    });
  }catch(err){ toast('파일을 읽을 수 없습니다'); } };
  r.readAsText(f); e.target.value='';
};

/* ── 기록 화면의 작은 막대들 ─────────────────────────────────────
   숫자만 늘어놓은 표는 "누가 많이 쳤나"를 읽으려면 눈이 일일이 비교를
   해야 한다. 같은 자리에 막대를 깔면 그 비교를 눈이 대신 해 준다.
   기록 화면과 누적 통계가 같은 함수를 쓴다 — 두 표의 막대가 다르게
   생기면 같은 값을 다른 것으로 읽게 된다. */

/* 게임 수 — 그날(또는 그 기간) 최다인 사람 대비 길이 */
function gamesBarHtml(n, max){
  const pct = max>0 ? Math.round(100*n/max) : 0;
  return `<div class="mrow"><b class="num" style="font-weight:800;font-size:16px">${n}</b>
    <span class="mbar"><i class="w" style="width:${pct}%;opacity:${n?1:0}"></i></span></div>`;
}
/* 승-패 — 왼쪽에서 승(초록), 오른쪽에서 패(주황)가 자란다.
   승패를 안 적은 경기는 어느 쪽도 아니라서 가운데가 비어 남는다. */
function winBarHtml(w, l){
  const t = w+l;
  if(!t) return '<span style="color:var(--muted2)">—</span>';
  return `<div class="mrow"><b class="num" style="font-weight:700">${w}-${l}</b>
    <span class="mbar"><i class="w" style="width:${Math.round(100*w/t)}%"></i>
      <i class="l" style="width:${Math.round(100*l/t)}%"></i></span></div>`;
}
/* 경기 유형 분포 — 한 줄짜리 누적 막대. 색은 배지(.mt)와 같은 것을 쓴다.
   좁은 조각에는 글자가 안 들어가므로 8% 미만이면 범례에만 남긴다. */
function typeStackHtml(byType, total){
  const ts = ['MD','WD','XD','MX','UNKNOWN'].filter(t=>byType[t]);
  if(!ts.length || !total) return '';
  return `<div style="margin-bottom:22px">
    <div class="mstack">
      ${ts.map(t=>{ const p = 100*byType[t]/total; return `<i style="width:${p.toFixed(1)}%;background:${MT_COLOR[t]}">${
        p>=8?`<span>${MT_LBL[t]} ${Math.round(p)}%</span>`:''}</i>`; }).join('')}
    </div>
    <div class="mlegend">
      ${ts.map(t=>`<span><b style="background:${MT_COLOR[t]}"></b>${MT_LBL[t]} ${byType[t]}경기
        · ${Math.round(100*byType[t]/total)}%</span>`).join('')}
    </div></div>`;
}

/* ── 기록 ───────────────────────────────────────────────────────── */
function renderHist(){
  /* 기록에는 출석자 전원의 이름과 게임 수가 그대로 있다. 게스트에게는
     탭도 감추지만(applyRole) 화면 함수에서도 한 번 더 막는다. */
  if(Auth.isViewer){
    $('#histBody').innerHTML='<div class="hint">경기 기록은 회원과 운영자만 볼 수 있습니다.<br>'
      + '본인 이름으로 입장하면 내 게임 수를 확인할 수 있습니다.</div>';
    return;
  }
  const done=S.matches.filter(m=>m.endedAt);
  const all=Object.values(S.att).sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name,'ko'));
  const byType={}; done.forEach(m=>byType[m.type||'UNKNOWN']=(byType[m.type||'UNKNOWN']||0)+1);
  const avg=done.length? done.reduce((s,m)=>s+(m.endedAt-m.startedAt),0)/done.length/60000 : 0;
  const men=all.filter(isM), wom=all.filter(isF);
  const mean=a=>a.length? (a.reduce((s,x)=>s+x.games,0)/a.length).toFixed(2):'—';
  const scored=done.filter(m=>m.win).length;
  /* 결과 칸. 운영자에게는 비어 있어도 누를 곳이 보여야 한다 — 안 그러면
     "승패 없이 종료"한 판을 나중에 채워 넣을 길이 있다는 걸 알 수 없다. */
  const canEditRes = Auth.can('edit');
  const resCell = m => m.win
    ? `<b style="color:var(--court)">${m.win}팀 승</b>`
      + (m.sw!=null && m.sl!=null ? ` <span class="num" style="color:var(--muted)">${m.sw}:${m.sl}</span>` : '')
    : `<span style="color:var(--muted2)">${canEditRes?'입력 ✎':'—'}</span>`;
  const maxG = all.length ? Math.max(1, ...all.map(a=>a.games)) : 1;
  $('#histBody').innerHTML=`
    <div class="sec-h">${S.date} 세션 요약<span class="rule"></span></div>
    <div class="mcards">
      <div class="mcard"><div class="k">총 경기</div><div class="v num">${done.length}</div></div>
      <div class="mcard"><div class="k">평균 경기시간</div><div class="v num">${avg.toFixed(1)}<small>분</small></div></div>
      <div class="mcard"><div class="k">남 평균</div><div class="v num">${mean(men)}<small>게임</small></div></div>
      <div class="mcard"><div class="k">여 평균</div><div class="v num">${mean(wom)}<small>게임</small></div></div>
      <div class="mcard"><div class="k">게임수 편차</div><div class="v num">${all.length?maxG-Math.min(...all.map(a=>a.games)):0}</div></div>
      <div class="mcard"><div class="k">결과 입력</div><div class="v num">${scored}<small>/${done.length}</small></div></div>
    </div>
    ${done.length ? typeStackHtml(byType, done.length)
                  : '<div class="hint" style="margin-bottom:24px">아직 종료된 경기가 없습니다.</div>'}
    <div class="sec-h">개인별<span class="rule"></span></div>
    <table><tr><th>이름</th><th>게임수</th><th>승-패</th><th>마지막 경기</th></tr>
      ${all.map(a=>{ const r=recordOf(a.id); return `<tr><td style="font-weight:700">${esc(a.name)}${a.guest?' <span style="color:var(--gold)">G</span>':''}</td>
        <td>${gamesBarHtml(a.games, maxG)}</td>
        <td>${winBarHtml(r.w, r.l)}</td>
        <td style="color:var(--muted)">${a.lastEnd?new Date(a.lastEnd).toTimeString().slice(0,5):'—'}</td></tr>`; }).join('')}
    </table>
    <div class="hint" style="margin-top:6px">막대는 <b>가장 많이 친 사람 대비</b>입니다.
      한쪽으로 길게 치우쳐 있으면 그날 배정이 고르지 않았다는 뜻입니다.</div>
    <div class="sec-h" style="margin-top:26px">경기 이력<span class="rule"></span></div>
    <table><tr><th>#</th><th>코트</th><th>유형</th><th>A팀</th><th>B팀</th><th>결과</th><th>시간</th></tr>
      ${done.slice().reverse().map((m,i)=>`<tr><td class="num">${done.length-i}</td><td>${m.court}</td>
        <td><span class="mt ${m.type||'UNKNOWN'}" style="cursor:default;height:22px">${MT_LBL[m.type||'UNKNOWN']}</span></td>
        <td${m.win==='A'?' style="font-weight:800"':''}>${(m.An||m.A.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td${m.win==='B'?' style="font-weight:800"':''}>${(m.Bn||m.B.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td class="res-cell${canEditRes?' edit':''}"${canEditRes?` data-res="${esc(m.id)}"`:''}>${resCell(m)}</td>
        <td class="num" style="color:var(--muted)">${Math.round((m.endedAt-m.startedAt)/60000)}분</td></tr>`).join('')}
    </table>
    ${done.length?`<div class="hint" style="margin-top:8px">${canEditRes
        ? '결과 칸을 누르면 승패와 점수를 넣거나 고칠 수 있습니다. 점수는 <b>진 팀 점수</b>만 넣으면 됩니다.'
        : '결과는 운영자가 넣습니다.'}</div>`:''}
    <div class="sec-h" style="margin-top:26px">누적 통계<span class="rule"></span></div>
    <div class="hint" style="margin-bottom:10px">
      끝난 경기는 세션과 별개로 <span class="num">clubs/${esc(CLUB)}/kv/rec:날짜</span> 원장에 날짜별로 남습니다.
      전원 퇴장하거나 날이 바뀌어도 지워지지 않습니다.
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" data-stat="4">최근 4회</button>
      <button class="btn sm" data-stat="12">최근 12회</button>
      <button class="btn sm" data-stat="0">전체</button>
      <span class="hint" id="statLbl2"></span>
    </div>
    <div id="statsBox"></div>
    <div class="row" style="margin-top:24px;align-items:center;gap:14px">
      <button class="btn warn" id="btnClose">세션 마감 (전원 퇴장)</button>
      <span class="hint" id="autoCloseLbl"></span>
    </div>`;

  /* 누적 통계는 눌렀을 때만 읽는다. 날짜마다 문서가 하나라, 기록 탭을 열
     때마다 통째로 읽으면 오래된 동호회일수록 느려지고 읽기 쿼터도 먹는다. */
  $$('#histBody [data-stat]').forEach(b=>b.onclick=()=>{ Sound.play('tap'); renderStats(+b.dataset.stat); });
  /* 끝난 경기의 결과를 나중에 채워 넣거나 고친다. 종료할 때 "승패 없이"를
     골랐거나, 점수를 나중에 들었을 때 쓴다. 같은 창(resultDialog)이다. */
  $$('#histBody [data-res]').forEach(e=>e.onclick=()=>{
    if(!requirePerm('edit')) return;
    const m=S.matches.find(x=>x.id===e.dataset.res); if(!m) return;
    Sound.play('tap');
    // 대진판에서 묶인 사람을 풀 때와 같은 창이다(actions.js openResultFor).
    openResultFor(m, { after: renderHist });
  });
  (function(){
    const lbl=$('#autoCloseLbl');
    if(!S.startedAt){
      lbl.textContent=`첫 경기가 시작되면 ${autoCloseHours()}시간 뒤 자동 마감됩니다 · 수동 마감은 운영자만 가능합니다`;
      return;
    }
    const ms=msUntilAutoClose();
    if(ms>0){
      const h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000);
      lbl.textContent=`자동 마감까지 ${h}시간 ${m}분 · 마감은 운영자만 할 수 있습니다`;
    }else{
      lbl.textContent='곧 자동 마감됩니다';
    }
  })();
  $('#btnClose').onclick=()=>{
    if(!requirePerm('closeSess')) return;
    if(!confirm('전원 퇴장 처리하고 대진판을 비웁니다. 오늘 경기 기록은 남습니다. 진행할까요?')) return;
    Sound.play('confirm');
    tx(()=>closeSession('MANUAL'),{auto:false});
    renderHist(); toast('세션을 마감했습니다');
  };
}

/* ── 누적 통계 ───────────────────────────────────────────────────
   원장(records.js)을 읽어 사람별로 묶는다. n=0이면 전체, 아니면 최근 n번의
   운동일이다(달력 날짜가 아니라 기록이 있는 날 기준 — 한 주에 두 번 치는
   동호회와 매일 치는 동호회에서 "최근 12회"가 같은 뜻이 되게).

   회원은 회원 id로 묶여서 이름이 바뀌어도 이어지고, 게스트는 이름으로밖에
   묶을 수 없어 따로 표시한다. 그 한계는 원장 설계 자체에서 온다(회원 id가
   없는 사람에게 붙일 열쇠가 없다). */
async function renderStats(n){
  const box=$('#statsBox'), lbl=$('#statLbl2');
  if(!box) return;
  box.innerHTML='<div class="hint">불러오는 중...</div>';
  const all = await Records.dates();
  if(!all.length){
    lbl.textContent='';
    box.innerHTML='<div class="hint">아직 원장에 쌓인 기록이 없습니다. 경기를 마치면 그날부터 남습니다.</div>';
    return;
  }
  const pick = n>0 ? all.slice(0,n) : all;
  const list = await Records.load(pick);
  const st = Records.stats(list);
  lbl.textContent = `${pick.length}일 · ${st.matches}경기 (${pick[pick.length-1]} ~ ${pick[0]})`;

  const rows=[...st.people.values()].sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name,'ko'));
  const maxG = rows.length ? Math.max(1, ...rows.map(e=>e.games)) : 1;
  const rate = e => (e.win+e.lose) ? Math.round(100*e.win/(e.win+e.lose))+'%' : '—';
  const byType={}; list.forEach(m=>byType[m.type||'UNKNOWN']=(byType[m.type||'UNKNOWN']||0)+1);
  const maxPair = Math.max(1, ...[...st.pairs.values()].map(p=>p.n), 1);
  const maxFoe  = Math.max(1, ...[...st.foes.values()].map(p=>p.n), 1);
  // 짝·상대는 이름을 붙여 보여 준다(키는 회원 id라 사람이 읽을 수 없다).
  const nameOf = k => { const e=st.people.get(k); return e? e.name : '?'; };
  const top = (map,limit) => [...map.values()].sort((a,b)=>b.n-a.n).slice(0,limit);

  box.innerHTML=`
    ${typeStackHtml(byType, st.matches)}
    <table>
      <tr><th>이름</th><th>경기</th><th>승-패</th><th>승률</th><th>평균 득실</th><th>나온 날</th></tr>
      ${rows.map(e=>`<tr>
        <td style="font-weight:700">${esc(e.name)}${e.guest?' <span style="color:var(--gold)">G</span>':''}${
          e.memberId?'':' <span class="hint">(이름으로 묶음)</span>'}</td>
        <td>${gamesBarHtml(e.games, maxG)}</td>
        <td>${winBarHtml(e.win, e.lose)}</td>
        <td class="num" style="font-weight:700">${rate(e)}</td>
        <td class="num" style="color:var(--muted)">${(e.pf+e.pa)?`${(e.pf/e.games).toFixed(1)} : ${(e.pa/e.games).toFixed(1)}`:'—'}</td>
        <td class="num" style="color:var(--muted)">${e.days.size}</td></tr>`).join('')}
    </table>
    <div class="hint" style="margin-top:8px">
      승·패·승률은 <b>결과를 적은 경기만</b> 셉니다. 경기 수는 결과와 무관하게 전부 셉니다 —
      그래서 승+패가 경기 수보다 적을 수 있습니다.
    </div>
    <div class="row" style="gap:26px;align-items:flex-start;margin-top:20px">
      <div style="flex:1;min-width:260px">
        <div class="sec-h">자주 함께한 짝<span class="rule"></span></div>
        <table><tr><th>짝</th><th>함께</th><th>승</th></tr>
          ${top(st.pairs,10).map(p=>`<tr><td>${esc(nameOf(p.a))} · ${esc(nameOf(p.b))}</td>
            <td>${gamesBarHtml(p.n, maxPair)}</td>
            <td class="num" style="color:var(--muted)">${p.win}</td></tr>`).join('')
            || '<tr><td colspan="3" class="hint">없음</td></tr>'}
        </table>
      </div>
      <div style="flex:1;min-width:260px">
        <div class="sec-h">자주 만난 상대<span class="rule"></span></div>
        <table><tr><th>상대</th><th>만남</th></tr>
          ${top(st.foes,10).map(p=>`<tr><td>${esc(nameOf(p.a))} ↔ ${esc(nameOf(p.b))}</td>
            <td>${gamesBarHtml(p.n, maxFoe)}</td></tr>`).join('')
            || '<tr><td colspan="2" class="hint">없음</td></tr>'}
        </table>
      </div>
    </div>
    <div class="hint" style="margin-top:12px">
      설정 → <b>지난 기록 참고</b>를 켜면 이 "함께한 짝" 횟수를 자동 배치의 중복 회피에 씁니다.
      지금은 <b>${S.settings.historyDays?`최근 ${S.settings.historyDays}회`:'사용 안 함'}</b>입니다.
    </div>`;
}

/* ── 설정 ───────────────────────────────────────────────────────── */
const POLICY=[['FREE','성별 무시 (권장)','공정성만 보고 조합. 결과대로 유형만 표기'],
  ['PREFER_SAME','동성 우선','남복·여복 선호. 여성이 소수면 혼복이 사라질 수 있음'],
  ['PREFER_MIXED','혼복 우선','혼복 선호. 여복이 거의 안 나옴'],
  ['STRICT_SAME','동성 강제','남4·여4만 허용'],
  ['STRICT_MIXED','혼복 강제','남2여2만 허용. 성비가 치우치면 공정성이 깨짐']];
function renderSet(){
  /* 게스트에게는 클럽 운영 값을 보여 주지 않는다. 대신 역할을 바꿀 길만
     남긴다 — 이것마저 없으면 게스트로 한 번 들어온 기기가 갇힌다. */
  if(Auth.isViewer){
    $('#setBody').innerHTML=`
      <div class="hint" style="margin-bottom:16px">설정은 회원과 운영자만 볼 수 있습니다.</div>
      <div class="row"><button class="btn primary" id="s_relogin">입장하기</button></div>`;
    $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
    return;
  }
  // 설정은 운영자 전용이다. 회원에게는 현재 값을 읽기 전용으로 보여 준다.
  // 화면을 통째로 비우면 "지금 어떤 규칙으로 돌고 있는지"조차 확인할 수 없어서다.
  if(!Auth.can('settings')){
    const s=S.settings;
    const pol=(POLICY.find(p=>p[0]===s.genderPolicy)||POLICY[0]);
    $('#setBody').innerHTML=`
      <div class="hint" style="margin-bottom:16px">
        설정 변경은 <b>운영자</b>만 할 수 있습니다. 현재 적용된 값은 아래와 같습니다.
      </div>
      <div class="kv">
        <div class="h">현재 설정</div>
        <div class="k">클럽 이름</div><div>${esc(s.clubName)}</div>
        <div class="k">코트 / 대기 슬롯</div><div>${s.courtCount}면 / ${s.queueSlotCount}개</div>
        <div class="k">자동 배치</div><div>${s.autoMode?'켜짐':'꺼짐'}</div>
        <div class="k">성별 정책</div><div>${esc(pol[1])}</div>
        <div class="k">경기 시간 경고</div><div>${s.matchWarnMinutes}분</div>
        <div class="k">최대 경기 시간</div><div>${s.maxMatchMinutes?`${s.maxMatchMinutes}분 (자동 종료)`:'사용 안 함'}</div>
        <div class="k">한 게임 점수</div><div>${s.winPoint||21}점</div>
        <div class="k">결과 기록 강제</div><div>${s.requireResult?'켜짐 — 결과를 적어야 다음 판에 들어갑니다':'꺼짐'}</div>
        <div class="k">자동 마감</div><div>첫 경기 후 ${autoCloseHours()}시간</div>
        <div class="h">내 계정</div>
        <div class="k">현재 역할</div><div><b>${esc(Auth.roleLabel())}</b></div>
        <div class="k">앱 버전</div><div class="num">${esc(APP_VERSION)}</div>
        <div class="k">효과음</div><div><label class="row"><input type="checkbox" id="s_soundOnly" ${s.sound!==false?'checked':''} style="width:20px;height:20px"> 이 기기에서 소리 내기</label></div>
      </div>
      <div class="row" style="margin-top:20px"><button class="btn" id="s_relogin">다시 입장하기</button></div>`;
    // 소리는 기기별 취향이라 권한과 무관하게 각자 켜고 끌 수 있게 둔다.
    $('#s_soundOnly').onchange=e=>{ Sound.set(e.target.checked); Sound.play('tap'); };
    $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
    return;
  }
  const s=S.settings;
  $('#setBody').innerHTML=`
    <div class="kv">
      <div class="h">기본</div>
      <div class="k">클럽 이름</div><div><input type="text" id="s_club" value="${esc(s.clubName)}" style="width:240px"></div>
      <div class="k">코트 수</div><div><input type="number" id="s_courts" value="${s.courtCount}" min="1" max="8" style="width:90px">
        <span class="hint">대진판은 초기화되지 않습니다 — 뒤에서 코트를 더하거나 뺍니다.
          줄일 때 그 코트에 사람이 있으면 무엇이 어떻게 되는지 먼저 보여 드립니다</span></div>
      <div class="k">대기 슬롯 수</div><div><input type="number" id="s_slots" value="${s.queueSlotCount}" min="2" max="12" style="width:90px"></div>
      <div class="k">풀 최소 확보 인원</div><div><input type="number" id="s_minpool" value="${s.minPool}" min="0" max="12" style="width:90px">
        <span class="hint">대기 슬롯을 끝까지 채우지 않고 이만큼은 대기 인원으로 남깁니다. 0으로 두면 방금 같이 친 4명이 그대로 다시 묶입니다</span></div>
      <div class="k">경기 시간 경고</div><div><input type="number" id="s_warn" value="${s.matchWarnMinutes}" min="5" max="60" style="width:90px"> 분 초과 시 코트가 붉게 표시</div>
      <div class="k">최대 경기 시간</div><div><input type="number" id="s_maxmin" value="${s.maxMatchMinutes==null?30:s.maxMatchMinutes}" min="0" max="120" style="width:90px">
        <span class="hint">이 시간에 닿으면 <b>경기를 자동으로 마칩니다</b> — 네 명 모두 게임 수가 1 오르고
          기록에 남으며 대기 인원으로 내려갑니다. 승패는 비워 둡니다(나중에 기록 화면에서 넣을 수 있습니다).
          <b>0이면 사용하지 않습니다.</b></span></div>
      <div class="k">결과 기록 강제</div><div>
        <label class="row"><input type="checkbox" id="s_reqres" ${s.requireResult?'checked':''} style="width:20px;height:20px">
          결과를 적을 때까지 그 네 명을 묶어 둡니다</label>
        <div class="hint" style="margin-top:6px">켜면 경기가 끝날 때 <b>결과 창이 뜨지 않습니다.</b>
          대신 그 네 명의 칩이 <b style="color:var(--cork)">붉게 깜박이며 아무 데로도 움직이지 않습니다</b> —
          자동 배치에서도 빠집니다. 다음 판에 넣으려면 결과부터 적어야 합니다.<br>
          창을 띄워 봐야 '나중에'를 누르게 되고, 그 '나중에'가 결국 결과가 안 남는 이유였습니다.
          정말 아무도 모르는 판은 결과 창의 <b>모름 — 기록 없이 풀기</b>로 넘길 수 있습니다.</div></div>
      <div class="k">한 게임 점수</div><div><input type="number" id="s_wp" value="${s.winPoint||21}" min="5" max="31" style="width:90px">
        <span class="hint">결과를 넣을 때 <b>진 팀 점수</b>만 받고 이긴 팀 점수는 여기서 계산합니다
          (${s.winPoint||21}점제 · 듀스는 2점 차 · 상한 ${(s.winPoint||21)+9}점)</span></div>

      <div class="h">자동화</div>
      <div class="k">자동 배치</div><div><label class="row"><input type="checkbox" id="s_auto" ${s.autoMode?'checked':''} style="width:20px;height:20px"> 켜기</label></div>
      <div class="k">코트 자동 투입</div><div><label class="row"><input type="checkbox" id="s_push" ${s.autoPushToCourt?'checked':''} style="width:20px;height:20px"> 코트가 비면 대기 1번 팀을 바로 올림</label></div>

      <div class="h">성별 정책</div>
      <div class="k">정책</div><div><select id="s_pol" style="width:280px">${POLICY.map(([v,l])=>`<option value="${v}" ${s.genderPolicy===v?'selected':''}>${l}</option>`).join('')}</select>
        <div class="hint" style="margin-top:6px">${POLICY.find(p=>p[0]===s.genderPolicy)[2]}</div></div>
      <div class="k">3:1 감점</div><div><input type="number" id="s_odd" value="${s.w.odd}" step="10" style="width:110px">
        <span class="hint">−250이면 남3여1 조합을 사실상 차단합니다</span></div>
      <div class="k">감점 면제 기준</div><div><input type="number" id="s_relax" value="${s.oddRelaxThreshold}" min="1" max="5" style="width:90px">
        <span class="hint">게임 이상 뒤처진 사람이 있으면 3:1 감점을 면제 (소수 성별이 대기에 갇히는 것을 방지)</span></div>

      <div class="h">배치 가중치</div>
      <div class="k">게임 수 격차</div><div><input type="number" id="s_wgame" value="${s.w.game}" step="10" style="width:110px"> <span class="hint">클수록 공정성 우선</span></div>
      <div class="k">대기 시간 (분당)</div><div><input type="number" id="s_wwait" value="${s.w.wait}" style="width:110px"></div>
      <div class="k">중복 회피</div><div><input type="number" id="s_wrep" value="${s.w.repeat}" style="width:110px">
        <span class="hint">최근 <input type="number" id="s_look" value="${s.repeatLookback}" min="0" max="10" style="width:60px;height:32px"> 경기 내 같은 조 회피</span></div>
      <div class="k">지난 기록 참고</div><div><input type="number" id="s_hist" value="${s.historyDays||0}" min="0" max="60" style="width:90px">
        <span class="hint">지난 <b>운동일</b>을 이만큼 불러와 "같은 팀이었던 횟수"를 중복 회피에 더합니다
          (달력 날짜가 아니라 기록이 있는 날 기준). 오늘 안의 이력보다 절반 무게로 셉니다 —
          방금 친 사람과 또 붙는 것이 지난주보다 무겁기 때문입니다.
          <b>0이면 지금까지처럼 오늘 안만 봅니다.</b></span></div>
      <div class="k">급수 밸런스</div><div><input type="number" id="s_wbal" value="${s.w.balance}" style="width:110px"></div>
      <div class="k">연령 고려</div><div><input type="number" id="s_wage" value="${s.w.age}" style="width:110px"> <span class="hint">0이면 사용 안 함</span></div>

      <div class="h">소리 · 계정</div>
      <div class="k">효과음</div><div><label class="row"><input type="checkbox" id="s_sound" ${s.sound!==false?'checked':''} style="width:20px;height:20px"> 버튼과 경기 시작 알림에 소리를 냅니다</label></div>
      <div class="k">현재 역할</div><div><b>${esc(Auth.roleLabel())}</b>
        <button class="btn sm" id="s_relogin" style="margin-left:10px">다시 입장하기</button></div>

      <div class="h">버전</div>
      <div class="k">앱 버전</div><div><b class="num">${esc(APP_VERSION)}</b>
        <div class="hint" style="margin-top:6px">재배포했는데 화면이 그대로면 이 숫자를 확인하세요.
          바뀌지 않았다면 브라우저가 옛 파일을 쓰고 있는 것이니 새로고침(모바일은 탭을 닫았다 열기)하세요.</div></div>

      <div class="h">데이터 복구</div>
      <div class="k">클라우드에서 다시 불러오기</div><div>
        <button class="btn sm" id="s_reload">지금 다시 불러오기</button>
        <div class="hint" style="margin-top:6px">화면의 회원·기록이 비어 보이면 저장하지 말고 이 버튼을 먼저 누르세요.
          클라우드(Firestore)에 있는 원본을 그대로 다시 읽어 옵니다.</div></div>
      <div class="k">운영자 비밀번호</div><div>
        <b id="adminPwState" style="color:var(--muted)">확인 중...</b>
        <div id="adminPwBox" style="margin-top:8px"></div>
        <div class="hint" style="margin-top:6px">운영자는 아이디 <span class="doc-k">${esc(CLUB)}</span>와
          이 비밀번호로 들어옵니다. <b>정하는 사람은 소유자입니다.</b><br>
          운영자가 바뀌거나 비밀번호가 샜다고 생각되면 여기서 새로 정하세요 —
          정하는 즉시 옛 비밀번호는 통하지 않습니다. 콘솔을 열 필요가 없습니다.</div></div>
      <div class="k">회원 명단 보호</div><div>
        <div class="hint">회원 명단을 통째로 바꾸는 조작(백업 복원 · CSV 일괄등록 · 클라우드에서 다시 불러오기)은
          <b>소유자 계정</b>으로 로그인해야 합니다. 확인 창에서 누가 사라지고 누가 생기는지,
          그 결과가 무엇인지 먼저 보여 줍니다.<br>
          비밀번호를 거치지 않은 채 회원이 사라지는 저장(명단을 못 불러와 화면이 빈 경우 등)은
          자동으로 차단되고 화면 위에 붉은 띠가 뜹니다. 그때는 아무것도 만지지 말고 새로고침하세요.<br>
          현재 기준 명단: <b>${loadedMembersCount==null?'확인 안 됨':loadedMembersCount+'명'}</b></div></div>

      <div class="h">저장소</div>
      <div class="k">서버 시계와의 차이</div><div>${clockLabel()}
        <div class="hint" style="margin-top:6px">경기 시간은 이 기기의 시계가 아니라
          <b>서버 시계</b>를 기준으로 셉니다. 그래야 어느 태블릿에서 봐도 같은 시간이 나옵니다.
          차이가 몇 분씩 난다면 이 기기의 날짜·시간 설정을 확인하세요
          (앱은 알아서 보정하지만, 다른 앱의 시간도 틀리게 됩니다).</div></div>
      <div class="k">현재 모드</div><div><b id="storeMode" style="color:${Store.mode==='firebase'?'var(--court)':'var(--muted)'}">${storeModeLabel()}</b>
        <div class="hint" style="margin-top:6px">Firebase를 연결하면 클라우드에 저장되고 다른 태블릿과 실시간으로 맞춰집니다. 연결이 끊겨도 이 기기에서 계속 조작할 수 있고, 돌아오면 자동으로 동기화됩니다. 연결하지 않으면 이 기기에만 저장되니 회원 화면의 <b>백업</b>을 주기적으로 받아 두세요.</div></div>
      <div class="k">Firebase 프로젝트</div><div>${fbConfigSectionHtml()}</div>
    </div>
    <div class="row" style="margin-top:24px"><button class="btn primary" id="s_save">설정 저장</button>
      <button class="btn" id="s_reset">기본값으로</button></div>`;
  /* 이 기기 시계가 서버보다 얼마나 빠르거나 느린가. 앱은 이 차이를 보정해
     쓰므로 화면의 경기 시간은 어느 기기에서나 같다 — 이 값은 "왜 그런가"를
     확인하고 기기 시계가 크게 틀어진 것을 알아채기 위한 것이다. */
  function clockLabel(){
    if(Store.mode!=='firebase') return '<b style="color:var(--muted)">—</b> '
      + '<span class="hint">Firebase 미연결 — 이 기기 시계를 그대로 씁니다</span>';
    if(!Store.clockKnown()) return '<b style="color:var(--muted)">확인 중...</b> '
      + '<span class="hint">첫 동기화가 오면 잽니다</span>';
    const ms = Store.clockSkew(), s = Math.abs(ms)/1000;
    const big = s >= 60;
    const txt = s < 1 ? '거의 없음'
              : s < 60 ? `${s.toFixed(1)}초 ${ms<0?'빠름':'느림'}`
              : `${Math.round(s/60)}분 ${ms<0?'빠름':'느림'}`;
    return `<b style="color:${big?'var(--cork)':'var(--court)'}">${txt}</b>`
         + (big?' <span class="hint">이 기기 시계가 많이 틀어져 있습니다</span>':'');
  }
  function storeModeLabel(){
    if(Store.mode==='firebase'){
      const src = window.__fbConfigSource==='file' ? '설정 파일' : '수동 입력';
      return `🔥 Firebase 연결됨 (${src}) · 실시간 동기화`;
    }
    if(Store.fbState==='error') return '⚠ Firebase 연결 실패 — 이 기기에만 저장 중';
    return (Store.mode==='window.storage'?'앱 내장 저장소':'이 기기(브라우저)') + ' — Firebase 미연결';
  }
  /* 설정 소스에 따라 세 가지 화면을 보여준다.
     file : firebase-config.json으로 자동 연결됨 — 손댈 게 없으니 수동 입력칸 대신 상태만 보여준다.
     local: 이 기기에서 직접 입력한 값 — 기존처럼 편집 가능한 폼을 보여준다.
     none : 아무 것도 없음 — 폼 + 파일 배치 방법 안내를 함께 보여준다. */
  function fbConfigSectionHtml(){
    const src = window.__fbConfigSource || 'none';
    if(src==='file' && Store.mode==='firebase'){
      return `<div class="opt on" style="cursor:default;margin-bottom:0">
          <div><div class="t">📄 firebase-config.json 파일로 연결됨</div>
          <div class="d">경로: ${esc(window.__fbConfigFile||'./firebase-config.json')} · projectId: ${esc(window.__fb?.app?.options?.projectId||'')}</div></div></div>
        <div class="hint" style="margin-top:10px;max-width:520px;line-height:1.7">
          이 기기가 아니라 <b>배포 폴더</b>의 설정 파일을 읽어 자동으로 연결된 상태입니다. 모든 태블릿이 같은 파일을 보므로
          여기서 개별로 바꿀 필요가 없습니다. 값을 바꾸려면 배포 폴더의 firebase-config.json 파일을 수정한 뒤
          새로고침하세요.</div>`;
    }
    const fbCfg = window.__fbReadCfg && window.__fbReadCfg();
    const fileTried = src==='none' || src==='local';
    return `
        <div class="row">
          <input type="text" id="fb_apiKey" placeholder="apiKey" value="${esc(fbCfg?.apiKey||'')}" style="width:260px">
          <input type="text" id="fb_projectId" placeholder="projectId" value="${esc(fbCfg?.projectId||'')}" style="width:180px">
        </div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="fb_authDomain" placeholder="authDomain (projectId.firebaseapp.com)" value="${esc(fbCfg?.authDomain||'')}" style="width:260px">
          <input type="text" id="fb_appId" placeholder="appId" value="${esc(fbCfg?.appId||'')}" style="width:180px">
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn sm primary" id="fb_save">저장하고 연결</button>
          ${fbCfg?'<button class="btn sm" id="fb_clear">연결 해제</button>':''}
        </div>
        <div class="hint" style="margin-top:8px;max-width:520px;line-height:1.7">
          Firebase 콘솔(console.firebase.google.com) → 프로젝트 생성 → Firestore Database(테스트 모드로 시작) →
          프로젝트 설정 → "웹 앱 추가"에서 위 네 값을 복사해 넣으세요. Authentication에서
          <b>익명 로그인</b>을 켜 두면 앱이 자동으로 로그인합니다. 저장 후 페이지를 새로고침합니다.
        </div>
        ${fileTried?fileDiagHtml():''}`;
  }
  function fileDiagHtml(){
    const d = window.__fbFileDiag;
    const box = (title,body,color)=>`<div class="hint" style="margin-top:10px;max-width:560px;line-height:1.7;${color?'color:'+color+';':''}">${body}</div>`;
    if(!d || !d.attempts || !d.attempts.length){
      return box('', `매번 기기마다 입력하는 대신, 배포 폴더에 <b>firebase-config.json</b> 파일을
        두면 자동으로 연결됩니다. (아직 파일 조회를 시도하지 않았습니다 — 페이지를 새로고침해 보세요.)`);
    }
    const rows = d.attempts.map(a=>{
      const ok = a.result==='OK';
      const line = `<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--surface2);border:1px solid ${ok?'var(--court)':'var(--line)'}">
        <div style="font-weight:700;color:${ok?'var(--court)':'var(--cork)'}">${ok?'✓ 성공':'✗ 실패'} — <span class="num">${esc(a.url)}</span></div>
        <div style="margin-top:3px">${esc(a.result||'')}${a.status!=null?` (HTTP ${a.status})`:''}</div>
        ${a.hint?`<div style="margin-top:5px;color:var(--muted)">${esc(a.hint)}</div>`:''}
        ${a.snippet?`<div style="margin-top:5px;color:var(--muted2);font-family:monospace;font-size:12px;white-space:pre-wrap">응답 미리보기: ${esc(a.snippet)}</div>`:''}
      </div>`;
      return line;
    }).join('');
    return box('', `배포 폴더의 <b>firebase-config.json</b>을 자동으로 찾아본 결과입니다:
      ${rows}
      <div style="margin-top:8px">모든 시도가 실패해 이 기기의 수동 입력(위)이나 기본 저장소로 동작합니다.
      <button class="btn sm ghost" id="fb_recheck" style="margin-left:6px">다시 확인</button></div>`);
  }
  $('#fb_save')?.addEventListener('click',()=>{
    const cfg={ apiKey:$('#fb_apiKey').value.trim(), projectId:$('#fb_projectId').value.trim(),
      authDomain:$('#fb_authDomain').value.trim()||($('#fb_projectId').value.trim()+'.firebaseapp.com'),
      appId:$('#fb_appId').value.trim() };
    if(!cfg.apiKey||!cfg.projectId) return toast('apiKey와 projectId는 필수입니다');
    localStorage.setItem(window.__fbConfigKey, JSON.stringify(cfg));
    toast('저장했습니다. 새로고침합니다...');
    setTimeout(()=>location.reload(),700);
  });
  $('#fb_clear')?.addEventListener('click',()=>{
    if(!confirm('Firebase 연결을 해제할까요? 데이터는 이 기기 저장소로 되돌아갑니다.')) return;
    localStorage.removeItem(window.__fbConfigKey); setTimeout(()=>location.reload(),300);
  });
  $('#fb_recheck')?.addEventListener('click',()=>{ toast('다시 확인합니다...'); setTimeout(()=>location.reload(),300); });
  /* ── 운영자 비밀번호 — 소유자만 정할 수 있다 ────────────────────
     화면을 그린 뒤 비동기로 채운다. 소유자가 아니면 상태만 보여 주고
     입력칸은 내지 않는다. 내 봐야 서버가 거절하므로, 누를 수 있는 버튼을
     보여 주고 실패시키는 것보다 아예 안 보여 주는 편이 정직하다. */
  (async()=>{
    const el=$('#adminPwState'), box=$('#adminPwBox');
    if(!el) return;
    const st=await Secret.state();
    if(st==='set'){ el.textContent='설정됨'; el.style.color='var(--court)'; }
    else if(st==='unset'){ el.textContent='아직 없음 — 운영자가 들어올 수 없습니다';
                           el.style.color='var(--cork)'; }
    else { el.textContent='확인하지 못했습니다(연결 확인)'; return; }

    if(!Auth.isOwner){
      if(box) box.innerHTML='<div class="hint">바꾸려면 <b>소유자 계정</b>으로 로그인해야 합니다.</div>';
      return;
    }
    box.innerHTML=`
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input type="password" id="s_apw"  placeholder="새 비밀번호(8자 이상)"
               autocomplete="new-password" style="width:210px">
        <input type="password" id="s_apw2" placeholder="한 번 더"
               autocomplete="new-password" style="width:150px">
        <button class="btn sm primary" id="s_apwSet">${st==='set'?'바꾸기':'설정'}</button>
      </div>
      <div id="s_apwErr" class="hint" style="margin-top:6px;color:var(--cork);min-height:18px"></div>`;
    $('#s_apwSet').onclick=async()=>{
      const err=$('#s_apwErr'), a=$('#s_apw').value, b=$('#s_apw2').value;
      if(a.length<8){ Sound.play('error'); return err.textContent='8자 이상으로 정해 주세요'; }
      if(a!==b){ Sound.play('error'); return err.textContent='두 번 입력한 값이 다릅니다'; }
      const btn=$('#s_apwSet'); btn.disabled=true; err.textContent='설정 중...';
      const r=await Secret.setAdminPassword(a);
      btn.disabled=false;
      if(!r.ok){
        Sound.play('error');
        err.textContent = r.reason==='denied'
          ? '서버가 거절했습니다 — 소유자 계정으로 로그인했는지, 보안 규칙이 배포됐는지 확인해 주세요'
          : '설정하지 못했습니다 — 연결을 확인해 주세요';
        return;
      }
      Sound.play('confirm');
      $('#s_apw').value=''; $('#s_apw2').value='';
      err.style.color='var(--court)'; err.textContent='새 비밀번호가 적용됐습니다';
      el.textContent='설정됨'; el.style.color='var(--court)';
      toast('운영자 비밀번호를 설정했습니다');
    };
  })();
  $('#s_pol').onchange=renderSetHint;
  function renderSetHint(){ $('#s_pol').parentElement.querySelector('.hint').textContent=POLICY.find(p=>p[0]===$('#s_pol').value)[2]; }
  $('#s_save').onclick=()=>{
    const nc=Math.max(1,+$('#s_courts').value||3), ns=Math.max(2,+$('#s_slots').value||7);
    const sized = nc!==s.courtCount || ns!==s.queueSlotCount;

    /* ── 줄일 때만 물어본다 ────────────────────────────────────────
       코트를 늘리는 것은 아무것도 잃지 않으므로 그냥 한다. 줄일 때는
       없어지는 자리에 사람이 있을 수 있어서, 그들이 어디로 가는지 먼저
       말하고 확인을 받는다. 예전처럼 대진판을 통째로 비우지는 않는다. */
    if(sized){
      const goneC = S.courts.slice(nc).filter(c=>c.members.length);
      const goneQ = S.queues.slice(ns).filter(q=>q.members.length);
      const playing = goneC.filter(c=>c.status==='PLAYING');
      if(goneC.length || goneQ.length){
        const lines = [];
        if(goneC.length) lines.push(`${goneC.map(c=>c.no+'코트').join('·')}의 `
          + `${goneC.reduce((n,c)=>n+c.members.length,0)}명이 대기 인원으로 내려갑니다`);
        if(playing.length) lines.push(`그중 ${playing.map(c=>c.no+'코트').join('·')}는 경기 중입니다 — `
          + `한 판 친 것으로 쳐서 게임 수가 오르고 기록에 남습니다(승패는 비워 둡니다)`);
        if(goneQ.length) lines.push(`${goneQ.map(q=>'Q'+q.index).join('·')}의 `
          + `${goneQ.reduce((n,q)=>n+q.members.length,0)}명이 대기 인원으로 흩어집니다`);
        if(!confirm(`없어지는 자리에 사람이 있습니다.\n\n· ${lines.join('\n· ')}\n\n`
                  + `나머지 코트와 대기열은 그대로 유지됩니다. 진행할까요?`)) return;
      }
    }

    /* '결과 기록 강제'를 지금 켠 것이라면, 이미 끝나 있던 미기록 경기들은
       그냥 넘긴 것으로 표시해 둔다. 안 그러면 설정을 켜는 순간 오늘 친
       사람 전부가 한꺼번에 묶여 대진판이 통째로 멈춘다. 앞으로 끝나는
       경기부터 적으라는 것이 이 설정의 뜻이지, 지난 판을 소급해 캐묻는
       것이 아니다. */
    if($('#s_reqres').checked && !s.requireResult)
      S.matches.forEach(m=>{ if(resultPending(m)) m.skipped = true; });

    Object.assign(s,{clubName:$('#s_club').value.trim()||'대진판',courtCount:nc,queueSlotCount:ns,
      matchWarnMinutes:+$('#s_warn').value||18, autoMode:$('#s_auto').checked,
      winPoint:Math.max(5,Math.min(31,+$('#s_wp').value||21)),
      requireResult:$('#s_reqres').checked,
      maxMatchMinutes:Math.max(0,Math.min(120,+$('#s_maxmin').value||0)),
      autoPushToCourt:$('#s_push').checked,
      genderPolicy:$('#s_pol').value, oddRelaxThreshold:+$('#s_relax').value||2,
      minPool:Math.max(0,+$('#s_minpool').value||0),
      repeatLookback:+$('#s_look').value||3,
      historyDays:Math.max(0,Math.min(60,+$('#s_hist').value||0))});
    s.sound = $('#s_sound').checked; Sound.set(s.sound);
    settingsTrusted = true;      // 운영자가 화면에서 직접 확정한 값이다
    Object.assign(s.w,{odd:+$('#s_odd').value,game:+$('#s_wgame').value,wait:+$('#s_wwait').value,
      repeat:+$('#s_wrep').value,balance:+$('#s_wbal').value,age:+$('#s_wage').value});
    // 참고 일수가 바뀌었으면 과거 기록을 그만큼 다시 불러 둔다(다음 배치부터 반영).
    Records.warmUp(s.historyDays).catch(()=>{});
    tx(()=>{ if(sized) resizeBoard(nc, ns); });
    /* 코트/슬롯 수가 바뀌면 이전 스냅샷은 새 설정과 아귀가 안 맞으므로
       되돌리기 이력을 버린다. 되돌려서 옛 코트 배열이 돌아오면 화면과
       설정이 서로 다른 코트 수를 말하게 된다. */
    if(sized) undoStack.length=0;
    renderSet(); toast('설정을 저장했습니다');
  };
  $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
  $('#s_reload').onclick=async()=>{
    Sound.play('tap');
    const btn=$('#s_reload'); btn.disabled=true; btn.textContent='불러오는 중...';
    const rMem=await Store.getSafe(K('members'), {strict:true});
    const rSet=await Store.getSafe(K('settings'), {strict:true});
    btn.disabled=false; btn.textContent='지금 다시 불러오기';
    if(!rMem.ok){ Sound.play('error');
      return toast(`클라우드를 읽지 못했습니다 (${rMem.error||'읽기 실패'}). 연결을 확인하세요`); }
    const list=rMem.value||[];
    if(!list.length) return toast('클라우드에도 회원 명단이 없습니다');
    // 방금 읽은 결과를 그대로 넘겨 준다(같은 문서를 두 번 읽지 않게).
    bulkOverwriteMembers(list, {
      source:`클라우드에서 다시 불러오기 — ${list.length}명`,
      dbRead:rMem,
      applyExtra(){
        if(rSet.ok && rSet.value){
          S.settings=Object.assign(clone(DEFAULTS),rSet.value,{w:Object.assign({},DEFAULTS.w,rSet.value.w||{})});
          settingsTrusted = true;               // 클라우드 원본을 방금 읽어 왔다
        }
      },
      after(){ renderSet(); }
    });
  };
  $('#s_reset').onclick=()=>{ if(!confirm('설정을 기본값으로 되돌릴까요? 회원과 출석 정보는 유지됩니다.')) return;
    S.settings=clone(DEFAULTS); tx(()=>initBoard()); renderSet(); };
}
