/* =====================================================================
   자동 배치 알고리즘

   ── 사람이 도는 길 ──────────────────────────────────────────────
     대기 인원(POOL) ──충원──> 대기열(QUEUED) ──투입──> 코트(PLAYING)
            ^                                              │
            └──────────────────── 종료 ────────────────────┘

   ── 한 번의 autoAssign()이 하는 일 ──────────────────────────────
     아래 세 단계를 "더 이상 변화가 없을 때까지" 되풀이한다.
       1. 투입   pushToCourt()    빈 코트에 4명이 찬 대기 팀을 올린다
       2. 당기기 compactQueues()  뒤 슬롯을 앞으로 당겨 순번을 메운다
       3. 충원   fillQueues()     대기 인원에서 뽑아 빈자리를 채운다
     순서를 바꾸면 안 된다. 충원이 먼저 돌면 Q1이 비는 즉시 방금 경기를
     마친 사람들로 다시 채워져, 뒤 슬롯이 영영 앞으로 오지 못하고 그 팀은
     한 게임도 못 친다.

   ── 누구를 뽑을지 정하는 방법 ───────────────────────────────────
     (1) 개인 점수(priority)로 후보를 추린다 — 게임 수가 적고 오래 기다린
         사람이 앞선다.
     (2) 추린 후보로 만들 수 있는 4명 조합을 전부 만들어 조합 점수를 매긴다.
           조합 점수 = Σ개인 점수
                      − 중복(최근에 같이 친 짝)
                      − 급수 불균형
                      − 나이 차
                      + 성별 정책 가산 − 3:1 감점
     (3) 가장 높은 조합을 쓴다.

   이 파일은 다섯 부분으로 나뉜다.
     1부 점수      개인·조합 점수 계산
     2부 성별과 팀 경기 유형 판정과 2:2 분할
     3부 조합 탐색 후보에서 최적 조합 고르기
     4부 파이프라인 투입 · 당기기 · 충원
     5부 시작과 종료
   ===================================================================== */


/* =====================================================================
   1부. 점수
   ===================================================================== */

/* 개인 우선순위 — 클수록 먼저 나간다.
   게임 수가 적을수록, 오래 기다렸을수록, 아직 한 판도 못 쳤으면 더 크다. */
function priority(a, maxG){
  const w=S.settings.w;
  const wait = a.lastEnd ? Math.min((now()-a.lastEnd)/60000, 30) : 30;
  // jit: 출석 시 1회 부여하는 0~1 고정값. 모든 조건이 같을 때만 순서를 가른다.
  // 이게 없으면 세션 첫 배치가 명단 입력 순서대로 몰려(예: 남자만 코트에) 나온다.
  return w.game*(maxG-a.games) + w.wait*wait + (a.games===0? w.new:0) + (a.jit||0);
}

/* 3:1 감점 — 성별 정책과 무관하게 항상 본다. 남3여1 같은 조합을 피한다.
   단, 유독 뒤처진 사람이 끼어 있으면 공정성을 우선해 감점을 면제한다.
   (소수 성별이 대기에 갇히는 것을 막는 장치다.) */
function oddPenalty(ids, maxG){
  if(hasUnknown(ids)) return 0;
  const [m,f]=counts(ids);
  if(!(m===3||f===3)) return 0;
  const behind = maxG - Math.min(...ids.map(i=>A(i).games));
  if(behind >= S.settings.oddRelaxThreshold) return 0;
  return S.settings.w.odd;
}

/* 성별 정책 가산점. STRICT_*는 조건에 맞지 않으면 -Infinity로 조합 자체를 버린다. */
function policyBonus(ids){
  if(hasUnknown(ids)) return 0;
  const [m,f]=counts(ids), w=S.settings.w;
  const same=(m===4||f===4), mixed=(m===2&&f===2);
  switch(S.settings.genderPolicy){
    case 'PREFER_SAME':  return same? w.same:0;
    case 'PREFER_MIXED': return mixed? w.mixed:0;
    case 'STRICT_SAME':  return same? 0:-Infinity;
    case 'STRICT_MIXED': return mixed? 0:-Infinity;
    default:             return 0;
  }
}

