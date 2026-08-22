/* =====================================================================
   경기 기록 보관소 — 세션과 분리된, 날짜별로 남는 원장

   ── 왜 세션 문서로는 안 되는가 ──────────────────────────────────

   세션 문서(kv/session:YYYY-MM-DD)는 "지금 대진판이 어떻게 생겼는가"를
   담은 작업 문서다. 칩 하나 옮길 때마다 통째로 덮어써지고, 출석자
   목록(att)은 마감하면 비워진다. 경기 기록도 여태 그 안에 얹혀 있었다.

   문제가 둘이었다.

     1) 기록이 작업 문서의 운명을 함께 진다. 세션이 잘못 덮어써지면
        그날 경기가 통째로 사라진다. 되돌릴 방법이 없다.

     2) 경기의 참가자가 출석자 id(a3f9…)로만 적혀 있다. 그 id는 그날
        하루짜리라 다음 날이 되면 누구인지 알 방법이 없다. 이름을 함께
        적어 두긴 했지만 이름으로는 동명이인·개명·게스트를 가릴 수 없다.
        즉 날짜를 건너뛰는 통계가 원리적으로 불가능했다.

   ── 그래서 원장을 따로 둔다 ────────────────────────────────────

     clubs/{club}/kv/rec:YYYY-MM-DD   그날 끝난 경기들 (굳은 사본)
     clubs/{club}/kv/recIndex         기록이 있는 날짜 목록

   원장에 적히는 경기는 세션의 것을 그대로 옮긴 사본이 아니라, 그 순간의
   사람 정보까지 함께 굳힌 사본이다.

     · 회원 id를 박아 둔다        — 날짜를 건너 이어 붙이려면 이것뿐이다
     · 급수·성별은 그때의 값이다  — 급수는 바뀐다. 지금 급수로 옛 경기를
                                    해석하면 없던 이야기가 만들어진다
     · 이름도 함께 적는다         — 회원이 삭제돼도 누구였는지는 남는다

   ── 덮어쓰기 규칙은 하나다 ────────────────────────────────────

     참가자는 처음 한 번만 적고, 결과(승패·점수)만 나중에 고칠 수 있다.

   세션이 비워진 뒤(마감·날짜 넘김) att가 사라진 상태에서 같은 경기가 다시
   올라오면 참가자가 전부 '?'로 굳는다. 이 규칙이 그 사고를 막는다.
   ===================================================================== */
