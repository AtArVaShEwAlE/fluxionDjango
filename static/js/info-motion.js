// Shared motion for info pages (About / FAQ / Contact):
// word-by-word headline, scroll reveals, count-up numbers, card tilt.
// Everything degrades to the plain final state without JS or with reduced motion.
(function () {
    window.__infoMotion = true;   // tells the head failsafe that this script loaded

    const root = document.documentElement;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
        root.classList.remove('motion-ready');   // CSS then shows everything at once
        return;
    }

    // ---- 1. Split headline into words so CSS can animate them one by one ----
    document.querySelectorAll('[data-split]').forEach(function (el) {
        const words = el.textContent.trim().split(/\s+/);
        el.textContent = '';
        words.forEach(function (word, i) {
            const span = document.createElement('span');
            span.className = 'word';
            span.style.setProperty('--i', i);
            span.textContent = word;
            el.appendChild(span);
            if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        });
    });

    // ---- 2. Reveal on scroll ----
    const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
    if ('IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const delay = parseInt(el.getAttribute('data-reveal-delay'), 10);
                if (delay) el.style.transitionDelay = delay + 'ms';
                el.classList.add('is-visible');
                revealObserver.unobserve(el);
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
        revealEls.forEach(function (el) { revealObserver.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    }

    // ---- 3. Count-up numbers: markup holds the final value, we animate 0 -> value ----
    const counters = Array.from(document.querySelectorAll('[data-count]'));

    function runCount(el) {
        const target = parseFloat(el.getAttribute('data-count'));
        const suffix = el.getAttribute('data-suffix') || '';
        if (!isFinite(target)) return;
        const duration = 1200;
        const start = performance.now();
        function frame(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased) + suffix;
            if (t < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    if ('IntersectionObserver' in window) {
        const countObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                runCount(entry.target);
                countObserver.unobserve(entry.target);
            });
        }, { threshold: 0.6 });
        counters.forEach(function (el) {
            el.textContent = '0' + (el.getAttribute('data-suffix') || '');
            countObserver.observe(el);
        });
    }

    // ---- 4. Card tilt (mouse only) ----
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        document.querySelectorAll('[data-tilt]').forEach(function (card) {
            card.addEventListener('pointermove', function (event) {
                const rect = card.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width - 0.5;
                const y = (event.clientY - rect.top) / rect.height - 0.5;
                card.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
                card.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
                card.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
                card.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
            });
            card.addEventListener('pointerleave', function () {
                card.style.setProperty('--ry', '0deg');
                card.style.setProperty('--rx', '0deg');
            });
        });
    }
})();