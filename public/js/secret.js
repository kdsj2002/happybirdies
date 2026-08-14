/* =====================================================================
   운영자 비밀번호 — 저장하지 않고 확인만 한다

   예전에는 S.settings.adminPin에 평문으로 들어 있었다. settings 문서는
   누구나 읽을 수 있으므로 그건 비밀번호가 아니라 공지사항이었다.

   지금 구조는 이렇다.

     kv/adminAuth      { salt, iter }   읽기 O — salt는 비밀이 아니다
     secret/adminPin   { hash }         읽기 X — 규칙이 아예 막는다
     probe/{랜덤}      { hash }         읽기 X — 규칙이 대조만 해 준다

   확인은 "읽어서 비교"가 아니라 "써 보고 되는지 본다"이다.
   입력한 비밀번호로 PBKDF2 해시를 만들어 probe 문서를 만들어 보면,
   규칙이 secret/adminPin의 해시와 대조해 같을 때만 통과시킨다.
     · 생성 성공 → 맞다        · permission-denied → 틀리다
   해시가 클라이언트로 내려오는 일이 없으므로, 네트워크를 뜯어보든
   firebase-config.json을 복사해 스크립트를 돌리든 가져갈 것이 없다.
   얻을 수 있는 것은 "맞다/틀리다" 한 비트뿐이다.

   ── 왜 트랜잭션으로 쓰는가 ─────────────────────────────────────
   오프라인 캐시가 켜져 있으면 setDoc()은 서버에 닿기 전에 성공으로
   돌아온다. 그대로 두면 비행기 모드에서 아무 비밀번호나 통과한다.
   트랜잭션은 오프라인에서 큐에 쌓이지 않고 실패하므로, "확인됐다"는
   말이 언제나 서버가 확인해 줬다는 뜻이 된다.
   대신 첫 로그인은 온라인이어야 한다. 한 번 들어오면 역할이 이 기기에
   저장되므로, 그 뒤로는 오프라인에서도 운영자로 남는다.

   ── 알고 쓸 것 ────────────────────────────────────────────────
   · 초기화 직후(=kv/adminAuth가 없는 동안)에는 앱을 먼저 연 사람이
     비밀번호를 차지한다. 지웠으면 곧바로 본인이 설정할 것.
   · 온라인 무차별 대입은 규칙으로 못 막는다. 아래 시도 제한은 이 기기
     안에서만 도는 장치라 스크립트에는 효력이 없다.
     **길게 쓰는 것이 여전히 실질적인 방어의 전부다.**
   ===================================================================== */
