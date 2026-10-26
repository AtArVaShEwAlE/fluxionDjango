// Board view page (owner only): Share / Copy Link / Unshare
(function () {
    const dataEl = document.getElementById('boardData');
    const shareBtn = document.getElementById('shareBoardBtn');
    const unshareBtn = document.getElementById('unshareBoardBtn');
    const row = document.getElementById('boardShareRow');
    const input = document.getElementById('boardShareLink');
    if (!dataEl || !shareBtn || !unshareBtn || !row || !input) return;

    const data = JSON.parse(dataEl.textContent);
    const state = { id: data.id, shareUrl: data.is_public ? (data.share_url || '') : '' };

    function render() {
        const isPublic = !!state.shareUrl;
        shareBtn.textContent = isPublic ? 'Copy Link' : 'Share';
        unshareBtn.style.display = isPublic ? '' : 'none';
        row.style.display = isPublic ? '' : 'none';
        input.value = state.shareUrl;
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        } else {
            input.select();
            document.execCommand('copy');
        }
    }

    async function post(path) {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        let body = {};
        try {
            body = await response.json();
        } catch (e) {
            // non-JSON body: fall through to the error below
        }
        if (!response.ok || !body.success) {
            throw new Error(body.error || `Server error (${response.status})`);
        }
        return body;
    }

    shareBtn.addEventListener('click', async function () {
        if (!state.shareUrl) {
            shareBtn.disabled = true;
            shareBtn.textContent = 'Generating...';
            try {
                const body = await post(`/share-board/${state.id}`);
                state.shareUrl = body.share_url;
            } catch (error) {
                alert('Could not share: ' + error.message);
                shareBtn.disabled = false;
                render();
                return;
            }
            shareBtn.disabled = false;
        }
        render();
        copyText(state.shareUrl);
        shareBtn.textContent = 'Copied!';
        setTimeout(render, 1500);
    });

    unshareBtn.addEventListener('click', async function () {
        if (!confirm('Stop sharing this board?\n\nAnyone with the link will lose access.')) return;
        unshareBtn.disabled = true;
        try {
            await post(`/unshare-board/${state.id}`);
            state.shareUrl = '';
            render();
        } catch (error) {
            alert('Could not unshare: ' + error.message);
        }
        unshareBtn.disabled = false;
    });

    input.addEventListener('focus', function () { input.select(); });
    render();
})();