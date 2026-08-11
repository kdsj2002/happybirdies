/* =====================================================================
   드래그앤드롭 (Pointer Events) + 탭-투-무브 대체 경로
   HTML5 DnD는 태블릿에서 신뢰할 수 없어 직접 구현한다.
   드래그가 실패해도 "칩 탭 → 목적지 탭"으로 항상 이동할 수 있다.
   ===================================================================== */
(function(){
  let sx=0,sy=0,src=null,drag=false,srcEl=null,lastDrop=null,holdT=null;
  const ghost=$('#ghost');

  document.addEventListener('pointerdown',e=>{
    const c=e.target.closest('[data-chip]'); if(!c) return;
    const id=c.dataset.chip;
    const L=locate(id);
    if(L.kind==='court'&&L.obj.status==='PLAYING') return;   // 경기 중은 잠금
    // 운영자가 아니면 자기 칩만, 그것도 코트 밖에서만 잡을 수 있다
    if(!Auth.can('edit')){
      if(!Auth.can('selfQueue') || !Auth.isMe(id)) return;
      if(L.kind==='court') return;
    }
    sx=e.clientX; sy=e.clientY; src=id; srcEl=c; drag=false;
    holdT=setTimeout(()=>begin(e),160);
  });
  function begin(e){
    if(!src||drag) return;
    drag=true; srcEl.classList.add('ghost');
    ghost.innerHTML=''; const g=chipEl(src,'ghost'); g.style.width='100%'; ghost.appendChild(g);
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
    if(!src) return;
    if(!drag && Math.hypot(e.clientX-sx,e.clientY-sy)>8){ clearTimeout(holdT); begin(e); }
    if(drag){ e.preventDefault(); move(e); }
  },{passive:false});
  document.addEventListener('pointerup',e=>{
    clearTimeout(holdT);
    if(!src) return;
    if(drag){
      const under=document.elementFromPoint(e.clientX,e.clientY);
      const d=under?.closest('[data-drop]');
      if(d) moveTo(src,d.dataset.drop);
      cleanup();
    } else {                                   // 탭 = 선택 토글
      if(sel===src){ sel=null; } else { sel=src; }
      cleanup(); render();
    }
  });
  document.addEventListener('pointercancel',cleanup);
  function cleanup(){
    clearTimeout(holdT);
    if(srcEl) srcEl.classList.remove('ghost');
    if(lastDrop) lastDrop.classList.remove('drop');
    ghost.style.display='none'; src=null; srcEl=null; drag=false; lastDrop=null;
  }
  /* 탭-투-무브: 선택된 칩이 있을 때 드롭 영역을 탭하면 이동 */
  document.addEventListener('click',e=>{
    if(!sel) return;
    if(e.target.closest('[data-chip]')) return;
    const d=e.target.closest('[data-drop]'); if(!d) return;
    const id=sel; sel=null; moveTo(id,d.dataset.drop);
  });
})();

/* =====================================================================
   보드 조작 이벤트
   ===================================================================== */
