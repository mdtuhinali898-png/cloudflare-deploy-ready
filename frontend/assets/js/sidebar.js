// ============================================
// EDUCART PREMIUM COLLAPSIBLE SIDEBAR
// ============================================
(function () {
    'use strict';

    const SIDEBAR_COLLAPSED_KEY = 'edusmart_sidebar_collapsed';

    // DOM refs
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');

    if (!sidebar) return;

    // Keep finance navigation compact while preserving the dashboard link.
    function setupFinanceMenu() {
        const nav = sidebar.querySelector('.sidebar-nav');
        const financeLink = nav?.querySelector('a.nav-item[href="finance.html"]');
        let expensesLink = nav?.querySelector('a.nav-item[href="expenses.html"]');
        let payrollLink = nav?.querySelector('a.nav-item[href="payroll.html"]');
        if (!nav || !financeLink || nav.querySelector('.finance-nav-group')) return;

        const createFinanceLink = (href, icon, label) => {
            const link = document.createElement('a');
            link.href = href;
            link.className = 'nav-item';
            link.innerHTML = `<i class="fas ${icon}"></i><span>${label}</span><span class="nav-tooltip">${label}</span>`;
            return link;
        };

        if (!expensesLink) expensesLink = createFinanceLink('expenses.html', 'fa-file-invoice-dollar', 'Expenses');
        if (!payrollLink) payrollLink = createFinanceLink('payroll.html', 'fa-users-cog', 'Payroll');

        const group = document.createElement('div');
        group.className = 'finance-nav-group';
        group.innerHTML = `
            <div class="finance-nav-heading">
                <a href="#" class="nav-item finance-nav-trigger">
                    <i class="fas fa-briefcase"></i><span>Finance Management</span><span class="nav-tooltip">Finance Management</span>
                </a>
                <button type="button" class="finance-nav-toggle" aria-label="Toggle finance menu" aria-expanded="false">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
            <div class="finance-nav-submenu"></div>`;

        const trigger = group.querySelector('.finance-nav-trigger');
        const toggle = group.querySelector('.finance-nav-toggle');
        const submenu = group.querySelector('.finance-nav-submenu');
        toggle.style.display = 'none';
        const dashboardWasActive = financeLink.classList.contains('active');

        const financeLabel = financeLink.querySelector('span:not(.nav-tooltip)');
        const financeTooltip = financeLink.querySelector('.nav-tooltip');
        if (financeLabel) financeLabel.textContent = 'Finance Dashboard';
        if (financeTooltip) financeTooltip.textContent = 'Finance Dashboard';

        trigger.classList.toggle('active', dashboardWasActive);
        submenu.append(expensesLink, payrollLink);
        nav.insertBefore(group, nav.querySelector('a.nav-item[href="book-store.html"]') || nav.firstElementChild);

        const setOpen = (open) => {
            group.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', String(open));
        };

        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(!group.classList.contains('open'));
        });

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            sidebar.querySelectorAll('.nav-item.active').forEach(item => item.classList.remove('active'));
            trigger.classList.add('active');
            setOpen(!group.classList.contains('open'));
        });

        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
        setOpen(currentPage === 'expenses.html' || currentPage === 'payroll.html');
    }

    setupFinanceMenu();

    // Restore collapsed state
    const wasCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    if (wasCollapsed) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
        updateToggleIcon(true);
    } else {
        updateToggleIcon(false);
    }

    // Update toggle icon based on collapsed state
    function updateToggleIcon(isCollapsed) {
        if (!sidebarToggle) return;
        const icon = sidebarToggle.querySelector('i');
        if (icon) {
            if (isCollapsed) {
                icon.className = 'fas fa-chevron-right';
                sidebarToggle.style.transform = 'rotate(0deg)';
            } else {
                icon.className = 'fas fa-chevron-left';
                sidebarToggle.style.transform = 'rotate(0deg)';
            }
        }
    }

    // Toggle function (mobile off-canvas / desktop collapse)
    function toggleSidebar() {
        const isMobile = window.innerWidth <= 992;
        if (isMobile) {
            const showing = sidebar.classList.toggle('show');
            document.body.style.overflow = showing ? 'hidden' : '';
            if (showing) {
                // Create/use overlay for mobile
                let overlay = document.querySelector('.sidebar-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'sidebar-overlay';
                    document.body.appendChild(overlay);
                    overlay.addEventListener('click', () => {
                        sidebar.classList.remove('show');
                        document.body.style.overflow = '';
                        overlay.classList.remove('active');
                    });
                }
                overlay.classList.add('active');
            } else {
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) overlay.classList.remove('active');
            }
        } else {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed', isCollapsed);
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
            updateToggleIcon(isCollapsed);
        }
    }

    // Click on collapse/expand button in sidebar header
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }

    // On mobile: close sidebar when clicking outside or on a nav item
    if ('matchMedia' in window && window.matchMedia('(max-width: 992px)').matches) {
        sidebar.classList.remove('collapsed');
        document.body.classList.remove('sidebar-collapsed');
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !e.target.closest('#sidebarToggle')) {
                sidebar.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    // Re-evaluate on resize to clear mobile states
    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) {
            sidebar.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    // Optional: Click on active nav item to collapse
    sidebar.querySelectorAll('.nav-item.active:not(.finance-nav-trigger):not([href="finance.html"])').forEach(item => {
        item.addEventListener('click', () => {
            if (!sidebar.classList.contains('collapsed')) {
                toggleSidebar();
            }
        });
    });

    // Set active nav item based on current page
    function setActiveNavItem() {
        const currentPage = window.location.pathname;
        const pageName = currentPage.split('/').pop() || 'dashboard.html';
        
        // Remove all active classes
        const allNavItems = document.querySelectorAll('.nav-item');
        allNavItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current page
        const activeLink = document.querySelector(`.nav-item[href="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        const financeGroup = document.querySelector('.finance-nav-group');
        if (financeGroup && (pageName === 'expenses.html' || pageName === 'payroll.html')) {
            financeGroup.classList.add('open');
            financeGroup.querySelector('.finance-nav-trigger')?.classList.add('active');
            financeGroup.querySelector('.finance-nav-toggle')?.setAttribute('aria-expanded', 'true');
        }
    }
    
    // Set active nav item on page load
    setActiveNavItem();

    const API_BASE_URL = 'http://localhost:5002/api';
    const sidebarSearchInput = document.getElementById('sidebarSearchInput');
    const sidebarSearchResults = document.getElementById('sidebarSearchResults');
    let sidebarSearchTimeout = null;

    function debounce(fn, delay = 220) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }

    function clearSearchResults() {
        if (!sidebarSearchResults) return;
        sidebarSearchResults.innerHTML = '';
        sidebarSearchResults.classList.remove('active');
    }

    function renderNoResults(query) {
        if (!sidebarSearchResults) return;
        sidebarSearchResults.innerHTML = `<div class="search-empty">No student found for “${query}”.</div>`;
        sidebarSearchResults.classList.add('active');
    }

    function renderSearchError() {
        if (!sidebarSearchResults) return;
        sidebarSearchResults.innerHTML = `<div class="search-empty">Unable to search right now. Please try again later.</div>`;
        sidebarSearchResults.classList.add('active');
    }

    function renderSearchResults(students, query) {
        if (!sidebarSearchResults) return;
        if (!students || students.length === 0) {
            renderNoResults(query);
            return;
        }

        const normalizedQuery = query.trim().toLowerCase();
        const exactMatch = students.find(s => String(s.studentId || '').toLowerCase() === normalizedQuery);
        if (exactMatch || students.length === 1) {
            const target = exactMatch || students[0];
            window.location.href = `/student-profile.html?id=${encodeURIComponent(target.studentId)}`;
            return;
        }

        sidebarSearchResults.classList.add('active');
        sidebarSearchResults.innerHTML = students.map(student => `
            <button type="button" class="search-result-item" data-id="${student.studentId}">
                <div class="search-result-meta">
                    <strong>${student.studentId}</strong>
                    <span>${student.name || 'Unnamed student'}</span>
                </div>
                <span class="search-result-phone">${student.phone || 'No phone'}</span>
            </button>
        `).join('');

        sidebarSearchResults.querySelectorAll('.search-result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.dataset.id;
                if (studentId) {
                    window.location.href = `/student-profile.html?id=${encodeURIComponent(studentId)}`;
                }
            });
        });
    }

    async function searchSidebarStudents(query) {
        if (!sidebarSearchResults) return;
        const trimmed = String(query || '').trim();
        if (!trimmed) {
            clearSearchResults();
            return;
        }

        sidebarSearchResults.innerHTML = '<div class="search-loading">Searching for students…</div>';
        sidebarSearchResults.classList.add('active');

        try {
            const response = await fetch(`${API_BASE_URL}/students?search=${encodeURIComponent(trimmed)}&limit=8`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.students)) {
                renderSearchError();
                return;
            }
            renderSearchResults(data.students, trimmed);
        } catch (error) {
            console.error('Sidebar student search failed:', error);
            renderSearchError();
        }
    }

    const debouncedSearch = debounce(searchSidebarStudents, 220);

    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', (event) => {
            const value = event.target.value;
            if (!value.trim()) {
                clearSearchResults();
                return;
            }
            debouncedSearch(value);
        });

        sidebarSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchSidebarStudents(event.target.value);
            }
        });

        document.addEventListener('click', (event) => {
            if (!sidebar.contains(event.target)) {
                clearSearchResults();
            }
        });
    }

    // Keyboard shortcut: Ctrl/Cmd + B to toggle
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });
})();
