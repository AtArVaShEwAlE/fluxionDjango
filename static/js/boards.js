// Boards list page

function deleteBoard(btn, boardId) {
    const card = btn.closest('.report-card');
    const name = card ? card.dataset.name : 'this board';
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis only deletes the board - the charts inside it are kept.`)) return;

    if (card) {
        card.style.opacity = '0.5';
        card.style.pointerEvents = 'none';
    }

    fetch(`/delete-board/${boardId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (card) {
                card.style.transition = 'all 0.3s ease';
                card.style.transform = 'scale(0)';
                setTimeout(() => {
                    card.remove();
                    if (document.querySelectorAll('.report-card').length === 0) {
                        window.location.reload();
                    }
                }, 300);
            }
            showAlert('Board deleted successfully!', 'success');
        } else {
            showAlert(data.error || 'Failed to delete board', 'error');
            restoreCard(card);
        }
    })
    .catch(error => {
        console.error('Error deleting board:', error);
        showAlert('Error deleting board. Please try again.', 'error');
        restoreCard(card);
    });
}

function restoreCard(card) {
    if (!card) return;
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
}

function showAlert(message, type = 'info') {
    let flashContainer = document.querySelector('.flash-messages');
    if (!flashContainer) {
        flashContainer = document.createElement('div');
        flashContainer.className = 'flash-messages';
        document.body.appendChild(flashContainer);
    }

    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type}`;
    const text = document.createElement('span');
    text.textContent = message;
    alertEl.appendChild(text);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => alertEl.remove();
    alertEl.appendChild(closeBtn);
    flashContainer.appendChild(alertEl);

    setTimeout(() => {
        alertEl.style.opacity = '0';
        setTimeout(() => alertEl.remove(), 300);
    }, 5000);
}

// Search + sort (pure client-side)
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('boardSearchInput');
    const sortSelect = document.getElementById('boardSortSelect');
    const grid = document.getElementById('boardsGrid');
    if (!searchInput || !sortSelect || !grid) return;

    function applyFilters() {
        const query = searchInput.value.trim().toLowerCase();
        const cards = Array.from(grid.querySelectorAll('.report-card'));

        cards.forEach(card => {
            card.style.display = card.dataset.title.includes(query) ? '' : 'none';
        });

        const sortValue = sortSelect.value;
        cards.sort((a, b) => {
            if (sortValue === 'title-asc') return a.dataset.title.localeCompare(b.dataset.title);
            if (sortValue === 'title-desc') return b.dataset.title.localeCompare(a.dataset.title);
            if (sortValue === 'date-asc') return new Date(a.dataset.date) - new Date(b.dataset.date);
            return new Date(b.dataset.date) - new Date(a.dataset.date);
        });
        cards.forEach(card => grid.appendChild(card));
    }

    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
});