(function () {
  /* ---- theme toggle ---- */
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  function paint() { btn.textContent = root.dataset.theme === 'dark' ? 'Light' : 'Dark'; }
  paint();
  btn.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('uz-theme', root.dataset.theme); } catch (e) {}
    paint();
  });

  /* ---- scroll-spy for the left nav ---- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.leftnav a'));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var visible = new Map();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
        else visible.delete(e.target.id);
      });
      var best = null, bestTop = Infinity;
      visible.forEach(function (_, id) {
        var top = document.getElementById(id).getBoundingClientRect().top;
        if (top < bestTop) { bestTop = top; best = id; }
      });
      links.forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + best);
      });
    }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.25, 0.5, 1] });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---- Fig. 06: the two levers ---- */
  var ACC26 = 2497496;            // located GitHub accounts, Q1 2026
  var REFERENCE = 31999;          // Vietnam's Q1 2026 intensity applied to Pakistan's internet users
  var g = document.getElementById('lvGrowth'), c = document.getElementById('lvConv');
  var gV = document.getElementById('lvGrowthVal'), cV = document.getElementById('lvConvVal');
  var oAcc = document.getElementById('outAcc'), oMit = document.getElementById('outMit');
  var oRatio = document.getElementById('outRatio'), oNote = document.getElementById('outNote');
  var fmt = new Intl.NumberFormat('en-US');
  function round(n, to) { return Math.round(n / to) * to; }
  function recompute() {
    var growth = Number(g.value) / 100;
    var conv = Number(c.value) / 10000;          // slider is in hundredths of a percent
    var acc = ACC26 * Math.pow(1 + growth, 4);
    var mit = acc * conv;
    var ratio = mit / REFERENCE;
    gV.textContent = Number(g.value) + '%/yr';
    cV.textContent = (Number(c.value) / 100).toFixed(2) + '%';
    oAcc.textContent = fmt.format(round(acc, 1000));
    oMit.textContent = fmt.format(round(mit, 100));
    // Test the displayed value, so the wording never contradicts the number.
    var shown = Number(ratio.toFixed(2));
    oRatio.textContent = shown.toFixed(2) + '×';
    oRatio.classList.toggle('hit', shown >= 1);
    oNote.textContent = shown >= 1
      ? 'at or above Vietnam’s current intensity'
      : 'short of Vietnam’s current intensity';
  }
  [g, c].forEach(function (el) { el.addEventListener('input', recompute); });
  recompute();
})();
