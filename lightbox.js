/* Figure viewer for Insights post charts.
 *
 * Why this exists: the post figures are authored at 2400 to 3000 px wide but
 * render at 453 px on a phone, a 5x to 7x downscale that makes the denser
 * multi-panel charts unreadable. On desktop they already render at 1247 to
 * 1440 px and are legible, so this is mainly a small-screen fix.
 *
 * Because an overlay on a 390 px screen is also 390 px wide, simply showing
 * the image "bigger" gains nothing. The viewer therefore has two states:
 * fit-to-screen, and native resolution with the container scrolling to pan.
 *
 * Progressive enhancement: with JS off the figures render as ordinary images.
 * No dependencies, no build step, consistent with the rest of the site.
 */
(function () {
  'use strict';

  var figures = document.querySelectorAll('.post-body figure');
  if (!figures.length) return;

  var lastTrigger = null;
  // Read from the figure the reader just clicked, which is on screen and
  // therefore decoded. The overlay image may not have decoded yet, so its own
  // naturalWidth can still be 0 at the moment zoom is first requested.
  var naturalW = 0;

  // Build the overlay once and reuse it for every figure.
  var box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Figure viewer');
  box.innerHTML =
    '<div class="lightbox-bar">' +
      '<button type="button" class="lightbox-btn" data-act="zoom"></button>' +
      '<button type="button" class="lightbox-btn" data-act="close" aria-label="Close figure">Close</button>' +
    '</div>' +
    '<div class="lightbox-scroll"><img alt=""></div>' +
    '<p class="lightbox-caption"></p>';
  document.body.appendChild(box);

  var scroll = box.querySelector('.lightbox-scroll');
  var view = box.querySelector('.lightbox-scroll img');
  var caption = box.querySelector('.lightbox-caption');
  var zoomBtn = box.querySelector('[data-act="zoom"]');
  var closeBtn = box.querySelector('[data-act="close"]');

  function setZoom(on) {
    box.classList.toggle('is-zoomed', on);
    // Pin the image to its natural width so the scroll container can pan it.
    view.style.width = on && naturalW ? naturalW + 'px' : '';
    zoomBtn.textContent = on ? 'Fit to screen' : 'Actual size';
    zoomBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      // Start the pan centred rather than at the top-left corner.
      scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
    }
  }

  function open(img, cap, trigger) {
    lastTrigger = trigger;
    naturalW = img.naturalWidth;
    view.src = img.currentSrc || img.src;
    view.alt = img.getAttribute('alt') || '';
    caption.textContent = cap ? cap.textContent : '';
    box.classList.add('is-open');
    document.body.classList.add('lightbox-open');
    setZoom(false);
    closeBtn.focus();
  }

  function close() {
    box.classList.remove('is-open', 'is-zoomed');
    document.body.classList.remove('lightbox-open');
    view.removeAttribute('src');
    view.style.width = '';
    if (lastTrigger) lastTrigger.focus();
  }

  zoomBtn.addEventListener('click', function () {
    setZoom(!box.classList.contains('is-zoomed'));
  });
  closeBtn.addEventListener('click', close);
  view.addEventListener('click', function () {
    setZoom(!box.classList.contains('is-zoomed'));
  });

  // Clicking the backdrop closes; clicking the image itself toggles zoom.
  scroll.addEventListener('click', function (e) {
    if (e.target === scroll) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    // Two controls only, so keep Tab cycling between them.
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === closeBtn ? zoomBtn : closeBtn).focus();
    }
  });

  // Turn each figure image into a real button so keyboard and screen-reader
  // behaviour comes from the platform rather than from ARIA guesswork.
  Array.prototype.forEach.call(figures, function (fig) {
    var img = fig.querySelector('img');
    if (!img) return;
    var cap = fig.querySelector('figcaption');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'figure-zoom';
    btn.setAttribute('aria-label', 'Enlarge figure: ' + (img.getAttribute('alt') || 'chart'));
    img.parentNode.insertBefore(btn, img);
    btn.appendChild(img);
    btn.addEventListener('click', function () { open(img, cap, btn); });
  });
})();