/* 최근 N경기 안에 같이 뛴 짝의 수. 많을수록 감점(같은 사람끼리 계속 붙는 것 방지). */
function repeatPenalty(ids){
  const look=S.settings.repeatLookback;
  // 주의: slice(-0)은 slice(0)과 같아서 배열 전체를 돌려준다. 0을 "중복 회피 끄기"로
  // 쓰려면 여기서 먼저 걸러야 한다. 안 그러면 세션 내내 쌓인 모든 경기를 보고
  // 감점하게 되어 오히려 가장 강하게 회피하는 설정이 되어 버린다.
  if(!look || look<=0) return 0;
  const recent=S.hist.slice(-look);
  let p=0;
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++)
    for(const g of recent) if(g.includes(ids[i])&&g.includes(ids[j])) p++;
  return p;
}

/* 네 명의 나이 폭(10년 단위). w.age가 0이면 사실상 안 쓴다. */
function ageCost(ids){
  const ys=ids.map(i=>A(i).birthYear).filter(Boolean);
  return ys.length<2?0:(Math.max(...ys)-Math.min(...ys))/10;
}

/* 조합 하나의 최종 점수. 위 항목들을 설정 가중치로 버무린 결과다.
   full  = 슬롯에 이미 있던 사람 + 새로 넣을 사람 (총 4명)
   combo = 이번에 새로 넣을 사람만 (개인 점수는 이쪽만 센다)
   split = bestSplit이 고른 2:2 분할(급수 불균형 비용을 여기서 가져온다) */
function comboScore(full, combo, split, maxG, genderTerm){
  const w=S.settings.w;
  return combo.reduce((x,i)=>x+priority(A(i),maxG),0)
       - w.repeat  * repeatPenalty(full)
       - w.balance * split.cost
       - w.age     * ageCost(full)
       + genderTerm;
}


/* =====================================================================
   2부. 성별과 팀
   ===================================================================== */

function counts(ids){ const m=ids.filter(i=>isM(A(i))).length; return [m, ids.length-m]; }
function hasUnknown(ids){ return ids.some(i=>{const g=A(i).gender; return g!=='M'&&g!=='F';}); }

/* 네 명과 팀 배치로부터 경기 유형을 판정한다.
   남4=MD, 여4=WD, 남2여2인데 양 팀 모두 남녀 한 명씩이면 XD(혼복),
   아니면 MX(혼성 — 예: 남남 vs 여여). */
function mtypeOf(ids, teams){
  if(hasUnknown(ids)) return 'UNKNOWN';
  const [m,f]=counts(ids);
  if(m===4) return 'MD';
  if(f===4) return 'WD';
  if(m===2&&f===2&&teams){
    const mix = t => t.some(i=>isM(A(i))) && t.some(i=>isF(A(i)));
    return (mix(teams.A)&&mix(teams.B))? 'XD':'MX';
  }
  return 'MX';
}
/* 팀을 짜기 전에 "이 네 명이면 보통 이 유형"을 정해 둔다. */
function defaultTarget(ids){
  if(hasUnknown(ids)) return null;
  const [m,f]=counts(ids);
  if(m===4) return 'MD';
  if(f===4) return 'WD';
  if(m===2&&f===2) return 'XD';
  return 'MX';
}

/* 네 명을 2:2로 나누는 방법은 세 가지뿐이다. 목표 유형을 만족하는 것만 남기고
   그중 급수 합이 가장 팽팽한 분할을 고른다. cost가 곧 급수 불균형이다. */
function bestSplit(ids, target){
  const P=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
  const out=[];
  for(const [a1,a2,b1,b2] of P){
    const t={A:[ids[a1],ids[a2]], B:[ids[b1],ids[b2]]};
    const mt=mtypeOf(ids,t);
    if(target==='XD' && mt!=='XD') continue;
    if(target==='MX' && mt!=='MX') continue;
    out.push({teams:t, cost:Math.abs(gw(A(t.A[0]).grade)+gw(A(t.A[1]).grade)-gw(A(t.B[0]).grade)-gw(A(t.B[1]).grade)), mt});
  }
  if(!out.length) return null;
  out.sort((a,b)=>a.cost-b.cost);
  return out[0];
}


