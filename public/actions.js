/* =====================================================================
   변경 트랜잭션 — 모든 상태 변경은 여기를 거친다 (Undo + 저장)
   ===================================================================== */
function tx(fn, opts={}){
  undoStack.push(JSON.stringify({att:S.att,courts:S.courts,queues:S.queues,matches:S.matches,hist:S.hist}));
  if(undoStack.length>20) undoStack.shift();
  fn();
  if(opts.auto!==false) autoAssign();
  save(); render();
}
function undo(){
  if(!undoStack.length) return;
  const s=JSON.parse(undoStack.pop());
  Object.assign(S,s); sel=null; save(); render(); toast('되돌렸습니다');
}
let saveT;
/* 마지막으로 저장한 내용을 기억해 두고 바뀐 것만 쓴다.
   예전에는 칩 하나 옮길 때마다 설정 + 회원 41명 배열 + 세션을 전부 다시 쓰고,
   거기에 세션 목록을 읽는 네트워크 요청까지 매번 했다. 2시간이면 수백 번이라
   Firestore 쿼터와 응답 속도 양쪽에 부담이었다. */
let lastWritten={settings:null,members:null,session:null};
let sessionsIdx=null;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(async()=>{
    window.__markLocalSave && window.__markLocalSave();

    const st=JSON.stringify(S.settings);
    if(st!==lastWritten.settings){ await Store.set(K('settings'),S.settings); lastWritten.settings=st; }

    const mem=JSON.stringify(S.members);
    if(mem!==lastWritten.members){ await Store.set(K('members'),S.members); lastWritten.members=mem; }

    const sess={date:S.date,startedAt:S.startedAt,att:S.att,courts:S.courts,queues:S.queues,matches:S.matches,hist:S.hist};
    const ss=JSON.stringify(sess);
    if(ss!==lastWritten.session){ await Store.set(K('session:'+S.date),sess); lastWritten.session=ss; }

    if(sessionsIdx===null) sessionsIdx=(await Store.get(K('sessions')))||[];
    if(!sessionsIdx.includes(S.date)){ sessionsIdx.push(S.date); await Store.set(K('sessions'),sessionsIdx); }
  },300);
}

/* =====================================================================
   이동 / 배치
   ===================================================================== */
function locate(id){
  for(const c of S.courts) if(c.members.includes(id)) return {kind:'court',obj:c};
  for(const q of S.queues) if(q.members.includes(id)) return {kind:'queue',obj:q};
  return {kind:'pool',obj:null};
}
function removeFrom(id){
  const L=locate(id);
  if(L.kind==='pool') return;
  const o=L.obj;
  o.members=o.members.filter(x=>x!==id);
  o.teams.A=o.teams.A.filter(x=>x!==id); o.teams.B=o.teams.B.filter(x=>x!==id);
  o.matchType = o.members.length===4? mtypeOf(o.members,o.teams):null;
  if(L.kind==='queue'&&!o.members.length) Object.assign(o,{origin:'AUTO',typeSource:'AUTO',locked:o.pinnedType?o.locked:false});
  A(id).state='POOL';
}
function addTo(id, target){
  const [kind,key,side,slotIdx]=target.split(':');
  if(kind==='pool'){ A(id).state='POOL'; return true; }
  const o = kind==='court'? S.courts.find(c=>c.no===+key) : S.queues.find(q=>q.index===+key);
  if(!o) return false;
  if(kind==='court'&&o.status==='PLAYING'){ toast('경기 중인 코트는 바꿀 수 없습니다'); return false; }
  if(o.members.length>=4) return false;
  o.members.push(id); A(id).state=kind==='court'?'FILLING':'QUEUED';
  if(kind==='court'&&side){                       // 지정 자리에 삽입
    const arr=o.teams[side]; const k=+slotIdx;
    if(arr.length<2) arr.splice(Math.min(k,arr.length),0,id); else arr.push(id);
  }else if(o.teams.A.length+o.teams.B.length<4){
    (o.teams.A.length<=o.teams.B.length? o.teams.A:o.teams.B).push(id);
  }
  if(o.members.length===4){
    if(o.teams.A.length!==2||o.teams.B.length!==2){
      const sp=bestSplit(o.members,o.pinnedType||defaultTarget(o.members));
      if(sp) o.teams=sp.teams;
    }
    o.matchType=mtypeOf(o.members,o.teams);
  } else o.matchType=null;
  o.locked=true;                                   // 수동 배치 → 자동 잠금
  o.origin='MANUAL'; o.notice=null;
  flash(id);
  return true;
}
function moveTo(id, target){
  const [kind,key]=target.split(':');
  if(!requirePerm('edit')) return;
  // 코트에 사람을 직접 넣고 빼는 것이 "수동 배정"이다. 회원은 여기만 막힌다.
  const from=locate(id);
  if((kind==='court' || from.kind==='court') && !requirePerm('courtAssign')) return;
  const dest = kind==='court'? S.courts.find(c=>c.no===+key) : kind==='queue'? S.queues.find(q=>q.index===+key):null;
  if(dest && dest.members.includes(id)) return;
  if(dest && dest.members.length>=4){
    const occ = occupantAt(target);
    if(occ) return swap(id,occ);
    toast('자리가 가득 찼습니다'); return;
  }
  tx(()=>{ removeFrom(id); addTo(id,target); });
  Sound.play('move');
}
function occupantAt(target){
  const p=target.split(':');
  if(p[0]==='court'&&p[2]!=null){ const c=S.courts.find(c=>c.no===+p[1]); return c?.teams[p[2]]?.[+p[3]]||null; }
  if(p[0]==='queue'&&p[2]!=null){ const q=S.queues.find(q=>q.index===+p[1]);
    const order=q.teams.A.length?[...q.teams.A,...q.teams.B]:q.members; return order[+p[2]]||null; }
  return null;
}
function swap(a,b){
  if(a===b) return;
  if(!requirePerm('edit')) return;
  const La=locate(a), Lb=locate(b);
  if((La.kind==='court'||Lb.kind==='court') && !requirePerm('courtAssign')) return;
  if((La.kind==='court'&&La.obj.status==='PLAYING')||(Lb.kind==='court'&&Lb.obj.status==='PLAYING')){
    toast('경기 중인 코트는 바꿀 수 없습니다'); return; }
  tx(()=>{
    const rep=(o,x,y)=>{ if(!o) return;
      o.members=o.members.map(v=>v===x?y:v);
      o.teams.A=o.teams.A.map(v=>v===x?y:v); o.teams.B=o.teams.B.map(v=>v===x?y:v); };
    const sa=La.obj, sb=Lb.obj;
    if(sa===sb&&sa){ rep(sa,a,'__T'); rep(sa,b,a); rep(sa,'__T',b); }
    else { rep(sa,a,b); rep(sb,b,a); const t=A(a).state; A(a).state=A(b).state; A(b).state=t; }
    [sa,sb].forEach(o=>{ if(o){ o.matchType=o.members.length===4?mtypeOf(o.members,o.teams):null; o.locked=true; o.origin='MANUAL'; }});
    flash(a); flash(b);
  });
}
