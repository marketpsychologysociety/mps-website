(() => {
  "use strict";
  const ticker = document.querySelector("[data-mps-demo-ticker]");
  if (ticker) {
    const track = ticker.querySelector(".ticker-track");
    const toggle = ticker.querySelector(".ticker-toggle");
    if (track && toggle) {
      let manualPaused = false;
      let hoverPaused = false;
      let focusPaused = false;
      const applyPause = () => {
        track.classList.toggle("is-paused", manualPaused || hoverPaused || focusPaused);
        toggle.setAttribute("aria-pressed", String(manualPaused));
        toggle.textContent = manualPaused ? "Lanjut" : "Jeda";
      };
      toggle.addEventListener("click", () => {
        manualPaused = !manualPaused;
        applyPause();
      });
      ticker.addEventListener("focusin", () => {
        focusPaused = true;
        applyPause();
      });
      ticker.addEventListener("focusout", () => {
        focusPaused = ticker.contains(document.activeElement);
        applyPause();
      });
      ticker.addEventListener("mouseenter", () => {
        hoverPaused = true;
        applyPause();
      });
      ticker.addEventListener("mouseleave", () => {
        hoverPaused = false;
        applyPause();
      });
    }
  }

  const filters = [...document.querySelectorAll(".announce-filter")];
  const cards = [...document.querySelectorAll(".announce-card")];
  const empty = document.getElementById("announceEmpty");
  filters.forEach(button => button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filters.forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    let visible = 0;
    cards.forEach(card => {
      const show = filter === "all" || card.dataset.category === filter;
      card.hidden = !show;
      if (show) visible++;
    });
    if (empty) empty.hidden = visible !== 0;
  }));

  document.querySelectorAll("[data-demo-detail]").forEach(button => {
    button.addEventListener("click", () => window.alert(button.dataset.demoDetail));
  });

  const spinButton = document.getElementById("demoSpin");
  const wheel = document.getElementById("demoWheel");
  const result = document.getElementById("rouletteResult");
  let spinning = false;
  if (spinButton && wheel && result) {
    spinButton.addEventListener("click", () => {
      if (spinning) return;
      spinning = true;
      spinButton.disabled = true;
      result.textContent = "Animasi simulasi berjalan — tidak memilih peserta atau pemenang.";
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const current = Number(wheel.dataset.rotation || 0);
      const turns = reduced ? 0 : 360 * 5 + 1270;
      wheel.style.transition = reduced ? "none" : "transform 4.2s cubic-bezier(.12,.72,.08,1)";
      wheel.style.transform = `rotate(${current + turns}deg)`;
      window.setTimeout(() => {
        const next = current + turns;
        wheel.dataset.rotation = String(next);
        wheel.style.transition = "";
        spinButton.disabled = false;
        spinning = false;
        result.textContent = "Simulasi selesai. Tidak ada pemenang yang dipilih atau dicatat.";
      }, reduced ? 50 : 4350);
    });
  }
})();