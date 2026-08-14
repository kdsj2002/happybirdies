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
    subscribe(key, cb){
      if(this.mode!=='firebase') return ()=>{};
      const fb=this._fb;
      return fb.onSnapshot(fb.doc(fb.db,'clubs',CLUB,'kv',docId(key)), snap=>{
        if(!snap.exists()) return;
        try{ cb(JSON.parse(snap.data().v)); }catch{}
      }, err=>console.warn('구독 오류',err));
    }
  };
  return api;
})();
