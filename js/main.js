(() => {
  const cfg = window.MPS_CONFIG || {};

  if (cfg.previewMode === true) {
    document.querySelectorAll("a[data-preview-disabled=\"true\"]").forEach(link => {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("mps-preview-disabled");
      link.title = "Belum aktif dalam pratinjau statis";
    });
  }
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("navLinks");

  if (toggle && nav) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const opened = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(opened));
      toggle.setAttribute("aria-label", opened ? "Tutup menu" : "Buka menu");
      toggle.textContent = opened ? "×" : "☰";
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Buka menu");
      toggle.textContent = "☰";
    }));
  }

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("[data-link]").forEach(link => {
    const key = link.dataset.link;
    const url = cfg.links && cfg.links[key];
    if (url) {
      link.href = url;
    } else if (key === "whatsapp" && cfg.links && cfg.links.telegram) {
      // Avoid a dead "#" contact button when WhatsApp has not been configured.
      link.href = cfg.links.telegram;
      link.setAttribute("aria-label", "Hubungi MPS melalui Telegram");
      link.title = "Hubungi MPS melalui Telegram";
    }
  });
  document.querySelectorAll("[data-rebate='max']").forEach(el => {
    el.textContent = String((cfg.rebate && cfg.rebate.maxPercent) ?? 70);
  });
  document.querySelectorAll("[data-rebate='disclaimer']").forEach(el => {
    el.textContent = (cfg.rebate && cfg.rebate.disclaimer) || "";
  });
  document.querySelectorAll("[data-brand='name']").forEach(el => {
    el.textContent = (cfg.brand && cfg.brand.name) || "Market Psychology Society";
  });
  document.querySelectorAll("[data-brand='tagline']").forEach(el => {
    el.textContent = (cfg.brand && cfg.brand.tagline) || "DISIPLIN DI ATAS IMPULS";
  });
  const year = document.getElementById("year");
  if (year) year.textContent = `© ${new Date().getFullYear()} ${(cfg.brand && cfg.brand.name) || "Market Psychology Society"}. Hak cipta dilindungi.`;
})();
// MPS AUTOMATIC IMAGE SLIDER
document.addEventListener("DOMContentLoaded", function () {
  const slider = document.getElementById("mpsSlider");
  if (!slider) return;

  const slides = slider.querySelector(".mps-slides");
  const images = slides.querySelectorAll("img");
  const dotsContainer = slider.querySelector(".mps-dots");
  const prev = slider.querySelector(".mps-prev");
  const next = slider.querySelector(".mps-next");

  let current = 0;
  let timer;

  images.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = "mps-dot";
    dot.setAttribute("aria-label", "Gambar " + (index + 1));
    dot.addEventListener("click", () => showSlide(index));
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll(".mps-dot");

  function showSlide(index) {
    current = (index + images.length) % images.length;
    slides.style.transform = `translateX(-${current * 100}%)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === current);
    });
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(() => showSlide(current + 1), 4000);
  }

  prev.addEventListener("click", () => {
    showSlide(current - 1);
    startAuto();
  });

  next.addEventListener("click", () => {
    showSlide(current + 1);
    startAuto();
  });

  showSlide(0);
  startAuto();
});


// MPS v4.8 tactile interaction: explicit pointer, touch-compatible, and keyboard press states.
(() => {
  const selector = '.btn,button,.nav-join,.pwa-install-btn,input[type="button"],input[type="submit"]';
  const pressed = new Map();
  const timers = new WeakMap();
  const findButton = target => {
    const node = target instanceof Element ? target : target && target.parentElement;
    return node && node.closest(selector);
  };
  const clearRelease = el => { const t=timers.get(el); if(t){clearTimeout(t);timers.delete(el);} };
  const press = (el, event) => {
    if(!el || el.disabled || el.getAttribute('aria-disabled')==='true') return;
    clearRelease(el);
    el.classList.add('mps-is-pressed');
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect=el.getBoundingClientRect();
    const x=event && Number.isFinite(event.clientX) ? event.clientX : rect.left+rect.width/2;
    const y=event && Number.isFinite(event.clientY) ? event.clientY : rect.top+rect.height/2;
    const ripple=document.createElement('span');
    ripple.className='mps-click-ripple';
    ripple.setAttribute('aria-hidden','true');
    ripple.style.left=Math.max(0,Math.min(rect.width,x-rect.left))+'px';
    ripple.style.top=Math.max(0,Math.min(rect.height,y-rect.top))+'px';
    el.appendChild(ripple);
    window.setTimeout(()=>ripple.remove(),680);
  };
  const release = el => {
    if(!el)return;
    clearRelease(el);
    timers.set(el,window.setTimeout(()=>{el.classList.remove('mps-is-pressed');timers.delete(el);},230));
  };
  document.addEventListener('pointerdown',event=>{
    const el=findButton(event.target); if(!el)return;
    pressed.set(event.pointerId,el); press(el,event);
  },{capture:true,passive:true});
  document.addEventListener('pointerup',event=>{
    const el=pressed.get(event.pointerId)||findButton(event.target);
    pressed.delete(event.pointerId); release(el);
  },{capture:true,passive:true});
  document.addEventListener('pointercancel',event=>{
    const el=pressed.get(event.pointerId); pressed.delete(event.pointerId);
    if(el){clearRelease(el);el.classList.remove('mps-is-pressed');}
  },{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
    if(event.repeat || !['Enter',' '].includes(event.key))return;
    const el=findButton(event.target); if(el)press(el,null);
  },true);
  document.addEventListener('keyup',event=>{
    if(!['Enter',' '].includes(event.key))return;
    release(findButton(event.target));
  },true);
  document.addEventListener('click',event=>{
    if(event.detail!==0)return;
    const el=findButton(event.target); if(el){press(el,null);release(el);}
  },true);
  window.addEventListener('blur',()=>{
    for(const el of pressed.values()){clearRelease(el);el.classList.remove('mps-is-pressed');}
    pressed.clear();
    document.querySelectorAll('.mps-is-pressed').forEach(el=>el.classList.remove('mps-is-pressed'));
  });
})();
