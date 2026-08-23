/* ── 기본 설정 ──────────────────────────────────────────────────── */
const APP_VERSION = '2026.08.19g';

const DEFAULTS = {
  clubName:'대진판',
  courtCount:3, queueSlotCount:7,
  autoMode:true, autoPushToCourt:true,   // 4명이 차면 무조건 시작하므로 별도 설정은 없앴다
  matchWarnMinutes:18,
  maxMatchMinutes:30,         // 이 시간에 닿으면 경기를 자동으로 마친다 (0이면 사용 안 함)
  winPoint:21,                // 한 게임의 점수. 결과 입력에서 이긴 팀 점수를 계산하는 기준
  genderPolicy:'FREE',
  considerAge:false,
  candidateK:10, repeatLookback:3, oddRelaxThreshold:2,
  /* 매칭이 참고할 지난 기록의 날짜 수. 0이면 오늘 안의 이력만 본다(지금까지의
     동작). 켜면 그만큼의 지난 운동일을 불러와 "같은 팀이었던 횟수"를 중복
     회피에 더한다 — records.js 원장이 그 근거다. */
  historyDays:0,
  minPool:4,        // 자동 충원 시 풀에 남겨 둘 최소 인원 (섞을 여지를 확보)
  sessionAutoCloseHours:12,   // 세션 시작 후 이 시간이 지나면 자동 마감
  /* 관리 비밀번호는 더 이상 여기 없다. settings 문서는 누구나 읽을 수 있어서
     평문 PIN을 두는 것은 비밀번호가 아니라 공지사항이었다. 지금은 클라우드에
     되돌릴 수 없는 해시로만 두고, 확인은 서버가 한다 — js/secret.js 참고. */
  sound:true,                 // 버튼/알림 효과음
  w:{ game:100, wait:3, new:40, repeat:25, balance:10, age:0, odd:-250, same:60, mixed:20 },
  grades:[
    {code:'S',label:'자강',weight:6,color:'var(--gS)'},
    {code:'A',label:'A조', weight:5,color:'var(--gA)'},
    {code:'B',label:'B조', weight:4,color:'var(--gB)'},
    {code:'C',label:'C조', weight:3,color:'var(--gC)'},
    {code:'D',label:'D조', weight:2,color:'var(--gD)'},
    {code:'E',label:'초심',weight:1,color:'var(--gE)'}
  ]
};

/* ── 상태 ───────────────────────────────────────────────────────── */
let S = {
  settings:clone(DEFAULTS),
  members:[],
  date:todayStr(),
  startedAt:null,    // 첫 경기가 시작된 시각. 여기서 12시간이 지나면 자동 마감한다.
  att:{},            // attendeeId -> {id,memberId,name,grade,gender,birthYear,guest,games,lastEnd,state}
  courts:[], queues:[],
  matches:[],        // 경기 기록. 한 건의 생김새는 아래 '경기 기록과 결과' 참고
  hist:[],           // 최근 경기 참가자 id 배열 (중복 회피용)
  /* 게스트가 낸 회원 가입 요청. 운영자가 승인해야 members로 넘어간다.
     {id,name,gender,birthYear,grade,at} — 승인/거절하면 목록에서 빠진다. */
  joinRequests:[]
};
let undoStack=[], sel=null, dirty=false;

/* 읽기 실패로 데이터를 온전히 못 불러왔을 때 켜지는 안전 모드.
   켜져 있는 동안에는 아무것도 저장하지 않는다. 반쪽짜리 상태를
   클라우드에 덮어써서 명단을 날리는 사고를 막기 위한 잠금이다. */
