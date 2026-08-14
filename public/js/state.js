/* ── 기본 설정 ──────────────────────────────────────────────────── */
const APP_VERSION = '2026.08.14l';

const DEFAULTS = {
  clubName:'대진판',
  courtCount:3, queueSlotCount:7,
  autoMode:true, autoPushToCourt:true,   // 4명이 차면 무조건 시작하므로 별도 설정은 없앴다
  matchWarnMinutes:18,
  genderPolicy:'FREE',
  considerAge:false,
  candidateK:10, repeatLookback:3, oddRelaxThreshold:2,
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
  matches:[],        // {id,court,type,typeSource,startedAt,endedAt,A:[],B:[]}
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
const now = () => Date.now();
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
