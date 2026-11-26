document.addEventListener("DOMContentLoaded", function() {
  initHeroGrid();
  initClipSwitchers();
  initSideToc();
  initFramework();
});

// Framework: each button under the overview figure opens the details of its module below it, one at a time. A panel's
// videos load when it first opens and play only while it is open and on screen.
function initFramework() {
  var wrap = document.getElementById("fw-details");
  var bar = document.querySelector(".fw-buttons");
  if (!wrap || !bar) return;
  var btns = Array.prototype.slice.call(bar.querySelectorAll(".fw-btn"));
  var panels = Array.prototype.slice.call(wrap.querySelectorAll(".fw-panel"));
  var current = null, onScreen = false, hideTimer = 0;

  function videos(p) { return Array.prototype.slice.call(p.querySelectorAll("video.fw-video")); }
  function syncVideos() {
    panels.forEach(function(p) {
      var run = !p.hidden && p.dataset.fwPanel === current && onScreen;
      videos(p).forEach(function(v) {
        if (run) {
          if (!v.getAttribute("src")) v.setAttribute("src", v.dataset.src);
          if (v.paused) playQuietly(v);
        } else if (!v.paused) {
          v.pause();
        }
      });
    });
  }

  function show(name) {
    current = name;
    bar.classList.add("is-touched");
    btns.forEach(function(b) {
      var on = b.dataset.fw === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-expanded", on ? "true" : "false");
    });
    clearTimeout(hideTimer);
    if (name) {
      panels.forEach(function(p) { p.hidden = p.dataset.fwPanel !== name; });
      wrap.classList.add("is-open");
      onScreen = true;
      // keep the buttons in view, the panel right under them
      var top = bar.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.45) {
        window.scrollTo({ top: window.scrollY + top - 96, behavior: "smooth" });
      }
    } else {
      wrap.classList.remove("is-open");
      hideTimer = setTimeout(function() { if (!current) panels.forEach(function(p) { p.hidden = true; }); }, 460);
    }
    syncVideos();
  }

  btns.forEach(function(b) {
    b.addEventListener("click", function() { show(current === b.dataset.fw ? null : b.dataset.fw); });
  });
  panels.forEach(function(p) {
    var x = p.querySelector(".fw-close");
    if (x) x.addEventListener("click", function() { show(null); });
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function(entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      syncVideos();
    }).observe(wrap);
  }
}

// Side contents list: shown once the hero is mostly scrolled past; the active entry is the last section whose top is
// above 40 % of the window height (the last one at the bottom of the page).
function initSideToc() {
  var toc = document.querySelector(".side-toc");
  if (!toc) return;
  var hero = document.querySelector(".hero-cover");
  var links = Array.prototype.slice.call(toc.querySelectorAll("a[data-target]"));
  var sections = links.map(function(a) { return document.getElementById(a.dataset.target); });
  var ticking = false;

  function update() {
    ticking = false;
    var heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    toc.classList.toggle("is-visible", heroBottom < window.innerHeight * 0.35);
    var line = window.innerHeight * 0.4;
    var current = 0;
    sections.forEach(function(sec, i) {
      if (sec && sec.getBoundingClientRect().top <= line) current = i;
    });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = sections.length - 1;
    links.forEach(function(a, i) { a.classList.toggle("is-active", i === current); });
  }

  window.addEventListener("scroll", function() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
}

// Hero background: the displayed cell videos are downloaded in full while their posters show, then start together from
// frame 0. After 15 s the ones that are ready start anyway. They pause while the hero is out of view.
function initHeroGrid() {
  var grid = document.querySelector(".hero-grid");
  if (!grid) return;
  var videos = Array.prototype.filter.call(grid.querySelectorAll("video[data-src]"), function(v) {
    return v.getClientRects().length > 0;
  });
  if (!videos.length) return;
  var started = false;
  var heroVisible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function(entries) {
      heroVisible = entries[entries.length - 1].isIntersecting;
      if (!started) return;
      videos.forEach(function(v) {
        if (!heroVisible) v.pause();
        else if (v.paused && v.readyState >= 2) playQuietly(v);
      });
    }).observe(grid);
  }

  function whenPlayable(v) {
    return new Promise(function(resolve) {
      if (v.readyState >= 3) { resolve(); return; }
      v.addEventListener("canplaythrough", resolve, { once: true });
      v.addEventListener("error", resolve, { once: true });
    });
  }

  // seek every ready video to frame 0 and play them together once all the seeks are done
  function startAll() {
    if (started) return;
    started = true;
    var ready = videos.filter(function(v) { return v.readyState >= 2; });
    videos.forEach(function(v) {
      if (ready.indexOf(v) < 0) v.addEventListener("canplay", function() { if (heroVisible) playQuietly(v); }, { once: true });
    });
    Promise.all(ready.map(function(v) {
      return new Promise(function(resolve) {
        v.addEventListener("seeked", resolve, { once: true });
        setTimeout(resolve, 1000);
        v.currentTime = 0;
      });
    })).then(function() {
      if (heroVisible) ready.forEach(playQuietly);
    });
  }

  var loads = videos.map(function(v) {
    var url = v.dataset.src;
    v.preload = "auto";
    var got = window.fetch
      ? fetch(url).then(function(r) {
          if (!r.ok) throw new Error(r.status);
          return r.blob();
        }).then(function(blob) {
          v.src = URL.createObjectURL(blob);
        })
      : Promise.reject(new Error("no fetch"));
    return got.catch(function() { v.src = url; }).then(function() { return whenPlayable(v); });
  });

  Promise.all(loads).then(startAll);
  setTimeout(startAll, 15000);
}

function playQuietly(video) {
  var playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(function() {});
  }
}

// Clip lists ([data-clip-target]) that switch the video of one player. A player loads its first clip when it comes near
// the window and pauses while it is far off screen.
function initClipSwitchers() {
  document.querySelectorAll("[data-clip-target]").forEach(function(group) {
    var shell = document.getElementById(group.dataset.clipTarget);
    if (!shell) return;
    var video = shell.querySelector("video");
    var status = shell.querySelector(".video-shell-status");
    var buttons = group.querySelectorAll(".clip-item");
    if (!video || !buttons.length) return;
    var requestId = 0;

    function select(button) {
      var label = button.dataset.label || button.textContent.trim();
      var src = button.dataset.src;
      var id = ++requestId;

      buttons.forEach(function(b) {
        b.classList.toggle("is-active", b === button);
      });
      shell.classList.add("is-loading");
      if (status) status.textContent = "Loading " + label + "...";
      var ready = function() {
        if (id !== requestId || !shell.classList.contains("is-loading")) return;
        shell.classList.remove("is-loading");
        playQuietly(video);
      };
      video.onloadeddata = video.oncanplay = ready;
      var poll = setInterval(function() {
        if (id !== requestId) { clearInterval(poll); return; }
        if (video.readyState >= 2) { clearInterval(poll); ready(); }
      }, 200);
      video.onerror = function() {
        if (id !== requestId) return;
        if (status) status.textContent = "Unable to load " + label + ".";
      };
      video.setAttribute("src", src);
      video.load();
      playQuietly(video);
    }

    buttons.forEach(function(button) {
      button.addEventListener("click", function() {
        select(button);
      });
    });
    buttons[0].classList.add("is-active");
    if (!("IntersectionObserver" in window)) { select(buttons[0]); return; }
    new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          if (!requestId) select(group.querySelector(".is-active") || buttons[0]);
          else if (video.paused && !shell.classList.contains("is-loading")) playQuietly(video);
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { rootMargin: "600px 0px" }).observe(shell);
  });
}
