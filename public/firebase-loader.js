const FB_CFG_KEY = 'bmt:fbConfig';
const FB_CFG_FILE = './firebase-config.json';   // board.html과 같은 폴더

function readLocalCfg(){ try{ return JSON.parse(localStorage.getItem(FB_CFG_KEY)||'null'); }catch{ return null; } }
function validCfg(c){ return !!(c && c.apiKey && c.projectId); }

/* 배포 경로의 설정 파일을 읽는다. 실패해도 앱은 멈추지 않고 localStorage로
   넘어가지만, "왜" 실패했는지는 window.__fbFileDiag에 남겨서 설정 화면에
   그대로 보여준다. Firebase Hosting에서 가장 흔한 실패 원인은 firebase.json의
   "**" 리라이트가 이 JSON 요청까지 index.html로 되돌려 보내는 경우다 —
   이 경우 응답이 200 OK인데 내용이 HTML이라 JSON 파싱이 깨진다. 그 패턴을
   따로 감지해서 원인을 짚어 준다. */
async function readFileCfg(){
  // './firebase-config.json' (상대경로)과 '/firebase-config.json' (사이트 루트) 둘 다 시도한다.
  // 배포 구조에 따라 상대경로 해석이 달라질 수 있어서다.
  const candidates = [...new Set([FB_CFG_FILE, '/' + FB_CFG_FILE.replace(/^\.?\/*/,'')])];
  const diag = { triedUrls: candidates, attempts: [] };
  window.__fbFileDiag = diag;

  for(const url of candidates){
    const step = { url };
    diag.attempts.push(step);
    try{
      const res = await fetch(url, { cache:'no-store' });
      step.status = res.status;
      step.contentType = res.headers.get('content-type') || '';
      if(!res.ok){ step.result = `HTTP ${res.status}`; continue; }
      const text = await res.text();
      step.snippet = text.slice(0,120);
      if(/^\s*</.test(text)){
        step.result = 'HTML이 반환됨 (JSON 아님)';
        step.hint = 'Firebase Hosting의 firebase.json에 "source":"**" 리라이트가 있으면 이 요청도 index.html로 되돌려 보냅니다. 리라이트 source를 SPA 라우트로 좁히거나, firebase-config.json이 실제 public 폴더 루트에 배포됐는지 확인하세요.';
        continue;
      }
      let cfg;
      try{ cfg = JSON.parse(text); }
      catch(e){ step.result = 'JSON 파싱 실패: '+e.message; continue; }
      if(!validCfg(cfg)){
        step.result = 'apiKey 또는 projectId 필드 없음';
        step.hint = '파일 안의 키 이름이 정확히 apiKey, projectId 인지 확인하세요 (대소문자 구분).';
        continue;
      }
      step.result = 'OK';
      diag.success = url;
      return cfg;
    }catch(e){
      step.result = '요청 실패: '+(e && e.message || e);
      step.hint = 'file://로 직접 열었다면 브라우저가 로컬 파일 fetch를 차단합니다. 반드시 http(s)로 서빙된 상태(Firebase Hosting 등)에서 열어야 합니다.';
    }
  }
  return null;
}

async function resolveConfig(){
  const fromFile = await readFileCfg();
  if(fromFile) return { cfg: fromFile, source: 'file' };
  const fromLocal = readLocalCfg();
  if(validCfg(fromLocal)) return { cfg: fromLocal, source: 'local' };
  return { cfg: null, source: 'none' };
}

window.__fbConfigKey = FB_CFG_KEY;
window.__fbConfigFile = FB_CFG_FILE;
window.__fbReadCfg = readLocalCfg;          // 설정 화면에서 "현재 수동 입력값 보기"용
window.__fbResolveConfig = resolveConfig;   // 설정 화면에서 "지금 뭐가 쓰이는지" 재확인용

async function boot(){
  const { cfg, source } = await resolveConfig();
  window.__fbConfigSource = source;
  if(!cfg){
    window.dispatchEvent(new CustomEvent('fb-ready',{detail:{ready:false, source}}));
    return;
  }
  try{
    const V='10.14.1';
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const { getAuth, signInAnonymously, onAuthStateChanged } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);

    const app = initializeApp(cfg);
    let db;
    try{
      db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }) });
    }catch(e){ db = F.getFirestore(app); }   // 이미 초기화된 경우 등 폴백

    const auth = getAuth(app);
    await new Promise((res)=>{
      onAuthStateChanged(auth, u=>{ if(u) res(); });
      signInAnonymously(auth).catch(err=>{ console.warn('익명 로그인 실패', err); res(); });
    });

    window.__fb = { ready:true, app, db, auth, source, ...F };
    window.dispatchEvent(new CustomEvent('fb-ready',{detail:{ready:true, source}}));
  }catch(err){
    console.warn('Firebase 초기화 실패, 로컬 저장소로 폴백', err);
    window.__fb = { ready:false, error:String(err), source };
    window.dispatchEvent(new CustomEvent('fb-ready',{detail:{ready:false, error:String(err), source}}));
  }
}
boot();