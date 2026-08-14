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

/* ── 게스트에게 보이는 이름 ────────────────────────────────────────
   구경만 하러 온 사람에게 코트 위 이름이 통째로 보일 이유가 없다.
   성만 남기고 나머지를 가린다 — 김철수 → 김○○.

   입장 화면의 가리기(gate.js maskName)와는 반대 방향이다. 저기는 본인
   확인용이라 마지막 한 글자만 가리고, 여기는 남에게 안 보이는 것이 목적이라
   첫 글자만 남긴다.

   한계: 남궁·선우처럼 두 글자 성은 한 글자로 잘린다. 성씨 목록을 들고
   다니면서까지 맞출 값어치는 없다고 보고 그대로 뒀다. 어차피 가리는 쪽이
   목적이라 덜 보이는 것은 문제가 되지 않는다. */
function viewerName(name){
  const a = [...String(name||'')];
  if(a.length < 2) return a.join('');
  return a[0] + '○'.repeat(a.length - 1);
}
/* 지금 역할에서 화면에 쓸 이름. 게스트만 가려진다. */
function shownName(name){
  return (typeof Auth!=='undefined' && Auth.isViewer) ? viewerName(name) : name;
}
function waitMin(a){ return a.lastEnd? Math.floor((now()-a.lastEnd)/60000) : null; }

/* 이번 렌더 주기의 파워 최댓값. 막대 길이는 절대값이 아니라 "지금 이
   화면에 있는 사람들 중 누가 제일 센가" 기준의 상대값이라 매 render()마다
   다시 잰다. render() 밖에서(드래그 고스트 등) 잠깐 옛 값을 쓰더라도
   막대가 좀 덜 정확할 뿐 깨지지는 않는다. */
let powerMax = 1;

