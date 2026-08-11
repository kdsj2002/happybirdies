/* =====================================================================
   자동 배치 알고리즘  (명세서 §5)
   ===================================================================== */
function priority(a, maxG){
  const w=S.settings.w;
  const wait = a.lastEnd ? Math.min((now()-a.lastEnd)/60000, 30) : 30;
  // jit: 출석 시 1회 부여하는 0~1 고정값. 모든 조건이 같을 때만 순서를 가른다.
  // 이게 없으면 세션 첫 배치가 명단 입력 순서대로 몰려(예: 남자만 코트에) 나온다.
  return w.game*(maxG-a.games) + w.wait*wait + (a.games===0? w.new:0) + (a.jit||0);
}

function counts(ids){ const m=ids.filter(i=>isM(A(i))).length; return [m, ids.length-m]; }
function hasUnknown(ids){ return ids.some(i=>{const g=A(i).gender; return g!=='M'&&g!=='F';}); }

/* ① 3:1 감점 — 정책과 무관하게 항상 적용, 단 공정성 예외 있음 */
function oddPenalty(ids, maxG){
  if(hasUnknown(ids)) return 0;
  const [m,f]=counts(ids);
  if(!(m===3||f===3)) return 0;
  const behind = maxG - Math.min(...ids.map(i=>A(i).games));
  if(behind >= S.settings.oddRelaxThreshold) return 0;   // 뒤처진 사람이 있으면 감점 면제
  return S.settings.w.odd;
}
/* ② 성별 정책 가산점 */
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
function defaultTarget(ids){
  if(hasUnknown(ids)) return null;
  const [m,f]=counts(ids);
  if(m===4) return 'MD';
  if(f===4) return 'WD';
  if(m===2&&f===2) return 'XD';
  return 'MX';
}
/* 3가지 2:2 분할 중 목표 유형을 만족하는 것들만 두고 급수 균형 최적 선택 */
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
function ageCost(ids){
  const ys=ids.map(i=>A(i).birthYear).filter(Boolean);
  return ys.length<2?0:(Math.max(...ys)-Math.min(...ys))/10;
}
function* kCombo(arr,k,start=0,cur=[]){
  if(cur.length===k){ yield cur.slice(); return; }
  for(let i=start;i<arr.length;i++){ cur.push(arr[i]); yield* kCombo(arr,k,i+1,cur); cur.pop(); }
}

/* 후보군에서 최적 조합 탐색. fixed는 이미 슬롯에 있는 인원(고정) */
function bestCombination(cands, need, fixed, pinned, maxG){
  const w=S.settings.w;
  let best=null;
  for(const combo of kCombo(cands,need)){
    const full=[...fixed,...combo];
    if(full.length<4){
      const s=combo.reduce((x,i)=>x+priority(A(i),maxG),0);
      if(!best||s>best.score) best={score:s,picked:combo,teams:null,matchType:null};
      continue;
    }
    const gt = oddPenalty(full,maxG) + policyBonus(full);
    if(gt===-Infinity) continue;
    const target = pinned || defaultTarget(full);
    const sp = bestSplit(full, target);
    if(!sp) continue;
    const s = combo.reduce((x,i)=>x+priority(A(i),maxG),0)
            - w.repeat*repeatPenalty(full)
            - w.balance*sp.cost
            - w.age*ageCost(full)
            + gt;
    if(!best||s>best.score) best={score:s,picked:combo,teams:sp.teams,matchType:mtypeOf(full,sp.teams)};
  }
  return best;
}

function poolIds(){ return Object.values(S.att).filter(a=>a.state==='POOL').map(a=>a.id); }

/* 슬롯 유형 핀이 걸려 있으면 해당 성별만 후보로 남긴다 */
function eligibleFor(ids, slot){
  const pin=slot.pinnedType;
  if(!pin) return ids;
  if(pin==='MD') return ids.filter(i=>isM(A(i)));
  if(pin==='WD') return ids.filter(i=>isF(A(i)));
  return ids;   // XD/MX는 조합 탐색 단계에서 분할 제약으로 처리
}
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

