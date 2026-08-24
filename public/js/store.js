/* =====================================================================
   배드민턴 대진판  v1.0  (명세서 v1.2 기준 / M1~M4)
   - 저장소는 어댑터로 격리했다. 나중에 서버(Supabase 등)로 바꿀 때
     Store 객체만 교체하면 되고 나머지 코드는 건드리지 않는다.
   - 모든 저장 키에 클럽 네임스페이스를 붙인다. 다른 클럽/아카데미로
     확장할 때 CLUB 값만 분기하면 데이터가 섞이지 않는다.
   ===================================================================== */

/* ── 클럽 식별자 — URL 경로에서 뽑는다 ──────────────────────────────
   여러 동호회가 한 배포본을 나눠 쓰기 위한 갈림길이다.

     /            → 'default'        (지금까지 쓰던 그 클럽. 주소가 안 바뀐다)
     /hanul/      → 'hanul'
     /hanul/...   → 'hanul'

   Firestore 경로 clubs/{CLUB}/... 와 로컬 저장 키 bmt:{CLUB}:... 가 통째로
   갈라지므로 데이터가 섞이지 않는다. 보안 규칙도 clubs/{club} 와일드카드라
   그대로 적용된다.

   호스팅에서 /{clubId}/** 를 index.html로 rewrite해 줘야 새로고침이 깨지지
   않는다(firebase.json). 자세한 설계는 docs/multi-club.md 참고.

   허용 문자를 좁게 잡는 이유: 경로 조각이 그대로 Firestore 문서 ID가 되므로
   '..' 이나 슬래시, 긴 문자열이 들어오면 안 된다. 규격을 벗어나면 default로
   떨어뜨린다 — 낯선 주소로 들어온 사람이 빈 클럽을 새로 만들지 않게. */
