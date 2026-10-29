// Mobile nav helper: hide the bottom tab bar while a text field has focus
// (on-screen keyboard would otherwise push the bar over the form).
(function () {
    var root = document.documentElement;
    var mq = window.matchMedia('(max-width: 900px)');
    var NO_KEYBOARD = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];

    function needsKeyboard(el) {
        if (!el || !el.tagName) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'INPUT') return NO_KEYBOARD.indexOf((el.type || '').toLowerCase()) === -1;
        return false;
    }

    function clear() {
        root.classList.remove('kb-open');
    }

    document.addEventListener('focusin', function (event) {
        if (mq.matches && needsKeyboard(event.target)) root.classList.add('kb-open');
    });

    document.addEventListener('focusout', function () {
        setTimeout(function () {
            if (!needsKeyboard(document.activeElement)) clear();
        }, 60);
    });

    window.addEventListener('pageshow', clear);

    if (mq.addEventListener) mq.addEventListener('change', clear);
    else if (mq.addListener) mq.addListener(clear);
})();