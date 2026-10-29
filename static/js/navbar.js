// Navbar user menu: open/close, outside click, Esc, arrow keys, focus handling
(function () {
    const root = document.getElementById('nvUser');
    const trigger = document.getElementById('nvTrigger');
    const menu = document.getElementById('nvMenu');
    if (!root || !trigger || !menu) return;

    function items() {
        var phone = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
        return Array.from(menu.querySelectorAll('.nv-item')).filter(function (el) {
            return phone || !el.classList.contains('nv-mobile-only');
        });
    }

    function isOpen() {
        return root.classList.contains('open');
    }

    function open(focusFirst) {
        root.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        if (focusFirst) {
            const list = items();
            if (list.length) list[0].focus();
        }
    }

    function close(returnFocus) {
        root.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
    }

    trigger.addEventListener('click', function () {
        if (isOpen()) close(false);
        else open(false);
    });

    // click anywhere outside closes
    document.addEventListener('click', function (event) {
        if (isOpen() && !root.contains(event.target)) close(false);
    });

    root.addEventListener('keydown', function (event) {
        const list = items();
        const index = list.indexOf(document.activeElement);

        if (event.key === 'Escape' && isOpen()) {
            event.preventDefault();
            close(true);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen()) open(true);
            else if (list.length) list[(index + 1) % list.length].focus();
        } else if (event.key === 'ArrowUp' && isOpen()) {
            event.preventDefault();
            if (list.length) list[(index <= 0 ? list.length : index) - 1].focus();
        } else if (event.key === 'Home' && isOpen() && list.length) {
            event.preventDefault();
            list[0].focus();
        } else if (event.key === 'End' && isOpen() && list.length) {
            event.preventDefault();
            list[list.length - 1].focus();
        }
    });

    // tabbing out of the menu closes it
    root.addEventListener('focusout', function (event) {
        if (isOpen() && event.relatedTarget && !root.contains(event.relatedTarget)) close(false);
    });
})();