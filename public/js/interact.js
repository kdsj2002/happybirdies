/* =====================================================================
   드래그앤드롭 (Pointer Events) + 탭-투-무브 대체 경로
   HTML5 DnD는 태블릿에서 신뢰할 수 없어 직접 구현한다.
   드래그가 실패해도 "칩 탭 → 목적지 탭"으로 항상 이동할 수 있다.
   ===================================================================== */
(function(){
  let sx=0,sy=0,src=null,drag=false,srcEl=null,lastDrop=null,holdT=null;
  let team=null;                 // 팀째 끌 때의 출발지 키('court:1'·'queue:3'). 개인 드래그면 null
  const ghost=$('#ghost');

  document.addEventListener('pointerdown',e=>{
    const c=e.target.closest('[data-chip]');
    if(c){
      const id=c.dataset.chip;
      const L=locate(id);
      // 운영자가 아니면 자기 칩만, 그것도 코트 밖에서만 잡을 수 있다
      if(!Auth.can('edit')){
        if(!Auth.can('selfQueue') || !Auth.isMe(id)) return;
        if(L.kind==='court') return;
      }
      sx=e.clientX; sy=e.clientY; src=id; srcEl=c; team=null; drag=false;
      holdT=setTimeout(()=>begin(e),160);
      return;
    }
    /* 팀 박스(코트 카드·대기 슬롯)를 통째로 끌기. 박스 안의 버튼·아이콘을
       누른 것이면 그건 그 버튼의 일이므로 드래그를 시작하지 않는다. */
    const s=e.target.closest('[data-team]');
    if(!s) return;
    if(e.target.closest('button,.ic,.mt')) return;
    if(!Auth.can('edit') || !Auth.can('courtAssign')) return;
    sx=e.clientX; sy=e.clientY; src=null; srcEl=s; team=s.dataset.team; drag=false;
    holdT=setTimeout(()=>begin(e),160);
  });
  function begin(e){
    if(drag || (!src && team===null)) return;
    drag=true;
    ghost.innerHTML='';
    if(team!==null){
      srcEl.classList.add('team-drag');
      const [k,n]=team.split(':');
      const o = k==='court' ? S.courts.find(c=>c.no===+n) : S.queues.find(q=>q.index===+n);
      const ids=(o.teams.A.length?[...o.teams.A,...o.teams.B]:o.members);
      const names=ids.map(i=>(A(i)||{}).name).filter(Boolean);
      const g=el('div','ghost-team',
        `<b>${k==='court'?n+'코트':'Q'+n} · ${names.length}명</b>`
        +`<span>${names.map(esc).join(' · ')}</span>`);
      ghost.appendChild(g);
    }else{
      srcEl.classList.add('ghost');
      const g=chipEl(src,'ghost'); g.style.width='100%'; ghost.appendChild(g);
    }
    ghost.style.display='block'; move(e);
  }
  function move(e){
    ghost.style.left=(e.clientX-85)+'px'; ghost.style.top=(e.clientY-32)+'px';
    ghost.style.display='block';
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const d=under?.closest('[data-drop]');
    if(lastDrop&&lastDrop!==d) lastDrop.classList.remove('drop');
    if(d){ d.classList.add('drop'); lastDrop=d; }
  }
  document.addEventListener('pointermove',e=>{
    if(!src && team===null) return;
    if(!drag && Math.hypot(e.clientX-sx,e.clientY-sy)>8){ clearTimeout(holdT); begin(e); }
    if(drag){ e.preventDefault(); move(e); }
  },{passive:false});
  document.addEventListener('pointerup',e=>{
    clearTimeout(holdT);
    if(!src && team===null) return;
    if(drag){
      const under=document.elementFromPoint(e.clientX,e.clientY);
      const d=under?.closest('[data-drop]');
      const t=team, s=src;
      cleanup();
      if(d){ if(t!==null) moveTeamTo(t, d.dataset.drop); else moveTo(s, d.dataset.drop); }
    } else if(src) {                           // 탭 = 선택 토글 (개인 칩만)
      if(sel===src){ sel=null; } else { sel=src; }
      cleanup(); render();
    } else cleanup();
  });
  document.addEventListener('pointercancel',cleanup);
  function cleanup(){
    clearTimeout(holdT);
    if(srcEl) srcEl.classList.remove('ghost','team-drag');
    if(lastDrop) lastDrop.classList.remove('drop');
    ghost.style.display='none'; src=null; srcEl=null; drag=false; lastDrop=null; team=null;
  }
  /* 탭-투-무브: 선택된 칩이 있을 때 드롭 영역을 탭하면 이동 */
  document.addEventListener('click',e=>{
    if(!sel) return;
    if(e.target.closest('[data-chip]')) return;
    const d=e.target.closest('[data-drop]'); if(!d) return;
    const id=sel; sel=null; moveTo(id,d.dataset.drop);
  });

  /* ── 더블탭 / 더블클릭 = 다음 단계로 ──────────────────────────
     같은 대상을 340ms 안에 두 번 두드리면 advance로 넘긴다.
     마우스의 dblclick만 쓰면 태블릿에서 동작하지 않으므로 포인터
     이벤트로 직접 센다. 끌기가 있었던 직후는 세지 않는다. */
  const DOUBLE_MS=340;
  let tapKey=null, tapAt=0;
  function targetKey(e){
    if(e.target.closest('button,.ic,.mt,.seg,.tab,input,select,.grip')) return null;
    const c=e.target.closest('[data-chip]');
    if(c) return 'chip:'+c.dataset.chip;
    const box=e.target.closest('.court,.slot');
    if(box && box.dataset.drop) return 'box:'+box.dataset.drop;
    return null;
  }
  document.addEventListener('pointerup',e=>{
    if(drag){ tapKey=null; return; }          // 방금 끌었다면 탭이 아니다
    const k=targetKey(e);
    if(!k){ tapKey=null; return; }
    const t=Date.now();
    if(tapKey===k && t-tapAt<DOUBLE_MS){
      tapKey=null; sel=null;
      if(k.startsWith('chip:')) advanceChip(k.slice(5));
      else                      advanceTeam(k.slice(4));
      return;
    }
    tapKey=k; tapAt=t;
  });
})();

