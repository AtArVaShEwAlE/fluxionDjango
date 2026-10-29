// FAQ page: live search, topic chips, expand/collapse all, animated open/close
(function () {
    const list = document.getElementById('faqList');
    if (!list) return;

    const items = Array.from(list.querySelectorAll('.faq-item'));
    const search = document.getElementById('faqSearch');
    const clearBtn = document.getElementById('faqClear');
    const countEl = document.getElementById('faqCount');
    const emptyEl = document.getElementById('faqEmpty');
    const resetBtn = document.getElementById('faqReset');
    const chips = Array.from(document.querySelectorAll('.fq-chip'));
    const expandBtn = document.getElementById('faqExpand');
    const collapseBtn = document.getElementById('faqCollapse');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let activeCat = 'all';

    // ---- Filter: topic chip + search text ----
    function applyFilter() {
        const query = (search ? search.value : '').trim().toLowerCase();
        let shown = 0;

        items.forEach(function (item) {
            const catOk = activeCat === 'all' || item.getAttribute('data-cat') === activeCat;
            const textOk = !query || item.textContent.toLowerCase().indexOf(query) !== -1;
            const visible = catOk && textOk;
            item.hidden = !visible;
            if (visible) shown++;
        });

        if (countEl) {
            countEl.textContent = shown === items.length
                ? `${items.length} questions`
                : `${shown} of ${items.length} questions`;
        }
        if (emptyEl) emptyEl.hidden = shown !== 0;
        if (clearBtn) clearBtn.hidden = !query;
    }

    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            activeCat = chip.getAttribute('data-cat');
            chips.forEach(function (c) {
                const on = c === chip;
                c.classList.toggle('active', on);
                c.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            applyFilter();
        });
    });

    function resetFilters() {
        if (search) search.value = '';
        activeCat = 'all';
        chips.forEach(function (c) {
            const on = c.getAttribute('data-cat') === 'all';
            c.classList.toggle('active', on);
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        applyFilter();
    }

    if (search) {
        search.addEventListener('input', applyFilter);
        search.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                search.value = '';
                applyFilter();
            }
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            search.value = '';
            applyFilter();
            search.focus();
        });
    }
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);

    // "/" jumps to the search box (unless already typing somewhere)
    document.addEventListener('keydown', function (event) {
        const tag = (event.target.tagName || '').toLowerCase();
        if (event.key === '/' && tag !== 'input' && tag !== 'textarea' && search) {
            event.preventDefault();
            search.focus();
        }
    });

    // ---- Expand / collapse all (visible items only) ----
    function setAll(open) {
        items.forEach(function (item) {
            if (!item.hidden) item.open = open;
        });
    }
    if (expandBtn) expandBtn.addEventListener('click', function () { setAll(true); });
    if (collapseBtn) collapseBtn.addEventListener('click', function () { setAll(false); });

    // ---- Animated open / close (native <details> snaps shut) ----
    items.forEach(function (item) {
        const summary = item.querySelector('summary');
        const answer = item.querySelector('.faq-answer');
        if (!summary || !answer) return;

        summary.addEventListener('click', function (event) {
            if (reduce || typeof answer.animate !== 'function') return;   // native behaviour
            event.preventDefault();

            if (item.open) {
                const from = answer.offsetHeight;
                answer.style.overflow = 'hidden';
                const closing = answer.animate(
                    [{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
                    { duration: 220, easing: 'ease' }
                );
                closing.onfinish = function () {
                    item.open = false;
                    answer.style.overflow = '';
                };
            } else {
                item.open = true;
                const to = answer.offsetHeight;
                answer.style.overflow = 'hidden';
                const opening = answer.animate(
                    [{ height: '0px', opacity: 0 }, { height: to + 'px', opacity: 1 }],
                    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                );
                opening.onfinish = function () {
                    answer.style.overflow = '';
                };
            }
        });
    });

    applyFilter();
})();