/* 대기 슬롯 앞으로 당기기 */
function compactQueues(){
  let moved=false;
  for(let i=0;i<S.queues.length-1;i++){
    const a=S.queues[i];
    // 목적지: 비어 있고 유형 핀이 없는 슬롯. 핀 슬롯은 그 자리에 예약된 것이므로 덮지 않는다.
    if(a.members.length||a.pinnedType) continue;
    for(let j=i+1;j<S.queues.length;j++){
      const b=S.queues[j];
      if(!b.members.length||b.pinnedType) continue;
      // 잠긴 슬롯도 앞으로 당긴다. 잠금은 "이 팀 구성을 바꾸지 말라"는 뜻이지
      // "순번을 뒤로 미뤄라"는 뜻이 아니다. 예전에는 잠긴 슬롯을 건너뛰는 바람에
      // 리벤지 팀(항상 잠김)이 뒤 슬롯에 갇혀 한 게임도 못 나가는 일이 있었다.
      // 잠금 플래그를 그대로 옮겨서 구성은 계속 보호한다.
      Object.assign(a,{members:b.members,teams:b.teams,matchType:b.matchType,
                       typeSource:b.typeSource,origin:b.origin,notice:b.notice,locked:b.locked});
      Object.assign(b,{members:[],teams:{A:[],B:[]},matchType:null,
                       typeSource:'AUTO',origin:'AUTO',notice:null,locked:false});
      moved=true; break;
    }
  }
  return moved;
}
/* 빈 코트에 대기 1번 팀 투입 */
function pushToCourt(){
  if(!S.settings.autoPushToCourt) return false;
  let moved=false;
  for(const c of S.courts){
    if(c.status!=='EMPTY'||c.disabled||c.locked) continue;
    const q=S.queues.find(q=>q.members.length===4);
    if(!q) break;
    c.members=q.members; c.teams=q.teams; c.matchType=q.matchType; c.typeSource=q.typeSource;
    c.members.forEach(i=>A(i).state='FILLING');
    c.status = S.settings.autoStartOnFull? 'PLAYING':'FILLING';
    if(c.status==='PLAYING') startCourt(c,true);
    Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',
                     origin:'AUTO',locked:false,notice:null});
    moved=true;
  }
  return moved;
}
/* 빈자리 자동 충원 */
function fillQueues(){
  let moved=false;
  const all=Object.values(S.att);
  if(!all.length) return false;
  const minPool = S.settings.minPool ?? 4;
  for(const slot of S.queues){
    const need=4-slot.members.length;
    if(need<=0) continue;
    // 잠긴 슬롯도 "빈자리 채우기"는 한다. 잠금은 이미 들어와 있는 사람을
    // 빼거나 바꾸지 말라는 뜻이고(명세 §5.4 부분 충원), 채우는 것까지 막으면
    // 손으로 1~2명만 넣은 슬롯이 영원히 4명이 안 되어 코트에 못 올라간다.
    // 기존 인원은 fixed로 넘어가므로 절대 바뀌지 않는다.
    let pool=eligibleFor(poolIds(), slot);
    // 대기 슬롯을 끝까지 채우면 풀이 비어 버리고, 그러면 방금 같이 친 4명이
    // 선택의 여지 없이 그대로 다시 묶인다. 한 팀이 준비돼 있으면 나머지는
    // 풀에 남겨 두어 다음 조합을 고를 수 있게 한다.
    // 단, 이미 사람이 들어 있는 슬롯(주로 운영자가 손으로 만든 팀)은 예외로
    // 끝까지 채운다. 새 팀을 하나 더 만드는 것과, 이미 만들어진 팀을 완성해
    // 코트에 올려보내는 것은 값어치가 다르다. 안 그러면 손으로 2명 넣어 둔
    // 슬롯이 인원이 빠듯한 날 내내 미완성으로 남는다.
    const ready = S.queues.filter(q=>q.members.length===4).length;
    if(!slot.members.length && ready>=1 && pool.length-need < minPool) break;
    if(pool.length<need){ slot.notice=shortageNotice(slot); continue; }
    const maxG=Math.max(...all.map(a=>a.games),0);
    let cands=pool.slice().sort((x,y)=>priority(A(y),maxG)-priority(A(x),maxG)).slice(0,S.settings.candidateK);
    let best=bestCombination(cands,need,slot.members,slot.pinnedType,maxG);
    if(!best && (S.settings.genderPolicy.startsWith('STRICT')||slot.pinnedType)){
      cands=pool.slice().sort((x,y)=>priority(A(y),maxG)-priority(A(x),maxG)).slice(0,20);
      best=bestCombination(cands,need,slot.members,slot.pinnedType,maxG);
    }
    if(!best){ slot.notice='조건에 맞는 조합 없음'; continue; }
    slot.members=[...slot.members,...best.picked];
    best.picked.forEach(i=>{A(i).state='QUEUED'; flash(i);});
    if(best.teams){ slot.teams=best.teams; slot.matchType=best.matchType; }
    slot.notice=null;
    // 손으로 만든 슬롯을 채워 준 것뿐이라면 MANUAL/REVENGE 표시는 유지한다.
    if(!slot.locked) slot.origin='AUTO';
    moved=true;
  }
  return moved;
}

function autoAssign(){
  if(!S.settings.autoMode) return;
  for(let i=0;i<12;i++){
    // 순서가 중요하다. 투입 → 당기기 → 충원.
    // 충원이 먼저 돌면 Q1이 비는 즉시 방금 경기를 마친 사람들로 채워져
    // 뒤 슬롯이 영원히 앞으로 못 오고 그 팀은 한 게임도 못 친다.
    let changed = false;
    if(pushToCourt())   changed = true;
    if(compactQueues()) changed = true;
    if(fillQueues())    changed = true;
    if(!changed) break;
  }
}

/* ── 경기 시작/종료 ─────────────────────────────────────────────── */
function startCourt(c, silent){
  if(c.members.length!==4) return;
  if(!c.teams.A.length){ const sp=bestSplit(c.members, c.matchType||defaultTarget(c.members));
                         if(sp){c.teams=sp.teams; c.matchType=mtypeOf(c.members,sp.teams);} }
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
    const slot=[...S.queues].reverse().find(q=>!q.members.length&&!q.locked&&!q.pinnedType)
            || [...S.queues].reverse().find(q=>!q.members.length);
    if(slot){
      slot.members=ids; slot.teams=teams; slot.matchType=mt; slot.typeSource=src;
      slot.origin='REVENGE'; slot.locked=true; slot.notice=null;
      ids.forEach(i=>{A(i).state='QUEUED'; flash(i);});
      toast('리벤지 — 같은 멤버로 대기 등록');
    } else toast('빈 대기 슬롯이 없어 대기 인원으로 보냈습니다');
  }
}
