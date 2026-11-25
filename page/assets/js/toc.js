// Table of contents (index.html, <nav class="toc">): highlight the section
// currently on screen. Each link points at a section id (#about, #news, ...).
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  var sections = links.map(function (a) { return document.getElementById(a.hash.slice(1)); });
  var ACTIVE_LINE = 100;  // a section becomes current once its top passes this many px from the top
  var clicked = -1;       // after a click, keep that link lit until the user scrolls again
  var settled = true;     // false while the page is still moving because of a click
  var settleTimer = 0;
  var frame = 0;

  function setActive(index) {
    links.forEach(function (a, i) {
      a.classList.toggle('active', i === index);
      if (i === index) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  // Scroll position at which each section becomes current. Sections near the end
  // of a short page can never scroll up to ACTIVE_LINE, so they share the last
  // stretch of scrolling evenly instead of being skipped.
  function activationPoints() {
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var points = sections.map(function (section) {
      return section.getBoundingClientRect().top + window.scrollY - ACTIVE_LINE;
    });
    for (var k = 1; k < points.length; k++) {
      if (points[k] > maxScroll) {
        var from = points[k - 1], count = points.length - k;
        for (var j = k; j < points.length; j++) {
          points[j] = from + (maxScroll - from) * (j - k + 1) / count;
        }
        break;
      }
    }
    return points;
  }

  function currentIndex() {
    var points = activationPoints(), index = 0;
    for (var i = 0; i < points.length; i++) {
      if (points[i] <= window.scrollY + 1) index = i;
    }
    return index;
  }

  function update() {
    frame = 0;
    setActive(clicked >= 0 ? clicked : currentIndex());
  }

  function settleSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { settled = true; }, 150);
  }

  window.addEventListener('scroll', function () {
    if (clicked >= 0) {
      if (!settled) { settleSoon(); return; }  // still the scroll started by the click
      clicked = -1;                            // a new scroll: the user is moving again
    }
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });

  window.addEventListener('resize', update);

  links.forEach(function (a, i) {
    a.addEventListener('click', function () {
      clicked = i;
      settled = false;
      setActive(i);
      settleSoon();
    });
  });

  update();
})();