document.addEventListener('click',e=>{
  const t=e.target;
  const scr=t.closest('[data-scr]'); if(scr) return show(scr.dataset.scr);

  const start=t.closest('[data-start]');
  if(start){ if(!requirePerm('edit')) return;
    const c=S.courts.find(c=>c.no===+start.dataset.start);
    Sound.play('start'); Sound.buzz(30); return tx(()=>startCourt(c)); }

  const end=t.closest('[data-end]');
  if(end){ if(!requirePerm('edit')) return;
    Sound.play('end'); return endDialog(S.courts.find(c=>c.no===+end.dataset.end)); }

  const push=t.closest('[data-push]');
  if(push){ if(!requirePerm('edit')||!requirePerm('courtAssign')) return;
    Sound.play('move');
    const q=S.queues.find(q=>q.index===+push.dataset.push);
    const c=S.courts.find(c=>c.status==='EMPTY'&&!c.disabled);
    if(!c) return toast('빈 코트가 없습니다');
    return tx(()=>{ c.members=q.members;c.teams=q.teams;c.matchType=q.matchType;c.typeSource=q.typeSource;
      c.status='FILLING'; q.members.forEach(i=>A(i).state='FILLING');
      Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',locked:false,notice:null}); });
  }

  const clr=t.closest('[data-clear]');
  if(clr){ if(!requirePerm('edit')) return; Sound.play('tap');
    const q=S.queues.find(q=>q.index===+clr.dataset.clear);
    return tx(()=>{ q.members.forEach(i=>A(i).state='POOL');
      Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',locked:false,notice:null}); }); }

  const lk=t.closest('[data-lock]');
  if(lk){ if(!requirePerm('edit')) return; Sound.play('tap');
    const [k,n]=lk.dataset.lock.split(':');
    const o=k==='court'?S.courts.find(c=>c.no===+n):S.queues.find(q=>q.index===+n);
    return tx(()=>{o.locked=!o.locked;},{auto:o.locked}); }

  const sw=t.closest('[data-swap]');
  if(sw){ if(!requirePerm('edit')) return;
    const [k,n]=sw.dataset.swap.split(':');
    if(k==='court' && !requirePerm('courtAssign')) return;
    Sound.play('move');
    const o=k==='court'?S.courts.find(c=>c.no===+n):S.queues.find(q=>q.index===+n);
    if(o.members.length!==4) return toast('4명이 있어야 팀을 바꿀 수 있습니다');
    if(k==='court'&&o.status==='PLAYING') return toast('경기 중에는 팀을 바꿀 수 없습니다');
    return tx(()=>{
      const m=o.members, P=[[0,1,2,3],[0,2,1,3],[0,3,1,2]];
      const cur=P.findIndex(p=>o.teams.A.includes(m[p[0]])&&o.teams.A.includes(m[p[1]]));
      const nx=P[(cur+1)%3];
      o.teams={A:[m[nx[0]],m[nx[1]]],B:[m[nx[2]],m[nx[3]]]};
      o.matchType=mtypeOf(m,o.teams); o.typeSource='MANUAL'; o.locked=true;
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
    if(q.locked || q.origin==='REVENGE' || q.pinnedType) return;
    q.members.forEach(i=>A(i).state='POOL');
    Object.assign(q,{members:[],teams:{A:[],B:[]},matchType:null,typeSource:'AUTO',origin:'AUTO',locked:false,notice:null});
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

/* 되돌릴 수 없는 조작 앞에 관리 비밀번호를 묻는다. 맞으면 onOk()를 부른다. */
function askPin(title, desc, onOk){
  openModal(`<h3>${esc(title)}</h3><div class="sub">${esc(desc)}</div>
    <div style="display:flex;justify-content:center;margin:6px 0 4px">
      <input type="password" id="pinIn" inputmode="numeric" autocomplete="off" maxlength="8"
             style="width:190px;height:56px;font-size:26px;letter-spacing:.4em;text-align:center">
    </div>
    <div id="pinErr" style="text-align:center;color:var(--cork);font-size:13px;font-weight:700;min-height:20px"></div>
    <div class="row end"><button class="btn" id="pinCancel">취소</button>
      <button class="btn warn" id="pinOk">확인</button></div>`);
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

let endTimer=null;
function endDialog(c){
  clearTimeout(endTimer);
  const nm=id=>esc(A(id).name);
  const mins=Math.floor((now()-c.startedAt)/60000), secs=Math.floor((now()-c.startedAt)/1000)%60;
  openModal(`<h3>${c.no}코트 경기 종료</h3>
    <div class="sub">${MT_LBL[c.matchType||'UNKNOWN']} · ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div>
    <div style="font-size:17px;font-weight:700;margin-bottom:18px;line-height:1.6">
      ${c.teams.A.map(nm).join(' · ')} &nbsp;vs&nbsp; ${c.teams.B.map(nm).join(' · ')}</div>
    <div class="opt on" data-d="POOL"><div><div class="t">전원 대기 인원으로 <span id="cd" style="color:var(--muted)"></span></div>
      <div class="d">기본. 4명이 풀로 돌아가 다음 조합에 들어갑니다</div></div></div>
    <div class="opt" data-d="REVENGE"><div><div class="t">리벤지 — 같은 멤버 그대로</div>
      <div class="d">4명이 팀을 유지한 채 대기 슬롯 뒤쪽에 등록됩니다</div></div></div>
    <div class="row end"><button class="btn" onclick="closeModal()">취소</button></div>`);
  let n=5;
  const tick=()=>{ const e=$('#cd'); if(!e) return; e.textContent=`(${n}초 후 자동)`;
    if(--n<0){ closeModal(); tx(()=>endCourt(c,'POOL')); } else endTimer=setTimeout(tick,1000); };
  tick();
  $$('#modal .opt').forEach(o=>o.onclick=()=>{ clearTimeout(endTimer); closeModal(); tx(()=>endCourt(c,o.dataset.d)); });
}

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
      if(sp){o.teams=sp.teams;} o.matchType=mtypeOf(ids,o.teams); o.typeSource='MANUAL'; o.locked=true; },{auto:false}); });
}