const Secret = (() => {
  const ITER = 210000;              // PBKDF2 반복. 새로 설정할 때 쓰는 값.

  /* ── 비밀번호는 두 종류다 ──────────────────────────────────────
     admin(운영자)과 owner(소유자). 저장 구조는 완전히 같고 이름만 다르다.
     소유자 비밀번호를 따로 두는 것이 핵심이다 — 같은 비밀번호로 두 역할을
     나누면 화면만 다르고 실제로는 같은 권한이라, 구분하는 척하는 것이 된다.
     비밀번호가 다르면 운영자 비밀번호만 아는 사람은 소유자 권한을 못 쓴다. */
  const KINDS = { admin:{ auth:'adminAuth', pin:'adminPin' },
                  owner:{ auth:'ownerAuth', pin:'ownerPin' } };
  const K_ = k => KINDS[k] || KINDS.admin;
  const LOCAL_KEY = (kind) => `bmt:${CLUB}:${K_(kind).auth}Local`;

  const fb = () => (Store.mode === 'firebase' ? Store._fb : null);
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));

  /* PBKDF2-SHA256. 결과는 32바이트(hex 64자) — 규칙이 길이를 검사한다. */
  async function digest(password, salt, iter) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: iter, hash: 'SHA-256' },
      key, 256);
    return hex(bits);
  }

  /* ── 이 기기에만 저장하는 경우 ──────────────────────────────────
     Firebase를 안 붙였을 때(로컬 저장소 모드)의 대체 경로다. 같은 해시를
     쓰지만 localStorage에 두므로 기기 주인이 열어 보면 보인다. 여기서는
     그게 한계다 — 서버가 없으면 "못 읽는 곳"이란 게 존재하지 않는다.
     Firebase에 붙이면 자동으로 위의 구조를 쓴다. */
  const localRead  = (kind) => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY(kind)) || 'null'); } catch { return null; } };
  const localWrite = (kind, v) => { try { localStorage.setItem(LOCAL_KEY(kind), JSON.stringify(v)); } catch {} };

  /* 지금 비밀번호가 설정돼 있는지. salt 문서의 존재로 판정한다.
     반환: 'set' | 'unset' | 'unknown'(읽기 실패 — 판단하지 않는다) */
  async function state(kind = 'admin') {
    const F = fb();
    if (!F) return localRead(kind) ? 'set' : 'unset';
    try {
      const snap = await F.getDoc(F.doc(F.db, 'clubs', CLUB, 'kv', K_(kind).auth));
      // 오프라인 캐시가 "없다"고 답한 것을 미설정으로 받아들이면,
      // 비행기 모드에서 최초 설정 화면이 떠 버린다. 캐시 답은 믿지 않는다.
      if (!snap.exists() && snap.metadata && snap.metadata.fromCache) return 'unknown';
      return snap.exists() ? 'set' : 'unset';
    } catch (e) {
      console.warn('운영자 비밀번호 상태 확인 실패', e);
      return 'unknown';
    }
  }

  /* 최초 설정. salt 문서와 해시 문서를 한 번에 만든다.
     규칙이 "adminAuth가 없을 때만"을 강제하므로, 이미 설정돼 있으면
     서버가 거절한다(둘이 동시에 눌러도 한쪽만 성공한다). */
  async function bootstrap(password, kind = 'admin') {
    if (!password) return { ok: false, reason: 'empty' };
    const salt = randHex(16);
    const hash = await digest(password, salt, ITER);
    const F = fb();
    if (!F) { localWrite(kind, { salt, iter: ITER, hash }); clearFails(kind); return { ok: true, local: true }; }
    try {
      const batch = F.writeBatch(F.db);
      batch.set(F.doc(F.db, 'clubs', CLUB, 'secret', K_(kind).pin), { hash });
      batch.set(F.doc(F.db, 'clubs', CLUB, 'kv', K_(kind).auth),
                { v: JSON.stringify({ salt, iter: ITER }), updatedAt: new Date() });
      await batch.commit();
      clearFails(kind);        // 새로 정한 비밀번호에 옛 실패 기록을 물려주지 않는다
      return { ok: true };
    } catch (e) {
      // 이미 누가 설정했거나(taken), 규칙이 아직 배포되지 않았거나(rules).
      const denied = String(e && e.code) === 'permission-denied';
      return { ok: false, reason: denied ? 'taken' : 'network', error: String(e) };
    }
  }

  /* ── 여러 번 틀렸을 때 ────────────────────────────────────────
     5번 틀리면 이 기기에서 잠그고, 잠금이 풀린 뒤 또 틀리면 다음 잠금은
     배로 길어진다(1 → 2 → 4 → 8 → 16 → 30분 상한). 맞히면 처음으로 돌아간다.

     여기(Secret)에 두는 이유는 비밀번호를 묻는 곳이 세 군데이기 때문이다 —
     입장 화면, 소유자 확인 창, 최초 설정 뒤 자동 입장. 화면마다 세면 한
     군데를 빠뜨리는 순간 그쪽이 우회로가 된다. 세는 곳은 하나여야 한다.

     ── 이것이 막는 것과 못 막는 것 ───────────────────────────────
     막는 것: 태블릿을 잠깐 만질 수 있는 사람이 "0000 · 0116 · 1234 …"를
     손으로 찍어 보는 것. 체육관에서 실제로 일어나는 시나리오는 이쪽이다.

     못 막는 것: **스크립트로 하는 무차별 대입.** 이 기록은 이 브라우저의
     localStorage에 있을 뿐이라, 앱을 거치지 않고 Firestore를 직접 두드리면
     아무 효력이 없다. 시크릿 창을 열거나 저장소를 비워도 풀린다. 서버가
     세어 주지 않는 한 이 이상은 안 된다(App Check는 쓰지 않기로 했다).
     그러니 이 장치를 믿고 짧은 비밀번호를 쓰면 안 된다.
     ─────────────────────────────────────────────────────────── */
  const MAX_TRY = 5;
  const STEPS   = [60000, 120000, 240000, 480000, 960000, 1800000];
  const lockKey   = kind => `bmt:${CLUB}:pinGate:${K_(kind).auth}`;
  const lockRead  = kind => { try { return JSON.parse(localStorage.getItem(lockKey(kind)) || '{}') || {}; } catch { return {}; } };
  const lockWrite = (kind, s) => { try { localStorage.setItem(lockKey(kind), JSON.stringify(s)); } catch {} };
  const lockLeft  = (kind = 'admin') => { const s = lockRead(kind); return (s.until && s.until > Date.now()) ? s.until - Date.now() : 0; };
  const triesLeft = (kind = 'admin') => Math.max(0, MAX_TRY - (lockRead(kind).fails || 0));
  function noteFail(kind) {
    const s = lockRead(kind);
    s.fails = (s.fails || 0) + 1;
    if (s.fails >= MAX_TRY) {
      const n = s.level || 0;                       // 몇 번째 잠금인지
      s.fails = 0;
      s.level = Math.min(n + 1, STEPS.length);
      s.until = Date.now() + STEPS[Math.min(n, STEPS.length - 1)];
    }
    lockWrite(kind, s);
  }
  const clearFails = kind => lockWrite(kind, {});

  /* 확인. 맞으면 {ok:true}. 서버까지 못 갔으면 reason:'offline'.
     비밀번호가 틀린 것과 통신이 안 되는 것을 반드시 구분해야 한다 —
     둘을 뭉뚱그리면 오프라인일 때 "비밀번호가 틀렸다"고 거짓말을 한다.
     잠겨 있으면 reason:'locked'와 남은 시간을 함께 돌려준다. */
  async function verify(password, kind = 'admin') {
    const wait = lockLeft(kind);
    if (wait > 0) return { ok: false, reason: 'locked', ms: wait };
    // 빈 입력은 시도로 세지 않는다. 엔터를 잘못 눌러 잠기면 억울하다.
    if (!password) return { ok: false, reason: 'wrong' };

    const r = await check(password, kind);
    if (r.ok) { clearFails(kind); return r; }
    /* 틀린 것만 센다. 통신이 안 되거나(offline) 아직 설정되지 않은 것은
       시도가 아니다 — 그것까지 세면 지하 체육관에서 와이파이가 오락가락할
       때 멀쩡한 운영자가 잠겨 버린다. */
    if (r.reason === 'wrong') {
      noteFail(kind);
      const ms = lockLeft(kind);
      if (ms > 0) return { ok: false, reason: 'locked', ms };
    }
    return r;
  }

  /* 실제 대조. 시도 횟수는 위 verify가 센다. */
  async function check(password, kind) {
    const F = fb();

    if (!F) {
      const rec = localRead(kind);
      if (!rec) return { ok: false, reason: 'unset' };
      const h = await digest(password, rec.salt, rec.iter || ITER);
      return h === rec.hash ? { ok: true, local: true } : { ok: false, reason: 'wrong' };
    }

    let cfg;
    try {
      const snap = await F.getDoc(F.doc(F.db, 'clubs', CLUB, 'kv', K_(kind).auth));
      if (!snap.exists()) return { ok: false, reason: 'unset' };
      cfg = JSON.parse(snap.data().v || '{}');
    } catch (e) {
      return { ok: false, reason: 'offline', error: String(e) };
    }
    if (!cfg.salt) return { ok: false, reason: 'unset' };

    const hash = await digest(password, cfg.salt, cfg.iter || ITER);
    const ref = F.doc(F.db, 'clubs', CLUB, 'probe', randHex(12));
    try {
      // 트랜잭션이라 오프라인에서는 큐에 쌓이지 않고 실패한다.
      await F.runTransaction(F.db, async tr => { tr.set(ref, { hash, kind }); });
    } catch (e) {
      if (String(e && e.code) === 'permission-denied') return { ok: false, reason: 'wrong' };
      return { ok: false, reason: 'offline', error: String(e) };
    }
    // 확인용 쪽지는 바로 치운다. 실패해도 상관없다(읽을 수 없는 문서다).
    F.deleteDoc(ref).catch(() => {});
    return { ok: true };
  }

  /* ── 소유자 확인 ────────────────────────────────────────────────
     소유자 비밀번호가 아직 없는 동호회(이 구조 이전부터 쓰던 곳)에서는
     운영자 비밀번호로 대신 확인한다. 안 그러면 소유자 전용으로 돌린
     조작(복원·CSV 일괄등록 등)이 통째로 막혀 버린다.
     대신 fallback 표시를 달아, 화면이 "소유자 비밀번호를 아직 안 정했다"고
     알려 줄 수 있게 한다. */
  async function verifyOwner(password) {
    const st = await state('owner');
    if (st === 'set')   return verify(password, 'owner');
    if (st === 'unset') {
      const r = await verify(password, 'admin');
      return r.ok ? Object.assign({}, r, { fallback: true }) : r;
    }
    return { ok: false, reason: 'offline' };
  }

  return { state, verify, verifyOwner, bootstrap, ITER,
           lockLeft, triesLeft, clearFails, MAX_TRY };
})();
