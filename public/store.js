/* =====================================================================
   배드민턴 대진판  v1.0  (명세서 v1.2 기준 / M1~M4)
   - 저장소는 어댑터로 격리했다. 나중에 서버(Supabase 등)로 바꿀 때
     Store 객체만 교체하면 되고 나머지 코드는 건드리지 않는다.
   - 모든 저장 키에 클럽 네임스페이스를 붙인다. 다른 클럽/아카데미로
     확장할 때 CLUB 값만 분기하면 데이터가 섞이지 않는다.
   ===================================================================== */

const CLUB = 'default';                 // 확장 지점: 클럽 식별자
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
    fbState: 'checking', // checking | connected | offline | unset | error

    async init(){
      const fb = await ready;
      if(fb && fb.ready){ this.mode='firebase'; this._fb=fb; this.fbState='connected'; }
      else this.fbState = fb && fb.error ? 'error' : 'unset';
      return this.mode;
    },
    async get(key){
      if(this.mode==='firebase'){
        try{
          const fb=this._fb;
          const snap = await fb.getDoc(fb.doc(fb.db,'clubs',CLUB,'kv',docId(key)));
          const v = snap.exists()? JSON.parse(snap.data().v) : null;
          localSet(key, v);           // 로컬에도 미러링 — Firestore 설정을 끄더라도 최근 값은 남는다
          return v;
        }catch(e){ console.warn('firebase get 실패, 로컬로 폴백', e); return localGet(key); }
      }
      return localGet(key);
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