const CLUB = (() => {
  try {
    const seg = decodeURIComponent((location.pathname || '/').split('/')[1] || '');
    // manual.html 등 실제 파일 이름은 클럽이 아니다.
    if (!seg || seg.includes('.')) return 'default';
    return /^[a-z0-9][a-z0-9-]{1,30}$/.test(seg) ? seg : 'default';
  } catch { return 'default'; }
})();
// 구형 태블릿 브라우저에는 structuredClone이 없다. 저장 데이터는 순수 JSON이라
// JSON 복사로 충분하다.
const clone = o => (typeof structuredClone==='function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
const K = (k) => `bmt:${CLUB}:${k}`;

/* ── 최근에 쓴 동호회 ──────────────────────────────────────────────
   현관(대표 주소)에서 한 번에 들어가기 위한 목록이다. 클럽별 데이터가
   아니라 이 기기의 기록이므로 K()를 쓰지 않는다 — 클럽 이름을 붙이면
   동호회마다 따로 쌓여서 목록의 뜻이 없어진다. */
const RECENT_KEY = 'bmt:recentClubs';
function recentClubs(){
  try{ const a=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); return Array.isArray(a)?a:[]; }
  catch{ return []; }
}
function rememberClub(id, name){
  if(!id || id==='default') return;      // 현관 자체는 기억하지 않는다
  try{
    const rest = recentClubs().filter(c=>c.id!==id);
    rest.unshift({ id, name: name||id, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(rest.slice(0,6)));
  }catch{}
}

/* ── 저장소 어댑터 ──────────────────────────────────────────────────
   우선순위: Firestore(설정된 경우) → window.storage → localStorage → 메모리
   Firestore가 설정돼 있어도 오프라인이면 로컬 캐시로 읽고 쓰며, 연결이
   돌아오면 SDK가 알아서 서버와 맞춘다. 이 계층 위의 코드는 Store.get/set만
   호출하므로 백엔드가 바뀌어도 나머지 코드는 손댈 필요가 없다.
   ───────────────────────────────────────────────────────────────── */
const Store = (() => {
  const hasW = typeof window !== 'undefined' && window.storage && window.storage.get;
  const localMode = hasW ? 'window.storage' : (() => {
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return 'localStorage'; }
    catch { return 'memory'; }
  })();
  const mem = new Map();
  const localGet = async (key) => {
    try{
      if(localMode==='window.storage'){ const r = await window.storage.get(key); return r? JSON.parse(r.value):null; }
      if(localMode==='localStorage'){ const v = localStorage.getItem(key); return v? JSON.parse(v):null; }
      return mem.has(key)? JSON.parse(mem.get(key)):null;
    }catch{ return null; }
  };
  const localSet = async (key,val) => {
    const s = JSON.stringify(val);
    try{
      if(localMode==='window.storage') return void await window.storage.set(key,s);
      if(localMode==='localStorage')   return void localStorage.setItem(key,s);
      mem.set(key,s);
    }catch(e){ console.warn('로컬 저장 실패',e); }
  };

  // Firestore 문서 ID는 '/'를 쓸 수 없다. 우리 키에는 없으므로 그대로 쓴다.
  const docId = key => key.replace(/^bmt:[^:]+:/,'');
  const ready = new Promise(res=>{
    if(window.__fb) return res(window.__fb);
    window.addEventListener('fb-ready', e=>res(window.__fb||{ready:false}), {once:true});
    // 여기서 오래 기다리면 그동안 화면이 아예 안 뜬다. 짧게 끊고 먼저 그린 뒤,
    // 연결이 늦게 완료되면 아래 fb-ready 처리에서 안전하게 다시 불러온다.
    setTimeout(()=>res(window.__fb||{ready:false, late:true}), 6000);
  });

  const api = {
    mode: localMode,   // fb-ready 이후 'firebase'로 갱신될 수 있다
    fbState: 'checking', // checking | connected | authFailed | offline | unset | error
    authError: null,

    async init(){
      const fb = await ready;
      if(fb && fb.ready){
        this.mode='firebase'; this._fb=fb;
        // 익명 로그인이 안 된 상태다. 규칙이 인증을 요구하면 여기서부터
        // 모든 읽기가 거부되므로, 원인을 구분해 둔다.
        this.fbState = fb.authFailed ? 'authFailed' : 'connected';
        this.authError = fb.authError || null;
      }
      else this.fbState = fb && fb.error ? 'error' : 'unset';
      return this.mode;
    },
    async get(key){ return (await this.getSafe(key)).value; },

    /* 읽기 결과를 성공/실패까지 함께 돌려준다.
       예전에는 실패해도 null을 돌려줬는데, 호출부가 그걸 "데이터 없음"으로
       받아 빈 상태로 시작하고, 이어지는 저장이 그 빈 상태를 클라우드에
       덮어써서 회원 명단이 통째로 날아갔다. 이제는 실패를 구분해 알린다.

       opts.strict : 회원 명단·설정처럼 "원래 있어야 하는" 문서에 쓴다.
         Firestore는 오프라인이면 예외를 던지지 않고 로컬 캐시로 답한다.
         이 기기에 캐시가 없으면 서버에 멀쩡히 있는 문서도 "없음"으로
         돌아오는데(다른 기기에서 등록했거나 캐시가 비워진 경우), 그걸
         "회원 0명"으로 받아들이면 다시 온라인이 되는 순간 그 빈 명단이
         클라우드를 덮어쓴다 — 오프라인 다녀오면 명단이 사라지던 원인이
         정확히 이것이다. strict에서는 그런 '없음'을 성공으로 치지 않는다. */
    async getSafe(key, opts={}){
      if(this.mode==='firebase'){
        try{
          const fb=this._fb;
          const snap = await fb.getDoc(fb.doc(fb.db,'clubs',CLUB,'kv',docId(key)));
          const cached = !!(snap.metadata && snap.metadata.fromCache);
          if(!snap.exists()){
            const lv = await localGet(key);
            if(opts.strict){
              // 캐시가 답한 '없음'은 서버의 대답이 아니다.
              if(cached) return { ok:false, value:lv, source:'cache', cached:true,
                                  error:'오프라인 캐시에 문서가 없습니다' };
              // 서버가 '없다'는데 이 기기에는 값이 남아 있다 — 지우고 시작하지 않는다.
              if(lv && !(Array.isArray(lv) && !lv.length))
                return { ok:false, value:lv, source:'local',
                         error:'서버에는 없고 이 기기에만 값이 있습니다' };
            }
            localSet(key, null);
            return { ok:true, value:null, source:'firebase', cached };
          }
          /* 여기서는 서버 시계를 재지 않는다. 한 번 읽은 updatedAt은
             "이 문서가 마지막으로 쓰인 시각"이지 "지금"이 아니다 — 부팅
             읽기가 재는 이유였는데, 그 값이 오래전 것일 수 있다는 게
             바로 이 시계 보정을 망가뜨리던 원인이었다. 자세한 사정은
             아래 subscribe()의 noteServerTime 호출부에 적어 뒀다. */
          const v = JSON.parse(snap.data().v);
          localSet(key, v);           // 로컬에도 미러링
          return { ok:true, value:v, source:'firebase', cached };
        }catch(e){
          console.warn('firebase get 실패', e);
          const lv = await localGet(key);
          // 로컬에 값이 남아 있으면 그걸 쓰되, 서버를 못 읽었다는 사실은 알린다.
          return { ok:false, value:lv, source:'local', error:String(e) };
        }
      }
      return { ok:true, value: await localGet(key), source:'local' };
    },
    async set(key,val){
      localSet(key,val);              // 항상 로컬에도 즉시 반영 (체감 속도 + 오프라인 대비)
      if(this.mode==='firebase'){
        try{
          const fb=this._fb;
          await fb.setDoc(fb.doc(fb.db,'clubs',CLUB,'kv',docId(key)),
            { v: JSON.stringify(val), updatedAt: fb.serverTimestamp() });
        }catch(e){ console.warn('firebase 저장 실패(오프라인 캐시에는 반영됨)', e); }
      }
    },
    /* 세션 문서 실시간 구독 — 다른 태블릿이 저장하면 콜백이 불린다 */
    /* ── 이 동호회가 등록돼 있나 ──────────────────────────────────
       clubs/{CLUB}/meta/club 문서의 존재로 판정한다. 그 문서는 규칙이
       클라이언트 쓰기를 막고 있어서, 서버가 만들어 준 동호회에만 있다.
       예전에는 주소창에 아무 이름이나 치면 그 이름의 빈 동호회가 생겼다.

       반환: {ok, registered, meta}
         ok:false → 판단 못 함(오프라인 등). 이때는 막지 않는다 —
         체육관에서 인터넷이 끊겼다고 앱이 안 열리면 안 된다. */
    async clubMeta(){
      // 기존 동호회는 이 구조가 생기기 전부터 쓰던 곳이라 조회 자체를 생략한다.
      if(CLUB==='default') return { ok:true, registered:true, meta:null };
      if(this.mode!=='firebase') return { ok:true, registered:true, meta:null, local:true };
      const fb=this._fb;
      try{
        const snap = await fb.getDoc(fb.doc(fb.db,'clubs',CLUB,'meta','club'));
        // 캐시가 "없다"고 답한 것을 미등록으로 받아들이면 오프라인에서 멀쩡한
        // 동호회가 막힌다. 캐시 답은 판단하지 않는다.
        if(!snap.exists() && snap.metadata && snap.metadata.fromCache) return { ok:false };
        return { ok:true, registered:snap.exists(), meta:snap.exists()?snap.data():null };
      }catch(e){
        console.warn('동호회 등록 확인 실패', e);
        return { ok:false, error:String(e) };
      }
    },

    /* ── 다른 동호회 찾기 ─────────────────────────────────────────
       현관에서 클럽 코드를 입력받아 그 동호회가 있는지 본다.
       등록 표시 문서는 읽기가 공개라 서버 없이 확인된다. */
    async lookupClub(code){
      const id = String(code||'').trim().toLowerCase();
      if(!/^[a-z0-9][a-z0-9-]{1,30}$/.test(id)) return { ok:true, found:false, bad:true };
      if(this.mode!=='firebase') return { ok:false };
      const fb=this._fb;
      try{
        const snap = await fb.getDoc(fb.doc(fb.db,'clubs',id,'meta','club'));
        if(!snap.exists() && snap.metadata && snap.metadata.fromCache) return { ok:false };
        return { ok:true, found:snap.exists(), id, meta:snap.exists()?snap.data():null };
      }catch(e){ return { ok:false, error:String(e) }; }
    },

    /* ── 옛 default 동호회가 아직 살아 있나 ────────────────────────
       '/' 는 원래 이 동호회 자체였다. teambailey 같은 제 주소로 이관하고
       clubs/default를 지우면 '/' 는 현관이 되어야 한다. 그 전환을 플래그
       없이 데이터로 판정한다 — settings 문서가 있으면 아직 쓰는 중이다.

       판단이 안 될 때(오프라인)는 "살아 있다"로 본다. 체육관에서 인터넷이
       끊겼다고 대진판 대신 현관이 뜨면 그날 운영이 멈춘다. */
    async legacyDefaultExists(){
      if(this.mode!=='firebase') return true;
      const fb=this._fb;
      try{
        const snap = await fb.getDoc(fb.doc(fb.db,'clubs','default','kv','settings'));
        if(!snap.exists() && snap.metadata && snap.metadata.fromCache) return true;
        return snap.exists();
      }catch{ return true; }
    },

    /* ── 전체 동호회 정원 ────────────────────────────────────────
       캡차가 준비되기 전까지는 "전체 몇 개까지"가 남용 방지 장치다.
       registry/clubs = { count, limit }. 쓰기는 서버만 하고 앱은 읽어서
       "정원이 찼습니다"를 보여 주는 데만 쓴다. */
    async clubQuota(){
      if(this.mode!=='firebase') return { ok:false };
      const fb=this._fb;
      try{
        const snap = await fb.getDoc(fb.doc(fb.db,'registry','clubs'));
        if(!snap.exists()) return { ok:false };
        const d = snap.data() || {};
        const count = +d.count || 0, limit = +d.limit || 0;
        return { ok:true, count, limit, full: limit>0 && count>=limit };
      }catch(e){ return { ok:false, error:String(e) }; }
    },

    /* ── 서버만 할 수 있는 일 (Cloud Functions) ─────────────────────
       새 동호회 신청, 소유자 이메일 확정 같은 조작은 클라이언트가 직접
       Firestore에 쓸 수 없다(규칙이 막는다 — functions/index.js 머리말
       참고). 대신 서버 함수를 부른다. 실패를 예외로 던지지 않고 값으로
       돌려주는 이유는 이 앱의 다른 비동기 함수들과 같다 — 호출부가 매번
       try/catch를 쓰지 않아도 되고, ok로 먼저 갈라 읽기 쉽다. */
    async callFunction(name, data){
      if(this.mode!=='firebase') return { ok:false, error:'클라우드에 연결되지 않았습니다' };
      const fb=this._fb;
      if(!fb.functions || !fb.httpsCallable) return { ok:false, error:'서버 기능을 불러오지 못했습니다' };
      try{
        const call = fb.httpsCallable(fb.functions, name);
        const res = await call(data);
        return { ok:true, ...(res.data||{}) };
      }catch(e){
        return { ok:false, error: (e && e.message) || String(e), code: e && e.code };
      }
    },

    /* ── 여러 기기가 같은 시계를 쓰게 한다 ──────────────────────────
       경기 시간은 "어느 기기가 세는가"의 문제가 아니다. 시작 시각
       (courts[].startedAt)은 세션 문서에 적혀 모든 기기가 나눠 갖고, 각
       기기는 그저 지금 시각에서 그것을 뺄 뿐이다. 그래서 화면마다 시간이
       다르게 보이는 원인은 하나뿐이다 — 기기마다 시계가 다르다.

       태블릿 시계가 3분 빠르면 그 기기가 시작한 경기는 다른 기기에서 3분
       덜 된 것으로 보인다. "운영자 기기 하나를 기준으로 삼자"는 방법도
       있지만, 그 기기가 꺼지거나 배터리가 나가거나 자리를 뜨면 기준 자체가
       사라진다. 사람이 아니라 서버를 기준으로 삼는 편이 낫다.

       ── 언제를 "지금"으로 재는가가 핵심이다 ─────────────────────
       Firestore 문서의 updatedAt은 "마지막으로 쓰인 시각"이지 "지금"이
       아니다. 둘은 방금 막 쓰였을 때만 같다. 그런데 예전 구현은 이 둘을
       같은 것으로 쳤다 — 스냅샷이 오면(캐시에서 왔든, 막 구독을 붙여서
       왔든) 그 안의 updatedAt을 무조건 "지금 서버 시각"으로 읽고 내 시계와
       비교했다. 아무도 안 건드린 채 10분이 지난 문서를 열면 updatedAt은
       10분 전인데 그걸 "지금"이라고 우기니, 시계가 10분 어긋난 것으로
       잘못 잰다. 코트를 열자마자 시작한 경기의 경과 시간이 마이너스로
       보이던 것, 기기마다 처음엔 안 맞다가 새로고침해야 맞던 것이 전부
       이 계산 오류였다 — 새로고침이 "고친" 게 아니라, 마침 그 순간
       가까이에 있던 다른 갱신을 얻어걸린 것뿐이었다.

       "방금 막 일어난 일"이라고 믿을 수 있는 순간은 하나뿐이다 — 이
       문서를 구독한 뒤로 updatedAt 값이 이전과 달라진 바로 그 순간.
       값이 바뀌었다는 것은 누군가 방금 썼다는 뜻이고, 우리는 그것을
       실시간 구독으로 거의 지연 없이(보통 0.1~0.3초) 받는다. 그래서
       "처음 보는 값"은 기준으로 삼지 않는다 — 캐시에서 왔을 수도, 막
       붙은 구독이 기존 상태를 확인해 주는 것일 수도 있어서, 그게 방금
       쓰인 것인지 훨씬 전에 쓰인 것인지 이 스냅샷 하나만으로는 알 수
       없기 때문이다. 두 번째부터, 즉 "값이 바뀌는 순간"만 잰다.

       튀는 값에 흔들리지 않도록 새 값은 3할만 반영한다. */
    _skew: 0,
    _skewKnown: false,
    _seenUpdated: new Map(),      // docId -> 마지막으로 본 updatedAt(ms)
    _calibratedCbs: [],
    noteServerTime(serverMs){
      const s = serverMs - Date.now();
      if(!isFinite(s) || Math.abs(s) > 12*3600*1000) return;   // 말이 안 되는 값은 버린다
      const first = !this._skewKnown;
      this._skew = this._skewKnown ? Math.round(this._skew*0.7 + s*0.3) : Math.round(s);
      this._skewKnown = true;
      /* 처음으로 시계가 맞춰지는 순간만 알린다. 그 전까지 now()는 이 기기의
         날것 시계였고, 그동안 startCourt() 같은 곳이 이미 몇 개의 시각을
         찍어 두었을 수 있다 — 그 값들을 지금 알아낸 진짜 오차만큼 보정할
         기회를 주는 신호다(algo.js startCourt · main.js 보정 콜백 참고).
         이후의 미세한 재조정(0.7/0.3 블렌딩)은 몇 밀리초 단위라 다시 알릴
         필요가 없다. */
      if(first) this._calibratedCbs.forEach(fn=>{ try{ fn(this._skew); }catch(e){ console.warn(e); } });
    },
    clockSkew(){ return this._skew; },
    clockKnown(){ return this._skewKnown; },
    /* 시계가 "처음" 맞춰지는 그 순간에 한 번 불린다. 그 전에 날것 시계로
       찍어 둔 시각을 보정할 곳(main.js)이 쓴다. */
    onCalibrated(cb){ this._calibratedCbs.push(cb); },

    subscribe(key, cb){
      if(this.mode!=='firebase') return ()=>{};
      const fb=this._fb;
      const self=this;
      const id=docId(key);
      return fb.onSnapshot(fb.doc(fb.db,'clubs',CLUB,'kv',id), snap=>{
        if(!snap.exists()) return;
        const meta = snap.metadata || {};
        const data = snap.data();
        // 아직 서버에 안 올라간 내 쓰기(hasPendingWrites)는 애초에 값이
        // 진짜로 바뀐 것인지 알 수 없으니 건너뛴다. 값 변화 판정은 위 설명대로.
        try{
          if(!meta.hasPendingWrites && data.updatedAt && data.updatedAt.toMillis){
            const ms = data.updatedAt.toMillis();
            const prev = self._seenUpdated.get(id);
            if(prev !== undefined && prev !== ms) self.noteServerTime(ms);
            self._seenUpdated.set(id, ms);
          }
        }catch{}
        try{ cb(JSON.parse(data.v),
                { local: !!meta.hasPendingWrites, cached: !!meta.fromCache }); }catch{}
      }, err=>console.warn('구독 오류',err));
    }
  };
  return api;
})();