let SAFE_MODE = false, safeReason = '';
function setSafeMode(on, reason){
  SAFE_MODE = !!on; safeReason = reason || '';
  const b = document.getElementById('safeBar');
  if(b){ b.style.display = SAFE_MODE ? 'flex' : 'none';
         const t=b.querySelector('span'); if(t) t.textContent = safeReason; }
}
/* ── 회원 명단 덮어쓰기 보호 ──────────────────────────────────────
   회원 명단(clubs/default/kv/members)은 이 클럽의 원본 자산이다. 한 번
   빈 값이나 남의 값으로 덮어쓰면 접속한 모든 기기에서 동시에 사라지고,
   백업 파일이 없으면 되돌릴 방법이 없다.

   그래서 "지금 DB에 들어 있다고 확인된 명단"을 기준선으로 들고 다니면서,
   저장하려는 명단에 기준선의 회원이 빠져 있으면(=누군가/무언가가 회원을
   지운 것이면) 그 저장 자체를 막는다. 기준선을 새로 잡는 곳은 세 군데뿐이다.
     1) 부팅 때 DB에서 명단을 제대로 읽었을 때        (main.js)
     2) 회원 화면에서 한 명씩 추가·수정·삭제했을 때    (screens.js)
     3) bulkOverwriteMembers()가 관리 비밀번호를 받았을 때 (actions.js)
   ───────────────────────────────────────────────────────────── */
let membersBaseline = null;      // Map(id -> 회원). null이면 DB 상태를 모른다 → 저장 금지
/* 설정도 같은 원칙이다. 제대로 읽지 못한 설정(=DEFAULTS로 시작한 상태)은
   클라우드에 쓰지 않는다. 회원 명단 복구로 안전 모드가 풀렸을 때 반쪽 설정이
   덩달아 올라가는 것을 막는다. 운영자가 설정 화면에서 직접 저장하면 켜진다. */
let settingsTrusted = false;
/* 불러온 시점의 회원 수. 화면 안내에만 쓴다(판정은 membersBaseline이 한다). */
let loadedMembersCount = null;

function setMembersBaseline(list){
  membersBaseline = list ? new Map(list.map(m=>[m.id,m])) : null;
  loadedMembersCount = list ? list.length : null;
}
/* 이 명단으로 저장하면 사라지는 회원들. 기준선을 모르면 null을 돌려준다. */
function droppedMembers(list){
  if(!membersBaseline) return null;
  const have = new Set((list||[]).map(m=>m.id));
  return [...membersBaseline.values()].filter(m=>!have.has(m.id));
}
/* 두 명단을 비교한다. lastSeen처럼 매번 바뀌는 값은 "정보 변경"으로 세지 않는다. */
const memberFields = m => [m.name, m.gender, m.birthYear||null, m.grade, m.active!==false];
function diffMembers(from, to){
  const a = new Map((from||[]).map(m=>[m.id,m]));
  const b = new Map((to  ||[]).map(m=>[m.id,m]));
  return {
    from: (from||[]).length,
    to:   (to  ||[]).length,
    removed: [...a.values()].filter(m=>!b.has(m.id)),
    added:   [...b.values()].filter(m=>!a.has(m.id)),
    changed: [...b.values()].filter(m=>a.has(m.id) &&
        String(memberFields(a.get(m.id)))!==String(memberFields(m)))
  };
}