function chipEl(id, ctx){
  const a=A(id); if(!a) return el('div','seat','');
  const w=waitMin(a);
  // 성별·급수·출생년도는 화면에 표시하지 않는다(회원 명단에서만 확인).
  // 배치 계산에는 그대로 쓰이고, 화면에는 이름과 운영 정보만 남긴다.
  const e=el('div','chip');
  e.dataset.chip=id; e.dataset.ctx=ctx;
  // 남녀는 이름 색으로만 구분한다(♂♀ 아이콘이나 배지를 따로 두지 않는다).
  const g = a.gender==='M' ? ' m' : a.gender==='F' ? ' f' : ' u';
  /* 파워 막대는 대기열·대기 인원에서만 이름 옆에 세운다. 코트는 팀 단위로
     따로 보여 주므로(renderCourts의 pw-col) 사람마다 또 넣으면 같은 정보가
     두 번 보인다. */
  const showPw = ctx==='pool' || ctx.startsWith('queue:');
  const pw = showPw ? `<div class="chip-pw" style="--pw:${Math.min(1,powerOf(a)/powerMax).toFixed(3)}"><i></i></div>` : '';
  e.innerHTML=`<div class="chip-nm${g}">${esc(shownName(a.name))}${a.guest?'<span class="gst">G</span>':''}</div>
    ${pw}
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

/* 경기 경과 — 헤더 숫자 타이머와 그 아래 경과 막대가 같은 값을 쓴다.
   100%의 기준은 설정의 '경기 시간 경고'(= 이 클럽이 정한 최대 경기 시간)다.
   진행 중이 아니면(코트가 비었거나 채우는 중이면) null. */
function courtElapsed(c){
  if(c.status!=='PLAYING' || !c.startedAt) return null;
  const ms=now()-c.startedAt, mins=ms/60000;
  const warn=S.settings.matchWarnMinutes||1;
  return {
    over: mins>=warn,
    label: `${String(Math.floor(mins)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`,
    pct: Math.min(100, mins/warn*100)
  };
}

/* 경과 막대 색 — 차오를수록 초록에서 붉은 쪽으로 옮겨 간다.
   양 끝값을 팔레트의 --court(0%)와 --cork(100%)에 정확히 맞춰 잡았다.
   그래야 다 찼을 때의 막대 색과 그때 함께 붉어지는 코트 테두리가 같은
   색이 되고, 중간 구간도 이 앱의 다른 색들과 겉돌지 않는다.

   구형 태블릿 브라우저를 생각해 hsl()은 쉼표 표기로 쓴다. */
function elapsedColor(pct){
  const t = Math.max(0, Math.min(1, pct/100));
  // 양 끝값은 팔레트를 HSL로 옮긴 것이다.
  //   --court #0B7A56 → hsl(160, 83%, 26%)   --cork #C2410C → hsl(18, 88%, 40%)
  const h = 160 + (18-160)*t;
  const s =  83 + (88-83) *t;
  const l =  26 + (40-26) *t;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

function renderCourts(){
  const box=$('#courts'); box.innerHTML='';
  for(const c of S.courts){
    const ce=courtElapsed(c);
    const card=el('div','court'+(c.status==='PLAYING'?' playing':'')+(ce&&ce.over?' over':'')+(c.disabled?' disabled':''));
    card.dataset.drop=`court:${c.no}`;
    // 버튼(시작·종료·빼기·잠금)은 전부 없앴다. 머리 부분을 두 번 두드리면
    // 다음 단계로 가고, 끌면 원하는 곳으로 옮긴다.
    if(c.members.length && Auth.can('courtAssign')) card.dataset.team=`court:${c.no}`;
    card.innerHTML=`<div class="court-h">
        <span class="court-no">${c.no}코트</span>
        ${mtBadge(c,'court',c.no)}
        <span class="spacer"></span>
        ${ce?`<span class="timer num">${ce.label}</span>`:`<span class="stat">${c.disabled?'사용 안 함':c.members.length?`${c.members.length}/4`:'비어 있음'}</span>`}
        ${c.members.length===4?`<span class="ic" data-swap="court:${c.no}" title="팀 바꾸기">⇄</span>`:''}
      </div>
      ${ce?`<div class="court-elapsed"><i style="width:${ce.pct}%;background:${elapsedColor(ce.pct)}"></i></div>`:''}`;

    // 팀 파워 — 두 팀을 나란히 비교하는 것이 목적이라, 더 센 쪽이 100%를
    // 채우고 나머지는 그 안에서의 비율로 짧아진다(전체 인원 대비가 아니다).
    const teamPower={A:0,B:0};
    ['A','B'].forEach(side=>{
      teamPower[side]=(c.teams[side]||[]).reduce((s,id)=>{const a=A(id); return s+(a?powerOf(a):0);},0);
    });
    const maxTP=Math.max(teamPower.A,teamPower.B,1);

    const net=el('div','net');
    ['A','B'].forEach((side,si)=>{
      const sd=el('div','side');
      sd.appendChild(el('div','side-tag',`${side}팀`));
      const arr=c.teams[side]||[];
      for(let k=0;k<2;k++){
        const id=arr[k];
        sd.appendChild(id? (()=>{const e=chipEl(id,`court:${c.no}:${side}:${k}`); e.dataset.drop=`court:${c.no}:${side}:${k}`; return e;})()
                         : seatEl(`court:${c.no}:${side}:${k}`));
      }
      /* 파워 막대는 네트 쪽 가장자리에 세운다 — A팀은 오른쪽 끝, B팀은
         왼쪽 끝. 둘이 네트를 사이에 두고 맞붙어야 길이 차이가 바로 읽힌다.
         떨어뜨려 놓으면 두 막대를 번갈아 보며 눈으로 재야 한다. */
      if(c.members.length)
        sd.appendChild(el('div','pw-col',
          `<i style="height:${(teamPower[side]/maxTP*100).toFixed(1)}%"></i>`));
      net.appendChild(sd);
      if(si===0) net.appendChild(el('div','netline'));
    });
    card.appendChild(net);
    box.appendChild(card);
  }
}

/* 1초마다 타이머만 갱신한다. renderCourts()를 통째로 다시 부르면 진행 중인
   코트 카드가 매초 새로 만들어지면서 "경기 시작" 테두리 애니메이션이 다시
   실행돼, 아무 일도 없는데 코트 가장자리가 계속 번쩍였다. 그래서 이미 있는
   DOM은 그대로 두고 숫자와 막대 값만 바꾼다 — 시작 때 한 번만 반짝인다. */
function tickCourts(){
  $$('#courts .court').forEach(card=>{
    const no=+(card.dataset.drop||'').split(':')[1];
    const c=S.courts.find(x=>x.no===no);
    const ce=c&&courtElapsed(c);
    if(!ce) return;
    card.classList.toggle('over',ce.over);
    const timerEl=card.querySelector('.timer'); if(timerEl) timerEl.textContent=ce.label;
    const barEl=card.querySelector('.court-elapsed > i');
    if(barEl){ barEl.style.width=ce.pct+'%'; barEl.style.background=elapsedColor(ce.pct); }
  });
}

function renderQueues(){
  const box=$('#queues'); box.innerHTML='';
  const firstFull=S.queues.findIndex(q=>q.members.length===4);
  S.queues.forEach((q,i)=>{
    const e=el('div','slot'+(i===firstFull?' next':'')+(!q.members.length?' empty':''));
    e.dataset.drop=`queue:${q.index}`;
    // 4명이 찬 슬롯은 통째로 끌어서 코트에 놓을 수 있다. 작은 투입 버튼을
    // 정확히 누르는 것보다 팀을 통째로 끌어다 놓는 쪽이 훨씬 직관적이다.
    const full = q.members.length===4;
    // 4명이 아니어도 사람이 있으면 통째로 끌 수 있다.
    if(q.members.length && Auth.can('courtAssign')) e.dataset.team=`queue:${q.index}`;
    e.innerHTML=`<div class="slot-h">
        <span class="slot-no">Q${q.index}</span>
        ${mtBadge(q,'queue',q.index)}
        ${q.origin==='REVENGE'?'<span class="stat" style="color:var(--gold)">리벤지</span>':''}
        <span class="spacer"></span>
        ${full?`<button class="btn sm primary push-btn" data-push="${q.index}">투입 →</button>`:''}
        ${q.members.length?`<span class="ic" data-swap="queue:${q.index}" title="팀 바꾸기">⇄</span>
          <span class="ic" data-clear="${q.index}" title="비우기">✕</span>`:''}
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
  if(dot){
    const bad = Store.fbState==='error' || Store.fbState==='authFailed';
    dot.style.background = bad ? 'var(--cork)'
      : Store.mode==='firebase' ? 'var(--court)' : 'var(--muted2)';
    dot.title = Store.fbState==='authFailed'
        ? '익명 로그인이 되지 않았습니다 — 콘솔에서 Authentication → 익명을 켜세요'
      : Store.fbState==='error' ? 'Firebase 연결 실패'
      : Store.mode==='firebase' ? 'Firebase 연결됨'
      : 'Firebase 미연결 (이 기기에만 저장)';
  }
}

function render(){
  // 파워 막대는 절대값이 아니라 "지금 화면에 있는 사람 중 최댓값 대비"라서
  // 출석자가 바뀔 때마다(=render 때마다) 기준을 다시 잰다.
  powerMax = Math.max(1, ...Object.values(S.att).map(powerOf));
  renderTop(); renderCourts(); renderQueues(); renderPool();
}
setInterval(()=>{ if($('#scr-board').classList.contains('on')) tickCourts(); },1000);