/* =====================================================================
   3부. 조합 탐색
   ===================================================================== */

/* 배열에서 k개를 고르는 모든 조합 */
function* kCombo(arr,k,start=0,cur=[]){
  if(cur.length===k){ yield cur.slice(); return; }
  for(let i=start;i<arr.length;i++){ cur.push(arr[i]); yield* kCombo(arr,k,i+1,cur); cur.pop(); }
}

/* 후보군에서 최적 조합을 찾는다.
     cands  후보 인원 (개인 점수 상위 K명)
     need   이번에 채워야 할 인원 수
     fixed  이미 슬롯에 있는 인원 — 절대 바뀌지 않는다
     pinned 슬롯에 지정된 경기 유형(있으면 그 유형으로만 팀을 짠다)
   네 명이 안 되는 슬롯은 팀을 짤 수 없으므로 개인 점수만으로 고른다. */
function bestCombination(cands, need, fixed, pinned, maxG){
  let best=null;
  const keep = cand => { if(!best || cand.score>best.score) best=cand; };

  for(const combo of kCombo(cands,need)){
    const full=[...fixed,...combo];

    // 아직 4명이 안 되면 팀·유형을 논할 수 없다. 개인 점수 합만 본다.
    if(full.length<4){
      keep({score:combo.reduce((x,i)=>x+priority(A(i),maxG),0),
            picked:combo, teams:null, matchType:null});
      continue;
    }

    // 성별 조건을 먼저 본다. STRICT 정책에 걸리면 이 조합은 아예 버린다.
    const genderTerm = oddPenalty(full,maxG) + policyBonus(full);
    if(genderTerm===-Infinity) continue;

    // 목표 유형에 맞는 2:2 분할이 없으면 역시 버린다.
    const split = bestSplit(full, pinned || defaultTarget(full));
    if(!split) continue;

    keep({score:comboScore(full, combo, split, maxG, genderTerm),
          picked:combo, teams:split.teams, matchType:mtypeOf(full,split.teams)});
  }
  return best;
}

/* 개인 점수 상위 k명을 후보로 추린다. 전수 탐색은 인원이 늘면 폭발하므로
   여기서 한 번 잘라 낸다(설정의 candidateK). */
function topCandidates(pool, maxG, k){
  return pool.slice().sort((x,y)=>priority(A(y),maxG)-priority(A(x),maxG)).slice(0,k);
}


/* =====================================================================
   4부. 배치 파이프라인
   ===================================================================== */

function poolIds(){ return Object.values(S.att).filter(a=>a.state==='POOL').map(a=>a.id); }

/* 슬롯에 유형 핀이 걸려 있으면 해당 성별만 후보로 남긴다.
   XD/MX는 성별을 거르는 것으로는 표현이 안 되므로 분할 단계에서 처리한다. */
function eligibleFor(ids, slot){
  const pin=slot.pinnedType;
  if(!pin) return ids;
  if(pin==='MD') return ids.filter(i=>isM(A(i)));
  if(pin==='WD') return ids.filter(i=>isF(A(i)));
  return ids;
}
/* 핀 때문에 인원이 모자랄 때 슬롯에 띄울 안내 문구 */
function shortageNotice(slot){
  const pin=slot.pinnedType, need=4-slot.members.length;
  if(!pin) return null;
  const p=poolIds();
  const avail = pin==='MD'? p.filter(i=>isM(A(i))).length
              : pin==='WD'? p.filter(i=>isF(A(i))).length : p.length;
  if(avail>=need) return null;
  const lbl = pin==='MD'?'남성':pin==='WD'?'여성':'인원';
  return `${lbl} ${need-avail}명 부족`;
}