/* =====================================================================
   보드 조작 이벤트
   ===================================================================== */
document.addEventListener('click',e=>{
  const t=e.target;
  const scr=t.closest('[data-scr]'); if(scr) return show(scr.dataset.scr);


  const push=t.closest('[data-push]');
  if(push){ if(!requirePerm('edit')||!requirePerm('courtAssign')) return;
    return void pushQueueToCourt(S.queues.find(q=>q.index===+push.dataset.push));
  }


  const clr=t.closest('[data-clear]');
  if(clr){ if(!requirePerm('edit')) return; Sound.play('tap');
    const q=S.queues.find(q=>q.index===+clr.dataset.clear);
    return tx(()=>{ q.members.forEach(i=>A(i).state='POOL');
      Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',notice:null}); }); }


  const sw=t.closest('[data-swap]');
  if(sw){ if(!requirePerm('edit')) return;
    const [k,n]=sw.dataset.swap.split(':');
    if(k==='court' && !requirePerm('courtAssign')) return;
    Sound.play('move');
    const o=k==='court'?S.courts.find(c=>c.no===+n):S.queues.find(q=>q.index===+n);
    if(o.members.length!==4) return toast('4명이 있어야 팀을 바꿀 수 있습니다');
    return tx(()=>{
      const m=o.members, P=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
      const cur=P.findIndex(p=>o.teams.A.includes(m[p[0]])&&o.teams.A.includes(m[p[1]]));
      const nx=P[(cur+1)%3];
      o.teams={A:[m[nx[0]],m[nx[1]]],B:[m[nx[2]],m[nx[3]]]};
      o.matchType=mtypeOf(m,o.teams); o.typeSource='MANUAL';
    },{auto:false}); }

  const mt=t.closest('[data-mt]');
  if(mt){ if(!requirePerm('edit')) return; Sound.play('tap');
    const [k,n]=mt.dataset.mt.split(':');
    const o=k==='court'?S.courts.find(c=>c.no===+n):S.queues.find(q=>q.index===+n);
    return typeDialog(o,k); }
});

$('#autoTgl').onclick=()=>{ if(!requirePerm('edit')) return;
  Sound.play('tap'); tx(()=>{S.settings.autoMode=!S.settings.autoMode;}); };
$('#btnSort').onclick=()=>{ if(!requirePerm('edit')) return; Sound.play('confirm'); tx(()=>{
  // 자동으로 만들어진 슬롯만 비우고 다시 짠다. 손으로 구성했거나(MANUAL),
  // 리벤지로 올렸거나, 유형 핀이 걸린 슬롯은 그대로 둔다.
  // (이전에는 조건이 정반대라 눌렀을 때 잠가 둔 팀이 오히려 부서졌다.)
  let n=0;
  S.queues.forEach(q=>{
    if(!q.members.length) return;
    if(q.origin!=='AUTO' || q.pinnedType) return;   // 손으로 짠 팀·리벤지·유형 지정은 건드리지 않는다
    q.members.forEach(i=>A(i).state='POOL');
    Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',notice:null});
    n++;
  });
  toast(n? `대기 ${n}개 팀을 다시 구성했습니다` : '다시 구성할 자동 슬롯이 없습니다');
}); };
/* 회원 본인 출석/퇴장 */
$('#myBtn').onclick=()=>{
  if(!requirePerm('selfCheckIn')) return;
  const id=Auth.memberId; if(!id) return;
  const a=Auth.myAttendee();
  if(a){
    if(a.state==='PLAYING') return toast('경기 중에는 퇴장할 수 없습니다');
    if(!confirm('출석을 취소할까요? 대기열에서도 빠집니다.')) return;
    Sound.play('tap'); tx(()=>checkOutMember(id));
    toast('출석을 취소했습니다');
  }else{
    Sound.play('confirm'); tx(()=>checkInMember(id));
    toast('출석했습니다');
  }
};

$('#btnUndo').onclick=()=>{ if(!requirePerm('edit')) return; Sound.play('tap'); undo(); };

/* ── 모달 ───────────────────────────────────────────────────────── */
function openModal(html){ $('#modal').innerHTML=html; $('#mask').classList.add('on'); }
function closeModal(){ $('#mask').classList.remove('on'); }

/* 되돌릴 수 없는 조작 앞에 관리 비밀번호를 묻는다. 맞으면 onOk()를 부른다.
   opts.bodyHtml : 비밀번호 칸 위에 넣을 설명(이 조작이 어떤 결과를 낳는지).
                   여기 들어가는 HTML은 만드는 쪽에서 esc() 해서 넘긴다.
   opts.okLabel  : 확인 버튼 문구
   opts.onReady  : 모달이 그려진 뒤 불린다(설명 안의 버튼을 묶을 때 쓴다) */
function askPin(title, desc, onOk, opts={}){
  openModal(`<h3>${esc(title)}</h3><div class="sub">${esc(desc)}</div>
    ${opts.bodyHtml||''}
    <div class="hint" style="text-align:center;margin-bottom:4px">확인하려면 관리 비밀번호를 입력하세요</div>
    <div style="display:flex;justify-content:center;margin:6px 0 4px">
      <input type="password" id="pinIn" inputmode="numeric" autocomplete="off" maxlength="8"
             style="width:190px;height:56px;font-size:26px;letter-spacing:.4em;text-align:center">
    </div>
    <div id="pinErr" style="text-align:center;color:var(--cork);font-size:13px;font-weight:700;min-height:20px"></div>
    <div class="row end"><button class="btn" id="pinCancel">취소</button>
      <button class="btn warn" id="pinOk">${esc(opts.okLabel||'확인')}</button></div>`);
  if(opts.onReady) opts.onReady();
  const inp=$('#pinIn');
  setTimeout(()=>inp&&inp.focus(),50);
  const submit=()=>{
    if(inp.value === String(S.settings.adminPin||'0116')){ closeModal(); onOk(); }
    else { $('#pinErr').textContent='비밀번호가 맞지 않습니다'; inp.value=''; inp.focus(); }
  };
  $('#pinOk').onclick=submit;
  $('#pinCancel').onclick=closeModal;
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); });
}
$('#mask').addEventListener('click',e=>{ if(e.target===$('#mask')) closeModal(); });

