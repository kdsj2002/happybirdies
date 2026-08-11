/* =====================================================================
   사운드 — 오디오 파일 없이 WebAudio로 직접 합성한다.
   체육관에서 오프라인으로 돌아가야 하므로 외부 파일을 받지 않는다.
   브라우저는 사용자가 한 번 화면을 만지기 전에는 소리를 못 내게 막으므로,
   첫 터치에서 오디오 컨텍스트를 깨운다.
   ===================================================================== */
const Sound = (() => {
  let ctx = null, enabled = true, unlocked = false;

  function ac(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    return ctx;
  }

  /* 부드러운 감쇠를 가진 짧은 톤 하나 */
  function tone(freq, {dur=0.09, type='sine', gain=0.16, delay=0, slideTo=null}={}){
    const a = ac(); if(!a) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    // 딱딱한 클릭음(팝 노이즈)이 나지 않게 아주 짧은 어택을 준다
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const PATTERNS = {
    tap:     () => tone(880,  {dur:0.05, gain:0.10}),
    move:    () => tone(660,  {dur:0.07, gain:0.12, slideTo:880}),
    confirm: () => { tone(784, {dur:0.09, gain:0.14}); tone(1175,{dur:0.11, gain:0.12, delay:0.07}); },
    start:   () => { tone(587, {dur:0.10, gain:0.15}); tone(880, {dur:0.10, gain:0.14, delay:0.09});
                     tone(1175,{dur:0.16, gain:0.13, delay:0.18}); },
    end:     () => { tone(659, {dur:0.10, gain:0.14}); tone(440, {dur:0.16, gain:0.13, delay:0.09}); },
    error:   () => { tone(320, {dur:0.13, gain:0.15, type:'triangle', slideTo:220}); },
    notify:  () => { tone(1046,{dur:0.13, gain:0.17}); tone(1318,{dur:0.13, gain:0.16, delay:0.12});
                     tone(1568,{dur:0.24, gain:0.15, delay:0.24}); }
  };

  return {
    /* 첫 사용자 조작에서 호출해 오디오를 깨운다 */
    unlock(){
      if(unlocked) return;
      unlocked = true;
      const a = ac();
      if(a && a.state === 'suspended') a.resume().catch(()=>{});
    },
    set(on){ enabled = !!on; },
    get on(){ return enabled; },
    play(name){
      if(!enabled) return;
      const p = PATTERNS[name] || PATTERNS.tap;
      try{ p(); }catch(e){ /* 오디오를 못 쓰는 환경이면 조용히 넘어간다 */ }
    },
    /* 진동은 지원하는 기기에서만. 소리가 잘 안 들리는 체육관 대비 */
    buzz(ms){ try{ navigator.vibrate && navigator.vibrate(ms); }catch{} }
  };
})();
