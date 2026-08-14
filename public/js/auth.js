/* =====================================================================
   역할과 권한
     소유자(owner)  : 운영자가 하는 것 전부 + 소유자 전용 조작.
                      비밀번호가 운영자와 따로다. 그래야 "구분하는 척"이
                      아니라 실제로 구분된다 — 운영자 비밀번호만 아는
                      사람은 소유자 조작을 할 수 없다.
     운영자(admin)  : 경기 운영 전반. 동시 접속 2명까지.
     회원(member)   : 코트 수동 배정만 차단. 그 외는 조작 가능.
     뷰어(viewer)   : 모든 수정 차단, 회원 명단 화면도 차단.

   운영자 2명 제한은 Firestore에 "임차권(lease)"을 두고 관리한다.
   문서 하나에 접속자 목록을 넣고 트랜잭션으로 갱신하므로, 두 사람이 동시에
   들어와도 정원을 넘기지 않는다. 20초마다 갱신하고 60초 넘게 갱신이 없으면
   죽은 것으로 보고 자리를 회수한다(탭을 강제 종료해도 자리가 안 잠긴다).
   ===================================================================== */
const Auth = (() => {
  const ROLE_KEY   = 'bmt:role';       // 'admin' | 'member' | 'viewer'
  const MEMBER_KEY = 'bmt:memberId';
  const TAB_KEY    = 'bmt:tabId';
  const LEASE_KEY  = () => K('adminLeases');
  const MAX_ADMINS = 2;
  const LEASE_TTL  = 60000;            // 이 시간 넘게 소식 없으면 자리 회수
  const BEAT_MS    = 20000;

  /* 회원에게 허용되는 것만 나열한다(화이트리스트).
     경기 운영은 전부 운영자 탭에서만 한다는 원칙이라, 목록에 없으면 막힌다. */
  const MEMBER_ALLOW = new Set(['view','selfQueue','selfCheckIn','members']);

  /* 소유자만 되는 것. 운영자에게도 열어 주면 역할이 이름뿐이 된다.
     지금은 "회원 명단을 통째로 갈아끼우는 조작" 하나다 — 되돌릴 수 없고
     모든 기기에 즉시 퍼지는, 이 앱에서 가장 파괴적인 동작이다. */
  const OWNER_ONLY = new Set(['membersBulk']);

  let role = 'viewer';
  let memberId = null;
  let beatTimer = null;

  function tabId(){
    let t = null;
    try{ t = sessionStorage.getItem(TAB_KEY); }catch{}
    if(!t){
      t = 'tab_' + Math.random().toString(36).slice(2,10);
      try{ sessionStorage.setItem(TAB_KEY, t); }catch{}
    }
    return t;
  }
  const ls = {
    get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
    set(k,v){ try{ localStorage.setItem(k,v); }catch{} },
    del(k){ try{ localStorage.removeItem(k); }catch{} }
  };

  function alive(list){
    const cut = Date.now() - LEASE_TTL;
    const out = {};
    for(const [id,v] of Object.entries(list||{})) if(v && v.ts > cut) out[id] = v;
    return out;
  }

  /* 운영자 자리 확보. 성공하면 true. Firebase가 없으면 이 기기 기준으로만 센다. */
  async function claimAdmin(){
    const fb = Store._fb;
    const me = tabId();
    if(Store.mode !== 'firebase' || !fb || !fb.runTransaction){
      return { ok:true, offline:true };     // 클라우드 없이는 강제할 방법이 없다
    }
    const ref = fb.doc(fb.db, 'clubs', CLUB, 'kv', 'adminLeases');
    try{
      const res = await fb.runTransaction(fb.db, async (tr)=>{
        const snap = await tr.get(ref);
        let list = {};
        if(snap.exists()){ try{ list = JSON.parse(snap.data().v) || {}; }catch{} }
        list = alive(list);
        if(!list[me] && Object.keys(list).length >= MAX_ADMINS){
          return { ok:false, count:Object.keys(list).length };
        }
        list[me] = { ts: Date.now() };
        tr.set(ref, { v: JSON.stringify(list) });
        return { ok:true, count:Object.keys(list).length };
      });
      return res;
    }catch(e){
      console.warn('운영자 자리 확보 실패', e);
      return { ok:true, offline:true };     // 통신 실패로 운영을 막지는 않는다
    }
  }

  async function beat(){
    const fb = Store._fb;
    if(Store.mode !== 'firebase' || !fb || !fb.runTransaction) return;
    const me = tabId();
    const ref = fb.doc(fb.db, 'clubs', CLUB, 'kv', 'adminLeases');
    try{
      await fb.runTransaction(fb.db, async (tr)=>{
        const snap = await tr.get(ref);
        let list = {};
        if(snap.exists()){ try{ list = JSON.parse(snap.data().v) || {}; }catch{} }
        list = alive(list); list[me] = { ts: Date.now() };
        tr.set(ref, { v: JSON.stringify(list) });
      });
    }catch{}
  }

  async function releaseAdmin(){
    const fb = Store._fb;
    if(Store.mode !== 'firebase' || !fb || !fb.runTransaction) return;
    const me = tabId();
    const ref = fb.doc(fb.db, 'clubs', CLUB, 'kv', 'adminLeases');
    try{
      await fb.runTransaction(fb.db, async (tr)=>{
        const snap = await tr.get(ref);
        let list = {};
        if(snap.exists()){ try{ list = JSON.parse(snap.data().v) || {}; }catch{} }
        delete list[me];
        tr.set(ref, { v: JSON.stringify(alive(list)) });
      });
    }catch{}
  }

  function startBeat(){
    stopBeat();
    beatTimer = setInterval(beat, BEAT_MS);
    window.addEventListener('pagehide', releaseAdmin);
    window.addEventListener('beforeunload', releaseAdmin);
  }
  function stopBeat(){ if(beatTimer){ clearInterval(beatTimer); beatTimer=null; } }

  return {
    get role(){ return role; },
    get memberId(){ return memberId; },
    get isOwner(){ return role === 'owner'; },
    /* 소유자는 운영자가 할 수 있는 것을 전부 할 수 있다. 화면 곳곳의
       isAdmin 분기가 소유자에게도 적용되도록 여기서 포함시킨다. */
    get isAdmin(){ return role === 'admin' || role === 'owner'; },
    get isMember(){ return role === 'member'; },
    get isViewer(){ return role === 'viewer'; },
    roleLabel(){ return role==='owner'?'소유자' : role==='admin'?'운영자'
                      : role==='member'?'회원' : '뷰어'; },

    /* 저장된 역할 복원. 운영자는 자리를 다시 확보해야 하므로 재확인한다. */
    async restore(){
      const r = ls.get(ROLE_KEY);
      if(r === 'member'){
        const id = ls.get(MEMBER_KEY);
        if(!id){ ls.del(ROLE_KEY); return false; }
        // 명단을 아직/제대로 못 불러온 상황(읽기 실패 등)에서 역할을 지우면
        // 멀쩡한 회원이 매번 다시 입장해야 한다. 명단이 확실히 로드됐을 때만 판정한다.
        const loaded = (typeof loadedMembersCount === 'number');
        if(!loaded || S.members.some(m=>m.id===id)){ role='member'; memberId=id; return true; }
        ls.del(ROLE_KEY); ls.del(MEMBER_KEY); return false;
      }
      if(r === 'admin' || r === 'owner'){
        const res = await claimAdmin();
        if(res.ok){ role=r; startBeat(); return true; }
        ls.del(ROLE_KEY); return false;      // 정원이 찼으면 다시 고르게 한다
      }
      if(r === 'viewer'){ role='viewer'; return true; }
      return false;
    },

    /* 비밀번호 확인은 Secret이 한다. 여기서는 결과만 받는다 —
       앱 어디에도 비밀번호나 그 해시가 남지 않는다.
       소유자도 운영자 자리(동시 접속 2명)를 함께 차지한다. 실제로 대진을
       돌리는 사람이므로 정원 밖에 두면 제한이 무의미해진다. */
    async loginAs(kind, pin){
      const v = await Secret.verify(pin, kind==='owner'?'owner':'admin');
      if(!v.ok) return { ok:false, reason:v.reason };   // 'wrong'|'offline'|'unset'
      const res = await claimAdmin();
      if(!res.ok) return { ok:false, reason:'full' };
      role = (kind==='owner') ? 'owner' : 'admin';
      memberId=null; ls.set(ROLE_KEY, role); startBeat();
      return { ok:true, offline:res.offline };
    },
    async loginAdmin(pin){ return this.loginAs('admin', pin); },
    async loginOwner(pin){ return this.loginAs('owner', pin); },
    loginMember(id){
      role='member'; memberId=id;
      ls.set(ROLE_KEY,'member'); ls.set(MEMBER_KEY,id);
    },
    loginViewer(){
      role='viewer'; memberId=null;
      ls.set(ROLE_KEY,'viewer'); ls.del(MEMBER_KEY);
    },
    async logout(){
      if(role==='admin' || role==='owner'){ stopBeat(); await releaseAdmin(); }
      role='viewer'; memberId=null;
      ls.del(ROLE_KEY); ls.del(MEMBER_KEY);
    },

    /* 권한 판정
       view         화면 보기 — 누구나
       selfQueue    내 이름만 대기열에 넣고 빼기 — 운영자·회원
       selfCheckIn  내 출석/퇴장 — 운영자·회원
       members      회원 명단 보기 — 운영자·회원
       edit         경기 운영 전반(시작·종료·정렬·잠금·유형·다른 사람 배치) — 운영자만
       courtAssign  코트 수동 배정 — 운영자만
       membersEdit  회원 추가·수정·삭제 — 운영자만
       settings     설정 변경 — 운영자만
       closeSess    세션 마감 — 운영자만
       membersBulk  회원 명단 통째 교체(복원·CSV·다시 불러오기) — 소유자만 */
    can(action){
      if(role === 'owner')  return true;
      if(role === 'admin')  return !OWNER_ONLY.has(action);
      if(role === 'member') return MEMBER_ALLOW.has(action);
      return action === 'view';
    },
    denyMsg(action){
      if(role === 'viewer') return '보기 전용으로 입장했습니다';
      if(action === 'selfQueue')   return '대기열에는 본인 이름만 올리고 뺄 수 있습니다';
      if(action === 'courtAssign') return '코트 배정은 운영자만 할 수 있습니다';
      if(action === 'settings')    return '설정 변경은 운영자만 할 수 있습니다';
      if(action === 'membersEdit') return '회원 정보 수정은 운영자만 할 수 있습니다';
      if(action === 'closeSess')   return '세션 마감은 운영자만 할 수 있습니다';
      if(action === 'membersBulk') return '회원 명단을 통째로 바꾸는 것은 소유자만 할 수 있습니다';
      return '경기 운영은 운영자만 할 수 있습니다';
    },

    /* 이 출석자가 나인가 (회원이 자기 이름만 다루도록 판별) */
    isMe(attendeeId){
      if(!memberId) return false;
      const a = S.att[attendeeId];
      return !!(a && a.memberId === memberId);
    },
    myAttendee(){
      if(!memberId) return null;
      return Object.values(S.att).find(a=>a.memberId===memberId) || null;
    }
  };
})();

/* 권한이 없으면 안내하고 false를 돌려준다. 조작 지점마다 이걸 앞에 둔다. */
function requirePerm(action){
  if(Auth.can(action)) return true;
  Sound.play('error');
  toast(Auth.denyMsg(action));
  return false;
}
