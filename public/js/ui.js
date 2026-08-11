/* =====================================================================
   렌더링
   ===================================================================== */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (t,c,h) => { const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; };
const MT_LBL = {MD:'남복',WD:'여복',XD:'혼복',MX:'혼성',UNKNOWN:'미정'};
const esc = s => String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
let flashSet=new Set();
function flash(id){ flashSet.add(id); setTimeout(()=>flashSet.delete(id),2100); }
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.display='none',2000); }

function sexIcon(g){ return g==='M'?'<span class="sx m">♂</span>' : g==='F'?'<span class="sx f">♀</span>' : '<span class="sx u">?</span>'; }
function waitMin(a){ return a.lastEnd? Math.floor((now()-a.lastEnd)/60000) : null; }

function chipEl(id, ctx){
  const a=A(id); if(!a) return el('div','seat','');
  const w=waitMin(a);
  // 성별·급수·출생년도는 화면에 표시하지 않는다(회원 명단에서만 확인).
  // 배치 계산에는 그대로 쓰이고, 화면에는 이름과 운영 정보만 남긴다.
  const e=el('div','chip');
  e.dataset.chip=id; e.dataset.ctx=ctx;
  e.innerHTML=`<div class="chip-nm">${esc(a.name)}${a.guest?'<span class="gst">G</span>':''}</div>
    <div class="chip-badge ${a.games===0?'zero':''}">${a.games}G</div>
    ${w!==null?`<div class="chip-wait ${w>=10?'long':''}">${w}분</div>`:''}`;
  if(sel===id) e.classList.add('sel');
  if(flashSet.has(id)) e.classList.add('hl');
  if(Auth.isMember && Auth.isMe(id)) e.classList.add('mine');   // 내 이름 강조
  return e;
}
function seatEl(dropId){ const e=el('div','seat','＋'); e.dataset.drop=dropId; return e; }

function mtBadge(o, kind, key){
  if(o.pinnedType && !o.members.length)
    return `<span class="mt ${o.pinnedType} pin" data-mt="${kind}:${key}">📌 ${MT_LBL[o.pinnedType]}</span>`;
  if(o.members.length!==4) return '';
  const t=o.matchType||'UNKNOWN';
  return `<span class="mt ${t}${o.pinnedType?' pin':''}" data-mt="${kind}:${key}">${o.pinnedType?'📌 ':''}${MT_LBL[t]}${o.typeSource==='MANUAL'?' ✎':''}</span>`;
}

function renderCourts(){
  const box=$('#courts'); box.innerHTML='';
  box.appendChild(el('div','sec-h','코트<span class="rule"></span>'));
  for(const c of S.courts){
    const mins=c.startedAt? (now()-c.startedAt)/60000 : 0;
    const over=c.status==='PLAYING' && mins>=S.settings.matchWarnMinutes;
    const card=el('div','court'+(c.status==='PLAYING'?' playing':'')+(over?' over':'')+(c.disabled?' disabled':''));
    card.dataset.drop=`court:${c.no}`;
    const t=c.startedAt? `${String(Math.floor(mins)).padStart(2,'0')}:${String(Math.floor((now()-c.startedAt)/1000)%60).padStart(2,'0')}` : '';
    card.innerHTML=`<div class="court-h">
        <span class="court-no">${c.no}코트</span>
        ${mtBadge(c,'court',c.no)}
        <span class="spacer"></span>
        ${t?`<span class="timer num">${t}</span>`:`<span class="stat">${c.disabled?'사용 안 함':c.members.length?`${c.members.length}/4`:'비어 있음'}</span>`}
        ${c.status==='PLAYING'
          ? `<button class="btn sm warn" data-end="${c.no}">종료</button>`
          : `<button class="btn sm primary" data-start="${c.no}" ${c.members.length!==4?'disabled':''}>시작</button>`}
        <span class="ic" data-swap="court:${c.no}" title="팀 바꾸기">⇄</span>
        <span class="ic ${c.locked?'on':''}" data-lock="court:${c.no}">${c.locked?'🔒':'🔓'}</span>
      </div>`;
    const net=el('div','net');
    ['A','B'].forEach((side,si)=>{
      const sd=el('div','side');
      sd.appendChild(el('div','side-tag',side+'팀'));
      const arr=c.teams[side]||[];
      for(let k=0;k<2;k++){
        const id=arr[k];
        sd.appendChild(id? (()=>{const e=chipEl(id,`court:${c.no}:${side}:${k}`); e.dataset.drop=`court:${c.no}:${side}:${k}`; return e;})()
                         : seatEl(`court:${c.no}:${side}:${k}`));
      }
      net.appendChild(sd);
      if(si===0) net.appendChild(el('div','netline'));
    });
    card.appendChild(net);
    box.appendChild(card);
  }
}

