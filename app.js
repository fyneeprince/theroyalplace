(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const lerp = (a,b,t) => a + (b-a)*t;

  window.addEventListener('load', () => setTimeout(() => $('.loader')?.classList.add('done'), 550));

  // Cursor
  const cursor = $('.cursor');
  if (cursor && matchMedia('(pointer:fine)').matches) {
    window.addEventListener('pointermove', e => { cursor.style.left = e.clientX+'px'; cursor.style.top = e.clientY+'px'; });
    $$('a,button,.piece-image,.space-card').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });
  }

  // Nav state
  const nav = $('#site-nav');
  const navUpdate = () => nav?.classList.toggle('scrolled', scrollY > 40);
  addEventListener('scroll', navUpdate, {passive:true}); navUpdate();

  // Small parallax on hero image
  const heroImg = $('.hero-media img');
  let ticking = false;
  const visualUpdate = () => {
    ticking = false;
    const y = scrollY;
    if (heroImg) heroImg.style.transform = `translate3d(0,${Math.min(y*.12,100)}px,0) scale(${1 + Math.min(y/8000,.035)})`;
    updateSpaces();
  };
  addEventListener('scroll', () => { if(!ticking){requestAnimationFrame(visualUpdate); ticking=true;} }, {passive:true});

  // Mobile menu: intentionally lightweight overlay built from the existing nav links.
  const menu = $('.menu-toggle');
  menu?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    if (open) {
      nav.insertAdjacentHTML('beforeend', '<div class="mobile-menu">'+$('.nav-links').innerHTML+'</div>');
      const panel = $('.mobile-menu');
      Object.assign(panel.style,{position:'fixed',top:'72px',left:'0',right:'0',padding:'28px 20px',background:'var(--dark-brown)',borderTop:'1px solid rgba(255,255,255,.12)',display:'grid',gap:'20px',zIndex:'101',color:'var(--cream)'});
      $$('.mobile-menu a').forEach(a=>{a.style.fontSize='11px';a.style.letterSpacing='.15em';a.style.textTransform='uppercase';a.addEventListener('click',()=>{document.body.classList.remove('menu-open');panel.remove()})});
    } else $('.mobile-menu')?.remove();
  });

  // VERSION 001 — Scroll-controlled JPG sequence.
  // The supplied 240-frame wardrobe sequence replaces the previous Three.js hero.
  const wardrobeCanvas = document.getElementById('hero-wardrobe-canvas');
  const heroSequence = document.querySelector('.hero-sequence-section');
  const sequenceShell = document.querySelector('.hero-sequence-shell');
  const sequenceLoading = document.getElementById('hero-sequence-loading');
  const sequenceStatus = document.getElementById('hero-sequence-status');
  const sequenceProgressBar = document.querySelector('.hero-sequence-progress span');

  const FRAME_COUNT = 240;
  const FRAME_PAD = 3;
  const FRAME_PATH = 'assets/hero-sequence/ezgif-frame-';
  const frameCache = new Map();
  let sequenceTarget = 0;
  let sequenceCurrent = 0;
  let sequenceRaf = 0;
  let sequenceLastDrawn = -1;
  let sequenceReady = false;

  const frameName = n => FRAME_PATH + String(n).padStart(FRAME_PAD,'0') + '.jpg';

  function loadSequenceFrame(n) {
    n = Math.max(1, Math.min(FRAME_COUNT, n));
    if (frameCache.has(n)) return frameCache.get(n);

    const img = new Image();
    img.decoding = 'async';
    img.src = frameName(n);
    frameCache.set(n, img);

    img.decode?.().catch(()=>{}).then(()=>{
      if (n === 1) {
        sequenceReady = true;
        sequenceLoading?.classList.add('loaded');
      }
      drawSequenceFrame(n);
    });
    return img;
  }

  function resizeSequenceCanvas() {
    if (!wardrobeCanvas || !sequenceShell) return;
    const rect = sequenceShell.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    wardrobeCanvas.width = Math.floor(w * dpr);
    wardrobeCanvas.height = Math.floor(h * dpr);
    wardrobeCanvas.style.width = w + 'px';
    wardrobeCanvas.style.height = h + 'px';
    const ctx = wardrobeCanvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    sequenceLastDrawn = -1;
    drawSequenceFrame(Math.round(sequenceCurrent * (FRAME_COUNT - 1)) + 1);
  }

  function drawSequenceFrame(n) {
    if (!wardrobeCanvas) return;
    n = Math.max(1, Math.min(FRAME_COUNT, n));
    const img = frameCache.get(n);
    if (!img || !img.complete || !img.naturalWidth) {
      loadSequenceFrame(n);
      return;
    }

    const rect = sequenceShell.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (!w || !h) return;

    const ctx = wardrobeCanvas.getContext('2d');
    // Contain rather than cover: the supplied 1280x720 frames stay at or below
    // their native display size whenever the viewport allows it, preserving detail.
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const x = (w - dw) / 2;
    const y = (h - dh) / 2;

    ctx.clearRect(0,0,w,h);
    ctx.drawImage(img,x,y,dw,dh);
    sequenceLastDrawn = n;

    const pct = Math.round(((n-1)/(FRAME_COUNT-1))*100);
    if (sequenceStatus) sequenceStatus.textContent =
      pct < 100 ? `SCROLL / EXPLORE · ${String(n).padStart(3,'0')}` : 'SCROLL / REPLAY';
    if (sequenceProgressBar) sequenceProgressBar.style.width = pct + '%';
    if (sequenceLoading) sequenceLoading.innerHTML =
      `FRAME <b>${String(n).padStart(3,'0')}</b> / ${FRAME_COUNT}`;
  }

  function sequenceProgress() {
    if (!heroSequence) return 0;
    const r = heroSequence.getBoundingClientRect();
    const travel = Math.max(1, heroSequence.offsetHeight - innerHeight);
    return clamp(-r.top / travel);
  }

  function warmSequenceAround(n) {
    // Keep a small rolling window decoded/available instead of holding all 240
    // full-resolution frames in memory at once.
    const radius = 8;
    for (let i = -radius; i <= radius; i += 1) {
      const f = n + i;
      if (f >= 1 && f <= FRAME_COUNT) loadSequenceFrame(f);
    }
  }

  function renderSequence() {
    sequenceRaf = 0;
    sequenceCurrent += (sequenceTarget - sequenceCurrent) * 0.24;

    if (Math.abs(sequenceTarget - sequenceCurrent) < 0.00035) {
      sequenceCurrent = sequenceTarget;
    }

    const frame = Math.round(sequenceCurrent * (FRAME_COUNT - 1)) + 1;
    warmSequenceAround(frame);
    if (frame !== sequenceLastDrawn) drawSequenceFrame(frame);

    if (Math.abs(sequenceTarget - sequenceCurrent) > 0.00035) {
      sequenceRaf = requestAnimationFrame(renderSequence);
    }
  }

  function updateHeroSequence() {
    sequenceTarget = sequenceProgress();
    if (!sequenceRaf) sequenceRaf = requestAnimationFrame(renderSequence);
  }

  if (wardrobeCanvas && heroSequence) {
    // The hero is intentionally taller than one viewport. Its sticky child
    // remains visible while scrolling, so scroll distance becomes animation time.
    heroSequence.style.minHeight = '320vh';

    loadSequenceFrame(1);
    loadSequenceFrame(2);
    loadSequenceFrame(3);

    addEventListener('scroll', updateHeroSequence, {passive:true});
    addEventListener('resize', resizeSequenceCanvas);
    resizeSequenceCanvas();
    sequenceTarget = sequenceProgress();
    sequenceCurrent = sequenceTarget;
    renderSequence();
  }

  // Horizontal room section controlled by vertical scroll.
  const spaces=$('.spaces'), track=$('#spaces-track'), cards=$$('.space-card',track);
  function updateSpaces(){
    if(!spaces||!track) return;
    const r=spaces.getBoundingClientRect();
    const max=Math.max(1,spaces.offsetHeight-innerHeight);
    const p=clamp(-r.top/max);
    const x=-(cards.length-1)*innerWidth*p;
    track.style.transform=`translate3d(${x}px,0,0)`;
    $('#space-bar').style.width=(25+75*p)+'%';
    const n=Math.min(cards.length,Math.floor(p*cards.length)+1);
    $('#space-count').textContent=String(n).padStart(2,'0')+' / '+String(cards.length).padStart(2,'0');
  }
  addEventListener('resize',()=>{updateCraft();updateSpaces()});

  // Sofa builder
  const builder = $('.builder');
  const state={material:'velvet',colour:'sand',shape:'three'};
  const palette={sand:'#d5c7b5',cocoa:'#4b3427',charcoal:'#262629',olive:'#505648'};
  const basePrice={velvet:1850000,linen:1720000,leather:2350000};
  const shapeMult={three:1,lshape:1.28,lounger:1.16};
  function money(n){return '₦'+Math.round(n).toLocaleString('en-NG')}
  function renderBuilder(){
    const sofa=$('#preview-sofa');
    sofa?.style.setProperty('--sofa',palette[state.colour]);
    if(state.material==='leather') sofa?.style.setProperty('filter','drop-shadow(0 20px 24px rgba(0,0,0,.42)) saturate(.8)');
    else sofa?.style.removeProperty('filter');
    sofa?.classList.toggle('lshape',state.shape==='lshape'); sofa?.classList.toggle('lounger',state.shape==='lounger');
    const price=basePrice[state.material]*shapeMult[state.shape];
    $('#builder-price').textContent=money(price);
    $('#preview-state').textContent=`${state.material.toUpperCase()} / ${state.colour.toUpperCase()} / ${state.shape==='three'?'3-SEATER':state.shape==='lshape'?'L-SHAPE':'LOUNGER'}`;
  }
  $$('.control').forEach(control=>{
    control.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
      const wrap=btn.closest('[data-control]'); if(!wrap) return;
      wrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      state[wrap.dataset.control]=btn.dataset.value;renderBuilder();
    }));
  });
  renderBuilder();

  // Intro reveal for key headings.
  const revealEls=$$('.manifesto-main h2,.section-heading h2,.craft-copy h2,.reveal-word,.builder-head h2,.standard-copy h2,.story-copy h2,.contact-intro h2');
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('is-visible')}),{threshold:.18});
  revealEls.forEach(el=>observer.observe(el));

  // Anchor links: a touch of intentional smoothness without hijacking the browser.
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
    const target=$(a.getAttribute('href')); if(!target) return; e.preventDefault(); target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }));

  updateSpaces();
})();