function todayStr(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const uid = p => p+Math.random().toString(36).slice(2,9);
/* ── 지금 몇 시인가 ─────────────────────────────────────────────
   이 앱의 시각은 전부 여기서 나온다. 경기 시작 시각도, 게임을 마친 시각도
   세션 문서에 적혀 다른 태블릿으로 건너간다. 그래서 기기마다 시계가
   다르면 같은 경기가 화면마다 다른 시간으로 보인다.

   Date.now() 대신 "서버 시계와의 차이"를 더해 돌려준다. 그 차이는
   Store가 스냅샷의 updatedAt(서버가 박아 준 시각)에서 계속 재고 있다.
   Firebase에 연결돼 있지 않으면 차이는 0이고, 그러면 예전과 똑같다. */
const now = () => Date.now() + (typeof Store!=='undefined' && Store.clockSkew ? Store.clockSkew() : 0);
const G   = code => S.settings.grades.find(g=>g.code===code) || {code,label:code,weight:3,color:'var(--gE)'};
const gw  = code => G(code).weight;
const A   = id => S.att[id];
const isM = a => a.gender==='M';
const isF = a => a.gender==='F';

/* ── 파워 게이지 ────────────────────────────────────────────────
   "이 팀이 더 세 보이는지" 대진판에서 한눈에 비교하려고 만든 상대값이다.
   정밀한 실력 측정이 아니라 화면 위 눈대중 장치라서, 급수(기술)가 가장 크게
   흔들리도록 두고(1~6배) 나이·성별은 그 위에서 ±5~22% 안쪽으로만 깎거나
   얹는다. 절대값 자체는 의미가 없고 서로 비교할 때만 뜻이 있다.
   출생년도·성별을 모르면 그 요인은 1(중립)로 둔다 — 모른다고 불리하게
   계산하면 정보를 안 적은 사람만 손해를 본다. */
function ageFactor(birthYear){
  if(!birthYear) return 1;
  const age = new Date().getFullYear() - birthYear;
  if(age<30) return 1.10;
  if(age<40) return 1.05;
  if(age<50) return 1.00;
  if(age<60) return 0.93;
  if(age<70) return 0.85;
  return 0.78;
}
const genderFactor = gender => gender==='M' ? 1.05 : gender==='F' ? 0.95 : 1;
const powerOf = a => gw(a.grade) * ageFactor(a.birthYear) * genderFactor(a.gender);

/* ── 경기 기록과 결과 ──────────────────────────────────────────────
   경기 한 건(S.matches[i])의 생김새다. 앞쪽은 경기가 시작될 때
   (algo.js startCourt) 채워지고, 뒤쪽 넷은 끝낼 때 운영자가 넣는 결과다.

     id         'm3f9a2b'      경기 id (코트의 matchId와 같다)
     court      3              코트 번호. 코트를 맞바꾸면 사람을 따라간다
     type       'XD'           경기 유형 (MD·WD·XD·MX)
     typeSource 'AUTO'         유형을 누가 정했나 (AUTO·MANUAL)
     startedAt  1755…          시작 시각(ms)
     endedAt    1755… | null   종료 시각. null이면 아직 진행 중
     A, B       ['a1','a2']    양 팀 출석자 id
     An, Bn     ['김철수', …]   그때의 이름. 세션을 마감하면 att가 비므로 필요하다
     ── 여기부터가 결과다 ──
     win        'A'|'B'|null   이긴 팀. null = 승패를 적지 않은 경기
     sw         21 | null      이긴 팀 점수
     sl         15 | null      진 팀 점수
     resAt      1755… | null   결과를 적은 시각

   왜 이렇게 나눠 두는가.

     · 승패(win)와 점수(sw·sl)는 별개다. 점수를 일일이 물어보기 어려워서
       실제로는 "누가 이겼는지만" 적는 경우가 가장 흔하다. 그래서 점수 없이
       승패만 있는 상태가 정상이고, 아예 둘 다 없는 상태(win=null)도 정상이다.
       '21:15' 같은 한 덩어리 문자열로 저장하면 나중에 세거나 정렬할 수 없다.

     · 이긴 팀 점수(sw)도 함께 적는다. 화면에서는 진 팀 점수만 받고 21점제
       규칙으로 이긴 쪽을 계산하지만, 그 계산의 기준(설정의 winPoint)은
       나중에 바뀔 수 있다. 계산해서 지워 두면 설정을 15점제로 바꾸는 순간
       옛 기록의 점수까지 따라 바뀐다. 기록은 그날 있었던 그대로여야 한다.

     · 사람별 승/패 수는 저장하지 않는다. matches에서 세면 되고, 따로 두면
       둘이 어긋날 자리가 생긴다(경기 도중 사람을 바꾸면 특히 그렇다).

   옛 기록에는 이 넷이 아예 없다. 없으면 "승패를 적지 않은 경기"로 읽히므로
   따로 옮겨 적을 것은 없다.
   ───────────────────────────────────────────────────────────── */

/* 진 팀 점수에서 이긴 팀 점수를 얻는다.
   21점제 기준 — 19점 이하로 졌으면 21점, 20점부터는 듀스라 2점 차,
   그리고 30점이 상한이다(21+9). winPoint를 다른 값으로 두면 상한도
   같은 폭(+9)으로 따라간다. */
function winnerScore(lose, target){
  if(lose==null || lose==='') return null;
  const t = target || S.settings.winPoint || 21, cap = t + 9;
  const l = Math.max(0, Math.min(cap-1, Math.round(+lose)));
  if(!isFinite(l)) return null;
  return l < t-1 ? t : Math.min(l+2, cap);
}
/* 결과를 기록에 적는다. r.win이 없으면 "승패 없음"으로 지운다. */
function applyResult(m, r){
  if(!m) return;
  const win = (r && (r.win==='A' || r.win==='B')) ? r.win : null;
  m.win = win;
  m.sw  = (win && r.sw!=null) ? +r.sw : null;
  m.sl  = (win && r.sl!=null) ? +r.sl : null;
  m.resAt = win ? now() : null;
}
/* 화면에 쓰는 한 줄 — 'A팀 승 21:15' · 승패가 없으면 빈 문자열 */
function resultLabel(m){
  if(!m || !m.win) return '';
  return `${m.win}팀 승` + ((m.sw!=null && m.sl!=null) ? ` ${m.sw}:${m.sl}` : '');
}
/* 이 사람의 승-패. 끝났고 승패가 적힌 경기만 센다. */
function recordOf(attId){
  let w=0, l=0;
  S.matches.forEach(m=>{
    if(!m.endedAt || !m.win) return;
    const side = (m.A||[]).includes(attId) ? 'A' : (m.B||[]).includes(attId) ? 'B' : null;
    if(!side) return;
    if(side===m.win) w++; else l++;
  });
  return {w,l};
}

function initBoard(){
  S.courts = Array.from({length:S.settings.courtCount},(_,i)=>({
    no:i+1, status:'EMPTY', disabled:false,
    members:[], teams:{A:[],B:[]}, matchType:null, typeSource:'AUTO',
    startedAt:null, matchId:null
  }));
  S.queues = Array.from({length:S.settings.queueSlotCount},(_,i)=>({
    index:i+1, members:[], teams:{A:[],B:[]},
    matchType:null, typeSource:'AUTO', pinnedType:null, notice:null, origin:'AUTO'
  }));
}

/* ── 코트·대기 슬롯 수 바꾸기 ────────────────────────────────────
   예전에는 설정에서 코트 수를 건드리면 initBoard()가 돌아 대진판이 통째로
   비워졌다. 진행 중인 경기가 사라지고 대기열이 흩어져서, 코트 하나 더 여는
   일이 그날 운영을 처음부터 다시 짜는 일이 됐다. 그래서 다들 손을 못 댔다.

   이제 있던 것은 그대로 두고 뒤에서만 더하거나 뺀다.

   빼는 자리에 사람이 있으면 대기 인원으로 내린다. 그 코트가 경기 중이었다면
   결과 없이 "마친 것"으로 친다 — 그들은 실제로 쳤으므로 게임 수가 사라지면
   안 된다(무효로 하면 사라진다). 승패는 알 수 없으니 비워 둔다.

   무엇이 없어지는지 미리 보여 주고 확인받는 일은 부르는 쪽(설정 화면)이 한다.
   여기서는 시키는 대로 한다. */
function resizeBoard(nc, ns){
  while(S.courts.length > nc){
    const c = S.courts.pop();
    if(c.status==='PLAYING') endCourt(c, 'POOL', null);
    else c.members.forEach(i=>{ if(A(i)) A(i).state='POOL'; });
  }
  while(S.courts.length < nc)
    S.courts.push({ no:S.courts.length+1, status:'EMPTY', disabled:false,
                    members:[], teams:{A:[],B:[]}, matchType:null, typeSource:'AUTO',
                    startedAt:null, matchId:null });

  while(S.queues.length > ns){
    const q = S.queues.pop();
    q.members.forEach(i=>{ if(A(i)) A(i).state='POOL'; });
  }
  while(S.queues.length < ns)
    S.queues.push({ index:S.queues.length+1, members:[], teams:{A:[],B:[]},
                    matchType:null, typeSource:'AUTO', pinnedType:null, notice:null, origin:'AUTO' });
}

/* ── 내 출석 처리 (회원 본인용) ────────────────────────────────── */
function checkInMember(memberId){
  const m = S.members.find(x=>x.id===memberId); if(!m) return null;
  const exist = Object.values(S.att).find(a=>a.memberId===memberId);
  if(exist) return exist;
  const id = uid('a');
  S.att[id] = {id, memberId:m.id, name:m.name, grade:m.grade, gender:m.gender,
               birthYear:m.birthYear, guest:false, games:0, lastEnd:null,
               state:'POOL', jit:Math.random()};
  m.lastSeen = now();
  return S.att[id];
}
function checkOutMember(memberId){
  const a = Object.values(S.att).find(x=>x.memberId===memberId);
  if(!a) return false;
  removeFrom(a.id);
  delete S.att[a.id];
  return true;
}

/* ── 세션 마감 ──────────────────────────────────────────────────
   전원 퇴장시키고 보드를 비운다. 그날의 경기 기록(matches)은 그대로 두어
   마감 후에도 기록 화면에서 확인할 수 있게 한다. 저장은 날짜 키로 남으므로
   나중에 백업 파일에서도 되살릴 수 있다.
   ───────────────────────────────────────────────────────────── */
function closeSession(reason){
  S.att={};
  initBoard();
  S.date = todayStr();          // 자정을 넘겨 자동 마감된 경우 새 날짜로 넘어간다
  S.startedAt = null;           // 다음 세션의 첫 경기가 시작될 때 다시 잡힌다
  // 경기 기록(matches)은 어떤 경우에도 지우지 않는다. 예전에는 자동 마감이
  // matches를 비웠는데, 그 상태가 그대로 Firebase에 저장되면서 그날 기록이
  // 영구히 사라졌다. 다음 판 조합에만 쓰이는 hist(최근 대전 이력)만 초기화한다.
  S.hist=[];
}
function autoCloseHours(){ return S.settings.sessionAutoCloseHours || 12; }
function sessionAgeMs(){ return S.startedAt? now()-S.startedAt : 0; }
function msUntilAutoClose(){ return S.startedAt? autoCloseHours()*3600000 - sessionAgeMs() : Infinity; }

/* 자동 마감 조건 — 딱 하나다.
   첫 경기가 시작된 뒤 12시간이 지나면 마감한다.
   기준을 "앱을 처음 연 시각"으로 잡았더니 아침에 누가 앱을 한 번 열어두면
   12시간 뒤 타이머가 만료되면서 마침 그때 출석한 사람까지 쓸려 나갔다.
   그래서 실제로 운동이 시작된 시점(첫 경기)을 기준으로 삼는다.
   12시간이 넘었다면 진행 중인 경기나 최근 조작이 있어도 실제 경기를 위한
   것일 가능성이 낮으므로, 조건을 더 걸지 않고 그대로 정리한다. */
function checkAutoClose(){
  if(!S.startedAt) return false;
  if(msUntilAutoClose()>0) return false;
  const had=Object.keys(S.att).length;
  tx(()=>closeSession('AUTO'),{auto:false});
  if(had) toast(`첫 경기 후 ${autoCloseHours()}시간이 지나 세션을 자동 마감했습니다`);
  return true;
}
