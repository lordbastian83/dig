/* Shared mobile nav for the tool pages: injects a hamburger toggle into the
   brand band and collapses the wrapping nav behind it on small screens.
   Progressive enhancement — without JS the nav simply wraps as before. */
(function toolNav() {
  var band = document.querySelector('.band-in');
  var nav = document.querySelector('.band-nav');
  if (!band || !nav) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'band-toggle';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="band-toggle-bars" aria-hidden="true"></span>Menu';
  band.insertBefore(btn, nav);

  function set(open) {
    band.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () {
    set(!band.classList.contains('nav-open'));
  });
  // Close after choosing a destination, or on Escape.
  Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
    a.addEventListener('click', function () { set(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') set(false);
  });

  /* Skip link + main landmark for keyboard / screen-reader users. */
  var wrap = document.querySelector('.wrap');
  if (wrap && !document.querySelector('.skip-link')) {
    if (!wrap.id) wrap.id = 'main';
    wrap.setAttribute('tabindex', '-1');
    var skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + wrap.id;
    skip.textContent = 'Skip to content';
    document.body.insertBefore(skip, document.body.firstChild);
  }

  /* Back to top — appears once the page has scrolled. */
  if (!document.getElementById('to-top')) {
    var top = document.createElement('button');
    top.id = 'to-top';
    top.className = 'to-top no-print';
    top.type = 'button';
    top.setAttribute('aria-label', 'Back to top');
    top.title = 'Back to top';
    top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(top);
    var onScroll = function () { top.classList.toggle('show', window.scrollY > 600); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    top.addEventListener('click', function () {
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }
})();
