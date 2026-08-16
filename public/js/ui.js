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
  /* 파워는 대기열·대기 인원에서만 보여 준다. 코트는 팀 단위로 따로
     보여 주므로(powerGauge) 사람마다 또 넣으면 같은 정보가
     두 번 보인다.

     막대를 이름 옆에 세우지 않고 칩 바탕을 아래에서부터 채운다. 옆에 세우면
     폰에서 그 몇 px 때문에 이름이 잘렸다 — 이름이 화면의 주인공인데 게이지가
     그걸 깎아먹으면 안 된다. 채우는 층은 이름 "뒤"에 깔리므로(z-index 아래)
     글자는 조금도 흐려지지 않는다.

     세로로 채우는 이유: 칩 높이는 어디서나 같지만 폭은 이름 길이를 따라
     달라진다. 가로로 채우면 같은 파워라도 이름이 긴 사람의 막대가 더 길어
     보여서 비교가 안 된다. 높이는 그 문제가 없다. */
  const showPw = ctx==='pool' || ctx.startsWith('queue:');
  const pw = showPw ? `<div class="chip-pw" style="--pw:${Math.min(1,powerOf(a)/powerMax).toFixed(3)}"></div>` : '';
  e.innerHTML=`${pw}
    <div class="chip-nm${g}">${esc(shownName(a.name))}${a.guest?'<span class="gst">G</span>':''}</div>
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

/* 경과 시간 색 — 시간이 갈수록 초록에서 붉은 쪽으로 옮겨 간다.
   양 끝값을 팔레트의 --court(0%)와 --cork(100%)에 맞춰 잡았다. 그래야 다
   찼을 때의 색과 그때 함께 붉어지는 코트 테두리가 같은 색이 되고, 중간
   구간도 이 앱의 다른 색들과 겉돌지 않는다.

   dl은 밝기를 더하는 값이다. 통합 게이지에서 A팀은 그대로, B팀은 밝게 써서
   같은 색 계열을 유지한 채 두 쪽을 구분한다(색을 아예 다르게 하면 "시간"을
   나타내는 색이 두 개가 되어 뜻이 흐려진다).

   구형 태블릿 브라우저를 생각해 hsl()은 쉼표 표기로 쓴다. */
function elapsedColor(pct, dl=0){
  const t = Math.max(0, Math.min(1, pct/100));
  // 양 끝값은 팔레트를 HSL로 옮긴 것이다.
  //   --court #0B7A56 → hsl(160, 83%, 26%)   --cork #C2410C → hsl(18, 88%, 40%)
  const h = 160 + (18-160)*t;
  const s =  83 + (88-83) *t;
  const l =  26 + (40-26) *t + dl;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${Math.min(92,l).toFixed(0)}%)`;
}

/* ── 통합 게이지 ──────────────────────────────────────────────────
   코트·대기 슬롯 하나에 가로 막대 하나. 두 가지를 한꺼번에 읽는다.

     · 길이  = 두 팀의 파워 비율. 왼쪽이 A팀, 오른쪽이 B팀이고 그 경계에
               구분선이 선다. 50:50이면 구분선이 한가운데 온다.
               가운데의 옅은 눈금이 "딱 반"의 기준선이라, 구분선이 거기서
               얼마나 밀려 있는지로 한쪽이 얼마나 센지 바로 보인다.
     · 색    = 경기 경과 시간. 최대 경기 시간(설정의 경기 시간 경고)에
               가까워질수록 붉어진다. 대기 슬롯은 아직 경기가 아니므로
               ce가 없고, 그때는 0%(코트 초록)로 고정된다.

   막대를 따로 두 개 세워 눈으로 재는 것보다, 하나를 나눠 갖게 하는 편이
   비율을 훨씬 빨리 읽는다(격투 게임 체력바와 같은 원리다). */
function hasTeams(o){ return !!((o.teams&&o.teams.A||[]).length || (o.teams&&o.teams.B||[]).length); }

