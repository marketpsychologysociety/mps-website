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

  // Portal routes remain closed unless an explicit production Web App URL is configured.
  const webAppEndpoint = String((cfg.webApp && cfg.webApp.endpoint) || "").trim();
  const validWebAppEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(webAppEndpoint);
  document.querySelectorAll("a[data-portal-route]").forEach(link => {
    const page = String(link.dataset.portalRoute || "").toLowerCase();
    const allowedPages = ["register", "learning", "dashboard", "pulse", "admin"];
    if (cfg.previewMode !== true && validWebAppEndpoint && allowedPages.includes(page)) {
      link.href = webAppEndpoint.replace(/\/$/, "") + "?page=" + encodeURIComponent(page);
      link.removeAttribute("aria-disabled");
      link.classList.remove("mps-preview-disabled");
      link.removeAttribute("title");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("mps-preview-disabled");
      link.title = "Portal belum diaktifkan: konfigurasi URL Apps Script dan mode produksi terlebih dahulu";
    }
  });
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

// MPS tactile click feedback: ripple originates from the real pointer/touch location (no fake cursor).
(() => {
  const selector = '.btn, button, .nav-join, .pwa-install-btn';
  const addRipple = (target, x, y) => {
    if (!(target instanceof Element) || !target.matches(selector)) return;
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'mps-click-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = Math.max(0, Math.min(rect.width, x - rect.left)) + 'px';
    ripple.style.top = Math.max(0, Math.min(rect.height, y - rect.top)) + 'px';
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    window.setTimeout(() => ripple.remove(), 750);
  };
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest?.(selector);
    if (target) addRipple(target, event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener('click', event => {
    if (event.detail !== 0) return;
    const target = event.target.closest?.(selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    addRipple(target, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
})();


/* MPS hero world clocks: update the single static panel; never inject a second panel. */
(() => {
  const zones = [
    {id:'tokyo',zone:'Asia/Tokyo',open:9,close:18},
    {id:'london',zone:'Europe/London',open:8,close:17},
    {id:'newyork',zone:'America/New_York',open:8,close:17}
  ];
  const mountClocks = () => {
    const panel = document.querySelector('[data-mps-session-clocks]');
    document.querySelectorAll('.mps-session-board').forEach(node => node.remove());
    document.querySelectorAll('.mps-global-sessions').forEach(node => { if (node !== panel) node.remove(); });
    if (!panel) return;
    zones.forEach(({id}) => {
      const card=panel.querySelector('[data-session="'+id+'"]'), face=card&&card.querySelector('.mps-gs-face');
      if (!face) return;
      const ticks=face.querySelector('.mps-gs-ticks');
      if (ticks && !ticks.children.length) for(let n=0;n<12;n++){
        const tick=document.createElement('i'); tick.className='mps-gs-tick';
        tick.style.transform='translateX(-50%) rotate('+(n*30)+'deg)'; ticks.appendChild(tick);
      }
    });
    const timeFmt=new Map(zones.map(z=>[z.id,new Intl.DateTimeFormat('en-GB',{timeZone:z.zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})]));
    const dateFmt=new Map(zones.map(z=>[z.id,new Intl.DateTimeFormat('id-ID',{timeZone:z.zone,weekday:'short',day:'2-digit',month:'short',year:'numeric'})]));
    const update=()=>{
      const now=new Date();
      zones.forEach(({id,zone,open,close})=>{
        const card=panel.querySelector('[data-session="'+id+'"]'); if(!card)return;
        const parts=Object.fromEntries(timeFmt.get(id).formatToParts(now).map(p=>[p.type,p.value]));
        const hh=+parts.hour,mm=+parts.minute,ss=+parts.second;
        const digital=card.querySelector('.mps-gs-digital'),date=card.querySelector('.mps-gs-date');
        if(digital)digital.textContent=parts.hour+':'+parts.minute+':'+parts.second;
        if(date)date.textContent=dateFmt.get(id).format(now);
        const degrees={hour:(hh%12)*30+mm*.5,minute:mm*6+ss*.1,second:ss*6};
        Object.entries(degrees).forEach(([hand,angle])=>{const el=card.querySelector('.mps-gs-'+hand);if(el)el.style.transform='translateX(-50%) rotate('+angle+'deg)';});
        const weekday=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).format(now);
        const openNow=!['Sat','Sun'].includes(weekday)&&hh>=open&&hh<close;
        const status=card.querySelector('.mps-gs-status');
        if(status){status.classList.toggle('is-closed',!openNow);const label=status.querySelector('span');if(label)label.textContent=openNow?'SESI BERLANGSUNG':'SESI TUTUP';}
      });
      const overlap=panel.querySelector('#mps-gs-overlap');
      if(overlap){
        const london=+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(now);
        const ny=+new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now);
        const weekday=now.getUTCDay()>0&&now.getUTCDay()<6;
        overlap.innerHTML='<strong>MARKET OVERLAP</strong> · '+(weekday&&london>=13&&london<17&&ny>=8&&ny<12?'London dan New York sedang aktif bersamaan.':'Irisan sesi London dan New York belum berlangsung saat ini.');
      }
    };
    update(); window.setInterval(update,1000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountClocks,{once:true});else mountClocks();
})();

/* MPS verified high-impact event alarm.
   The three world clocks are rendered once in index.html inside the hero mockup. */
(() => {
  const mount = () => {
    if (document.querySelector('[data-mps-news-alarm]')) return;
    const nav = document.querySelector('.navbar');
    if (!nav) return;

    const journal = document.createElement('li');
    journal.innerHTML = '<a href="journal.html">Jurnal Perdagangan</a>';
    const links = nav.querySelector('.nav-links');
    if (links && !links.querySelector('a[href="journal.html"]')) links.appendChild(journal);

    const alarm = document.createElement('div');
    alarm.className = 'mps-news-alarm';
    alarm.dataset.mpsNewsAlarm = '';
    alarm.hidden = true;
    alarm.setAttribute('role', 'status');
    alarm.setAttribute('aria-live', 'polite');
    alarm.innerHTML = `
      <span class="mps-alarm-beacon" aria-hidden="true"></span>
      <div><strong>PERINGATAN BERITA BERDAMPAK TINGGI</strong><b data-mps-news-title></b><span data-mps-news-countdown></span><small data-mps-news-meta></small></div>
    `;
    const placement = document.querySelector('.mps-ticker') || document.querySelector('.page-head') || nav;
    placement.insertAdjacentElement('afterend', alarm);

    const zones = [
      { zone:'Asia/Tokyo', open:9, close:18 },
      { zone:'Europe/London', open:8, close:17 },
      { zone:'America/New_York', open:8, close:17 }
    ];
    const allSessionsClosed = now => zones.every(({zone, open, close}) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone:zone, weekday:'short', hour:'2-digit', hourCycle:'h23'
        }).formatToParts(now).map(part => [part.type, part.value])
      );
      const hour = Number(parts.hour);
      const weekdayOpen = !['Sat','Sun'].includes(parts.weekday);
      return !(weekdayOpen && hour >= open && hour < close);
    });

    const renderAlarm = now => {
      // Event data must come from a trusted, verified MPS feed; no sample events are fabricated.
      const event = window.MPS_HIGH_IMPACT_EVENT;
      const start = event && Date.parse(event.startsAt);
      const verified = event && event.verified === true && event.impact === 'high' &&
        typeof event.title === 'string' && event.title.trim() && Number.isFinite(start) && start > now.getTime();
      if (!verified || !allSessionsClosed(now)) { alarm.hidden = true; return; }

      alarm.hidden = false;
      alarm.querySelector('[data-mps-news-title]').textContent = event.title;
      const remaining = Math.max(0, start - now.getTime());
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      alarm.querySelector('[data-mps-news-countdown]').textContent = `Mulai dalam ${hours}j ${minutes}m ${seconds}d`;
      alarm.querySelector('[data-mps-news-meta]').textContent = event.timeWib
        ? `Jadwal: ${event.timeWib} WIB · Sumber terverifikasi`
        : 'Jadwal terverifikasi · WIB';
    };

    const update = () => renderAlarm(new Date());
    update();
    window.setInterval(update, 1000);
    window.addEventListener('mps:verified-high-impact-event', event => {
      if (event.detail && typeof event.detail === 'object') window.MPS_HIGH_IMPACT_EVENT = event.detail;
      update();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();

/* Browser-only deterrents. These cannot prevent OS-level screenshots or external cameras. */
(() => {
  document.addEventListener('contextmenu', event => {
    if (event.target.closest('.mps-session-board, [data-mps-private-preview]')) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    const key = String(event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ['p'].includes(key)) event.preventDefault();
  });
  window.addEventListener('beforeprint', () => document.documentElement.classList.add('mps-print-guard'));
  window.addEventListener('afterprint', () => document.documentElement.classList.remove('mps-print-guard'));
})();


/* MPS TRADING AWARENESS — entry reminder on the public home page.
   Acknowledgement is kept for this browser tab session only. */
(() => {
  'use strict';
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (page !== 'index.html' && page !== '') return;
  const storageKey = 'mpsTradingAwarenessAcknowledgedV1';
  try { if (window.sessionStorage.getItem(storageKey) === 'yes') return; } catch (_) {}

  const mount = () => {
    if (document.getElementById('mpsTradingAwareness')) return;
    const style = document.createElement('style');
    style.id = 'mpsTradingAwarenessStyles';
    style.textContent = `
      #mpsTradingAwareness{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(2,5,12,.88);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
      #mpsTradingAwareness[hidden]{display:none}
      #mpsTradingAwareness .mps-ta-panel{position:relative;width:min(720px,100%);max-height:min(90dvh,900px);overflow:auto;border:1px solid rgba(244,189,69,.58);border-radius:20px;background:radial-gradient(ellipse at 50% 0%,rgba(244,189,69,.13),transparent 45%),linear-gradient(150deg,#111a2a,#070b14 72%);box-shadow:0 28px 90px rgba(0,0,0,.62),0 0 35px rgba(244,189,69,.1);color:#edf2fa;padding:clamp(22px,4vw,36px)}
      #mpsTradingAwareness .mps-ta-kicker{display:flex;align-items:center;justify-content:center;gap:9px;color:#f4bd45;font-size:10px;font-weight:900;letter-spacing:.2em;text-align:center}
      #mpsTradingAwareness .mps-ta-symbol{display:grid;place-items:center;width:48px;height:48px;margin:17px auto 12px;border:1px solid rgba(244,189,69,.6);border-radius:50%;color:#f4bd45;font-size:25px;box-shadow:0 0 24px rgba(244,189,69,.15)}
      #mpsTradingAwareness h2{margin:0;text-align:center;color:#fff;font-size:clamp(21px,4vw,30px);line-height:1.2;letter-spacing:.035em}
      #mpsTradingAwareness .mps-ta-intro{max-width:570px;margin:12px auto 22px;text-align:center;color:#b8c4d5;font-size:13px;line-height:1.75}
      #mpsTradingAwareness .mps-ta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
      #mpsTradingAwareness .mps-ta-item{min-width:0;padding:15px;border:1px solid rgba(148,163,184,.2);border-radius:13px;background:rgba(255,255,255,.035)}
      #mpsTradingAwareness .mps-ta-item strong{display:block;margin-bottom:6px;color:#f4bd45;font-size:12px;letter-spacing:.045em}
      #mpsTradingAwareness .mps-ta-item p{margin:0;color:#c2ccda;font-size:12px;line-height:1.65}
      #mpsTradingAwareness .mps-ta-disclaimer{margin:16px 0;padding:13px 14px;border-left:3px solid #e45a55;border-radius:7px;background:rgba(228,90,85,.08);color:#e2d7d7;font-size:11px;line-height:1.7}
      #mpsTradingAwareness .mps-ta-confirm{display:flex;align-items:flex-start;gap:10px;margin:17px 0 13px;color:#dce5f1;font-size:12px;line-height:1.55;cursor:pointer}
      #mpsTradingAwareness .mps-ta-confirm input{width:18px;height:18px;flex:0 0 18px;margin:1px 0 0;accent-color:#f4bd45}
      #mpsTradingAwareness .mps-ta-enter{display:block;width:100%;min-height:48px;border:1px solid #f4bd45;border-radius:999px;background:linear-gradient(135deg,#f4bd45,#d99a27);color:#17130a;font:900 12px/1.2 inherit;letter-spacing:.08em;cursor:pointer;transition:filter .2s,transform .2s}
      #mpsTradingAwareness .mps-ta-enter:disabled{filter:grayscale(.75);opacity:.45;cursor:not-allowed}
      #mpsTradingAwareness .mps-ta-enter:not(:disabled):active{transform:scale(.99)}
      #mpsTradingAwareness .mps-ta-foot{margin:12px 0 0;text-align:center;color:#77869c;font-size:9px;letter-spacing:.12em}
      @media(max-width:520px){#mpsTradingAwareness{padding:10px}#mpsTradingAwareness .mps-ta-panel{padding:20px 16px;border-radius:16px;max-height:94dvh}#mpsTradingAwareness .mps-ta-grid{grid-template-columns:1fr;gap:8px}#mpsTradingAwareness .mps-ta-item{padding:12px}#mpsTradingAwareness .mps-ta-intro{margin:9px auto 15px;font-size:12px}#mpsTradingAwareness .mps-ta-item p{font-size:11px}}
      @media(prefers-reduced-motion:reduce){#mpsTradingAwareness *{transition:none!important;animation:none!important}}
    `;
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'mpsTradingAwareness';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','mpsTaTitle');
    overlay.setAttribute('aria-describedby','mpsTaIntro');
    overlay.innerHTML = `
      <section class="mps-ta-panel" role="document">
        <div class="mps-ta-kicker">MARKET PSYCHOLOGY SOCIETY <span aria-hidden="true">✦</span> TRADING AWARENESS</div>
        <div class="mps-ta-symbol" aria-hidden="true">⚠</div>
        <h2 id="mpsTaTitle">BACA SEBELUM ANDA TRADING</h2>
        <p class="mps-ta-intro" id="mpsTaIntro">Sebelum melanjutkan, ingat bahwa tujuan utama proses trading bukan sekadar mencari entry, melainkan menjaga kualitas keputusan, disiplin, dan pengelolaan risiko.</p>
        <div class="mps-ta-grid">
          <article class="mps-ta-item"><strong>01 · PAHAMI RISIKO</strong><p>Trading memiliki risiko tinggi. Anda dapat kehilangan sebagian atau seluruh modal. Gunakan hanya dana yang sanggup Anda tanggung risikonya.</p></article>
          <article class="mps-ta-item"><strong>02 · DISIPLIN DI ATAS EMOSI</strong><p>Ikuti rencana yang sudah dibuat. Hindari keputusan karena takut tertinggal peluang, serakah, panik, atau ingin membalas kerugian.</p></article>
          <article class="mps-ta-item"><strong>03 · CATAT DALAM JURNAL</strong><p>Dokumentasikan alasan entry dan exit, kondisi emosi, ukuran risiko, hasil transaksi, serta evaluasi agar kesalahan dan kebiasaan dapat dipelajari.</p></article>
          <article class="mps-ta-item"><strong>04 · KELOLA RISIKO</strong><p>Tentukan batas risiko dan titik pembatalan sebelum membuka posisi. Jangan memaksakan transaksi, overtrading, atau menambah risiko di luar rencana.</p></article>
        </div>
        <p class="mps-ta-disclaimer"><strong>Pengingat:</strong> Materi, analisis, dan sinyal MPS bersifat edukatif dan referensi, bukan jaminan keuntungan atau saran investasi personal. Setiap keputusan dan risiko transaksi menjadi tanggung jawab masing-masing pelaku perdagangan.</p>
        <label class="mps-ta-confirm"><input type="checkbox" data-mps-ta-check><span>Saya telah membaca dan memahami bahwa trading memiliki risiko kerugian, serta berkomitmen mengutamakan disiplin, jurnal, dan manajemen risiko.</span></label>
        <button class="mps-ta-enter" type="button" data-mps-ta-enter disabled>SAYA MEMAHAMI — LANJUTKAN KE MPS</button>
        <p class="mps-ta-foot">TERHUBUNG · BELAJAR · BERTUMBUH · BERPRESTASI</p>
      </section>`;
    document.body.appendChild(overlay);
    const check = overlay.querySelector('[data-mps-ta-check]');
    const enter = overlay.querySelector('[data-mps-ta-enter]');
    check.addEventListener('change', () => { enter.disabled = !check.checked; });
    enter.addEventListener('click', () => {
      if (!check.checked) return;
      try { window.sessionStorage.setItem(storageKey,'yes'); } catch (_) {}
      overlay.remove();
      style.remove();
    });
    check.focus({preventScroll:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
