/* ── 기본 설정 ──────────────────────────────────────────────────── */
const DEFAULTS = {
  clubName:'대진판',
  courtCount:3, queueSlotCount:7,
  autoMode:true, autoPushToCourt:true, autoStartOnFull:false,
  matchWarnMinutes:18,
  genderPolicy:'FREE',
  considerAge:false,
  candidateK:10, repeatLookback:3, oddRelaxThreshold:2,
  minPool:4,        // 자동 충원 시 풀에 남겨 둘 최소 인원 (섞을 여지를 확보)
  sessionAutoCloseHours:12,   // 세션 시작 후 이 시간이 지나면 자동 마감
  adminPin:'0116',            // 운영자 입장에 필요한 관리 비밀번호
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
  hist:[]            // 최근 경기 참가자 id 배열 (중복 회피용)
};
let undoStack=[], sel=null, dirty=false;

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

function initBoard(){
  S.courts = Array.from({length:S.settings.courtCount},(_,i)=>({
    no:i+1, status:'EMPTY', locked:false, disabled:false,
    members:[], teams:{A:[],B:[]}, matchType:null, typeSource:'AUTO',
    startedAt:null, matchId:null
  }));
  S.queues = Array.from({length:S.settings.queueSlotCount},(_,i)=>({
    index:i+1, locked:false, members:[], teams:{A:[],B:[]},
    matchType:null, typeSource:'AUTO', pinnedType:null, notice:null, origin:'AUTO'
  }));
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