function powerGauge(o, ce){
  const pw = s => ((o.teams&&o.teams[s])||[]).reduce((n,id)=>{const a=A(id); return n+(a?powerOf(a):0);},0);
  const a=pw('A'), b=pw('B'), total=a+b;
  // 파워가 0이면 반반으로 둔다 — 한쪽으로 쏠린 채 보여 주면 없는 정보를
  // 있는 것처럼 말하는 셈이다. (팀이 아예 없으면 hasTeams가 걸러 낸다.)
  const aPct = total>0 ? a/total*100 : 50;
  const pct  = ce ? ce.pct : 0;
  return `<div class="pw-gauge">
      <i class="ga" style="width:${aPct.toFixed(1)}%;background:${elapsedColor(pct)}"></i>
      <i class="gb" style="width:${(100-aPct).toFixed(1)}%;background:${elapsedColor(pct,26)}"></i>
      <i class="gmid"></i>
      <i class="gsplit" style="left:${aPct.toFixed(1)}%"></i>
    </div>`;
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
      </div>
      ${hasTeams(c)? powerGauge(c,ce) : ''}`;

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
    /* 게이지에서 매 초 바뀌는 것은 색(경과 시간)뿐이다. 길이(파워 비율)는
       사람이 바뀔 때만 달라지므로 render()가 맡는다. */
    const ga=card.querySelector('.pw-gauge .ga'), gb=card.querySelector('.pw-gauge .gb');
    if(ga) ga.style.background=elapsedColor(ce.pct);
    if(gb) gb.style.background=elapsedColor(ce.pct,26);
  });
}

function renderQueues(){
  const box=$('#queues'); box.innerHTML='';
  const firstFull=S.queues.findIndex(q=>q.members.length===4);
  S.queues.forEach((q,i)=>{
    const e=el('div','slot'+(i===firstFull?' next':'')+(!q.members.length?' empty':''));
    e.dataset.drop=`queue:${q.index}`;
    // 4명이 아니어도 사람이 있으면 통째로 끌 수 있다.
    // 투입 버튼은 없앴다 — 코트가 비면 자동으로 올라가고, 손으로 올릴 때는
    // 슬롯을 통째로 끌어다 놓는다. 작은 버튼을 정확히 누르는 것보다 낫다.
    if(q.members.length && Auth.can('courtAssign')) e.dataset.team=`queue:${q.index}`;
    e.innerHTML=`<div class="slot-h">
        <span class="slot-no">Q${q.index}</span>
        ${mtBadge(q,'queue',q.index)}
        ${q.origin==='REVENGE'?'<span class="stat" style="color:var(--gold)">리벤지</span>':''}
        <span class="spacer"></span>
        ${q.members.length?`<span class="ic" data-clear="${q.index}" title="비우기">✕</span>`:''}
      </div>
      ${hasTeams(q)? powerGauge(q,null) : ''}`;
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
  syncIdle();          // 상태가 바뀌었으니 타이머·화면잠금도 다시 맞춘다
}

/* =====================================================================
   놀고 있을 때는 아무것도 하지 않는다

   빈 대진판을 띄워 둔 아이패드가 밤새 배터리를 다 썼다. 원인이 셋이었다.
     1. 화면 꺼짐 방지(wake lock)를 켠 뒤 푸는 코드가 없었다. 경기가 있든
        없든 앱을 열기만 하면 화면이 영영 안 꺼졌다.
     2. 1초 타이머가 진행 중인 경기가 하나도 없어도 계속 깨어났다.
     3. 운영자로 두면 20초마다 Firestore 트랜잭션을 돌았다(auth.js).

   이제 "지금 실제로 필요한가"를 한 곳에서 판단해 셋을 함께 켜고 끈다.
   판단 기준은 아래 want* 함수 세 개뿐이라, 나중에 조건을 바꿀 때도
   여기만 보면 된다.
   ===================================================================== */

/* 화면을 켜 둬야 하는가 — 출석자가 있는 동안만. 세션을 마감하면(출석자 0)
   태블릿은 알아서 잠들어야 한다. 경기 사이사이 쉬는 시간에도 운영자는
   화면을 봐야 하므로 "진행 중인 경기"가 아니라 "출석자"를 기준으로 둔다. */
const wantWake = () => document.visibilityState==='visible'
                    && Object.keys(S.att).length > 0;
/* 1초 타이머가 필요한가 — 대진판이 보이고, 시간이 흐르는 코트가 있을 때만.
   타이머가 하는 일은 경과 시간 숫자와 게이지 색을 바꾸는 것뿐이다. */
const wantTick = () => document.visibilityState==='visible'
                    && !!($('#scr-board') && $('#scr-board').classList.contains('on'))
                    && S.courts.some(c=>c.status==='PLAYING');

let tickTimer=null, wakeSentinel=null;

async function syncWake(){
  if(!('wakeLock' in navigator)) return;
  const want = wantWake();
  try{
    if(want && !wakeSentinel){
      wakeSentinel = await navigator.wakeLock.request('screen');
      /* 브라우저가 스스로 놓는 경우가 있다(탭 전환·기기 잠금). 그때 참조를
         비워 두지 않으면 다음에 다시 요청하지 못하고, 예전 코드처럼 놓지도
         않은 잠금이 쌓인다. */
      wakeSentinel.addEventListener('release', ()=>{ wakeSentinel=null; });
    }else if(!want && wakeSentinel){
      const s=wakeSentinel; wakeSentinel=null;
      await s.release();
    }
  }catch{ wakeSentinel=null; }   // 요청 실패는 조용히 넘긴다(기능이 없는 기기 등)
}

function syncIdle(){
  const want = wantTick();
  if(want && !tickTimer)      tickTimer=setInterval(tickCourts,1000);
  else if(!want && tickTimer){ clearInterval(tickTimer); tickTimer=null; }
  syncWake();
}

/* 화면을 벗어나면 곧바로 전부 멈춘다. 돌아오면 다시 맞춘다.
   구독과 운영자 하트비트도 같은 신호를 쓴다(main.js·auth.js). */
document.addEventListener('visibilitychange', syncIdle);