function renderQueues(){
  const box=$('#queues'); box.innerHTML='';
  const firstFull=S.queues.findIndex(q=>q.members.length===4);
  S.queues.forEach((q,i)=>{
    const e=el('div','slot'+(i===firstFull?' next':'')+(q.locked?' locked':'')+(!q.members.length?' empty':''));
    e.dataset.drop=`queue:${q.index}`;
    e.innerHTML=`<div class="slot-h">
        <span class="slot-no">Q${q.index}</span>
        ${mtBadge(q,'queue',q.index)}
        ${q.origin==='REVENGE'?'<span class="stat" style="color:var(--gold)">리벤지</span>':''}
        <span class="spacer"></span>
        ${q.members.length===4?`<button class="btn sm" data-push="${q.index}">투입</button>`:''}
        ${q.members.length?`<span class="ic" data-swap="queue:${q.index}" title="팀 바꾸기">⇄</span>
          <span class="ic" data-clear="${q.index}" title="비우기">✕</span>`:''}
        <span class="ic ${q.locked?'on':''}" data-lock="queue:${q.index}">${q.locked?'🔒':'🔓'}</span>
      </div>`;
    const grid=el('div','slot-grid');
    const order = q.teams.A.length? [...q.teams.A,...q.teams.B] : q.members;
    for(let k=0;k<4;k++){
      const id=order[k];
      grid.appendChild(id? (()=>{const c=chipEl(id,`queue:${q.index}`); c.dataset.drop=`queue:${q.index}:${k}`; return c;})()
                         : seatEl(`queue:${q.index}:${k}`));
    }
    e.appendChild(grid);
    if(q.notice) e.appendChild(el('div','notice','⚠ '+q.notice));
    box.appendChild(e);
  });
}

let poolSort='pri', poolSex='';
function renderPool(){
  const box=$('#pool'); box.innerHTML='';
  const all=Object.values(S.att);
  const maxG=Math.max(...all.map(a=>a.games),0);
  let ids=poolIds().filter(i=>!poolSex||A(i).gender===poolSex);
  if(poolSort==='pri')       ids.sort((x,y)=>priority(A(y),maxG)-priority(A(x),maxG));
  else if(poolSort==='game') ids.sort((x,y)=>A(x).games-A(y).games||A(x).name.localeCompare(A(y).name,'ko'));
  else                       ids.sort((x,y)=>A(x).name.localeCompare(A(y).name,'ko'));
  if(!ids.length) box.appendChild(el('div','pool-empty','대기 인원이 없습니다.'));
  ids.forEach(i=>box.appendChild(chipEl(i,'pool')));
  const m=poolIds().filter(i=>isM(A(i))).length, f=poolIds().filter(i=>isF(A(i))).length;
  $('#poolCnt').innerHTML=`<b>${poolIds().length}명</b> <span style="color:var(--muted2)">♂${m} ♀${f}</span>`;
}

function renderTop(){
  const all=Object.values(S.att);
  const m=all.filter(isM).length, f=all.filter(isF).length;
  const playing=S.courts.filter(c=>c.status==='PLAYING').length;
  $('#clubName').firstChild.textContent=S.settings.clubName;
  $('#dateLbl').textContent=' '+S.date.slice(5).replace('-','/');
  $('#statLbl').innerHTML=`출석 <b>${all.length}</b> <span style="color:var(--muted2)">(♂${m}·♀${f})</span> · 진행 <b>${playing}</b> · 총 <b>${S.matches.filter(x=>x.endedAt).length}</b>경기`;
  $('#autoTgl').classList.toggle('on',S.settings.autoMode);
  // 경기 운영 버튼은 CSS만 믿지 않는다. CSS가 캐시 등으로 반영되지 않아도
  // 눌리지 않도록 JS에서 직접 비활성화하고 숨긴다.
  const canEdit = Auth.can('edit');
  [['#autoTgl',true],['#btnSort',true],['#btnUndo',true]].forEach(([sel])=>{
    const b=$(sel); if(!b) return;
    b.style.display = canEdit ? '' : 'none';
    if(b.tagName==='BUTTON') b.disabled = !canEdit;
  });
  $('#btnUndo').disabled = !canEdit || !undoStack.length;
  // 회원용 내 출석 버튼
  const my=$('#myBtn');
  if(my){
    if(Auth.isMember){
      const a=Auth.myAttendee();
      my.style.display='';
      my.textContent = a? '출석 중' : '출석하기';
      my.classList.toggle('primary', !a);
      my.classList.toggle('ghost', !!a);
    } else my.style.display='none';
  }
  const dot=$('#cloudDot');
  if(dot) dot.style.background = Store.mode==='firebase' ? 'var(--court)' : Store.fbState==='error' ? 'var(--cork)' : 'var(--muted2)';
  if(dot) dot.title = Store.mode==='firebase' ? 'Firebase 연결됨' : Store.fbState==='error' ? 'Firebase 연결 실패' : 'Firebase 미연결 (이 기기에만 저장)';
}

function render(){ renderTop(); renderCourts(); renderQueues(); renderPool(); }
setInterval(()=>{ if($('#scr-board').classList.contains('on')) renderCourts(); },1000);