const Records = (() => {
  const REC = d => K('rec:' + d);
  const IDX = () => K('recIndex');

  /* 이미 원장에 올린 내용의 지문. 같은 경기를 매번 다시 쓰지 않기 위한
     것이라 메모리에만 둔다(새로고침하면 seed()가 원장에서 다시 채운다). */
  let sig = new Map();
  let idx = null;            // 날짜 목록 캐시. null이면 아직 안 읽었다
  let warm = null;           // 통계·매칭용으로 불러 둔 과거 기록

  const fb = () => (Store.mode === 'firebase' ? Store._fb : null);
  const stamp = m => JSON.stringify([m.endedAt || 0, m.win || null,
                                     m.sw == null ? null : m.sw,
                                     m.sl == null ? null : m.sl]);

  /* 문서 하나를 읽고-고치고-쓴다.
     두 태블릿이 같은 순간에 경기를 마치면 나중 것이 앞 것을 지울 수 있다.
     원장은 지워지면 안 되는 값이라 트랜잭션으로 감싼다.
     fn이 undefined를 돌려주면 쓰지 않는다(바꿀 것이 없었다는 뜻). */
  async function mutate(key, fn){
    const F = fb();
    if(!F || !F.runTransaction){
      const cur = await Store.get(key);
      const next = fn(cur);
      if(next !== undefined) await Store.set(key, next);
      return next;
    }
    const id = key.replace(/^bmt:[^:]+:/, '');
    const ref = F.doc(F.db, 'clubs', CLUB, 'kv', id);
    return await F.runTransaction(F.db, async tr => {
      const snap = await tr.get(ref);
      let cur = null;
      if(snap.exists()){ try{ cur = JSON.parse(snap.data().v); }catch{} }
      const next = fn(cur);
      if(next === undefined) return cur;
      tr.set(ref, { v: JSON.stringify(next), updatedAt: new Date() });
      return next;
    });
  }

  /* 한 사람을 굳힌다. 출석자가 이미 사라졌으면(마감 후) 기록에 함께
     적혀 있던 이름만이라도 남긴다 — 그 경우 회원 id는 얻을 수 없다. */
  function person(attId, fallbackName){
    const a = (typeof A === 'function') ? A(attId) : null;
    if(!a) return { m:null, n: fallbackName || '?', g:null, r:null, gu:0 };
    return { m: a.memberId || null, n: a.name, g: a.gender || null,
             r: a.grade || null, gu: a.guest ? 1 : 0 };
  }
  function freeze(m){
    return {
      id: m.id, court: m.court, type: m.type || null,
      startedAt: m.startedAt || null, endedAt: m.endedAt || null,
      A: (m.A || []).map((id, i) => person(id, (m.An || [])[i])),
      B: (m.B || []).map((id, i) => person(id, (m.Bn || [])[i])),
      win: m.win || null,
      sw: m.sw == null ? null : m.sw,
      sl: m.sl == null ? null : m.sl
    };
  }

  /* 부팅 때 오늘 원장을 읽어 지문을 채운다. 이걸 안 하면 새로고침한 기기가
     오늘 경기를 전부 다시 올리려 든다(내용은 같지만 쓰기가 낭비다). */
  async function seed(){
    try{
      const cur = await Store.get(REC(S.date));
      if(cur && Array.isArray(cur.matches))
        cur.matches.forEach(x => sig.set(x.id, stamp(x)));
    }catch(e){ console.warn('원장 읽기 실패', e); }
  }

  async function touchIndex(date){
    if(idx === null){ try{ idx = (await Store.get(IDX())) || []; }catch{ idx = []; } }
    if(idx.includes(date)) return;
    await mutate(IDX(), cur => {
      const list = Array.isArray(cur) ? cur.slice() : [];
      if(list.includes(date)) return undefined;
      list.push(date); list.sort();
      return list;
    });
    idx.push(date); idx.sort();
  }

  /* 끝난 경기 중 아직 원장에 없거나 결과가 바뀐 것만 올린다.
     save()가 부른다 — 어느 길로 경기가 끝났든(손으로·리매치·30분 자동
     종료·나중에 결과 수정) 전부 여기를 지나가므로 빠지는 경로가 없다. */
  async function sync(){
    if(SAFE_MODE) return;            // 반쪽 상태는 원장에도 남기지 않는다
    const date = S.date;
    const dirty = S.matches.filter(m => m.endedAt && sig.get(m.id) !== stamp(m));
    if(!dirty.length) return;
    const frozen = dirty.map(freeze);
    try{
      await mutate(REC(date), cur => {
        const doc = (cur && Array.isArray(cur.matches)) ? cur : { date, ver:1, matches:[] };
        const at = new Map(doc.matches.map((x, i) => [x.id, i]));
        frozen.forEach(f => {
          const i = at.get(f.id);
          if(i == null){ doc.matches.push(f); return; }
          /* 참가자는 처음 적힌 것을 지킨다. 결과만 고쳐 쓴다. */
          const old = doc.matches[i];
          old.endedAt = f.endedAt; old.win = f.win; old.sw = f.sw; old.sl = f.sl;
          if(f.type) old.type = f.type;
        });
        doc.matches.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
        return doc;
      });
      dirty.forEach(m => sig.set(m.id, stamp(m)));
      await touchIndex(date);
      if(warm) warm = null;          // 통계 캐시가 낡았다. 다음에 다시 부른다
    }catch(e){
      // 실패해도 지문을 남기지 않으므로 다음 저장에서 그대로 다시 시도한다.
      console.warn('경기 기록 저장 실패 — 다음 저장에서 다시 시도합니다', e);
    }
  }

  /* 기록이 있는 날짜 — 최근 것이 앞에 온다. */
  async function dates(){
    if(idx === null){ try{ idx = (await Store.get(IDX())) || []; }catch{ idx = []; } }
    return idx.slice().sort().reverse();
  }

  /* 그 날짜들의 경기를 한 배열로 읽어 온다(각 경기에 date가 붙는다). */
  async function load(list){
    const out = [];
    for(const d of (list || [])){
      try{
        const doc = await Store.get(REC(d));
        if(doc && Array.isArray(doc.matches))
          doc.matches.forEach(m => out.push(Object.assign({ date:d }, m)));
      }catch(e){ console.warn(d + ' 기록 읽기 실패', e); }
    }
    return out;
  }

  /* ── 사람을 무엇으로 묶는가 ──────────────────────────────────────
     회원은 회원 id로 묶는다. 이름이 바뀌어도, 동명이인이 있어도 안 섞인다.
     게스트는 회원 id가 없어서 이름으로 묶을 수밖에 없다 — 정확하지 않다는
     것을 알고 쓴다(다른 게스트가 같은 이름이면 한 사람으로 보인다).
     그래서 통계 화면에서 게스트는 따로 표시한다. */
  const pkey = p => p.m || ('n:' + p.n);
  const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

  /* 사람별 집계 + 짝·상대 집계. 매칭이 참조하는 것도 이 결과다. */
  function stats(list){
    const people = new Map(), pairs = new Map(), foes = new Map();
    const touch = p => {
      const k = pkey(p);
      let e = people.get(k);
      if(!e){ e = { key:k, memberId:p.m || null, name:p.n, guest:!!p.gu,
                    games:0, win:0, lose:0, mins:0, pf:0, pa:0, days:new Set() };
              people.set(k, e); }
      e.name = p.n;                       // 가장 최근에 쓰인 이름
      return e;
    };
    const bump = (map, a, b, won) => {
      const k = pairKey(a, b);
      let e = map.get(k);
      if(!e){ e = { a, b, n:0, win:0 }; map.set(k, e); }
      e.n++; if(won) e.win++;
      return e;
    };

    (list || []).forEach(m => {
      const mins = (m.endedAt && m.startedAt) ? Math.round((m.endedAt - m.startedAt) / 60000) : 0;
      const sides = { A: m.A || [], B: m.B || [] };
      ['A', 'B'].forEach(side => {
        const mine = sides[side], won = m.win === side;
        mine.forEach(p => {
          const e = touch(p);
          e.games++; e.mins += mins; if(m.date) e.days.add(m.date);
          if(m.win) (won ? e.win++ : e.lose++);
          if(m.win && m.sw != null && m.sl != null){
            e.pf += won ? m.sw : m.sl;
            e.pa += won ? m.sl : m.sw;
          }
        });
        // 같은 팀으로 뛴 짝 — 한 경기에서 각 팀을 한 번씩만 센다
        for(let i = 0; i < mine.length; i++)
          for(let j = i + 1; j < mine.length; j++)
            bump(pairs, pkey(mine[i]), pkey(mine[j]), won);
      });
      // 맞상대 — A×B를 한 번만 센다(양쪽에서 세면 두 배가 된다)
      sides.A.forEach(p => sides.B.forEach(o => bump(foes, pkey(p), pkey(o), false)));
    });
    return { people, pairs, foes, matches:(list || []).length };
  }

  /* ── 매칭이 참조하는 창구 ────────────────────────────────────────
     설정의 '이력 참고 일수'가 0보다 클 때만 과거를 불러 둔다. 안 불렀으면
     아래 pairCount는 언제나 0을 돌려주므로, 매칭은 오늘 안의 이력만 보고
     지금까지와 똑같이 돈다 — 켜지 않은 기능이 조용히 결과를 바꾸는 일이
     없도록 판단을 한곳(warm 여부)으로 모았다. */
  async function warmUp(days){
    const n = +days || 0;
    if(n <= 0){ warm = null; return null; }
    const all = await dates();
    const pick = all.filter(d => d !== S.date).slice(0, n);   // 오늘은 S.hist가 본다
    const list = await load(pick);
    warm = Object.assign(stats(list), { dates:pick });
    return warm;
  }
  const warmed = () => !!warm;
  const attKey = id => {
    const a = (typeof A === 'function') ? A(id) : null;
    if(!a) return null;
    return a.memberId || ('n:' + a.name);
  };
  /* 이 둘이 불러 둔 기간 안에 같은 팀이었던 횟수. 안 불렀으면 0. */
  function pairCount(x, y){
    if(!warm) return 0;
    const a = attKey(x), b = attKey(y);
    if(!a || !b) return 0;
    const e = warm.pairs.get(pairKey(a, b));
    return e ? e.n : 0;
  }

  return { sync, seed, dates, load, stats, warmUp, warmed, pairCount,
           pkey, pairKey,
           // 화면에서 쓰는 것들
           warmData: () => warm, todayKey: () => REC(S.date) };
})();
