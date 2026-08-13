/* =====================================================================
   화면 전환
   ===================================================================== */
function show(name){
  $$('.screen').forEach(s=>s.classList.toggle('on',s.id==='scr-'+name));
  $$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.scr===name));
  if(name==='att') renderAtt();
  if(name==='mem') renderMem();
  if(name==='hist') renderHist();
  if(name==='set') renderSet();
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

/* ── 기록 ───────────────────────────────────────────────────────── */
function renderHist(){
  const done=S.matches.filter(m=>m.endedAt);
  const all=Object.values(S.att).sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name,'ko'));
  const byType={}; done.forEach(m=>byType[m.type||'UNKNOWN']=(byType[m.type||'UNKNOWN']||0)+1);
  const avg=done.length? done.reduce((s,m)=>s+(m.endedAt-m.startedAt),0)/done.length/60000 : 0;
  const men=all.filter(isM), wom=all.filter(isF);
  const mean=a=>a.length? (a.reduce((s,x)=>s+x.games,0)/a.length).toFixed(2):'—';
  $('#histBody').innerHTML=`
    <div class="sec-h">${S.date} 세션 요약<span class="rule"></span></div>
    <div class="row" style="gap:26px;margin:14px 0 22px;font-size:15px">
      <div>총 경기 <b class="num" style="font-size:22px">${done.length}</b></div>
      <div>평균 경기시간 <b class="num" style="font-size:22px">${avg.toFixed(1)}</b>분</div>
      <div>남 평균 <b class="num" style="font-size:22px">${mean(men)}</b>게임</div>
      <div>여 평균 <b class="num" style="font-size:22px">${mean(wom)}</b>게임</div>
      <div>게임수 편차 <b class="num" style="font-size:22px">${all.length?Math.max(...all.map(a=>a.games))-Math.min(...all.map(a=>a.games)):0}</b></div>
    </div>
    <div class="row" style="gap:9px;margin-bottom:24px">
      ${['MD','WD','XD','MX','UNKNOWN'].filter(t=>byType[t]).map(t=>
        `<span class="mt ${t}" style="cursor:default;height:30px">${MT_LBL[t]} ${byType[t]}경기 · ${Math.round(100*byType[t]/done.length)}%</span>`).join('')||'<span class="hint">아직 종료된 경기가 없습니다.</span>'}
    </div>
    <div class="sec-h">개인별<span class="rule"></span></div>
    <table><tr><th>이름</th><th>게임수</th><th>마지막 경기</th></tr>
      ${all.map(a=>`<tr><td style="font-weight:700">${esc(a.name)}${a.guest?' <span style="color:var(--gold)">G</span>':''}</td>
        <td class="num" style="font-weight:800;font-size:17px">${a.games}</td>
        <td style="color:var(--muted)">${a.lastEnd?new Date(a.lastEnd).toTimeString().slice(0,5):'—'}</td></tr>`).join('')}
    </table>
    <div class="sec-h" style="margin-top:26px">경기 이력<span class="rule"></span></div>
    <table><tr><th>#</th><th>코트</th><th>유형</th><th>A팀</th><th>B팀</th><th>시간</th></tr>
      ${done.slice().reverse().map((m,i)=>`<tr><td class="num">${done.length-i}</td><td>${m.court}</td>
        <td><span class="mt ${m.type||'UNKNOWN'}" style="cursor:default;height:22px">${MT_LBL[m.type||'UNKNOWN']}</span></td>
        <td>${(m.An||m.A.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td>${(m.Bn||m.B.map(id=>A(id)?.name||'?')).map(esc).join(' · ')}</td>
        <td class="num" style="color:var(--muted)">${Math.round((m.endedAt-m.startedAt)/60000)}분</td></tr>`).join('')}
    </table>
    <div class="row" style="margin-top:24px;align-items:center;gap:14px">
      <button class="btn warn" id="btnClose">세션 마감 (전원 퇴장)</button>
      <span class="hint" id="autoCloseLbl"></span>
    </div>`;
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

/* ── 설정 ───────────────────────────────────────────────────────── */
const POLICY=[['FREE','성별 무시 (권장)','공정성만 보고 조합. 결과대로 유형만 표기'],
  ['PREFER_SAME','동성 우선','남복·여복 선호. 여성이 소수면 혼복이 사라질 수 있음'],
  ['PREFER_MIXED','혼복 우선','혼복 선호. 여복이 거의 안 나옴'],
  ['STRICT_SAME','동성 강제','남4·여4만 허용'],
  ['STRICT_MIXED','혼복 강제','남2여2만 허용. 성비가 치우치면 공정성이 깨짐']];
function renderSet(){
  // 설정은 운영자 전용이다. 회원·뷰어에게는 현재 값을 읽기 전용으로 보여 준다.
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
      <div class="k">코트 수</div><div><input type="number" id="s_courts" value="${s.courtCount}" min="1" max="8" style="width:90px"> <span class="hint">변경하면 대진판이 초기화됩니다</span></div>
      <div class="k">대기 슬롯 수</div><div><input type="number" id="s_slots" value="${s.queueSlotCount}" min="2" max="12" style="width:90px"></div>
      <div class="k">풀 최소 확보 인원</div><div><input type="number" id="s_minpool" value="${s.minPool}" min="0" max="12" style="width:90px">
        <span class="hint">대기 슬롯을 끝까지 채우지 않고 이만큼은 대기 인원으로 남깁니다. 0으로 두면 방금 같이 친 4명이 그대로 다시 묶입니다</span></div>
      <div class="k">경기 시간 경고</div><div><input type="number" id="s_warn" value="${s.matchWarnMinutes}" min="5" max="60" style="width:90px"> 분 초과 시 코트가 붉게 표시</div>

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
      <div class="k">회원 명단 보호</div><div>
        <div class="hint">회원 명단을 통째로 바꾸는 조작(백업 복원 · CSV 일괄등록 · 클라우드에서 다시 불러오기)은
          <b>관리 비밀번호</b>를 받고 진행합니다. 확인 창에서 누가 사라지고 누가 생기는지,
          그 결과가 무엇인지 먼저 보여 줍니다.<br>
          비밀번호를 거치지 않은 채 회원이 사라지는 저장(명단을 못 불러와 화면이 빈 경우 등)은
          자동으로 차단되고 화면 위에 붉은 띠가 뜹니다. 그때는 아무것도 만지지 말고 새로고침하세요.<br>
          현재 기준 명단: <b>${loadedMembersCount==null?'확인 안 됨':loadedMembersCount+'명'}</b></div></div>

      <div class="h">저장소</div>
      <div class="k">현재 모드</div><div><b id="storeMode" style="color:${Store.mode==='firebase'?'var(--court)':'var(--muted)'}">${storeModeLabel()}</b>
        <div class="hint" style="margin-top:6px">Firebase를 연결하면 클라우드에 저장되고 다른 태블릿과 실시간으로 맞춰집니다. 연결이 끊겨도 이 기기에서 계속 조작할 수 있고, 돌아오면 자동으로 동기화됩니다. 연결하지 않으면 이 기기에만 저장되니 회원 화면의 <b>백업</b>을 주기적으로 받아 두세요.</div></div>
      <div class="k">Firebase 프로젝트</div><div>${fbConfigSectionHtml()}</div>
    </div>
    <div class="row" style="margin-top:24px"><button class="btn primary" id="s_save">설정 저장</button>
      <button class="btn" id="s_reset">기본값으로</button></div>`;
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
  $('#s_pol').onchange=renderSetHint;
  function renderSetHint(){ $('#s_pol').parentElement.querySelector('.hint').textContent=POLICY.find(p=>p[0]===$('#s_pol').value)[2]; }
  $('#s_save').onclick=()=>{
    const nc=Math.max(1,+$('#s_courts').value||3), ns=Math.max(2,+$('#s_slots').value||7);
    const reset = nc!==s.courtCount || ns!==s.queueSlotCount;
    Object.assign(s,{clubName:$('#s_club').value.trim()||'대진판',courtCount:nc,queueSlotCount:ns,
      matchWarnMinutes:+$('#s_warn').value||18, autoMode:$('#s_auto').checked,
      autoPushToCourt:$('#s_push').checked,
      genderPolicy:$('#s_pol').value, oddRelaxThreshold:+$('#s_relax').value||2,
      minPool:Math.max(0,+$('#s_minpool').value||0),
      repeatLookback:+$('#s_look').value||3});
    s.sound = $('#s_sound').checked; Sound.set(s.sound);
    settingsTrusted = true;      // 운영자가 화면에서 직접 확정한 값이다
    Object.assign(s.w,{odd:+$('#s_odd').value,game:+$('#s_wgame').value,wait:+$('#s_wwait').value,
      repeat:+$('#s_wrep').value,balance:+$('#s_wbal').value,age:+$('#s_wage').value});
    tx(()=>{ if(reset){ Object.values(S.att).forEach(a=>a.state='POOL'); initBoard(); } });
    // 코트/슬롯 수가 바뀌면 이전 스냅샷은 새 설정과 아귀가 안 맞으므로 되돌리기 이력을 버린다.
    if(reset) undoStack.length=0;
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