/* ── 1단계. 투입 — 빈 코트에 4명이 찬 대기 팀을 올린다 ────────── */
function pushToCourt(){
  if(!S.settings.autoPushToCourt) return false;
  let moved=false;
  for(const c of S.courts){
    if(c.status!=='EMPTY'||c.disabled) continue;
    const q=S.queues.find(q=>q.members.length===4);
    if(!q) break;
    c.members=q.members; c.teams=q.teams; c.matchType=q.matchType; c.typeSource=q.typeSource;
    c.members.forEach(i=>A(i).state='FILLING');
    // 여기서는 채우기만 한다. 4명이 찬 코트를 시작시키는 일은 tx()의
    // autoStartFullCourts()가 한 곳에서 맡는다(손 배치·드래그·더블탭도 같은 길).
    c.status='FILLING';
    Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                     origin:'AUTO',notice:null});
    moved=true;
  }
  return moved;
}

/* ── 2단계. 당기기 — 뒤 슬롯을 앞으로 옮겨 순번의 빈칸을 메운다 ── */
function compactQueues(){
  let moved=false;
  for(let i=0;i<S.queues.length-1;i++){
    const a=S.queues[i];
    // 목적지: 비어 있고 유형 핀이 없는 슬롯. 핀 슬롯은 그 자리에 예약된 것이므로 덮지 않는다.
    if(a.members.length||a.pinnedType) continue;
    for(let j=i+1;j<S.queues.length;j++){
      const b=S.queues[j];
      if(!b.members.length||b.pinnedType) continue;
      // origin(MANUAL·REVENGE)까지 함께 옮긴다. 손으로 짠 팀이 앞으로 당겨졌다고
      // 해서 자동 재구성 대상이 되면 안 된다.
      Object.assign(a,{members:b.members,teams:b.teams,matchType:b.matchType,
                       typeSource:b.typeSource,origin:b.origin,notice:b.notice});
      Object.assign(b,{members:[],teams:{A:[],B:[]},matchType:null,
                       typeSource:'AUTO',origin:'AUTO',notice:null});
      moved=true; break;
    }
  }
  return moved;
}

/* ── 3단계. 충원 — 대기 인원에서 뽑아 슬롯의 빈자리를 채운다 ──── */
function fillQueues(){
  const all=Object.values(S.att);
  if(!all.length) return false;
  const maxG=Math.max(...all.map(a=>a.games),0);
  const minPool = S.settings.minPool ?? 4;
  let moved=false;

  for(const slot of S.queues){
    const need=4-slot.members.length;
    if(need<=0) continue;

    // 이미 들어 있는 사람은 fixed로 넘어가 절대 바뀌지 않는다. 그래서 손으로
    // 1~2명만 넣어 둔 슬롯도 안심하고 채워 줄 수 있다.
    const pool=eligibleFor(poolIds(), slot);

    /* 풀을 끝까지 비우지 않는다. 슬롯을 꽉 채우면 방금 같이 친 네 명이
       선택의 여지 없이 그대로 다시 묶인다. 한 팀이 준비돼 있으면 나머지는
       풀에 남겨 다음 조합을 고를 수 있게 한다.
       단, 이미 사람이 들어 있는 슬롯은 예외로 끝까지 채운다 — 새 팀을 하나
       더 만드는 것과, 만들다 만 팀을 완성해 내보내는 것은 값어치가 다르다. */
    const ready = S.queues.filter(q=>q.members.length===4).length;
    if(!slot.members.length && ready>=1 && pool.length-need < minPool) break;

    if(pool.length<need){ slot.notice=shortageNotice(slot); continue; }

    // 상위 K명으로 찾아보고, 제약이 빡빡해서 실패하면 후보를 넓혀 한 번 더.
    let best=bestCombination(topCandidates(pool,maxG,S.settings.candidateK),
                             need, slot.members, slot.pinnedType, maxG);
    if(!best && (S.settings.genderPolicy.startsWith('STRICT')||slot.pinnedType))
      best=bestCombination(topCandidates(pool,maxG,20),
                           need, slot.members, slot.pinnedType, maxG);
    if(!best){ slot.notice='조건에 맞는 조합 없음'; continue; }

    slot.members=[...slot.members,...best.picked];
    best.picked.forEach(i=>{A(i).state='QUEUED'; flash(i);});
    if(best.teams){ slot.teams=best.teams; slot.matchType=best.matchType; }
    slot.notice=null;
    // origin은 건드리지 않는다. 손으로 짠 팀(MANUAL)이나 리벤지를 자동으로
    // 채워 줬다고 해서 "자동 슬롯"이 되면, 정렬 버튼에 부서진다.
    moved=true;
  }
  return moved;
}

