// Contact page: send via fetch, per-field errors, sending / success states
(function () {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const card = document.getElementById('ctFormCard');
    const submit = document.getElementById('ctSubmit');
    const submitLabel = submit.querySelector('.ct-submit-label');
    const status = document.getElementById('contactStatus');
    const success = document.getElementById('ctSuccess');
    const again = document.getElementById('ctAgain');
    const message = document.getElementById('contactMessage');
    const count = document.getElementById('ctCount');

    let sending = false;

    function setStatus(text, isError) {
        status.textContent = text;
        status.hidden = !text;
        status.classList.toggle('is-error', !!isError);
    }

    function clearErrors() {
        form.querySelectorAll('[data-error-for]').forEach(function (p) {
            p.textContent = '';
            p.hidden = true;
        });
        form.querySelectorAll('.ct-field').forEach(function (field) {
            field.classList.remove('has-error');
            const input = field.querySelector('input, textarea');
            if (input) input.removeAttribute('aria-invalid');
        });
        setStatus('', false);
    }

    // errors = {field: [message, ...]}. Returns true if at least one landed on a field.
    function showErrors(errors) {
        let placed = false;
        let firstInput = null;
        Object.keys(errors || {}).forEach(function (key) {
            const p = form.querySelector('[data-error-for="' + key + '"]');
            const input = form.elements[key];
            if (!p || !input) return;
            p.textContent = errors[key][0];
            p.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            input.closest('.ct-field').classList.add('has-error');
            if (!firstInput) firstInput = input;
            placed = true;
        });
        if (firstInput) firstInput.focus();
        return placed;
    }

    function setSending(on) {
        sending = on;
        submit.disabled = on;
        submit.classList.toggle('is-sending', on);
        submitLabel.textContent = on ? 'Sending...' : 'Send message';
    }

    function shake() {
        card.classList.remove('ct-shake');
        void card.offsetWidth;   // restart the animation
        card.classList.add('ct-shake');
    }

    function updateCount() {
        const n = message.value.length;
        count.textContent = n + (n === 1 ? ' character' : ' characters');
        message.style.height = 'auto';
        message.style.height = Math.min(message.scrollHeight, 320) + 'px';
    }

    message.addEventListener('input', updateCount);

    // typing in a field clears that field's error
    form.addEventListener('input', function (event) {
        const field = event.target.closest ? event.target.closest('.ct-field') : null;
        if (!field || !field.classList.contains('has-error')) return;
        field.classList.remove('has-error');
        event.target.removeAttribute('aria-invalid');
        const p = field.querySelector('[data-error-for]');
        if (p) {
            p.textContent = '';
            p.hidden = true;
        }
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (sending) return;

        clearErrors();
        setSending(true);

        try {
            const response = await fetch('/contact', { method: 'POST', body: new FormData(form) });
            let data = {};
            try {
                data = await response.json();
            } catch (e) {
                // non-JSON body (server error page): handled below
            }

            if (response.ok && data.success) {
                form.reset();
                updateCount();
                form.hidden = true;
                success.hidden = false;
                success.focus();
                return;
            }

            const placed = showErrors(data.errors);
            if (!placed) setStatus(data.error || 'Something went wrong, try again.', true);
            shake();
        } catch (error) {
            setStatus('Could not send. Check your connection and try again.', true);
            shake();
        } finally {
            setSending(false);
        }
    });

    again.addEventListener('click', function () {
        success.hidden = true;
        form.hidden = false;
        form.elements.name.focus();
    });

    updateCount();
})();