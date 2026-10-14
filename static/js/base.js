// Base JavaScript for Fluxion
// Common functionality across all pages

document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add active state to navigation links
    updateActiveNavLink();
    
    // Close user dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const userMenu = document.querySelector('.navbar-user');
        const userDropdown = document.getElementById('userDropdown');
        
        if (userMenu && userDropdown) {
            if (!userMenu.contains(event.target)) {
                userDropdown.classList.remove('show');
            }
        }
    });
    
    // Navbar scroll effect
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar-container');
        if (navbar) {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
    });
});

// Update active navigation link based on current page
function updateActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.navbar-links a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (currentPath === '/' && href.includes('landing'))) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Toggle user dropdown menu
function toggleUserMenu() {
    const userDropdown = document.getElementById('userDropdown');
    if (userDropdown) {
        userDropdown.classList.toggle('show');
    }
}

// Auto-hide flash messages after 5 seconds
setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        alert.style.opacity = '0';
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 300);
    });
}, 5000);

// CSRF: Django rejects POST/PUT/DELETE without a token.
// Wrap fetch once so every same-origin write request carries it.
(function () {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        init = init || {};
        const method = (init.method || 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : input.url;
        const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
        if (sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const token = document.querySelector('meta[name="csrf-token"]');
            init.headers = new Headers(init.headers || {});
            if (token) init.headers.set('X-CSRFToken', token.content);
        }
        return originalFetch(input, init);
    };
})();