/* 세 단계를 변화가 멎을 때까지 돌린다. 12는 무한 루프를 막는 상한이다. */
function autoAssign(){
  if(!S.settings.autoMode) return;
  for(let i=0;i<12;i++){
    let changed = false;
    if(pushToCourt())   changed = true;
    if(compactQueues()) changed = true;
    if(fillQueues())    changed = true;
    if(!changed) break;
  }
}


/* =====================================================================
   5부. 경기 시작과 종료
   ===================================================================== */

/* 코트에 4명이 차면 불린다(tx의 autoStartFullCourts). 팀이 아직 없으면 여기서 짠다. */
function startCourt(c, silent){
  if(c.members.length!==4) return;
  if(!c.teams.A.length){ const sp=bestSplit(c.members, c.matchType||defaultTarget(c.members));
                         if(sp){c.teams=sp.teams; c.matchType=mtypeOf(c.members,sp.teams);} }
  // 팀이 이미 짜여 있는 채로 들어오면 위 분기를 타지 않아 유형이 비어 있을 수
  // 있다. 그러면 배지가 계속 "미정"으로 남고 기록에도 유형이 안 남는다.
  if(!c.matchType) c.matchType = mtypeOf(c.members, c.teams);
  c.status='PLAYING'; c.startedAt=now(); c.matchId=uid('m');
  // 자동 마감 타이머는 여기서 시작한다. 앱을 연 시각이 아니라 실제로 첫 게임이
  // 시작된 시각이 기준이어야 한다.
  if(!S.startedAt) S.startedAt = now();
  c.members.forEach(i=>A(i).state='PLAYING');
  // 이름을 기록에 함께 박아 둔다. 출석자 목록(att)은 세션 마감 때 비워지므로
  // id만 저장하면 마감 후 기록 화면에서 이름이 전부 '?'로 바뀐다.
  const nameOf = id => (A(id)&&A(id).name) || '?';
  S.matches.push({id:c.matchId,court:c.no,type:c.matchType,typeSource:c.typeSource,
                  startedAt:c.startedAt,endedAt:null,
                  A:[...c.teams.A],B:[...c.teams.B],
                  An:c.teams.A.map(nameOf), Bn:c.teams.B.map(nameOf)});
  if(!silent) toast(`${c.no}코트 경기 시작`);
}

/* 경기를 마친다 — 게임 수를 올리고 기록을 닫고 네 명을 대기 인원으로 보낸다.
   disposition='REVENGE'면 같은 멤버로 대기열 뒤쪽에 다시 등록한다.
   (지금 화면에는 리벤지를 고르는 곳이 없어 항상 'POOL'로 불린다.) */
function endCourt(c, disposition){
  const ids=[...c.members];
  const m=S.matches.find(x=>x.id===c.matchId);
  if(m){ m.endedAt=now(); m.type=c.matchType; }
  S.hist.push(ids);
  ids.forEach(i=>{ const a=A(i); a.games++; a.lastEnd=now(); a.state='POOL'; });
  const teams=clone(c.teams), mt=c.matchType, src=c.typeSource;
  Object.assign(c,{status:'EMPTY',members:[],teams:{A:[],B:[]},matchType:null,
                   typeSource:'AUTO',startedAt:null,matchId:null});
  if(disposition==='REVENGE'){
    // 뒤에서부터 찾는다 — 방금 친 팀이 줄 맨 앞으로 가면 안 된다.
    const slot=[...S.queues].reverse().find(q=>!q.members.length&&!q.pinnedType)
            || [...S.queues].reverse().find(q=>!q.members.length);
    if(slot){
      slot.members=ids; slot.teams=teams; slot.matchType=mt; slot.typeSource=src;
      slot.origin='REVENGE'; slot.notice=null;
      ids.forEach(i=>{A(i).state='QUEUED'; flash(i);});
      toast('리벤지 — 같은 멤버로 대기 등록');
    } else toast('빈 대기 슬롯이 없어 대기 인원으로 보냈습니다');
  }
}
