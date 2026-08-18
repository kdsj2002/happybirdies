/* =====================================================================
   서버만 할 수 있는 일

   보안 규칙은 강력하지만 못 하는 것이 둘 있다.
     · 문서 개수를 셀 수 없다 → "전체 100개까지"를 강제할 수 없다.
     · 여러 문서를 한 덩어리로 묶어 조건부로 만들 수 없다.

   그래서 지금까지 동호회 개설은 콘솔에서 사람이 두 가지를 손으로 했다.
     1. clubs/{id}/meta/club 문서 만들기
     2. registry/clubs 의 count 를 1 올리기
   2번을 빠뜨리면 상한이 무의미해지고, 두 사람이 동시에 만들면 같은 주소를
   두 번 만들거나 count 가 어긋난다. 사람이 지켜야 하는 규칙은 언젠가 깨진다.

   여기서는 그 둘을 하나의 트랜잭션으로 묶는다. 읽고-확인하고-올리고-만드는
   것이 전부 성공하거나 전부 실패한다.

   ── 이것이 막지 못하는 것 ────────────────────────────────────────
   스크립트로 익명 계정을 계속 새로 만들어 100칸을 다 태우는 짓은 막지
   못한다. App Check 도 캡차도 쓰지 않기로 했으므로 서버가 "사람인지"
   판단할 근거가 없다. 한 계정당 MAX_PER_CREATOR 개로 묶어 순진한 반복은
   막지만, 계정을 갈아 가며 두드리면 그만이다. 상한이 100인 이유가
   그것이다 — 최악의 경우 잃는 것이 100칸으로 한정된다.
   ===================================================================== */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/* Firestore 가 asia-northeast2(오사카)에 있다. 같은 지역에 두어야 트랜잭션
   왕복이 짧다. 배포가 이 지역을 거부하면 이 한 줄만 바꾸면 된다.
   maxInstances 는 요금 사고 방지용 뚜껑이다 — 동호회 개설은 아주 드문
   요청이라 10이면 넘치고도 남는다. */
setGlobalOptions({ region: 'asia-northeast2', maxInstances: 10 });

/* 주소 규격은 클라이언트(store.js의 CLUB)와 반드시 같아야 한다.
   여기가 느슨하면 앱이 열지 못하는 동호회가 만들어진다. */
const CLUB_ID = /^[a-z0-9][a-z0-9-]{1,30}$/;

/* 앱이 실제 경로로 쓰거나 쓸 수 있는 이름은 동호회 주소로 내줄 수 없다.
   'default'는 예전 동호회 자리이고, 나머지는 앞으로 쓸 수 있는 자리다. */
const RESERVED = new Set([
  'default', 'registry', 'manual', 'admin', 'api', 'www', 'app',
  'static', 'assets', 'js', 'css', 'help', 'about', 'new', 'club', 'clubs'
]);

const DEFAULT_LIMIT   = 100;   // registry/clubs 가 아직 없을 때 쓰는 기본 상한
const MAX_PER_CREATOR = 2;     // 한 계정이 만들 수 있는 동호회 수
const PROMO_DAYS      = 30;    // 무료 체험 기간

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ── 동호회 개설 ──────────────────────────────────────────────────
   앱에서 httpsCallable('createClub')로 부른다.
   성공하면 { ok:true, id }. 실패는 HttpsError 로 올라가고, 앱은 code 로
   무엇이 문제였는지 구분한다.
     already-exists     이미 쓰이는 주소
     resource-exhausted 전체 정원이 참
     permission-denied  이 계정이 만들 수 있는 수를 넘음
     invalid-argument   주소 규격이 맞지 않음
   ───────────────────────────────────────────────────────────── */
exports.createClub = onCall(async (req) => {
  const uid = req.auth && req.auth.uid;
  // 익명 로그인이라도 계정은 있어야 한다. 계정이 없으면 한 사람이 몇 개를
  // 만들었는지 셀 수가 없다.
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다');

  const id      = str(req.data && req.data.id, 40).toLowerCase();
  const name    = str(req.data && req.data.name, 40);
  const contact = str(req.data && req.data.contact, 120);
  const note    = str(req.data && req.data.note, 300);

  if (!CLUB_ID.test(id))
    throw new HttpsError('invalid-argument',
      '주소는 영문 소문자·숫자·하이픈으로 2~31자여야 합니다');
  if (RESERVED.has(id))
    throw new HttpsError('invalid-argument', '쓸 수 없는 주소입니다');
  if (!name)
    throw new HttpsError('invalid-argument', '동호회 이름을 입력하세요');

  const regRef     = db.doc('registry/clubs');
  const metaRef    = db.doc(`clubs/${id}/meta/club`);
  const creatorRef = db.doc(`clubCreators/${uid}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    // Firestore 트랜잭션은 읽기를 모두 마친 뒤에야 쓸 수 있다.
    const meta    = await tx.get(metaRef);
    const reg     = await tx.get(regRef);
    const creator = await tx.get(creatorRef);

    if (meta.exists)
      throw new HttpsError('already-exists', '이미 쓰이고 있는 주소입니다');

    const regData = reg.exists ? (reg.data() || {}) : {};
    const count = Number(regData.count) || 0;
    const limit = Number(regData.limit) || DEFAULT_LIMIT;
    if (count >= limit)
      throw new HttpsError('resource-exhausted',
        `지금은 신규 동호회 정원(${limit}개)이 다 찼습니다`);

    const mine = Number((creator.exists ? creator.data() : {}).count) || 0;
    if (mine >= MAX_PER_CREATOR)
      throw new HttpsError('permission-denied',
        '이 기기에서 만들 수 있는 동호회 수를 넘었습니다');

    tx.set(metaRef, {
      name, nameEn: id, contact, note,
      region: 'us',            // 요구사항 명세서의 프라이머리 리전
      plan: 'promo',
      status: 'active',
      promoUntil: now + PROMO_DAYS * 86400000,
      createdAt: now,
      createdBy: uid
    });
    // limit 도 함께 써 둔다 — registry 문서가 아직 없던 프로젝트에서도
    // 첫 개설 이후에는 상한이 명시적으로 남는다.
    tx.set(regRef, { count: count + 1, limit }, { merge: true });
    tx.set(creatorRef, { count: mine + 1, lastAt: now }, { merge: true });
  });

  logger.info('동호회 개설', { id, uid });
  return { ok: true, id };
});