function typeDialog(o,kind){
  if(o.members.length!==4){
    const opts=['MD','WD','XD','MX'];
    return openModal(`<h3>대기 슬롯 유형 지정</h3>
      <div class="sub">지정하면 자동 충원이 해당 성별만 채웁니다. 인원이 부족하면 비워 둡니다.</div>
      ${opts.map(t=>`<div class="opt ${o.pinnedType===t?'on':''}" data-p="${t}"><div class="t">${MT_LBL[t]}</div></div>`).join('')}
      <div class="opt ${!o.pinnedType?'on':''}" data-p=""><div class="t">지정 안 함</div></div>
      <div class="row end"><button class="btn" onclick="closeModal()">닫기</button></div>`),
      $$('#modal .opt').forEach(e=>e.onclick=()=>{ closeModal();
        tx(()=>{ o.pinnedType=e.dataset.p||null; o.notice=null;
          if(o.pinnedType&&o.members.length){ o.members.forEach(i=>A(i).state='POOL');
            Object.assign(o,{members:[],teams:{A:[],B:[]},matchType:null,pinnedType:o.pinnedType}); } }); });
  }
  const ids=o.members, [m,f]=counts(ids);
  const avail={ MD:m===4, WD:f===4, XD:(m===2&&f===2), MX:!(m===4||f===4) };
  const why={ MD:m===4?'':`여성 ${f}명 포함`, WD:f===4?'':`남성 ${m}명 포함`,
              XD:(m===2&&f===2)?'':'남2·여2가 아님', MX:(m===4||f===4)?'동성 4명':'' };
  const prev=t=>{ const sp=bestSplit(ids,t==='MD'||t==='WD'?null:t); if(!sp) return '';
    return sp.teams.A.map(i=>esc(A(i).name)).join('·')+' vs '+sp.teams.B.map(i=>esc(A(i).name)).join('·'); };
  openModal(`<h3>${kind==='court'?o.no+'코트':'Q'+o.index} 경기 유형</h3>
    <div class="sub">${ids.map(i=>`${A(i).gender==='M'?'♂':A(i).gender==='F'?'♀':'?'}${esc(A(i).name)}`).join('  ')}</div>
    ${['MD','WD','XD','MX'].map(t=>`
      <div class="opt ${o.matchType===t?'on':''} ${avail[t]?'':'off'}" ${avail[t]?`data-t="${t}"`:''}>
        <div><div class="t">${MT_LBL[t]}</div>
        <div class="d">${avail[t]?prev(t):'불가 — '+why[t]}</div></div></div>`).join('')}
    <div class="row end"><button class="btn" onclick="closeModal()">취소</button></div>`);
  $$('#modal .opt[data-t]').forEach(e=>e.onclick=()=>{ const t=e.dataset.t; closeModal();
    tx(()=>{ const sp=bestSplit(ids,t==='MD'||t==='WD'?null:t);
      if(sp){o.teams=sp.teams;} o.matchType=mtypeOf(ids,o.teams); o.typeSource='MANUAL'; },{auto:false}); });
}
