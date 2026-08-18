/* =====================================================================
   실제 계정 — 소유자와 운영자만

   ── 왜 필요한가 ──────────────────────────────────────────────────
   지금까지 소유자·운영자는 비밀번호로만 확인했다. 그 구조는 비밀번호를
   내려보내지 않는다는 점에서 잘 만들어졌지만, 규칙이 "누가" 요청했는지는
   여전히 모른다. 모두가 똑같은 익명 계정이기 때문이다. 그래서

     · 운영자 비밀번호를 아는 사람이 앱을 거치지 않고 Firestore를 직접
       두드리면 회원 명단을 통째로 갈아끼울 수 있었다. 소유자 전용이라는
       구분이 앱 안에서만 유효했다.
     · 비밀번호 무차별 대입을 서버가 셀 수 없었다.

   실제 계정으로 들어오면 규칙이 request.auth.uid로 사람을 특정할 수 있다.
   역할은 clubs/{club}/roles/{uid} 문서가 정하고, 그 문서는 클라이언트가
   못 쓴다. 이제 구분이 DB 수준에서 진짜가 된다.

   ── 회원과 게스트는 그대로다 ─────────────────────────────────────
   계정을 요구하는 것은 소유자·운영자뿐이다. 회원은 지금처럼 이름을 고르고
   가려진 글자 하나를 넣으면 들어온다. 체육관에서 처음 온 사람에게 이메일
   인증을 시키는 것은 이 앱이 지켜 온 방향과 반대다.

   ── 비밀번호 경로는 아직 살아 있다 ───────────────────────────────
   기존 동호회에는 roles 문서가 없다. 계정 로그인만 남기고 규칙을 조이면
   그 순간 운영자가 잠긴다. 그래서 한동안 두 길을 모두 열어 둔다.
   순서는 docs/auth.md 의 "이관 중 주의"에 적어 뒀다.
   ===================================================================== */
const Account = (() => {
  const fb = () => (Store.mode === 'firebase' ? Store._fb : null);
  const ns = () => { const F = fb(); return F && F.authFns; };

  /* 지금 로그인된 실제 계정. 익명은 계정으로 치지 않는다 —
     익명 사용자는 앱이 부팅할 때 늘 하나씩 만들어지므로, 그걸 "로그인했다"고
     보면 게스트가 운영자 화면을 여는 셈이 된다. */
  function current(){
    const F = fb();
    const u = F && F.auth && F.auth.currentUser;
    if(!u || u.isAnonymous) return null;
    return { uid:u.uid, email:u.email || '', name:u.displayName || '' };
  }

  /* 오류 코드를 사람 말로. 무엇이 틀렸는지는 알려 주되, "그 이메일은
     가입돼 있다/없다"를 구분해 주지는 않는다(계정 목록을 훑는 통로가 된다).
     Firebase도 요즘은 그 둘을 invalid-credential 하나로 합쳐서 돌려준다. */
  const MSG = {
    'auth/invalid-email':        '이메일 형식이 올바르지 않습니다',
    'auth/invalid-credential':   '이메일이나 비밀번호가 맞지 않습니다',
    'auth/wrong-password':       '이메일이나 비밀번호가 맞지 않습니다',
    'auth/user-not-found':       '이메일이나 비밀번호가 맞지 않습니다',
    'auth/user-disabled':        '사용이 중지된 계정입니다',
    'auth/too-many-requests':    '시도가 너무 잦습니다. 잠시 후 다시 해 주세요',
    'auth/network-request-failed':'연결되지 않았습니다 — 인터넷을 확인해 주세요',
    'auth/popup-blocked':        '팝업이 차단됐습니다. 이메일로 로그인해 주세요',
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다',
    'auth/operation-not-allowed':'이 로그인 방법이 콘솔에서 켜져 있지 않습니다'
  };
  const msgOf = e => MSG[e && e.code] || '로그인하지 못했습니다';

  async function signInEmail(email, password){
    const F = fb(), A = ns();
    if(!F || !A) return { ok:false, error:'클라우드에 연결되지 않았습니다' };
    try{
      await A.signInWithEmailAndPassword(F.auth, String(email||'').trim(), String(password||''));
      return { ok:true };
    }catch(e){ return { ok:false, error:msgOf(e), code:e && e.code }; }
  }

  /* 구글 로그인. 아이패드 사파리에서 팝업이 막히는 일이 있어서, 막히면
     이메일 쪽으로 안내한다(리다이렉트 방식은 저장소 분리 정책 때문에
     기기마다 결과가 갈려서 쓰지 않는다). */
  async function signInGoogle(){
    const F = fb(), A = ns();
    if(!F || !A) return { ok:false, error:'클라우드에 연결되지 않았습니다' };
    try{
      await A.signInWithPopup(F.auth, new A.GoogleAuthProvider());
      return { ok:true };
    }catch(e){ return { ok:false, error:msgOf(e), code:e && e.code }; }
  }

  /* 로그아웃하면 반드시 익명으로 다시 들어가야 한다. 그냥 나가 버리면
     request.auth가 비어서 규칙이 모든 읽기·쓰기를 거부하고, 대진판이
     통째로 죽는다. */
  async function signOut(){
    const F = fb(), A = ns();
    if(!F || !A) return;
    try{ await A.signOut(F.auth); }catch{}
    try{ await A.signInAnonymously(F.auth); }catch(e){ console.warn('익명 복귀 실패', e); }
  }

  /* 이 동호회에서 내 역할. 'owner' | 'admin' | null
     판단은 서버 문서가 한다. 읽기는 본인 것만 열려 있다(규칙 참고).
     반환이 null이면 "역할 없음"이고, 통신 실패는 error로 구분한다 —
     둘을 뭉뚱그리면 오프라인일 때 멀쩡한 운영자에게 "권한이 없다"고
     거짓말을 하게 된다. */
  async function roleIn(club){
    const F = fb(), acc = current();
    if(!acc) return { ok:true, role:null };
    if(!F)   return { ok:false };
    try{
      const snap = await F.getDoc(F.doc(F.db, 'clubs', club, 'roles', acc.uid));
      if(!snap.exists() && snap.metadata && snap.metadata.fromCache) return { ok:false };
      if(!snap.exists()) return { ok:true, role:null };
      const r = (snap.data() || {}).role;
      return { ok:true, role: (r === 'owner' || r === 'admin') ? r : null };
    }catch(e){
      return { ok:false, error:String(e) };
    }
  }

  return { current, signInEmail, signInGoogle, signOut, roleIn };
})();
