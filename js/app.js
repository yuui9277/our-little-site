/* ══════════════════════════════════════════════════════════════
   我们的小站 · 逻辑
   ─────────────────────────────────────────────────────────────
   负责把 data/content.js 里的内容画到页面上，以及各种动效。
   一般不需要改这里；改内容请打开 data/content.js
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // 先给 <html> 打个标记：样式表靠它判断"脚本到底有没有跑起来"。
  // 万一脚本被拦住了，页面会自动退回成"全部内容直接可见"，不会留一片空白。
  document.documentElement.classList.add('js');

  var C    = window.CONTENT || {};
  var site = C.site || {};

  /* 加密版是解锁之后才把内容塞进 window.CONTENT 的，
     所以这两个变量要在解锁后重新指一遍，不能一直指着空对象。 */
  function adoptContent() {
    C = window.CONTENT || {};
    site = C.site || {};
  }
  var DAY  = 86400000;

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var finePointer  = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  /* ══════════ 小工具 ══════════ */

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function url(p) { return 'url("' + String(p).replace(/"/g, '%22') + '")'; }

  /* 手动解析日期，避免 "2023-05-20" 被当成 UTC 导致差一天 */
  function parseDate(str) {
    if (!str) return null;
    var m = String(str).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) { var d = new Date(str); return isNaN(d.getTime()) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function fmtDate(d) {
    return d ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
  }
  function fmtDateDot(d) {
    return d ? d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) : '';
  }
  function fmtMonthDay(mmdd) {
    var p = String(mmdd).split('-');
    return (+p[0]) + '月' + (+p[1]) + '日';
  }

  /* 占位卡片的颜色：都落在粉粉的暖色区间，和小猪一个色系 */
  function hueOf(s) {
    var h = 0;
    s = String(s || 'pig');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 335 + (Math.abs(h) % 46) - 23;
  }

  function placeholder(text, hint, cls) {
    var hue = hueOf(text);
    var d = el('div', 'ph' + (cls ? ' ' + cls : ''));
    d.style.background = 'linear-gradient(140deg, hsl(' + hue + ' 78% 76%), hsl(' + (hue + 20) + ' 70% 64%))';
    d.innerHTML =
      '<span class="ph__ico">🐷</span>' +
      '<span class="ph__txt">' + esc(text || '这里将来会有一张照片') + '</span>' +
      '<span class="ph__hint">' + esc(hint || '') + '</span>';
    return d;
  }

  /* 用背景图放照片，路径写错时自动换成占位卡片 */
  function bgPhoto(node, src, phText, phCls, margin) {
    node.style.backgroundImage = url(src);
    var probe = new Image();
    probe.onerror = function () {
      var ph = placeholder(phText, '照片没找到：' + src, phCls);
      if (margin) ph.style.margin = margin;
      if (node.parentNode) node.parentNode.replaceChild(ph, node);
    };
    probe.src = src;
  }

  /* ══════════ 滚动出现 ══════════ */

  var revealQueue = [];
  var revealSeen = new WeakSet();

  function reveal(node, delay) {
    node.classList.add('reveal');
    if (delay) node.style.transitionDelay = delay + 'ms';
    revealQueue.push(node);
    return node;
  }

  function flushReveal() {
    var all = [], i;
    var statics = document.querySelectorAll('.reveal');
    for (i = 0; i < statics.length; i++) all.push(statics[i]);
    for (i = 0; i < revealQueue.length; i++) all.push(revealQueue[i]);
    revealQueue = [];

    if (!('IntersectionObserver' in window)) {
      all.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
        // 动画播完后清掉延迟，免得 hover 也被拖慢
        var d = parseFloat(e.target.style.transitionDelay) || 0;
        setTimeout(function () { e.target.style.transitionDelay = ''; }, d + 1000);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });

    all.forEach(function (n) {
      if (!revealSeen.has(n)) { revealSeen.add(n); io.observe(n); }
    });
  }

  function hasData(v) { return Array.isArray(v) && v.length > 0; }
  function hideSection(id) { var s = $(id); if (s) s.style.display = 'none'; }

  /* ══════════ 卡片：柔光 + 轻微倾斜 ══════════ */

  function bindCardFx(card) {
    if (!finePointer || reduceMotion) return;
    card.addEventListener('pointermove', function (ev) {
      var r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (ev.clientX - r.left) / r.width;
      var py = (ev.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      card.style.setProperty('--ry', ((px - .5) * 4).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((.5 - py) * 4).toFixed(2) + 'deg');
    });
    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    });
  }

  /* ══════════ 小猪 ══════════ */

  var pigTpl = $('pigTpl');

  function makePig() {
    if (pigTpl && pigTpl.content && pigTpl.content.cloneNode) {
      var frag = pigTpl.content.cloneNode(true);
      if (frag.firstElementChild) return frag.firstElementChild;
    }
    var s = el('span', 'pig', '🐷');
    s.style.fontSize = '26px';
    s.style.width = 'auto';
    return s;
  }

  var OINKS = ['哼唧～', '今天也要开心哦', '我在看着你们俩呢', '哼哼，被我逮到秀恩爱了', '别忘了多拍点照片！'];

  function showBubble(text) {
    var b = $('pigBubble');
    if (!b) return;
    b.textContent = text;
    b.hidden = false;
    requestAnimationFrame(function () { b.classList.add('is-show'); });
    clearTimeout(b._t);
    b._t = setTimeout(function () {
      b.classList.remove('is-show');
      setTimeout(function () { b.hidden = true; }, 320);
    }, 1600);
  }

  function pigBurst(x, y) {
    var faces = ['🐷', '🐽', '💗', '🌸', '🐖', '✨'];
    for (var i = 0; i < 9; i++) {
      var s = el('span', 'pig-pop', faces[i % faces.length]);
      s.style.left = (x - 10) + 'px';
      s.style.top = (y - 10) + 'px';
      s.style.setProperty('--drift', (Math.random() * 150 - 75).toFixed(0) + 'px');
      s.style.animationDelay = (i * 45) + 'ms';
      document.body.appendChild(s);
      (function (n) {
        setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2300);
      })(s);
    }
  }

  function initPigs() {
    var navPig = $('navPig');
    if (navPig) navPig.appendChild(makePig());

    var prePig = $('preloaderPig');
    if (prePig) prePig.appendChild(makePig());

    var counterPig = $('counterPig');
    if (counterPig) counterPig.appendChild(makePig());

    /* 悄悄话那一页：一只蹲在角落里听着的小猪 */
    var whispers = $('whispers');
    if (whispers && whispers.querySelector) {
      var wBox = whispers.querySelector('.whisper');
      if (wBox) {
        var wPig = el('span', 'whisper__pig');
        wPig.appendChild(makePig());
        wBox.appendChild(wPig);
      }
    }

    /* 看大图的时候，它也蹲在角落里陪着 */
    var lbBox = $('lightbox');
    if (lbBox) {
      var lPig = el('span', 'lb__pig');
      lPig.appendChild(makePig());
      lbBox.appendChild(lPig);
    }

    var row = $('pigRow');
    if (row) {
      for (var i = 0; i < 7; i++) {
        var p = makePig();
        if (i === 3) p.style.width = '31px';   // 中间那只大一点
        row.appendChild(p);
      }
      row.addEventListener('click', function (ev) { pigBurst(ev.clientX, ev.clientY); });
    }

    var hero = $('pigHero');
    if (hero) {
      hero.addEventListener('click', function (ev) {
        hero.classList.remove('is-wiggle');
        void hero.offsetWidth;                 // 强制重排，让动画能重复播放
        hero.classList.add('is-wiggle');
        showBubble(OINKS[Math.floor(Math.random() * OINKS.length)]);
        pigBurst(ev.clientX, ev.clientY);
      });
    }
  }

  /* ══════════ 渲染 ══════════ */

  function renderSite() {
    if (site.title) {
      document.title = site.title;
      var t = $('navTitle');
      if (t) t.textContent = site.title;
      var pn = $('preloaderNames');
      if (pn) pn.textContent = site.names || site.title;
    }

    var names = $('heroNames');
    if (names && site.names) names.textContent = site.names;
    splitTitle();

    var eb = $('heroEyebrow');
    if (eb) eb.textContent = (C.hero && C.hero.eyebrow) || '写给我们的';

    var q = $('heroQuote');
    if (q) q.textContent = (C.hero && C.hero.quote) || '';

    var fn = $('heroFootnote');
    if (fn) fn.textContent = (C.hero && C.hero.footnote) || '';

    var bg = $('heroBg');
    if (bg && C.hero && C.hero.photo) {
      bg.style.backgroundImage = url(C.hero.photo);
      var probe = new Image();
      probe.onload = function () { bg.classList.add('has-photo'); };
      probe.src = C.hero.photo;
    }

    var f1 = $('footerLine1'), f2 = $('footerLine2');
    if (f1 && C.footer && C.footer.line1) f1.textContent = C.footer.line1;
    if (f2 && C.footer && C.footer.line2) f2.textContent = C.footer.line2;

    var root = document.documentElement;
    if (site.primary) root.style.setProperty('--primary', site.primary);
    if (site.accent)  root.style.setProperty('--accent', site.accent);
  }

  /* 大标题逐字拆开，好让每个字单独浮现 */
  function splitTitle() {
    var h = $('heroNames');
    if (!h) return;
    var text = h.textContent || '';
    if (!text || reduceMotion) return;

    h.innerHTML = '';
    Array.from(text).forEach(function (c, i) {
      var s = el('span', 'ch' + (c === ' ' ? ' ch--sp' : ''));
      s.style.setProperty('--i', i);
      s.textContent = (c === ' ') ? '\u00A0' : c;
      h.appendChild(s);
    });
  }

  function revealTitle() {
    var h = $('heroNames');
    if (h) h.classList.add('is-in');
  }

  /* —— 天数：先滚动数字，再交给实时计时器 —— */
  var counting = true;

  function countUp(target) {
    var dNum = $('daysNum');
    if (!dNum) { counting = false; return; }
    if (reduceMotion || !window.requestAnimationFrame) {
      dNum.textContent = target;
      counting = false;
      return;
    }
    var start = null, dur = 1300;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 4);
      dNum.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
      else { dNum.textContent = target; counting = false; }
    }
    requestAnimationFrame(step);
  }

  function renderCounter() {
    var since = parseDate(site.togetherSince);
    var dNum = $('daysNum'), hms = $('hms'), sinceTxt = $('sinceText'), fDays = $('footerDays');
    if (!dNum) return;

    if (!since) {
      dNum.textContent = '--';
      counting = false;
      if (hms) hms.textContent = '还没设置在一起的日子';
      if (sinceTxt) sinceTxt.textContent = '请打开 data/content.js 填写 togetherSince';
      return;
    }

    if (sinceTxt) {
      sinceTxt.textContent = '从 ' + fmtDate(since) + ' ' +
        pad(since.getHours()) + ':' + pad(since.getMinutes()) + ' 开始';
    }

    var firstTarget = 0;

    function tick() {
      var diff = Date.now() - since.getTime();
      if (diff < 0) {
        if (!counting) dNum.textContent = '0';
        if (hms) hms.textContent = '那一天还没到呢';
        return;
      }
      var days = Math.floor(diff / DAY) + 1;      // 在一起的第一天算第 1 天
      firstTarget = days;
      if (!counting) dNum.textContent = days;
      if (fDays) fDays.textContent = days;        // 页脚不参与滚动动画

      var rest = diff % DAY;
      var h = Math.floor(rest / 3600000);
      var m = Math.floor((rest % 3600000) / 60000);
      var s = Math.floor((rest % 60000) / 1000);
      if (hms) hms.textContent = h + ' 小时 ' + pad(m) + ' 分 ' + pad(s) + ' 秒';
    }

    tick();
    setInterval(tick, 1000);

    // 等开场动画结束再滚数字
    startHooks.push(function () { countUp(firstTarget || 0); });
  }

  var startHooks = [];

  function renderAnniversaries() {
    var box = $('anniCards');
    if (!box) return;
    if (!hasData(C.anniversaries)) { hideSection('anniversaries'); return; }

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    var list = C.anniversaries.map(function (a) {
      var p = String(a.date || '').split('-').map(Number);
      if (!p[0] || !p[1]) return null;
      var next = new Date(today.getFullYear(), p[0] - 1, p[1]);
      if (next < today) next = new Date(today.getFullYear() + 1, p[0] - 1, p[1]);
      return { a: a, next: next, days: Math.round((next - today) / DAY) };
    }).filter(Boolean).sort(function (x, y) { return x.days - y.days; });

    list.forEach(function (it, i) {
      var isToday = it.days === 0;
      var card = el('div', 'card' + (isToday ? ' card--today' : ''));
      card.innerHTML =
        '<div class="card__emoji">' + esc(it.a.emoji || '🎉') + '</div>' +
        '<div class="card__name">' + esc(it.a.name || '纪念日') + '</div>' +
        '<div class="card__date">' + esc(fmtMonthDay(it.a.date)) + '</div>' +
        '<div class="card__days">' +
          (isToday ? '<b>就是今天</b> 🎉'
                   : '<b>' + it.days + '</b> 天后 · ' + esc(fmtDate(it.next))) +
        '</div>';
      bindCardFx(card);
      /* 卡片右上角盖一枚小猪印章，很淡，只在凑近看时发现 */
      var seal = el('span', 'card__seal');
      seal.appendChild(makePig());
      card.appendChild(seal);
      reveal(card, Math.min(i, 4) * 80);
      box.appendChild(card);
    });
  }

  function renderTimeline() {
    var box = $('timelineList');
    if (!box) return;
    if (!hasData(C.timeline)) { hideSection('timeline'); return; }

    var items = C.timeline.slice().sort(function (a, b) {
      var da = parseDate(a.date), db = parseDate(b.date);
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    items.forEach(function (it, i) {
      var d = parseDate(it.date);
      var row = el('div', 'tl-item');
      var card = el('div', 'tl-card');

      var head = el('div', 'tl-card__head');
      head.innerHTML =
        '<span class="tl-card__date">' + esc(d ? fmtDateDot(d) : (it.date || '')) + '</span>' +
        (it.tag ? '<span class="tl-card__tag">' + esc(it.tag) + '</span>' : '');
      card.appendChild(head);

      card.appendChild(el('h3', 'tl-card__title', esc(it.title || '')));
      if (it.text) card.appendChild(el('p', 'tl-card__text', esc(it.text)));
      if (it.place) card.appendChild(el('p', 'tl-card__place', '📍 ' + esc(it.place)));

      if (it.photo) {
        var wrap = el('div', 'tl-card__photo');
        card.appendChild(wrap);
        bgPhoto(wrap, it.photo, '这一天的照片', 'ph--wide', '20px -30px -28px');
      }

      bindCardFx(card);
      /* 时间线那个小圆点，换成小猪头 */
      var dot = el('span', 'tl-item__dot tl-item__dot--pig');
      dot.appendChild(makePig());
      row.appendChild(dot);
      row.appendChild(card);
      reveal(row, Math.min(i, 4) * 90);
      box.appendChild(row);
    });
  }

  /* 灯箱用的真实照片列表 */
  var photos = [];

  function renderGallery() {
    var box = $('galleryGrid');
    if (!box) return;
    if (!hasData(C.gallery)) { hideSection('gallery'); return; }

    photos = [];

    C.gallery.forEach(function (g, i) {
      var item = el('div', 'masonry__item');
      var hasPhoto = !!g.src;

      if (hasPhoto) {
        var idx = photos.length;
        photos.push(g);
        (function (g, idx, item) {
          var img = new Image();
          img.src = g.src;
          img.alt = g.caption || '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.addEventListener('error', function () {
            // 路径写错了就换成占位卡片，同时记下来，免得灯箱里也打不开
            g._broken = true;
            item.classList.add('is-empty');
            if (img.parentNode === item) {
              item.replaceChild(placeholder(g.caption || '这张照片没找到', '照片没找到：' + g.src), img);
            }
          });
          item.appendChild(img);
          item.appendChild(el('span', 'masonry__hint', '<span>查看大图</span>'));
          item.addEventListener('click', function () { openLightbox(idx); });
        })(g, idx, item);
      } else {
        item.classList.add('is-empty');
        item.appendChild(placeholder(g.caption || '这里将来会有一张照片', '把照片放进 photos 文件夹'));
      }

      var cap = el('div', 'masonry__cap');
      cap.innerHTML = '<span>' + esc(g.caption || '') + '</span>' +
                      (g.date ? '<time>' + esc(g.date) + '</time>' : '');
      item.appendChild(cap);

      reveal(item, Math.min(i, 6) * 60);
      box.appendChild(item);
    });
  }

  /* 她的样子：整页都是她的自拍，同样接进灯箱，可以和照片墙混着翻 */
  function renderPortraits() {
    var box = $('portraitsGrid');
    if (!box) return;
    if (!hasData(C.portraits)) { hideSection('portraits'); return; }

    C.portraits.forEach(function (g, i) {
      var item = el('div', 'masonry__item');

      if (g.src) {
        var idx = photos.length;
        photos.push(g);
        (function (g, idx, item) {
          var img = new Image();
          img.src = g.src;
          img.alt = g.caption || '她的自拍';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.addEventListener('error', function () {
            g._broken = true;
            item.classList.add('is-empty');
            if (img.parentNode === item) {
              item.replaceChild(placeholder('这张没加载出来', '检查一下 images 里的文件名'), img);
            }
          });
          item.appendChild(img);
          item.appendChild(el('span', 'masonry__hint', '<span>查看大图</span>'));
          item.addEventListener('click', function () { openLightbox(idx); });
        })(g, idx, item);
      } else {
        item.classList.add('is-empty');
        item.appendChild(placeholder('这里将来会有一张照片', '把照片放进 images 文件夹'));
      }

      reveal(item, Math.min(i, 6) * 50);
      box.appendChild(item);
    });
  }

  function renderPlaces() {
    var box = $('placesGrid');
    if (!box) return;
    if (!hasData(C.places)) { hideSection('places'); return; }

    C.places.forEach(function (p, i) {
      var card = el('div', 'card card--place');

      if (p.photo) {
        var div = el('div', 'place__photo');
        card.appendChild(div);
        bgPhoto(div, p.photo, p.name || '这个地方', 'ph--wide', '0');
      } else {
        card.appendChild(placeholder(p.name || '这个地方', '还没有这里的照片', 'ph--wide'));
      }

      var body = el('div', 'card__body');
      body.appendChild(el('div', 'card__name', esc(p.name || '')));
      if (p.date) body.appendChild(el('div', 'card__date', esc(p.date)));
      if (p.story) body.appendChild(el('p', 'place__story', esc(p.story)));
      card.appendChild(body);

      bindCardFx(card);
      reveal(card, i * 80);
      box.appendChild(card);
    });
  }

  function renderChats() {
    var box = $('chatsList');
    if (!box) return;
    if (!hasData(C.chats)) { hideSection('chats'); return; }

    C.chats.forEach(function (day) {
      var wrap = el('div', 'chat-day');
      var d = parseDate(day.date);
      wrap.appendChild(el('div', 'chat-day__label',
        '<span>' + esc(d ? fmtDate(d) : (day.date || '')) + '</span>'));

      var bubbles = el('div', 'bubbles');
      (day.messages || []).forEach(function (m) {
        var isMe = m.from === 'me';
        bubbles.appendChild(el('div', 'bubble ' + (isMe ? 'bubble--me' : 'bubble--ta'), esc(m.text || '')));
      });
      wrap.appendChild(bubbles);
      reveal(wrap);
      box.appendChild(wrap);
    });

    // 聊天气泡滚到眼前时逐个出现
    if ('IntersectionObserver' in window && !reduceMotion) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          var bs = e.target.querySelectorAll('.bubble');
          for (var i = 0; i < bs.length; i++) {
            (function (b, i) {
              b.style.opacity = '0';
              setTimeout(function () {
                b.style.opacity = '';
                b.style.animation = 'pop .5s cubic-bezier(.22,.61,.36,1) both';
                b.style.animationDelay = (i * 90) + 'ms';
              }, 60);
            })(bs[i], i);
          }
          io.unobserve(e.target);
        });
      }, { threshold: 0.2 });
      var days = box.querySelectorAll('.chat-day');
      for (var i = 0; i < days.length; i++) io.observe(days[i]);
    }
  }

  var lastWhisper = -1;

  function pickWhisper() {
    var w = C.whispers || [];
    if (!w.length) return '在 data/content.js 里写下第一句想说的话吧。';
    var i;
    do { i = Math.floor(Math.random() * w.length); } while (w.length > 1 && i === lastWhisper);
    lastWhisper = i;
    return w[i];
  }

  function renderWhispers() {
    var txt = $('whisperText'), btn = $('whisperBtn');
    if (!txt) return;
    if (!hasData(C.whispers)) { hideSection('whispers'); return; }

    txt.textContent = pickWhisper();

    function next() {
      txt.classList.add('is-fading');
      setTimeout(function () {
        txt.textContent = pickWhisper();
        txt.classList.remove('is-fading');
      }, 340);
    }

    if (btn) btn.addEventListener('click', next);
    txt.style.cursor = 'pointer';
    txt.title = '点一下也可以换';
    txt.addEventListener('click', next);
  }

  /* ══════════ 灯箱 ══════════ */

  var lbIndex = 0;

  function buildThumbs() {
    var thumbs = $('lbThumbs');
    if (!thumbs) return;
    thumbs.innerHTML = '';
    photos.forEach(function (g, i) {
      var b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      if (!g._broken) {
        var im = new Image();
        im.src = g.src;
        im.alt = '';
        b.appendChild(im);
      }
      b.addEventListener('click', function () { openLightbox(i); });
      thumbs.appendChild(b);
    });
  }

  function syncThumbs() {
    var thumbs = $('lbThumbs');
    if (!thumbs) return;
    var bs = thumbs.children;
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('is-active', i === lbIndex);
    }
    if (bs[lbIndex] && bs[lbIndex].scrollIntoView) {
      try { bs[lbIndex].scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
    }
  }

  function openLightbox(i) {
    if (!photos.length) return;

    lbIndex = (i + photos.length) % photos.length;
    var tries = 0;
    while (photos[lbIndex]._broken && tries < photos.length) {   // 跳过打不开的照片
      lbIndex = (lbIndex + 1) % photos.length;
      tries++;
    }
    if (photos[lbIndex]._broken) return;

    var lb = $('lightbox'), m = $('lbMedia'), cap = $('lbCap'), cnt = $('lbCount'), bd = $('lbBackdrop');
    var g = photos[lbIndex];

    m.innerHTML = '';
    var img = new Image();
    img.src = g.src;
    img.alt = g.caption || '';
    m.appendChild(img);

    cap.innerHTML = esc(g.caption || '') + (g.date ? '<time>' + esc(g.date) + '</time>' : '');
    if (cnt) cnt.textContent = pad(lbIndex + 1) + ' / ' + pad(photos.length);
    if (bd) bd.style.backgroundImage = url(g.src);

    var multi = photos.length > 1;
    var pv = $('lbPrev'), nx = $('lbNext');
    if (pv) pv.hidden = !multi;
    if (nx) nx.hidden = !multi;

    lb.hidden = false;
    document.body.classList.add('is-locked');
    syncThumbs();
  }

  function closeLightbox() {
    var lb = $('lightbox');
    if (lb) lb.hidden = true;
    document.body.classList.remove('is-locked');
  }

  function initLightbox() {
    var lb = $('lightbox');
    if (!lb) return;
    buildThumbs();

    var c = $('lbClose'), pv = $('lbPrev'), nx = $('lbNext');
    if (c) c.addEventListener('click', closeLightbox);
    if (pv) pv.addEventListener('click', function () { openLightbox(lbIndex - 1); });
    if (nx) nx.addEventListener('click', function () { openLightbox(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
      else if (e.key === 'ArrowRight') openLightbox(lbIndex + 1);
    });
  }

  /* ══════════ 导航 ══════════ */

  var navMoveInk = null;    /* 让翻页器能挪动导航栏那条金条 */

  function initNav() {
    var nav = $('nav'), links = $('navLinks'), burger = $('burgerBtn'), ink = $('navInk');

    // 现在没有"滚动"这回事了，导航栏一直是实心底，始终压在内容之上
    if (nav) nav.classList.add('is-stuck');

    if (burger && links) {
      burger.addEventListener('click', function () {
        links.classList.toggle('is-open');
        burger.classList.toggle('is-open');
      });
    }
    if (links) {
      links.addEventListener('click', function (e) {
        if (!e.target || e.target.tagName !== 'A') return;
        if (links.classList.contains('is-open')) {
          links.classList.remove('is-open');
          if (burger) burger.classList.remove('is-open');
        }
      });
    }

    function moveInk(link) {
      if (!ink || !link || !link.offsetWidth) return;
      ink.style.width = link.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + link.offsetLeft + 'px)';
      ink.classList.add('is-on');
    }

    navMoveInk = moveInk;
  }

  /* ══════════ 白天 / 夜晚 ══════════ */

  function initTheme() {
    var btn = $('themeBtn');
    var root = document.documentElement;
    var meta = document.querySelector ? document.querySelector('meta[name="theme-color"]') : null;

    function read() { try { return localStorage.getItem('our-site-theme'); } catch (e) { return null; } }
    function save(v) { try { localStorage.setItem('our-site-theme', v); } catch (e) {} }

    function apply(v) {
      root.setAttribute('data-theme', v);
      if (btn) btn.title = v === 'dark' ? '切换到白天模式（象牙玫瑰）' : '切换到夜晚模式（暗夜玫瑰）';
      if (meta) meta.setAttribute('content', v === 'dark' ? '#0d0a0c' : '#fbf7f4');
    }

    var saved = read();
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(saved || (prefersDark ? 'dark' : 'light'));

    if (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        save(next);
      });
    }
  }

  /* ══════════ 背景音乐 ══════════ */

  function initMusic() {
    var src = site.music;
    if (!src) return;
    var bgm = $('bgm'), btn = $('musicBtn');
    if (!bgm || !btn) return;

    bgm.src = src;
    btn.hidden = false;

    function sync() {
      btn.classList.toggle('is-playing', !bgm.paused);
      btn.title = bgm.paused ? '播放背景音乐' : '暂停背景音乐';
    }

    btn.addEventListener('click', function () {
      if (bgm.paused) {
        var p = bgm.play();
        if (p && p.catch) p.catch(function () { btn.title = '音乐文件没找到：' + src; });
      } else {
        bgm.pause();
      }
    });

    bgm.addEventListener('play', sync);
    bgm.addEventListener('pause', sync);
    bgm.addEventListener('error', function () {
      btn.title = '音乐文件没找到：' + src;
      btn.style.opacity = '.4';
    });
    sync();
  }

  /* ══════════ 开场动画 ══════════ */

  var started = false;
  var preloaderDone = false;

  function startHero() {
    if (started) return;
    started = true;
    document.body.classList.add('is-ready');
    revealTitle();
    startHooks.forEach(function (f) { try { f(); } catch (e) {} });
  }

  function finishPreloader() {
    if (preloaderDone) return;
    preloaderDone = true;
    var p = $('preloader');
    if (p) p.classList.add('is-done');
    document.body.classList.remove('is-loading');
    setTimeout(startHero, 200);
  }

  function runPreloader() {
    var bar = $('preloaderBar'), pct = $('preloaderPct');
    var dur = reduceMotion ? 1 : 950;
    var start = null;

    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      if (bar) bar.style.width = Math.round(eased * 100) + '%';
      if (pct) pct.textContent = Math.round(eased * 100);
      if (t < 1) requestAnimationFrame(step);
      else setTimeout(finishPreloader, 220);
    }

    if (window.requestAnimationFrame && !reduceMotion) requestAnimationFrame(step);
    else setTimeout(finishPreloader, 300);
  }

  /* ══════════ 鼠标光晕 ══════════ */

  function initCursor() {
    var c = $('cursor');
    if (!c || !finePointer || reduceMotion) return;

    var ring = c.querySelector('.cursor__ring');
    var dot  = c.querySelector('.cursor__dot');
    if (!ring || !dot) return;

    var mx = -100, my = -100, rx = -100, ry = -100, shown = false;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!shown) {
        shown = true; rx = mx; ry = my;
        document.body.classList.add('has-cursor');
      }
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      shown = false;
      document.body.classList.remove('has-cursor');
      c.classList.add('is-hidden');
    });
    document.addEventListener('mouseenter', function () {
      c.classList.remove('is-hidden');
    });

    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      var hot = !!(t && t.closest && t.closest('a, button, .masonry__item, .pig-hero, .pig-row, .whisper__text'));
      c.classList.toggle('is-hot', hot);
    });

    function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      dot.style.transform  = 'translate3d(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px,0)';
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* ══════════ 翻页 ══════════ */

  function initPager() {
    var ids = ['hero', 'anniversaries', 'timeline', 'gallery', 'portraits', 'places', 'chats', 'whispers'];
    var pages = [], i, s;

    for (i = 0; i < ids.length; i++) {
      s = $(ids[i]);
      if (s) pages.push(s);
    }
    s = document.querySelector ? document.querySelector('.footer') : null;
    if (s) pages.push(s);
    if (pages.length < 2) return;

    var dots = $('pagerDots'), count = $('pagerCount');
    var bar = $('progressBar'), arc = $('totopArc'), totop = $('totop');
    var leafPrev = $('leafPrev'), leafNext = $('leafNext');
    var btns = [];
    var CIRC = 125.7;
    var cur = 0, painted = -1, busy = false;

    if (dots) {
      dots.innerHTML = '';
      pages.forEach(function (p, k) {
        var b = el('button', 'pager__dot');
        b.type = 'button';
        var t = p.querySelector && p.querySelector('.section__title');
        var label = (t && t.textContent) || (k === 0 ? '封面' : (k === pages.length - 1 ? '页脚' : '第 ' + (k + 1) + ' 页'));
        b.title = label;
        b.setAttribute('aria-label', '翻到：' + label);
        b.addEventListener('click', function () { go(k); });
        dots.appendChild(b);
        btns.push(b);
      });
    }

    /* 翻页：当前页绕左边装订线掀走，下一页从右侧落下来 */
    function go(k) {
      k = Math.max(0, Math.min(pages.length - 1, k));
      if (k === cur || busy) return;

      busy = true;
      var back = k < cur;
      var from = pages[cur], to = pages[k];
      from.setAttribute('aria-hidden', 'true');
      cur = k;

      from.classList.remove('is-active');
      from.classList.add('is-out');
      if (back) from.classList.add('back');

      to.classList.remove('is-active');
      to.classList.add('is-in');
      if (back) to.classList.add('back');
      to.setAttribute('aria-hidden', 'false');
      void to.offsetWidth;                    /* 先把起始角度定住，再放开动画 */

      setTimeout(function () {
        from.classList.remove('is-out', 'back');
        to.classList.remove('is-in', 'back');
        to.classList.add('is-active');
        mark(cur);
        setTimeout(function () { busy = false; }, reduceMotion ? 20 : 480);
      }, reduceMotion ? 20 : 400);
    }

    function mark(k) {
      if (k === painted) return;
      painted = k;
      for (var n = 0; n < btns.length; n++) btns[n].classList.toggle('is-on', n === k);
      if (count) count.textContent = pad(k + 1) + ' / ' + pad(pages.length);
      var pr = (k + 1) / pages.length;
      if (bar) bar.style.width = (pr * 100).toFixed(2) + '%';
      if (arc) arc.style.strokeDashoffset = (CIRC * (1 - pr)).toFixed(1);
      if (totop) totop.classList.toggle('is-on', k > 0);
      if (leafPrev) leafPrev.disabled = (k === 0);
      if (leafNext) leafNext.disabled = (k === pages.length - 1);

      /* 顶部导航同步高亮 */
      var navLinks = $('navLinks');
      if (navLinks) {
        var tgt = pages[k].id ? '#' + pages[k].id : '';
        var as = navLinks.querySelectorAll('a'), hit = null;
        for (var j = 0; j < as.length; j++) {
          var on = tgt && as[j].getAttribute('href') === tgt;
          as[j].classList.toggle('is-active', on);
          if (on) hit = as[j];
        }
        if (hit && navMoveInk) navMoveInk(hit);
      }
    }

    /* 自动适配：内容比一屏高时，把整块等比缩小一点，保证永远是"一页看完"，
       一行字都不裁掉。以后往里加照片、加时间线也不会撑破页面。 */
    function fitPages() {
      /* 手机窄屏、或者窗口太矮时不缩小。此时卡片会自己叠成单列、内容本来就
         该长，硬压到半屏字就小得没法看了 —— 改成页内上下滑，字保持原尺寸。
         条件要和 CSS 里那条媒体查询保持一致。 */
      var narrow = window.matchMedia &&
        window.matchMedia('(max-width: 760px), (max-height: 560px)').matches;
      for (var n = 0; n < pages.length; n++) {
        var w = pages[n].querySelector ? pages[n].querySelector('.wrap') : null;
        if (!w) continue;
        w.style.transform = 'none';
        if (narrow) continue;
        /* 自拍墙不吃缩放：它是图片网格，缩一点点照片就明显变小。
           装不下就往页内滑，滚到底再翻页。 */
        if (pages[n].id === 'portraits') continue;
        var avail = pages[n].clientHeight - 140;      /* 上面留给导航栏，下面留一点气 */
        var need = w.scrollHeight;
        if (need > avail + 2 && avail > 120) {
          var sc = avail / need;
          w.style.transformOrigin = '50% 0';
          w.style.transform = 'scale(' + sc.toFixed(4) + ')';
        }
      }
    }

    /* 初始状态：第一页摊开，其余合上 */
    for (var n0 = 0; n0 < pages.length; n0++) {
      pages[n0].classList.remove('is-out', 'is-in', 'back');
      pages[n0].classList.toggle('is-active', n0 === 0);
      pages[n0].setAttribute('aria-hidden', n0 === 0 ? 'false' : 'true');
    }
    mark(0);
    fitPages();

    var fitTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fitPages, 180);
    }, { passive: true });

    /* 滚轮 / 触控板：滚一下翻一页 */
    document.addEventListener('wheel', function (e) {
      var d = e.deltaY > 0 ? 1 : -1;
      if (Math.abs(e.deltaY) < 3) return;

      /* 页内那些"自己能滚"的地方（长列表、或者内容真的比一屏高）优先，滚到头了才翻页 */
      var list = e.target && e.target.closest ? e.target.closest('.timeline, .chats') : null;
      var box = list || pages[cur];
      if (box && box.scrollHeight > box.clientHeight + 4) {
        var atTop = box.scrollTop <= 0;
        var atBot = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
        if (!(d > 0 && atBot) && !(d < 0 && atTop)) return;
      }

      e.preventDefault();
      if (!busy) go(cur + d);
    }, { passive: false });

    /* 手机上滑一下翻一页 */
    var touchY = 0;
    document.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches[0]) touchY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dy = touchY - t.clientY;
      if (Math.abs(dy) > 46 && !busy) {
        /* 这一页自己还能滚，就先让它滚，滚到头了才翻页 */
        var box = pages[cur];
        if (box && box.scrollHeight > box.clientHeight + 4) {
          var d0 = dy > 0 ? 1 : -1;
          var atTop = box.scrollTop <= 0;
          var atBot = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
          if (!(d0 > 0 && atBot) && !(d0 < 0 && atTop)) return;
        }
        go(cur + (dy > 0 ? 1 : -1));
      }
    }, { passive: true });

    /* 左右页角 */
    if (leafPrev) leafPrev.addEventListener('click', function () { go(cur - 1); });
    if (leafNext) leafNext.addEventListener('click', function () { go(cur + 1); });

    /* 回到第一页 */
    if (totop) totop.addEventListener('click', function () { go(0); });

    /* 顶部导航 / 品牌名：点哪页翻哪页 */
    var byId = {};
    for (var n1 = 0; n1 < pages.length; n1++) {
      if (pages[n1].id) byId[pages[n1].id] = n1;
    }
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (id === 'top') { e.preventDefault(); go(0); return; }
      if (byId.hasOwnProperty(id)) { e.preventDefault(); go(byId[id]); }
    });

    /* 键盘翻页（看大图时让给灯箱） */
    document.addEventListener('keydown', function (e) {
      var lb = $('lightbox');
      if (lb && !lb.hidden) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var t = e.target;
      // 焦点在"页内可以自己滚的列表"里时，方向键留给那个列表
      if (t && t.closest && t.closest('.timeline, .chats, .masonry')) return;

      var k = e.key, dir = 0;
      if (k === 'ArrowDown' || k === 'PageDown' || k === 'ArrowRight') dir = 1;
      else if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft') dir = -1;
      else if (k === ' ' || k === 'Spacebar') dir = e.shiftKey ? -1 : 1;
      else if (k === 'Home') { e.preventDefault(); go(0); return; }
      else if (k === 'End') { e.preventDefault(); go(pages.length - 1); return; }
      else return;

      e.preventDefault();
      go(cur + dir);
    });
  }

  /* ══════════ 启动 ══════════ */

  /* 每一步单独兜住：某一块出错，其余照常显示，不会一错全白 */
  /* 手机竖屏时提示横过来看（浏览器不允许网页锁横屏，这是唯一可靠的做法） */
  function initRotateHint() {
    if (document.querySelector('.rotate-hint')) return;
    var h = el('div', 'rotate-hint');
    h.setAttribute('role', 'dialog');
    h.setAttribute('aria-label', '建议横屏观看');

    var box = el('div', 'rotate-hint__box');

    var art = el('div', 'rotate-hint__art');
    art.appendChild(makePig());
    box.appendChild(art);

    box.appendChild(el('p', 'rotate-hint__title', '把手机横过来'));
    box.appendChild(el('p', 'rotate-hint__sub', '这一页是按横屏排的，转一下看得更清楚'));

    var skip = el('button', 'rotate-hint__skip', '就这样竖着看');
    skip.type = 'button';
    skip.addEventListener('click', function () {
      document.documentElement.classList.add('no-rotate-hint');
    });
    box.appendChild(skip);

    h.appendChild(box);
    document.body.appendChild(h);
  }

  /* 全屏按钮：手机横屏时地址栏会吃掉一大截高度，全屏后它就彻底消失。
   iOS 的 Safari 不支持网页全屏，那就干脆不显示这个按钮，免得点了没反应。 */
  function initFullscreen() {
    var doc = document.documentElement;
    var req = doc.requestFullscreen || doc.webkitRequestFullscreen;
    if (!req) return;

    var tools = document.querySelector('.nav__tools');
    if (!tools) return;

    var b = el('button', 'icon-btn');
    b.type = 'button';
    b.id = 'fsBtn';
    b.title = '全屏看（藏掉浏览器地址栏）';
    b.setAttribute('aria-label', '全屏');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    b.addEventListener('click', function () {
      var d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        var exit = d.exitFullscreen || d.webkitExitFullscreen;
        if (exit) exit.call(d);
      } else {
        try {
          var p = req.call(doc);
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }
    });

    tools.insertBefore(b, tools.firstChild);
  }

  /* 飘雪。默认只在她第 100 天（11 月 26 日）那天下；平时想看得在网址后面
     加 ?snow=1，方便你现在就预览。用 canvas 画，比几百个 DOM 节点省电。 */
  function initSnow() {
    if (!window.requestAnimationFrame) return;
    /* 系统里开了"减少动态效果"就不飘，这类人看着会难受 */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var mode = (C.site && C.site.snow) || 'auto';
    var q = (window.location && window.location.search) || '';
    var force = /[?&]snow=1\b/.test(q);
    var now = new Date();
    var isDay = (now.getMonth() === 10 && now.getDate() === 26);   /* 11 月 26 日 */
    var on = force || mode === 'on' || (mode === 'auto' && isDay);
    if (mode === 'off' && !force) on = false;
    if (!on) return;

    var cv = el('canvas', 'snow');
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);

    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) {
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      return;
    }

    var W = 0, H = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var flakes = [];

    function make() {
      return {
        x: Math.random() * (W || 1),
        y: Math.random() * (H || 1),
        r: 0.9 + Math.random() * 2.1,
        vy: 0.25 + Math.random() * 0.75,
        vx: -0.25 + Math.random() * 0.5,
        a: 0.2 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2
      };
    }

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var want = Math.round(Math.min(120, Math.max(36, W / 13)));
      while (flakes.length < want) flakes.push(make());
      if (flakes.length > want) flakes.length = want;
    }

    var t0 = 0;
    function frame(ts) {
      if (!t0) t0 = ts;
      var t = (ts - t0) / 1000;

      /* 白天是暖灰的雪，夜里是白的，不然浅色底上根本看不见 */
      var light = document.documentElement.getAttribute('data-theme') !== 'dark';
      var rgb = light ? '122,110,120' : '255,255,255';
      var k = light ? 0.5 : 1;

      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.vy;
        f.x += f.vx + Math.sin(t * 0.7 + f.ph) * 0.35;
        if (f.y > H + 8) { f.y = -8; f.x = Math.random() * W; }
        if (f.x < -10) f.x = W + 10;
        if (f.x > W + 10) f.x = -10;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + rgb + ',' + (f.a * k) + ')';
        ctx.fill();
      }
      window.requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.requestAnimationFrame(frame);
  }

  /* ══════════ 密码门 ══════════
     发布版里 content.js 换成了一段密文。密码不发给任何地方、也不联网校验，
     它只在本地派生密钥、解开内容：密码不对，什么都解不出来。
     所以这不是"糊一层挡板"，源码里也翻不到内容。 */
  function initGate(done) {
    var cfg = window.LOCKED || {};
    var SAVE = 'pigSitePw';

    var box = el('div', 'gate');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '输入密码');
    box.innerHTML =
      '<div class="gate__box">' +
        '<div class="gate__art"></div>' +
        '<p class="gate__title">这是给晓琳的小站</p>' +
        '<p class="gate__sub">用他给你的密码打开</p>' +
        '<form class="gate__form">' +
          '<input class="gate__input" type="password" autocomplete="current-password" ' +
                 'placeholder="密码" aria-label="密码">' +
          '<button class="gate__btn" type="submit">进去</button>' +
        '</form>' +
        '<p class="gate__err" role="alert"></p>' +
      '</div>';
    document.body.appendChild(box);

    var art = box.querySelector('.gate__art');
    if (art && typeof makePig === 'function') art.appendChild(makePig());

    var form = box.querySelector('.gate__form');
    var input = box.querySelector('.gate__input');
    var errEl = box.querySelector('.gate__err');
    var busy = false;

    function b64buf(s) {
      var bin = atob(s);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }

    function fail(msg) {
      busy = false;
      box.classList.remove('is-busy');
      errEl.textContent = msg;
      input.value = '';
      input.focus();
    }

    function tryOpen(pw) {
      var subtle = window.crypto && window.crypto.subtle;
      if (!subtle) { fail('这个浏览器不支持加密解锁，换 Chrome 或 Safari 试试'); return; }
      if (busy) return;

      busy = true;
      errEl.textContent = '';
      box.classList.add('is-busy');

      fetch(cfg.file || 'data/content.enc.json', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (p) {
          return subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
            .then(function (base) {
              return subtle.deriveKey(
                { name: 'PBKDF2', salt: b64buf(p.salt), iterations: p.iter, hash: 'SHA-256' },
                base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
            })
            .then(function (key) {
              return subtle.decrypt({ name: 'AES-GCM', iv: b64buf(p.iv) }, key, b64buf(p.ct));
            });
        })
        .then(function (plain) {
          window.CONTENT = JSON.parse(new TextDecoder().decode(plain));
          try { sessionStorage.setItem(SAVE, pw); } catch (e) {}

          document.documentElement.classList.remove('is-locked');
          box.classList.add('is-out');
          window.setTimeout(function () {
            if (box.parentNode) box.parentNode.removeChild(box);
          }, 620);
          done();
        })
        .catch(function (e) {
          var name = (e && e.name) || '';
          if (name === 'OperationError' || name === 'DOMException') fail('密码不对，再想想');
          else fail('打不开内容，检查一下网络再试');
        });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value) { fail('先输入密码'); return; }
      tryOpen(input.value);
    });

    /* 刷新不用重输：同一个标签页里记住刚才那个密码 */
    var saved = '';
    try { saved = sessionStorage.getItem(SAVE) || ''; } catch (e) {}
    if (saved) tryOpen(saved);
    else if (input.focus) input.focus();
  }

  function safe(name, fn) {
    try { fn(); } catch (e) {
      if (window.console && console.error) console.error('[小站] ' + name + ' 没画出来：', e);
    }
  }

  function boot() {
    safe('小猪', initPigs);
    safe('横屏提示', initRotateHint);
    safe('全屏', initFullscreen);
    safe('飘雪', initSnow);
    safe('开场动画', runPreloader);
    safe('封面', renderSite);
    safe('天数', renderCounter);
    safe('纪念日', renderAnniversaries);
    safe('时间线', renderTimeline);
    safe('照片墙', renderGallery);
    safe('她的样子', renderPortraits);
    safe('老地方', renderPlaces);
    safe('聊天记录', renderChats);
    safe('悄悄话', renderWhispers);
    safe('灯箱', initLightbox);
    safe('导航', initNav);
    safe('翻页', initPager);
    safe('主题', initTheme);
    safe('音乐', initMusic);
    safe('鼠标光晕', initCursor);
    safe('入场动画', flushReveal);

    // 绝对兜底：无论发生什么，内容都要出现
    setTimeout(startHero, 3600);
    setTimeout(finishPreloader, 4000);
  }

  window.__startHero = startHero;

  function start() {
    adoptContent();
    boot();
  }

  if (window.LOCKED) {
    /* 加密版：先过密码这一关，解出内容再启动 */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { initGate(start); });
    } else {
      initGate(start);
    }
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();