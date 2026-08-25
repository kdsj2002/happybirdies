/* =====================================================================
   언어 전환

   기기별 저장이다(클럽 설정이 아니다) — 같은 클럽이라도 어떤 사람은
   영어로, 어떤 사람은 한국어로 보고 싶을 수 있다. 처음 여는 기기는
   브라우저 언어(navigator.language)로 추측하고, 한 번 고르면 그 뒤로는
   무조건 그 값을 쓴다(추측이 틀렸을 때 매번 되돌아가면 짜증난다).

   문자열은 window.I18N(js/i18n-*.js)에서 가져온다. 이 파일 자체는
   문자열을 하나도 담지 않는다 — 그래야 언어를 추가할 때 이 파일을
   건드리지 않고 i18n-xx.js 하나만 더하면 된다. */
const Lang = (() => {
  const KEY = 'bmt:lang';
  const SUPPORTED = ['ko', 'en', 'zh', 'ja'];
  const NAMES = { ko: '한국어', en: 'English', zh: '中文', ja: '日本語' };

  function detect() {
    try {
      const saved = localStorage.getItem(KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch {}
    const nav = ((navigator.language || navigator.userLanguage || 'ko') + '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('ja')) return 'ja';
    if (nav.startsWith('en')) return 'en';
    return 'ko';
  }

  let cur = detect();
  let onChange = null;

  function get() { return cur; }

  function set(l) {
    if (!SUPPORTED.includes(l) || l === cur) return;
    cur = l;
    try { localStorage.setItem(KEY, l); } catch {}
    if (typeof onChange === 'function') onChange(l);
  }

  /* 언어가 바뀔 때 다시 그려야 하는 쪽(main.js)이 콜백 하나를 등록해 둔다.
     Lang 자신은 render()를 모른다 — 화면을 어떻게 그리는지는 이 모듈이
     알 필요가 없는 일이다. */
  function onLangChange(cb) { onChange = cb; }

  /* {name} 같은 자리표시자를 문자열 치환으로 채운다. 번역문 안에
     <b> 같은 태그가 있어도 안전하다 — 여긴 텍스트만 바꿔 끼울 뿐,
     새로 HTML을 파싱하지 않는다. 키가 없으면 한국어로, 그마저 없으면
     키 이름 그대로 보여준다 — 화면이 비는 것보다 낫다. */
  function t(key, vars) {
    const table = window.I18N || {};
    let s = (table[cur] && table[cur][key]) ?? (table.ko && table.ko[key]) ?? key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  return { get, set, t, onLangChange, SUPPORTED, NAMES };
})();
const t = Lang.t;
