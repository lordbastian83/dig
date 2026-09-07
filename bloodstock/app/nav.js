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
})();
