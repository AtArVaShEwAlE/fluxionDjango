// Landing page motion + interactive demo. Vanilla JS, no dependencies.
// Safe by design: if this file fails to load, the head script removes
// html.lx-motion after 3 s and all content is shown.
(function () {
    'use strict';

    window.__lxMotion = true;

    var root = document.documentElement;
    var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduce = !!(mqReduce && mqReduce.matches);
    if (reduce) root.classList.remove('lx-motion');

    var hasIO = 'IntersectionObserver' in window;

    var SCHEMES = {
        default: ['#1F9D6E', '#34C08D', '#157A56', '#6EE7B7', '#0E5C40'],
        blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'],
        purple: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
        rainbow: ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6']
    };
    var SCHEME_NAMES = { default: 'Green', blue: 'Blue', purple: 'Purple', rainbow: 'Rainbow' };
    var TYPE_NAMES = { bar: 'Bar', line: 'Line', area: 'Area', donut: 'Doughnut' };
    var LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
    var BASE = [38, 55, 47, 78, 92];

    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    // run cb once when el scrolls into view (or at once without IntersectionObserver)
    function whenVisible(el, cb, opts) {
        if (!hasIO) { cb(); return; }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) { io.unobserve(entry.target); cb(); }
            });
        }, opts || { threshold: 0.15 });
        io.observe(el);
    }

    // call on(visible) whenever el enters or leaves the viewport
    function watchVisible(el, on) {
        if (!hasIO) { on(true); return; }
        new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { on(entry.isIntersecting); });
        }, { threshold: 0.05 }).observe(el);
    }

    /* ---------- headline words ---------- */
    qsa('[data-split]').forEach(function (el) {
        var words = el.textContent.trim().split(/\s+/);
        el.textContent = '';
        words.forEach(function (w, i) {
            var span = document.createElement('span');
            span.className = 'word';
            span.style.setProperty('--i', i);
            span.textContent = w;
            el.appendChild(span);
            if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        });
    });

    /* ---------- scroll reveal ---------- */
    qsa('[data-lx]').forEach(function (el) {
        var d = parseInt(el.getAttribute('data-lx-delay'), 10);
        if (d) el.style.setProperty('--lx-d', d);
        if (reduce) { el.classList.add('lx-in'); return; }
        whenVisible(el, function () { el.classList.add('lx-in'); }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    });

    /* ---------- count-up numbers ---------- */
    qsa('[data-count]').forEach(function (el) {
        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        if (reduce || !isFinite(target)) return;
        el.textContent = '0' + suffix;
        whenVisible(el, function () {
            var start = null, dur = 1300;
            function tick(ts) {
                if (start === null) start = ts;
                var p = Math.min((ts - start) / dur, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased) + suffix;
                if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }, { threshold: 0.4 });
    });

    /* ---------- pointer effects (hover devices only) ---------- */
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover && !reduce) {
        var tilt = qs('#lxTilt');
        var win = tilt && qs('.lx-window', tilt);
        if (tilt && win) {
            tilt.addEventListener('pointermove', function (e) {
                var r = tilt.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width - 0.5;
                var y = (e.clientY - r.top) / r.height - 0.5;
                win.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
                win.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg');
            });
            tilt.addEventListener('pointerleave', function () {
                win.style.setProperty('--rx', '0deg');
                win.style.setProperty('--ry', '0deg');
            });
        }
        qsa('.lx-card').forEach(function (card) {
            card.addEventListener('pointermove', function (e) {
                var r = card.getBoundingClientRect();
                card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                card.style.setProperty('--my', (e.clientY - r.top) + 'px');
            });
        });
    }

    /* ---------- SVG charts ---------- */
    var uid = 0;

    function smoothPath(pts) {
        var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
        for (var i = 1; i < pts.length; i++) {
            var a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2;
            d += ' C' + mx.toFixed(1) + ' ' + a[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + b[1].toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
        }
        return d;
    }

    function chartSVG(type, values, palette) {
        var W = 420, H = 232, left = 34, right = 14, base = 200;
        var n = values.length, step = (W - left - right) / n;
        function cx(i) { return left + step * i + step / 2; }
        function y(v) { return base - (v / 100) * 160; }
        var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" focusable="false">';
        var id = 'lxg' + (++uid);

        if (type !== 'donut') {
            for (var k = 0; k <= 4; k++) {
                var gy = base - k * 40;
                out += '<line class="lx-grid-line" x1="' + left + '" x2="' + (W - right) + '" y1="' + gy + '" y2="' + gy + '"/>';
                out += '<text class="lx-tick" x="' + (left - 8) + '" y="' + (gy + 3) + '" text-anchor="end">' + (k * 25) + '</text>';
            }
            LABELS.forEach(function (l, i) {
                out += '<text class="lx-xlab" x="' + cx(i) + '" y="220" text-anchor="middle">' + l + '</text>';
            });
        }

        if (type === 'bar') {
            var bw = Math.min(46, step * 0.62);
            values.forEach(function (v, i) {
                var h = (v / 100) * 160;
                out += '<rect class="lx-bar" style="--i:' + i + '" x="' + (cx(i) - bw / 2).toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="7" fill="' + palette[i % palette.length] + '"><title>' + LABELS[i] + ': ' + v + '</title></rect>';
                out += '<text class="lx-vlab" x="' + cx(i) + '" y="' + (base - h - 6).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
            });
        } else if (type === 'line' || type === 'area') {
            var pts = values.map(function (v, i) { return [cx(i), y(v)]; });
            var color = palette[0];
            if (type === 'area') {
                out += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".38"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>';
                out += '<path class="lx-area" fill="url(#' + id + ')" d="' + smoothPath(pts) + ' L' + pts[n - 1][0].toFixed(1) + ' ' + base + ' L' + pts[0][0].toFixed(1) + ' ' + base + ' Z"/>';
            }
            out += '<path class="lx-line" pathLength="1" stroke="' + color + '" d="' + smoothPath(pts) + '"/>';
            pts.forEach(function (p, i) {
                out += '<circle class="lx-dotpt" style="--i:' + i + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5.5" fill="' + palette[i % palette.length] + '"><title>' + LABELS[i] + ': ' + values[i] + '</title></circle>';
            });
        } else {
            var R = 64, C = 2 * Math.PI * R, total = values.reduce(function (a, b) { return a + b; }, 0), off = 0, mid = 118;
            values.forEach(function (v, i) {
                var len = (v / total) * C;
                out += '<circle class="lx-seg-arc" style="--i:' + i + '" cx="130" cy="' + mid + '" r="' + R + '" fill="none" stroke="' + palette[i % palette.length] + '" stroke-width="30" stroke-dasharray="' + Math.max(len - 3, 0).toFixed(2) + ' ' + (C - Math.max(len - 3, 0)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 130 ' + mid + ')"><title>' + LABELS[i] + ': ' + v + '</title></circle>';
                off += len;
            });
            out += '<text class="lx-donut-total" x="130" y="' + (mid + 6) + '" text-anchor="middle">' + total + '</text>';
            out += '<text class="lx-donut-sub" x="130" y="' + (mid + 22) + '" text-anchor="middle">total</text>';
            values.forEach(function (v, i) {
                var ly = 52 + i * 28;
                out += '<rect x="250" y="' + (ly - 10) + '" width="12" height="12" rx="3" fill="' + palette[i % palette.length] + '"/>';
                out += '<text class="lx-xlab" x="270" y="' + ly + '">' + LABELS[i] + '</text>';
                out += '<text class="lx-vlab" x="400" y="' + ly + '" text-anchor="end">' + v + '</text>';
            });
        }
        return out + '</svg>';
    }

    /* ---------- hero chart (auto-rotates) ---------- */
    var heroBox = qs('#lxHeroChart');
    var heroTabs = qsa('#lxHeroTabs .lx-tab');
    if (heroBox && heroTabs.length) {
        var heroTypes = ['bar', 'line', 'donut'];
        var heroIdx = 0, heroTimer = null, heroManual = false;

        var showHero = function (type) {
            heroTabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-type') === type ? 'true' : 'false'); });
            heroBox.innerHTML = chartSVG(type, BASE, SCHEMES.default);
        };
        var stopHero = function () { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } };
        var startHero = function () {
            if (reduce || heroManual || heroTimer) return;
            heroTimer = setInterval(function () {
                heroIdx = (heroIdx + 1) % heroTypes.length;
                showHero(heroTypes[heroIdx]);
            }, 3800);
        };

        showHero('bar');
        heroTabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                heroManual = true;
                stopHero();
                heroIdx = heroTypes.indexOf(tab.getAttribute('data-type'));
                showHero(tab.getAttribute('data-type'));
            });
        });
        watchVisible(heroBox, function (vis) { if (vis) startHero(); else stopHero(); });
        document.addEventListener('visibilitychange', function () { if (document.hidden) stopHero(); else startHero(); });
    }

    /* ---------- interactive demo ---------- */
    var demoBox = qs('#lxDemoChart');
    if (demoBox) {
        var state = { type: 'bar', scheme: 'default', values: BASE.slice() };
        var caption = qs('#lxDemoCaption');
        var valuesBox = qs('#lxDemoValues');

        var renderDemo = function () {
            var palette = SCHEMES[state.scheme];
            demoBox.innerHTML = chartSVG(state.type, state.values, palette);
            if (caption) caption.textContent = TYPE_NAMES[state.type] + (state.type === 'donut' ? '' : ' chart') + ' \u00b7 ' + SCHEME_NAMES[state.scheme];
            if (valuesBox) {
                valuesBox.innerHTML = '';
                state.values.forEach(function (v, i) {
                    var chip = document.createElement('span');
                    chip.className = 'lx-val';
                    var dot = document.createElement('i');
                    dot.style.background = palette[i % palette.length];
                    var b = document.createElement('b');
                    b.textContent = v;
                    chip.appendChild(dot);
                    chip.appendChild(document.createTextNode(LABELS[i] + ' '));
                    chip.appendChild(b);
                    valuesBox.appendChild(chip);
                });
            }
        };

        qsa('#lxDemoTypes .lx-seg-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.type = btn.getAttribute('data-type');
                qsa('#lxDemoTypes .lx-seg-btn').forEach(function (b) {
                    var on = b === btn;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                renderDemo();
            });
        });
        qsa('#lxDemoSchemes .lx-sw').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.scheme = btn.getAttribute('data-scheme');
                qsa('#lxDemoSchemes .lx-sw').forEach(function (b) {
                    var on = b === btn;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                renderDemo();
            });
        });
        var shuffle = qs('#lxShuffle');
        if (shuffle) {
            shuffle.addEventListener('click', function () {
                state.values = BASE.map(function () { return 20 + Math.floor(Math.random() * 75); });
                renderDemo();
            });
        }
        renderDemo();
    }

    /* ---------- steps line ---------- */
    // (the line fill is CSS, triggered by .lx-in from the reveal above)

    /* ---------- board mock: tiles "refresh" on a timer ---------- */
    var board = qs('#lxBoard');
    if (board) {
        var bars = qsa('.lx-mini i', board);
        var statusText = qs('.lx-board-status-text', board);
        var randomize = function () {
            bars.forEach(function (b) { b.style.setProperty('--h', (22 + Math.floor(Math.random() * 74)) + '%'); });
        };
        randomize();
        var boardTimer = null;
        var refreshOnce = function () {
            board.classList.add('lx-refreshing');
            if (statusText) statusText.textContent = 'Refreshing...';
            randomize();
            setTimeout(function () {
                board.classList.remove('lx-refreshing');
                if (statusText) statusText.textContent = 'Auto-refresh \u00b7 30 s';
            }, 1100);
        };
        var stopBoard = function () { if (boardTimer) { clearInterval(boardTimer); boardTimer = null; } };
        var startBoard = function () { if (reduce || boardTimer) return; boardTimer = setInterval(refreshOnce, 4200); };
        watchVisible(board, function (vis) { if (vis) startBoard(); else stopBoard(); });
        document.addEventListener('visibilitychange', function () { if (document.hidden) stopBoard(); });
    }

    /* ---------- live stream mock ---------- */
    var liveLine = qs('#lxLiveLine');
    var liveArea = qs('#lxLiveArea');
    if (liveLine && liveArea) {
        var N = 28, W = 600, H = 200;
        var clampStep = function (cur) {
            var next = cur + (Math.random() - 0.5) * 22;
            return Math.max(18, Math.min(92, next));
        };
        var data = [], v = 55;
        for (var i = 0; i < N; i++) { v = clampStep(v); data.push(v); }
        var elVal = qs('#lxLiveVal'), elN = qs('#lxLiveN'), elAvg = qs('#lxLiveAvg');

        var drawLive = function () {
            var pts = data.map(function (d, i) { return [(i / (N - 1)) * W, H - (d / 100) * (H - 20) - 10]; });
            var d = smoothPath(pts);
            liveLine.setAttribute('d', d);
            liveArea.setAttribute('d', d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z');
            var last = data[data.length - 1];
            var avg = data.reduce(function (a, b) { return a + b; }, 0) / data.length;
            if (elVal) elVal.textContent = last.toFixed(1);
            if (elN) elN.textContent = String(data.length);
            if (elAvg) elAvg.textContent = avg.toFixed(1);
        };
        drawLive();

        var liveTimer = null;
        var stopLive = function () { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } };
        var startLive = function () {
            if (reduce || liveTimer) return;
            liveTimer = setInterval(function () {
                data.shift();
                data.push(clampStep(data[data.length - 1]));
                drawLive();
            }, 900);
        };
        watchVisible(liveLine, function (vis) { if (vis) startLive(); else stopLive(); });
        document.addEventListener('visibilitychange', function () { if (document.hidden) stopLive(); });
    }
})();