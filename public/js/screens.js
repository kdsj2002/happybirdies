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
           ${t('screens.help.shareIntro')}
           <!-- 절대 경로여야 한다. 동호회 주소(/hanul/) 아래에서 상대 경로로
                걸면 /hanul/manual.html이 되는데, 그건 실제 파일이 아니라
                호스팅 rewrite가 대진판(index.html)으로 되돌려 버린다. -->
           <a href="/manual.html" target="_blank" rel="noopener"><b>${t('screens.help.openManual')}</b></a><br>
           ${t('screens.help.shareHint')}
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
    box.innerHTML='<div class="hint">'+t('screens.att.membersOnlyHint')+'</div>';
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
      ${a?`<div class="sub">${t('screens.att.gamesCount',{n:a.games})}</div>`:''}`;
    c.onclick=()=>toggleAtt(m);
    box.appendChild(c);
  }
  // 게스트
  Object.values(S.att).filter(a=>a.guest).forEach(a=>{
    const c=el('div','acard in');
    c.innerHTML=`<div class="ck">✓</div><div class="nm">${esc(a.name)}</div>
      <div class="sub" style="color:var(--gold)">${t('screens.att.guestGames',{n:a.games})}</div>`;
    c.onclick=()=>{ if(confirm(t('screens.att.confirmDeleteGuest',{name:a.name}))) tx(()=>{removeFrom(a.id); delete S.att[a.id];}); renderAtt(); };
    box.appendChild(c);
  });
  const all=Object.values(S.att);
  $('#attStat').innerHTML=t('screens.att.statLine',{n:all.length,m:all.filter(isM).length,f:all.filter(isF).length,mem:S.members.filter(m=>m.active!==false).length});
}
function toggleAtt(m){
  // 운영자는 전원을, 회원은 본인만 출석 처리할 수 있다.
  if(!Auth.can('edit')){
    if(!(Auth.can('selfCheckIn') && m.id === Auth.memberId)){
      Sound.play('error'); toast(t('screens.att.selfOnly')); return;
    }
  }
  const a=attendeeOf(m.id);
  if(a){
    if(a.state==='PLAYING'&&!confirm(t('screens.att.confirmUnattendPlaying',{name:m.name}))) return;
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
  openModal(`<h3>${t('screens.att.guestAddTitle')}</h3><div class="sub">${t('screens.att.guestAddHint')}</div>
    <div class="row"><label class="fl" style="flex:1">${t('screens.shared.name')}<input type="text" id="gN"></label>
    <label class="fl">${t('screens.shared.gender')}<select id="gS"><option value="M">${t('screens.shared.male')}</option><option value="F">${t('screens.shared.female')}</option></select></label>
    <label class="fl">${t('screens.shared.grade')}<select id="gG">${S.settings.grades.map(g=>`<option value="${g.code}" ${g.code==='C'?'selected':''}>${g.code} ${g.label}</option>`).join('')}</select></label></div>
    <div class="row end"><button class="btn" onclick="closeModal()">${t('screens.shared.cancel')}</button>
    <button class="btn primary" id="gOk">${t('screens.att.guestAddBtn')}</button></div>`);
  $('#gOk').onclick=()=>{ const n=$('#gN').value.trim(); if(!n) return toast(t('screens.shared.nameRequired'));
    closeModal(); tx(()=>{ const id=uid('a');
      S.att[id]={id,memberId:null,name:n,grade:$('#gG').value,gender:$('#gS').value,birthYear:null,
                 guest:true,games:0,lastEnd:null,state:'POOL',jit:Math.random()}; }); renderAtt(); };
};

/* ── 회원 ───────────────────────────────────────────────────────── */
let memQ='';
function renderMem(){
  if(!Auth.can('members')){
    $('#memTbl').innerHTML=''; $('#memStat').textContent='';
    $('#scr-mem').querySelector('.pad').innerHTML='<div class="hint">'+t('screens.mem.membersOnlyHint')+'</div>';
    return;
  }
  const tbl=$('#memTbl');
  let list=S.members.filter(m=>matchQ(m.name,memQ.trim()));
  list.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  tbl.innerHTML=`<tr><th>${t('screens.shared.name')}</th><th>${t('screens.shared.gender')}</th><th>${t('screens.mem.birthYear')}</th><th>${t('screens.shared.grade')}</th><th>${t('screens.mem.status')}</th><th></th></tr>`
    + list.map(m=>`<tr><td style="font-weight:700;font-size:16px">${esc(m.name)}</td>
      <td>${sexIcon(m.gender)}</td><td class="num">${m.birthYear||'—'}</td>
      <td><b style="color:${G(m.grade).color}">${esc(m.grade)}</b> <span style="color:var(--muted)">${esc(G(m.grade).label)}</span></td>
      <td style="color:${m.active===false?'var(--muted2)':'var(--court)'}">${m.active===false?t('screens.mem.inactive'):t('screens.mem.active')}</td>
      <td style="text-align:right"><button class="btn sm" data-edit="${m.id}">${t('screens.mem.editBtn')}</button></td></tr>`).join('');
  // 복원 버튼은 설정을 덮어쓰므로 운영자에게만 보인다
  const imp=$('#btnImport'); if(imp) imp.style.display = Auth.can('settings')? '' : 'none';
  renderJoinBtn();
  ['#btnAddMem','#btnCsv'].forEach(sel=>{ const b=$(sel);
    if(b) b.style.display = Auth.can('membersEdit')? '' : 'none'; });
  const act=S.members.filter(m=>m.active!==false);
  const noG=S.members.filter(m=>m.gender!=='M'&&m.gender!=='F').length;
  $('#memStat').innerHTML=t('screens.mem.statLine',{total:S.members.length,active:act.length,m:act.filter(isM).length,f:act.filter(isF).length})
    + (noG?t('screens.mem.noGenderWarn',{n:noG}):'');
  tbl.onclick=e=>{ const b=e.target.closest('[data-edit]'); if(!b) return;
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
  b.textContent = t('screens.mem.joinReqBtn',{n});
  b.classList.toggle('warn', n>0);
}
function joinDialog(){
  if(!requirePerm('membersEdit')) return;
  const list=(S.joinRequests||[]).slice().sort((a,b)=>a.at-b.at);
  if(!list.length){ closeModal(); return toast(t('screens.mem.noJoinReq')); }
  openModal(`<h3>${t('screens.mem.joinReqTitle',{n:list.length})}</h3>
    <div class="sub">${t('screens.mem.joinReqHint')}</div>
    ${list.map(r=>`<div class="opt" style="cursor:default">
      <div style="flex:1">
        <div class="t">${esc(r.name)} <span style="color:${G(r.grade).color}">${esc(r.grade)}</span></div>
        <div class="d">${r.gender==='M'?t('screens.shared.male'):t('screens.shared.female')}${r.birthYear?' · '+r.birthYear:''}
          · ${new Date(r.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button class="btn sm" data-rej="${esc(r.id)}">${t('screens.mem.rejectBtn')}</button>
      <button class="btn sm primary" data-app="${esc(r.id)}">${t('screens.mem.approveBtn')}</button>
    </div>`).join('')}
    <div class="row end"><button class="btn" onclick="closeModal()">${t('screens.shared.close')}</button></div>`);
  $$('#modal [data-app]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const m=await approveJoinRequest(b.dataset.app);
    Sound.play('confirm');
    if(m) toast(t('screens.mem.approvedToast',{name:m.name}));
    renderMem(); joinDialog();
  });
  $$('#modal [data-rej]').forEach(b=>b.onclick=async()=>{
    const r=(S.joinRequests||[]).find(x=>x.id===b.dataset.rej);
    if(!confirm(t('screens.mem.confirmReject',{name:r?r.name:t('screens.mem.thisRequest')}))) return;
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
  openModal(`<h3>${isNew?t('screens.mem.addTitle'):t('screens.mem.editTitle')}</h3><div class="sub">${t('screens.mem.genderRequiredHint')}</div>
    <div class="row"><label class="fl" style="flex:1">${t('screens.shared.name')}<input type="text" id="mN" value="${esc(m?.name||'')}"></label>
    <label class="fl">${t('screens.shared.gender')}<select id="mS">
      <option value="">${t('screens.mem.selectOpt')}</option>
      <option value="M" ${m?.gender==='M'?'selected':''}>${t('screens.shared.male')}</option>
      <option value="F" ${m?.gender==='F'?'selected':''}>${t('screens.shared.female')}</option></select></label>
    <label class="fl">${t('screens.mem.birthYear')}<input type="number" id="mY" style="width:110px" value="${m?.birthYear||''}" placeholder="1985"></label>
    <label class="fl">${t('screens.shared.grade')}<select id="mG">${S.settings.grades.map(g=>`<option value="${g.code}" ${m?.grade===g.code?'selected':''}>${g.code} ${g.label}</option>`).join('')}</select></label></div>
    ${isNew?'':`<label class="row" style="margin-top:14px;cursor:pointer"><input type="checkbox" id="mA" ${m.active!==false?'checked':''} style="width:20px;height:20px"> ${t('screens.mem.activeLabel')}</label>`}
    <div class="row end">${isNew?'':`<button class="btn ghost" id="mDel" style="margin-right:auto;color:var(--cork)">${t('screens.mem.deleteBtn')}</button>`}
    <button class="btn" onclick="closeModal()">${t('screens.shared.cancel')}</button><button class="btn primary" id="mOk">${t('screens.mem.saveBtn')}</button></div>`);
  $('#mOk').onclick=()=>{
    const n=$('#mN').value.trim(), g=$('#mS').value;
    if(!n) return toast(t('screens.shared.nameRequired'));
    if(!g) return toast(t('screens.mem.genderRequired'));
    const y=parseInt($('#mY').value)||null;
    if(isNew) S.members.push({id:uid('m'),name:n,gender:g,birthYear:y,grade:$('#mG').value,active:true,lastSeen:0});
    else Object.assign(m,{name:n,gender:g,birthYear:y,grade:$('#mG').value,active:$('#mA').checked});
    closeModal(); save(); renderMem(); toast(t('screens.mem.savedToast'));
  };
  /* 한 명 삭제는 이름을 눈으로 확인하고 지우는 조작이라 비밀번호까지는 받지 않는다.
     대신 기준선을 같이 내려 준다 — 그래야 save()의 회원 삭제 방지 잠금을 통과한다.
     (여러 명이 한꺼번에 사라지는 저장은 그 잠금에 걸려 아예 올라가지 않는다.) */
  if(!isNew) $('#mDel').onclick=()=>{
    if(!confirm(t('screens.mem.confirmDelete',{name:m.name}))) return;
    S.members=S.members.filter(x=>x.id!==m.id);
    setMembersBaseline(S.members);
    closeModal(); save(); renderMem(); };
}
$('#btnCsv').onclick=()=>{
  if(!requirePerm('membersEdit')) return;
  openModal(`<h3>${t('screens.mem.csvTitle')}</h3><div class="sub">${t('screens.mem.csvHint')}</div>
    <textarea id="csv" rows="12" placeholder="${t('screens.mem.csvPlaceholder')}"></textarea>
    <div class="row end"><button class="btn" onclick="closeModal()">${t('screens.shared.cancel')}</button><button class="btn primary" id="csvOk">${t('screens.mem.csvImportBtn')}</button></div>`);
  $('#csvOk').onclick=()=>{
    const lines=$('#csv').value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const add=[], err=[];
    const codes=S.settings.grades.map(g=>g.code);
    lines.forEach((ln,i)=>{
      if(i===0&&/이름/.test(ln)) return;
      const p=ln.split(',').map(x=>x.trim());
      const [name,by,gr,sx]=p;
      if(!name) return err.push(t('screens.mem.csvNoName',{n:i+1}));
      const gender = /^(M|m|남)/.test(sx||'')?'M' : /^(F|f|여)/.test(sx||'')?'F' : null;
      if(!gender) return err.push(t('screens.mem.csvNoGender',{n:i+1,name}));
      let grade=(gr||'').toUpperCase();
      if(!codes.includes(grade)){ const byLabel=S.settings.grades.find(g=>g.label===gr); grade=byLabel?byLabel.code:'C'; }
      const dup = m => m.name===name && String(m.birthYear||'')===String(by||'');
      if(S.members.some(dup)||add.some(dup)) return err.push(t('screens.mem.csvDup',{n:i+1,name}));
      add.push({id:uid('m'),name,gender,birthYear:parseInt(by)||null,grade,active:true,lastSeen:0});
    });
    closeModal();
    const showErr = ()=>{ if(!err.length) return;
      setTimeout(()=>openModal(`<h3>${t('screens.mem.csvResultTitle')}</h3><div class="sub">${t('screens.mem.csvResultHint',{add:add.length,err:err.length})}</div>
        <div class="hint">${err.map(esc).join('<br>')}</div>
        <div class="row end"><button class="btn primary" onclick="closeModal()">${t('screens.shared.confirm')}</button></div>`),300); };
    if(!add.length){ toast(t('screens.mem.noneToRegister')+(err.length?t('screens.mem.errSuffix',{n:err.length}):'')); return showErr(); }
    // 여러 명을 한 번에 회원 문서에 쓰는 조작이므로 비밀번호 확인을 거친다.
    bulkOverwriteMembers(S.members.concat(add),
      { source:t('screens.mem.csvSource',{n:add.length}), after:showErr });
  };
};
/* 백업 내려받기. 덮어쓰기 확인 창에서도 부르므로 이름을 붙여 둔다. */
async function exportBackup(){
  const idx=(await Store.get(K('sessions')))||[];
  const sessions={};
  for(const d of idx) sessions[d]=await Store.get(K('session:'+d));
  const blob=new Blob([JSON.stringify({v:1,club:CLUB,settings:S.settings,members:S.members,sessions},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=t('screens.mem.backupFilename',{date:todayStr()}); a.click(); toast(t('screens.mem.backupDownloadedToast'));
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
    if(!d || !Array.isArray(d.members)) return toast(t('screens.mem.notBackupFile'));
    /* 복원은 회원 문서를 파일 내용으로 통째로 갈아끼우는 조작이다.
       비밀번호 확인을 통과한 뒤에야 설정·세션까지 함께 적용한다. */
    bulkOverwriteMembers(d.members, {
      source:t('screens.mem.restoreSource',{file:f.name}),
      async applyExtra(){
        S.settings=Object.assign(clone(DEFAULTS),d.settings||{});
        settingsTrusted = true;                 // 파일에서 통째로 받은 값이다
        if(d.sessions) for(const [k,v] of Object.entries(d.sessions)) if(v) await Store.set(K('session:'+k),v);
        await Store.set(K('sessions'),Object.keys(d.sessions||{}));
        sessionsIdx = null;                     // 세션 목록을 다음 저장 때 다시 읽게 한다
        const cur=d.sessions?.[S.date];
        if(cur) Object.assign(S,{att:cur.att||{},courts:cur.courts,queues:cur.queues,matches:cur.matches||[],hist:cur.hist||[]});
      },
      after(){ renderSet(); toast(t('screens.mem.restoredToast')); }
    });
  }catch(err){ toast(t('screens.mem.fileReadError')); } };
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
  const ts = ['MD','WD','XD','MX','UNKNOWN'].filter(ty=>byType[ty]);
  if(!ts.length || !total) return '';
  return `<div style="margin-bottom:22px">
    <div class="mstack">
      ${ts.map(ty=>{ const p = 100*byType[ty]/total; return `<i style="width:${p.toFixed(1)}%;background:${MT_COLOR[ty]}">${
        p>=8?`<span>${MT_LBL[ty]} ${Math.round(p)}%</span>`:''}</i>`; }).join('')}
    </div>
    <div class="mlegend">
      ${ts.map(ty=>`<span><b style="background:${MT_COLOR[ty]}"></b>${MT_LBL[ty]} ${t('screens.shared.matchCount',{n:byType[ty]})}
        · ${Math.round(100*byType[ty]/total)}%</span>`).join('')}
    </div></div>`;
}

/* ── 기록 ───────────────────────────────────────────────────────── */
function renderHist(){
  /* 기록에는 출석자 전원의 이름과 게임 수가 그대로 있다. 게스트에게는
     탭도 감추지만(applyRole) 화면 함수에서도 한 번 더 막는다. */
  if(Auth.isViewer){
    $('#histBody').innerHTML='<div class="hint">'+t('screens.hist.membersOnlyHint')+'</div>';
    $('#btnCloseFloat').style.display='none';
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
    ? `<b style="color:var(--court)">${t('screens.hist.teamWin',{team:m.win})}</b>`
      + (m.sw!=null && m.sl!=null ? ` <span class="num" style="color:var(--muted)">${m.sw}:${m.sl}</span>` : '')
    : `<span style="color:var(--muted2)">${canEditRes?t('screens.hist.inputPending'):'—'}</span>`;
  const maxG = all.length ? Math.max(1, ...all.map(a=>a.games)) : 1;
  $('#histBody').innerHTML=`
    <div class="sec-h">${t('screens.hist.sessionSummary',{date:S.date})}<span class="rule"></span></div>
    <div class="mcards">
      <div class="mcard"><div class="k">${t('screens.hist.totalMatches')}</div><div class="v num">${done.length}</div></div>
      <div class="mcard"><div class="k">${t('screens.hist.avgMatchTime')}</div><div class="v num">${avg.toFixed(1)}<small>${t('screens.shared.minuteUnit')}</small></div></div>
      <div class="mcard"><div class="k">${t('screens.hist.maleAvg')}</div><div class="v num">${mean(men)}<small>${t('screens.shared.gameUnit')}</small></div></div>
      <div class="mcard"><div class="k">${t('screens.hist.femaleAvg')}</div><div class="v num">${mean(wom)}<small>${t('screens.shared.gameUnit')}</small></div></div>
      <div class="mcard"><div class="k">${t('screens.hist.gameGap')}</div><div class="v num">${all.length?maxG-Math.min(...all.map(a=>a.games)):0}</div></div>
      <div class="mcard"><div class="k">${t('screens.hist.resultInput')}</div><div class="v num">${scored}<small>/${done.length}</small></div></div>
    </div>
    ${done.length ? typeStackHtml(byType, done.length)
                  : '<div class="hint" style="margin-bottom:24px">'+t('screens.hist.noFinishedMatches')+'</div>'}
    <div class="sec-h">${t('screens.hist.perPerson')}<span class="rule"></span></div>
    <table><tr><th>${t('screens.shared.name')}</th><th>${t('screens.hist.gamesCol')}</th><th>${t('screens.hist.winLossCol')}</th><th>${t('screens.hist.lastMatchCol')}</th></tr>
      ${all.map(a=>{ const r=recordOf(a.id); return `<tr><td style="font-weight:700">${esc(a.name)}${a.guest?' <span style="color:var(--gold)">G</span>':''}</td>
        <td>${gamesBarHtml(a.games, maxG)}</td>
        <td>${winBarHtml(r.w, r.l)}</td>
        <td style="color:var(--muted)">${a.lastEnd?new Date(a.lastEnd).toTimeString().slice(0,5):'—'}</td></tr>`; }).join('')}
    </table>
    <div class="hint" style="margin-top:6px">${t('screens.hist.barHint')}</div>
    <div class="sec-h" style="margin-top:26px">${t('screens.hist.matchHistory')}<span class="rule"></span></div>
    <table><tr><th>${t('screens.hist.colNum')}</th><th>${t('screens.hist.colCourt')}</th><th>${t('screens.hist.colType')}</th><th>${t('screens.hist.colTeamA')}</th><th>${t('screens.hist.colTeamB')}</th><th>${t('screens.hist.colResult')}</th><th>${t('screens.hist.colTime')}</th></tr>
      ${done.slice().reverse().map((m,i)=>`<tr><td class="num">${done.length-i}</td><td>${m.court}</td>
        <td><span class="mt ${m.type||'UNKNOWN'}" style="cursor:default;height:22px">${MT_LBL[m.type||'UNKNOWN']}</span></td>
        <td${m.win==='A'?' style="font-weight:800"':''}>${(m.An||m.A.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td${m.win==='B'?' style="font-weight:800"':''}>${(m.Bn||m.B.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td class="res-cell${canEditRes?' edit':''}"${canEditRes?` data-res="${esc(m.id)}"`:''}>${resCell(m)}</td>
        <td class="num" style="color:var(--muted)">${t('screens.hist.durationMin',{n:Math.round((m.endedAt-m.startedAt)/60000)})}</td></tr>`).join('')}
    </table>
    ${done.length?`<div class="hint" style="margin-top:8px">${canEditRes
        ? t('screens.hist.resultEditHint')
        : t('screens.hist.resultReadOnlyHint')}</div>`:''}
    <div class="sec-h" style="margin-top:26px">${t('screens.hist.cumulativeStats')}<span class="rule"></span></div>
    <div class="hint" style="margin-bottom:10px">${t('screens.hist.ledgerHint',{club:esc(CLUB)})}</div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" data-stat="4">${t('screens.hist.recent4')}</button>
      <button class="btn sm" data-stat="12">${t('screens.hist.recent12')}</button>
      <button class="btn sm" data-stat="0">${t('screens.hist.allTime')}</button>
      <span class="hint" id="statLbl2"></span>
    </div>
    <div id="statsBox"></div>
    <div class="row" style="margin-top:24px;align-items:center;gap:14px">
      <button class="btn warn" id="btnClose">${t('screens.hist.closeSessionBtn')}</button>
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
      lbl.textContent=t('screens.hist.autoCloseNotStarted',{h:autoCloseHours()});
      return;
    }
    const ms=msUntilAutoClose();
    if(ms>0){
      const h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000);
      lbl.textContent=t('screens.hist.autoCloseCountdown',{h,m});
    }else{
      lbl.textContent=t('screens.hist.autoCloseSoon');
    }
  })();
  // 위쪽 플로팅 버튼은 스크롤 상태와 무관하게 아래 버튼과 같은 동작을 한다.
  const closeFloat=$('#btnCloseFloat');
  closeFloat.textContent=t('screens.hist.closeSessionBtn');
  closeFloat.style.display='';
  closeFloat.onclick=()=>$('#btnClose').click();
  $('#btnClose').onclick=()=>{
    if(!requirePerm('closeSess')) return;
    if(!confirm(t('screens.hist.confirmCloseSession'))) return;
    Sound.play('confirm');
    tx(()=>closeSession('MANUAL'),{auto:false});
    renderHist(); toast(t('screens.hist.sessionClosedToast'));
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
  box.innerHTML='<div class="hint">'+t('screens.stats.loading')+'</div>';
  const all = await Records.dates();
  if(!all.length){
    lbl.textContent='';
    box.innerHTML='<div class="hint">'+t('screens.stats.noRecords')+'</div>';
    return;
  }
  const pick = n>0 ? all.slice(0,n) : all;
  const list = await Records.load(pick);
  const st = Records.stats(list);
  lbl.textContent = t('screens.stats.summaryLine',{days:pick.length,matches:st.matches,from:pick[pick.length-1],to:pick[0]});

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
      <tr><th>${t('screens.shared.name')}</th><th>${t('screens.stats.matchesCol')}</th><th>${t('screens.stats.winLossCol')}</th><th>${t('screens.stats.winRateCol')}</th><th>${t('screens.stats.avgScoreCol')}</th><th>${t('screens.stats.daysCol')}</th></tr>
      ${rows.map(e=>`<tr>
        <td style="font-weight:700">${esc(e.name)}${e.guest?' <span style="color:var(--gold)">G</span>':''}${
          e.memberId?'':' <span class="hint">'+t('screens.stats.nameBoundByLabel')+'</span>'}</td>
        <td>${gamesBarHtml(e.games, maxG)}</td>
        <td>${winBarHtml(e.win, e.lose)}</td>
        <td class="num" style="font-weight:700">${rate(e)}</td>
        <td class="num" style="color:var(--muted)">${(e.pf+e.pa)?`${(e.pf/e.games).toFixed(1)} : ${(e.pa/e.games).toFixed(1)}`:'—'}</td>
        <td class="num" style="color:var(--muted)">${e.days.size}</td></tr>`).join('')}
    </table>
    <div class="hint" style="margin-top:8px">${t('screens.stats.countHint')}</div>
    <div class="row" style="gap:26px;align-items:flex-start;margin-top:20px">
      <div style="flex:1;min-width:260px">
        <div class="sec-h">${t('screens.stats.frequentPairsTitle')}<span class="rule"></span></div>
        <table><tr><th>${t('screens.stats.pairCol')}</th><th>${t('screens.stats.togetherCol')}</th><th>${t('screens.stats.winCol')}</th></tr>
          ${top(st.pairs,10).map(p=>`<tr><td>${esc(nameOf(p.a))} · ${esc(nameOf(p.b))}</td>
            <td>${gamesBarHtml(p.n, maxPair)}</td>
            <td class="num" style="color:var(--muted)">${p.win}</td></tr>`).join('')
            || '<tr><td colspan="3" class="hint">'+t('screens.stats.none')+'</td></tr>'}
        </table>
      </div>
      <div style="flex:1;min-width:260px">
        <div class="sec-h">${t('screens.stats.frequentFoesTitle')}<span class="rule"></span></div>
        <table><tr><th>${t('screens.stats.opponentCol')}</th><th>${t('screens.stats.meetCol')}</th></tr>
          ${top(st.foes,10).map(p=>`<tr><td>${esc(nameOf(p.a))} ↔ ${esc(nameOf(p.b))}</td>
            <td>${gamesBarHtml(p.n, maxFoe)}</td></tr>`).join('')
            || '<tr><td colspan="2" class="hint">'+t('screens.stats.none')+'</td></tr>'}
        </table>
      </div>
    </div>
    <div class="hint" style="margin-top:12px">${t('screens.stats.historyHint',{state:S.settings.historyDays?t('screens.stats.historyRecentN',{n:S.settings.historyDays}):t('screens.stats.historyOff')})}</div>`;
}

/* ── 설정 ───────────────────────────────────────────────────────── */
/* 라벨/설명은 번역 키만 담아 둔다 — 배열 자체를 모듈 로드 시 한 번만
   만들기 때문에, 여기서 바로 t()를 불러 문자열을 굳혀 버리면 언어를
   나중에 바꿔도 설정 화면이 그 값을 다시 그릴 때 반영되지 않는다.
   사용하는 곳(renderSet)에서 그때그때 t(p[1])/t(p[2])로 읽는다. */
const POLICY=[['FREE','screens.set.policy.free.label','screens.set.policy.free.desc'],
  ['PREFER_SAME','screens.set.policy.preferSame.label','screens.set.policy.preferSame.desc'],
  ['PREFER_MIXED','screens.set.policy.preferMixed.label','screens.set.policy.preferMixed.desc'],
  ['STRICT_SAME','screens.set.policy.strictSame.label','screens.set.policy.strictSame.desc'],
  ['STRICT_MIXED','screens.set.policy.strictMixed.label','screens.set.policy.strictMixed.desc']];
function renderSet(){
  /* 게스트에게는 클럽 운영 값을 보여 주지 않는다. 대신 역할을 바꿀 길만
     남긴다 — 이것마저 없으면 게스트로 한 번 들어온 기기가 갇힌다. */
  if(Auth.isViewer){
    $('#setBody').innerHTML=`
      <div class="hint" style="margin-bottom:16px">${t('screens.set.viewerHint')}</div>
      <div class="row"><button class="btn primary" id="s_relogin">${t('screens.set.enterBtn')}</button></div>`;
    $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
    $('#s_saveFloat').style.display='none';
    return;
  }
  // 설정은 운영자 전용이다. 회원에게는 현재 값을 읽기 전용으로 보여 준다.
  // 화면을 통째로 비우면 "지금 어떤 규칙으로 돌고 있는지"조차 확인할 수 없어서다.
  if(!Auth.can('settings')){
    const s=S.settings;
    const pol=(POLICY.find(p=>p[0]===s.genderPolicy)||POLICY[0]);
    $('#setBody').innerHTML=`
      <div class="hint" style="margin-bottom:16px">
        ${t('screens.set.readonlyHint')}
      </div>
      <div class="kv">
        <div class="h">${t('screens.set.currentSettings')}</div>
        <div class="k">${t('screens.set.clubName')}</div><div>${esc(s.clubName)}</div>
        <div class="k">${t('screens.set.courtsAndSlots')}</div><div>${t('screens.set.courtsAndSlotsValue',{c:s.courtCount,q:s.queueSlotCount})}</div>
        <div class="k">${t('screens.set.autoAssign')}</div><div>${s.autoMode?t('screens.shared.on'):t('screens.shared.off')}</div>
        <div class="k">${t('screens.set.genderPolicy')}</div><div>${esc(t(pol[1]))}</div>
        <div class="k">${t('screens.set.matchWarnMinutes')}</div><div>${t('screens.hist.durationMin',{n:s.matchWarnMinutes})}</div>
        <div class="k">${t('screens.set.maxMatchMinutes')}</div><div>${s.maxMatchMinutes?t('screens.set.maxMatchMinutesValue',{n:s.maxMatchMinutes}):t('screens.stats.historyOff')}</div>
        <div class="k">${t('screens.set.requireResult')}</div><div>${s.requireResult?t('screens.set.requireResultOn'):t('screens.shared.off')}</div>
        <div class="k">${t('screens.set.autoClose')}</div><div>${t('screens.set.autoCloseValue',{h:autoCloseHours()})}</div>
        <div class="h">${t('screens.set.myAccount')}</div>
        <div class="k">${t('screens.set.currentRole')}</div><div><b>${esc(Auth.roleLabel())}</b></div>
        <div class="k">${t('screens.set.appVersion')}</div><div class="num">${esc(APP_VERSION)}</div>
        <div class="k">${t('screens.set.sound')}</div><div><label class="row"><input type="checkbox" id="s_soundOnly" ${s.sound!==false?'checked':''} style="width:20px;height:20px"> ${t('screens.set.soundThisDevice')}</label></div>
      </div>
      <div class="row" style="margin-top:20px"><button class="btn" id="s_relogin">${t('screens.set.reenterBtn')}</button></div>`;
    // 소리는 기기별 취향이라 권한과 무관하게 각자 켜고 끌 수 있게 둔다.
    $('#s_soundOnly').onchange=e=>{ Sound.set(e.target.checked); Sound.play('tap'); };
    $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
    $('#s_saveFloat').style.display='none';
    return;
  }
  const s=S.settings;
  $('#setBody').innerHTML=`
    <div class="kv">
      <div class="h">${t('screens.set.sectionBasic')}</div>
      <div class="k">${t('screens.set.clubName')}</div><div><input type="text" id="s_club" value="${esc(s.clubName)}" style="width:240px"></div>
      <div class="k">${t('screens.set.language')}</div><div><select id="s_lang" style="width:160px">${Lang.SUPPORTED.map(l=>`<option value="${l}" ${(s.lang||'en')===l?'selected':''}>${Lang.NAMES[l]}</option>`).join('')}</select>
        <span class="hint">${t('screens.set.languageHint')}</span></div>
      <div class="k">${t('screens.set.courtCount')}</div><div><input type="number" id="s_courts" value="${s.courtCount}" min="1" max="8" style="width:90px">
        <span class="hint">${t('screens.set.courtCountHint')}</span></div>
      <div class="k">${t('screens.set.slotCount')}</div><div><input type="number" id="s_slots" value="${s.queueSlotCount}" min="2" max="12" style="width:90px"></div>
      <div class="k">${t('screens.set.minPoolLabel')}</div><div><input type="number" id="s_minpool" value="${s.minPool}" min="0" max="12" style="width:90px">
        <span class="hint">${t('screens.set.minPoolHint')}</span></div>
      <div class="k">${t('screens.set.matchWarnMinutes')}</div><div><input type="number" id="s_warn" value="${s.matchWarnMinutes}" min="5" max="60" style="width:90px">${t('screens.set.matchWarnSuffix')}</div>
      <div class="k">${t('screens.set.maxMatchMinutes')}</div><div><input type="number" id="s_maxmin" value="${s.maxMatchMinutes==null?30:s.maxMatchMinutes}" min="0" max="120" style="width:90px">
        <span class="hint">${t('screens.set.maxMatchHint')}</span></div>
      <div class="k">${t('screens.set.requireResult')}</div><div>
        <label class="row"><input type="checkbox" id="s_reqres" ${s.requireResult?'checked':''} style="width:20px;height:20px">
          ${t('screens.set.requireResultCheckboxLabel')}</label>
        <div class="hint" style="margin-top:6px">${t('screens.set.requireResultHint')}</div></div>

      <div class="h">${t('screens.set.sectionAutomation')}</div>
      <div class="k">${t('screens.set.autoAssign')}</div><div><label class="row"><input type="checkbox" id="s_auto" ${s.autoMode?'checked':''} style="width:20px;height:20px"> ${t('screens.set.autoAssignCheckboxLabel')}</label></div>
      <div class="k">${t('screens.set.autoPush')}</div><div><label class="row"><input type="checkbox" id="s_push" ${s.autoPushToCourt?'checked':''} style="width:20px;height:20px"> ${t('screens.set.autoPushCheckboxLabel')}</label></div>

      <div class="h">${t('screens.set.genderPolicy')}</div>
      <div class="k">${t('screens.set.policyLabel')}</div><div><select id="s_pol" style="width:280px">${POLICY.map(([v,l])=>`<option value="${v}" ${s.genderPolicy===v?'selected':''}>${t(l)}</option>`).join('')}</select>
        <div class="hint" style="margin-top:6px">${t(POLICY.find(p=>p[0]===s.genderPolicy)[2])}</div></div>
      <div class="k">${t('screens.set.oddPenalty')}</div><div><input type="number" id="s_odd" value="${s.w.odd}" step="10" style="width:110px">
        <span class="hint">${t('screens.set.oddPenaltyHint')}</span></div>
      <div class="k">${t('screens.set.oddRelaxLabel')}</div><div><input type="number" id="s_relax" value="${s.oddRelaxThreshold}" min="1" max="5" style="width:90px">
        <span class="hint">${t('screens.set.oddRelaxHint')}</span></div>

      <div class="h">${t('screens.set.sectionWeights')}</div>
      <div class="k">${t('screens.set.weightGame')}</div><div><input type="number" id="s_wgame" value="${s.w.game}" step="10" style="width:110px"> <span class="hint">${t('screens.set.weightGameHint')}</span></div>
      <div class="k">${t('screens.set.weightWait')}</div><div><input type="number" id="s_wwait" value="${s.w.wait}" style="width:110px"></div>
      <div class="k">${t('screens.set.weightRepeat')}</div><div><input type="number" id="s_wrep" value="${s.w.repeat}" style="width:110px">
        <span class="hint">${t('screens.set.weightRepeatHint',{lookInput:`<input type="number" id="s_look" value="${s.repeatLookback}" min="0" max="10" style="width:60px;height:32px">`})}</span></div>
      <div class="k">${t('screens.set.historyDaysLabel')}</div><div><input type="number" id="s_hist" value="${s.historyDays||0}" min="0" max="60" style="width:90px">
        <span class="hint">${t('screens.set.historyDaysHint')}</span></div>
      <div class="k">${t('screens.set.weightBalance')}</div><div><input type="number" id="s_wbal" value="${s.w.balance}" style="width:110px"></div>
      <div class="k">${t('screens.set.weightAge')}</div><div><input type="number" id="s_wage" value="${s.w.age}" style="width:110px"> <span class="hint">${t('screens.set.weightAgeHint')}</span></div>

      <div class="h">${t('screens.set.sectionSoundAccount')}</div>
      <div class="k">${t('screens.set.sound')}</div><div><label class="row"><input type="checkbox" id="s_sound" ${s.sound!==false?'checked':''} style="width:20px;height:20px"> ${t('screens.set.soundCheckboxLabel')}</label></div>
      <div class="k">${t('screens.set.currentRole')}</div><div><b>${esc(Auth.roleLabel())}</b>
        <button class="btn sm" id="s_relogin" style="margin-left:10px">${t('screens.set.reenterBtn')}</button></div>

      <div class="h">${t('screens.set.sectionVersion')}</div>
      <div class="k">${t('screens.set.appVersion')}</div><div><b class="num">${esc(APP_VERSION)}</b>
        <div class="hint" style="margin-top:6px">${t('screens.set.versionHint')}</div></div>

      <div class="h">${t('screens.set.sectionDataRecovery')}</div>
      <div class="k">${t('screens.set.reloadCloudLabel')}</div><div>
        <button class="btn sm" id="s_reload">${t('screens.set.reloadNowBtn')}</button>
        <div class="hint" style="margin-top:6px">${t('screens.set.reloadHint')}</div></div>
      <div class="k">${t('screens.set.adminPwLabel')}</div><div>
        <b id="adminPwState" style="color:var(--muted)">${t('screens.set.checking')}</b>
        <div id="adminPwBox" style="margin-top:8px"></div>
        <div class="hint" style="margin-top:6px">${t('screens.set.adminPwHint',{club:esc(CLUB)})}</div></div>
      <div class="k">${t('screens.set.memberProtectionLabel')}</div><div>
        <div class="hint">${t('screens.set.memberProtectionHint',{count:loadedMembersCount==null?t('screens.set.notChecked'):loadedMembersCount+t('screens.set.countUnit')})}</div></div>

      <div class="h">${t('screens.set.sectionStorage')}</div>
      <div class="k">${t('screens.set.clockDiffLabel')}</div><div>${clockLabel()}
        <div class="hint" style="margin-top:6px">${t('screens.set.clockDiffHint')}</div></div>
      <div class="k">${t('screens.set.currentModeLabel')}</div><div><b id="storeMode" style="color:${Store.mode==='firebase'?'var(--court)':'var(--muted)'}">${storeModeLabel()}</b>
        <div class="hint" style="margin-top:6px">${t('screens.set.storageModeHint')}</div></div>
      <div class="k">${t('screens.set.fbProjectLabel')}</div><div>${fbConfigSectionHtml()}</div>
    </div>
    <div class="row" style="margin-top:24px"><button class="btn primary" id="s_save">${t('screens.set.saveBtn')}</button>
      <button class="btn" id="s_reset">${t('screens.set.resetBtn')}</button></div>`;
  /* 이 기기 시계가 서버보다 얼마나 빠르거나 느린가. 앱은 이 차이를 보정해
     쓰므로 화면의 경기 시간은 어느 기기에서나 같다 — 이 값은 "왜 그런가"를
     확인하고 기기 시계가 크게 틀어진 것을 알아채기 위한 것이다. */
  function clockLabel(){
    if(Store.mode!=='firebase') return '<b style="color:var(--muted)">—</b> '
      + '<span class="hint">'+t('screens.set.fbNotConnected')+'</span>';
    if(!Store.clockKnown()) return '<b style="color:var(--muted)">'+t('screens.set.checking')+'</b> '
      + '<span class="hint">'+t('screens.set.waitingFirstSync')+'</span>';
    const ms = Store.clockSkew(), s = Math.abs(ms)/1000;
    const big = s >= 60;
    const dir = ms<0?t('screens.set.fast'):t('screens.set.slow');
    const txt = s < 1 ? t('screens.set.clockNegligible')
              : s < 60 ? t('screens.set.clockSecDiff',{s:s.toFixed(1),dir})
              : t('screens.set.clockMinDiff',{m:Math.round(s/60),dir});
    return `<b style="color:${big?'var(--cork)':'var(--court)'}">${txt}</b>`
         + (big?' <span class="hint">'+t('screens.set.clockSkewedWarn')+'</span>':'');
  }
  function storeModeLabel(){
    if(Store.mode==='firebase'){
      const src = window.__fbConfigSource==='file' ? t('screens.set.configSourceFile') : t('screens.set.configSourceManual');
      return t('screens.set.fbConnectedLabel',{src});
    }
    if(Store.fbState==='error') return t('screens.set.fbConnectFailed');
    return (Store.mode==='window.storage'?t('screens.set.builtinStorage'):t('screens.set.thisDeviceBrowser')) + t('screens.set.storageModeSuffix');
  }
  /* 설정 소스에 따라 세 가지 화면을 보여준다.
     file : firebase-config.json으로 자동 연결됨 — 손댈 게 없으니 수동 입력칸 대신 상태만 보여준다.
     local: 이 기기에서 직접 입력한 값 — 기존처럼 편집 가능한 폼을 보여준다.
     none : 아무 것도 없음 — 폼 + 파일 배치 방법 안내를 함께 보여준다. */
  function fbConfigSectionHtml(){
    const src = window.__fbConfigSource || 'none';
    if(src==='file' && Store.mode==='firebase'){
      return `<div class="opt on" style="cursor:default;margin-bottom:0">
          <div><div class="t">${t('screens.set.fbFileConnectedTitle')}</div>
          <div class="d">${t('screens.set.fbFileConnectedDetail',{path:esc(window.__fbConfigFile||'./firebase-config.json'),pid:esc(window.__fb?.app?.options?.projectId||'')})}</div></div></div>
        <div class="hint" style="margin-top:10px;max-width:520px;line-height:1.7">
          ${t('screens.set.fbFileConnectedHint')}</div>`;
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
          <button class="btn sm primary" id="fb_save">${t('screens.set.fbSaveConnectBtn')}</button>
          ${fbCfg?`<button class="btn sm" id="fb_clear">${t('screens.set.fbDisconnectBtn')}</button>`:''}
        </div>
        <div class="hint" style="margin-top:8px;max-width:520px;line-height:1.7">
          ${t('screens.set.fbSetupHint')}
        </div>
        ${fileTried?fileDiagHtml():''}`;
  }
  function fileDiagHtml(){
    const d = window.__fbFileDiag;
    const box = (title,body,color)=>`<div class="hint" style="margin-top:10px;max-width:560px;line-height:1.7;${color?'color:'+color+';':''}">${body}</div>`;
    if(!d || !d.attempts || !d.attempts.length){
      return box('', t('screens.set.fbDiagNotTried'));
    }
    const rows = d.attempts.map(a=>{
      const ok = a.result==='OK';
      const line = `<div style="margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--surface2);border:1px solid ${ok?'var(--court)':'var(--line)'}">
        <div style="font-weight:700;color:${ok?'var(--court)':'var(--cork)'}">${ok?t('screens.set.diagSuccess'):t('screens.set.diagFail')} — <span class="num">${esc(a.url)}</span></div>
        <div style="margin-top:3px">${esc(a.result||'')}${a.status!=null?` (HTTP ${a.status})`:''}</div>
        ${a.hint?`<div style="margin-top:5px;color:var(--muted)">${esc(a.hint)}</div>`:''}
        ${a.snippet?`<div style="margin-top:5px;color:var(--muted2);font-family:monospace;font-size:12px;white-space:pre-wrap">${t('screens.set.diagPreview',{snippet:esc(a.snippet)})}</div>`:''}
      </div>`;
      return line;
    }).join('');
    return box('', `${t('screens.set.diagResultIntro')}
      ${rows}
      <div style="margin-top:8px">${t('screens.set.diagAllFailed')}
      <button class="btn sm ghost" id="fb_recheck" style="margin-left:6px">${t('screens.set.recheckBtn')}</button></div>`);
  }
  $('#fb_save')?.addEventListener('click',()=>{
    const cfg={ apiKey:$('#fb_apiKey').value.trim(), projectId:$('#fb_projectId').value.trim(),
      authDomain:$('#fb_authDomain').value.trim()||($('#fb_projectId').value.trim()+'.firebaseapp.com'),
      appId:$('#fb_appId').value.trim() };
    if(!cfg.apiKey||!cfg.projectId) return toast(t('screens.set.fbRequiredToast'));
    localStorage.setItem(window.__fbConfigKey, JSON.stringify(cfg));
    toast(t('screens.set.fbSavedReloadToast'));
    setTimeout(()=>location.reload(),700);
  });
  $('#fb_clear')?.addEventListener('click',()=>{
    if(!confirm(t('screens.set.confirmFbDisconnect'))) return;
    localStorage.removeItem(window.__fbConfigKey); setTimeout(()=>location.reload(),300);
  });
  $('#fb_recheck')?.addEventListener('click',()=>{ toast(t('screens.set.recheckingToast')); setTimeout(()=>location.reload(),300); });
  /* ── 운영자 비밀번호 — 소유자만 정할 수 있다 ────────────────────
     화면을 그린 뒤 비동기로 채운다. 소유자가 아니면 상태만 보여 주고
     입력칸은 내지 않는다. 내 봐야 서버가 거절하므로, 누를 수 있는 버튼을
     보여 주고 실패시키는 것보다 아예 안 보여 주는 편이 정직하다. */
  (async()=>{
    const el=$('#adminPwState'), box=$('#adminPwBox');
    if(!el) return;
    const st=await Secret.state();
    if(st==='set'){ el.textContent=t('screens.set.pwSet'); el.style.color='var(--court)'; }
    else if(st==='unset'){ el.textContent=t('screens.set.pwUnset');
                           el.style.color='var(--cork)'; }
    else { el.textContent=t('screens.set.pwCheckFailed'); return; }

    if(!Auth.isOwner){
      if(box) box.innerHTML='<div class="hint">'+t('screens.set.pwOwnerOnlyHint')+'</div>';
      return;
    }
    box.innerHTML=`
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input type="password" id="s_apw"  placeholder="${t('screens.set.pwPlaceholderNew')}"
               autocomplete="new-password" style="width:210px">
        <input type="password" id="s_apw2" placeholder="${t('screens.set.pwPlaceholderAgain')}"
               autocomplete="new-password" style="width:150px">
        <button class="btn sm primary" id="s_apwSet">${st==='set'?t('screens.set.pwChangeBtn'):t('screens.set.pwSetBtn')}</button>
      </div>
      <div id="s_apwErr" class="hint" style="margin-top:6px;color:var(--cork);min-height:18px"></div>`;
    $('#s_apwSet').onclick=async()=>{
      const err=$('#s_apwErr'), a=$('#s_apw').value, b=$('#s_apw2').value;
      if(a.length<8){ Sound.play('error'); return err.textContent=t('screens.set.pwTooShort'); }
      if(a!==b){ Sound.play('error'); return err.textContent=t('screens.set.pwMismatch'); }
      const btn=$('#s_apwSet'); btn.disabled=true; err.textContent=t('screens.set.pwSettingInProgress');
      const r=await Secret.setAdminPassword(a);
      btn.disabled=false;
      if(!r.ok){
        Sound.play('error');
        err.textContent = r.reason==='denied'
          ? t('screens.set.pwDenied')
          : t('screens.set.pwFailed');
        return;
      }
      Sound.play('confirm');
      $('#s_apw').value=''; $('#s_apw2').value='';
      err.style.color='var(--court)'; err.textContent=t('screens.set.pwApplied');
      el.textContent=t('screens.set.pwSet'); el.style.color='var(--court)';
      toast(t('screens.set.pwSetToast'));
    };
  })();
  $('#s_pol').onchange=renderSetHint;
  function renderSetHint(){ $('#s_pol').parentElement.querySelector('.hint').textContent=t(POLICY.find(p=>p[0]===$('#s_pol').value)[2]); }
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
        if(goneC.length) lines.push(t('screens.set.resizeGoneCourtsLine',
          {courts:goneC.map(c=>c.no+t('screens.set.courtSuffix')).join('·'), n:goneC.reduce((n,c)=>n+c.members.length,0)}));
        if(playing.length) lines.push(t('screens.set.resizePlayingLine',
          {courts:playing.map(c=>c.no+t('screens.set.courtSuffix')).join('·')}));
        if(goneQ.length) lines.push(t('screens.set.resizeGoneQueueLine',
          {queues:goneQ.map(q=>'Q'+q.index).join('·'), n:goneQ.reduce((n,q)=>n+q.members.length,0)}));
        if(!confirm(t('screens.set.resizeConfirmHeader')+'\n\n· '+lines.join('\n· ')+'\n\n'
                  + t('screens.set.resizeConfirmFooter'))) return;
      }
    }

    /* '결과 기록 강제'를 지금 켠 것이라면, 이미 끝나 있던 미기록 경기들은
       그냥 넘긴 것으로 표시해 둔다. 안 그러면 설정을 켜는 순간 오늘 친
       사람 전부가 한꺼번에 묶여 대진판이 통째로 멈춘다. 앞으로 끝나는
       경기부터 적으라는 것이 이 설정의 뜻이지, 지난 판을 소급해 캐묻는
       것이 아니다. */
    if($('#s_reqres').checked && !s.requireResult)
      S.matches.forEach(m=>{ if(resultPending(m)) m.skipped = true; });

    Object.assign(s,{clubName:$('#s_club').value.trim()||t('screens.set.defaultClubName'),courtCount:nc,queueSlotCount:ns,
      lang:$('#s_lang').value, matchWarnMinutes:+$('#s_warn').value||18, autoMode:$('#s_auto').checked,
      requireResult:$('#s_reqres').checked,
      maxMatchMinutes:Math.max(0,Math.min(120,+$('#s_maxmin').value||0)),
      autoPushToCourt:$('#s_push').checked,
      genderPolicy:$('#s_pol').value, oddRelaxThreshold:+$('#s_relax').value||2,
      minPool:Math.max(0,+$('#s_minpool').value||0),
      repeatLookback:+$('#s_look').value||3,
      historyDays:Math.max(0,Math.min(60,+$('#s_hist').value||0))});
    s.sound = $('#s_sound').checked; Sound.set(s.sound);
    settingsTrusted = true;      // 운영자가 화면에서 직접 확정한 값이다
    Lang.set(s.lang);   // 이 기기는 곧바로 반영 — 다른 기기는 설정 구독이 따라간다
    Object.assign(s.w,{odd:+$('#s_odd').value,game:+$('#s_wgame').value,wait:+$('#s_wwait').value,
      repeat:+$('#s_wrep').value,balance:+$('#s_wbal').value,age:+$('#s_wage').value});
    // 참고 일수가 바뀌었으면 과거 기록을 그만큼 다시 불러 둔다(다음 배치부터 반영).
    Records.warmUp(s.historyDays).catch(()=>{});
    tx(()=>{ if(sized) resizeBoard(nc, ns); });
    /* 코트/슬롯 수가 바뀌면 이전 스냅샷은 새 설정과 아귀가 안 맞으므로
       되돌리기 이력을 버린다. 되돌려서 옛 코트 배열이 돌아오면 화면과
       설정이 서로 다른 코트 수를 말하게 된다. */
    if(sized) undoStack.length=0;
    renderSet(); toast(t('screens.set.settingsSavedToast'));
  };
  // 위쪽 플로팅 버튼은 스크롤 상태와 무관하게 아래 저장 버튼과 같은 동작을 한다.
  const saveFloat=$('#s_saveFloat');
  saveFloat.textContent=t('screens.set.saveBtn');
  saveFloat.style.display='';
  saveFloat.onclick=()=>$('#s_save').click();
  $('#s_relogin').onclick=async()=>{ Sound.play('tap'); await Auth.logout(); Gate.reopen(); };
  $('#s_reload').onclick=async()=>{
    Sound.play('tap');
    const btn=$('#s_reload'); btn.disabled=true; btn.textContent=t('screens.stats.loading');
    const rMem=await Store.getSafe(K('members'), {strict:true});
    const rSet=await Store.getSafe(K('settings'), {strict:true});
    btn.disabled=false; btn.textContent=t('screens.set.reloadNowBtn');
    if(!rMem.ok){ Sound.play('error');
      return toast(t('screens.set.cloudReadFailed',{err:rMem.error||t('screens.set.readFailedFallback')})); }
    const list=rMem.value||[];
    if(!list.length) return toast(t('screens.set.cloudNoMembers'));
    // 방금 읽은 결과를 그대로 넘겨 준다(같은 문서를 두 번 읽지 않게).
    bulkOverwriteMembers(list, {
      source:t('screens.set.reloadSource',{n:list.length}),
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
  $('#s_reset').onclick=()=>{ if(!confirm(t('screens.set.confirmReset'))) return;
    S.settings=clone(DEFAULTS); tx(()=>initBoard()); renderSet(); };
}
