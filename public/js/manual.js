/* =====================================================================
   사용 설명서 — 회원용 / 운영자용

   실제 글은 여기 없다. 언어별로 public/js/manual-{ko,en,zh,ja}.js에
   나뉘어 있고(window.MANUAL_CONTENT[언어]), 이 파일은 그중 지금 언어를
   골라 제목·목차·네 섹션을 조립만 한다. 글을 고칠 일이 있으면
   manual-ko.js를 고치고, 다른 언어 파일도 구조를 맞춰 함께 손봐야 한다.

   앱 안의 "도움말" 탭(screens.js → renderHelp)과 따로 열 수 있는
   manual.html이 이 파일 하나를 공유한다. manual.html은 앱 상태(S, Auth …)를
   읽지 않으므로 여기서도 그런 값을 참조하면 안 된다 — 클럽마다 다른 값은
   적지 않고 어디를 보면 되는지만 알려준다는 원칙은 그대로다.
   ===================================================================== */
const Manual = (() => {
  function content(){
    const lang = (typeof Lang !== 'undefined' && Lang.get) ? Lang.get() : 'ko';
    const table = window.MANUAL_CONTENT || {};
    return table[lang] || table.ko;
  }

  /* opts.role 을 주면 그 역할에 해당하는 부분에 표시가 붙는다.
     안 줘도 전부 그려진다(manual.html은 역할을 모른다). */
  function html(opts){
    const role = (opts && opts.role) || null;
    const C = content();
    const tag = who => role===who
      ? `<span class="doc-you">${C.ui.youAreHere}</span>` : '';
    return `
      <div class="doc">
        <h1>${C.ui.title}</h1>
        <p class="doc-lead">${C.ui.lead}</p>
        <nav class="doc-toc">
          <a href="#m-start">${C.ui.tocStart}</a>
          <a href="#m-member">${C.ui.tocMember} ${tag('member')}</a>
          <a href="#m-admin">${C.ui.tocAdmin} ${tag('admin')}</a>
          <a href="#m-trouble">${C.ui.tocTrouble}</a>
        </nav>
        ${C.start}
        ${C.member}
        ${C.admin}
        ${C.trouble}
      </div>`;
  }

  /* manual.html 전용 꼬리말(앱으로 돌아가는 링크). 앱 안의 도움말 탭은
     이미 앱 안이므로 이 꼬리말이 필요 없다 — screens.js는 html()만 쓴다. */
  function footer(){
    const C = content();
    return `<div class="doc doc-print">${C.ui.footerNote} ` +
           `<a href="./">${C.ui.openApp}</a></div>`;
  }

  return { html, footer, title(){ return content().ui.title; } };
})();
