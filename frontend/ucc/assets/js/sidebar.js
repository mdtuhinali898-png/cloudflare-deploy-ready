// ============================================
// EDUCART PREMIUM COLLAPSIBLE SIDEBAR
// ============================================
(function () {
    'use strict';

    // Clear any legacy collapsed state saved by older auto-collapse behavior
    localStorage.removeItem('edusmart_sidebar_collapsed');
    localStorage.removeItem('uccSidebarCollapsed');

    // DOM refs
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const menuToggle = document.getElementById('menuToggle');

    if (!sidebar) return;

    // Sidebar always starts expanded. Use the toggle button to collapse/expand.
    updateToggleIcon(false);

    // Update toggle icon based on collapsed state
    function updateToggleIcon(isCollapsed, overrideIcon) {
        if (!sidebarToggle) return;
        const icon = sidebarToggle.querySelector('i');
        if (icon) {
            if (overrideIcon) {
                icon.className = overrideIcon;
            } else if (isCollapsed) {
                icon.className = 'fas fa-chevron-right';
            } else {
                icon.className = 'fas fa-chevron-left';
            }
            sidebarToggle.style.transform = 'rotate(0deg)';
        }
    }

    function createSidebarOverlay() {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', closeMobileSidebar);
        }
        return overlay;
    }

    function setOverlayActive(active) {
        const overlay = createSidebarOverlay();
        overlay.classList.toggle('active', active);
    }

    function closeMobileSidebar() {
        sidebar.classList.remove('show');
        document.body.style.overflow = '';
        setOverlayActive(false);
        updateToggleIcon(sidebar.classList.contains('collapsed'));
    }

    // Toggle function (mobile off-canvas / desktop collapse)
    function toggleSidebar() {
        const isMobile = window.innerWidth <= 992;
        if (isMobile) {
            const showing = sidebar.classList.toggle('show');
            document.body.style.overflow = showing ? 'hidden' : '';
            if (showing) {
                sidebar.classList.remove('collapsed');
                document.body.classList.remove('sidebar-collapsed');
                updateToggleIcon(false, 'fas fa-times');
                setOverlayActive(true);
            } else {
                closeMobileSidebar();
            }
        } else {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            document.body.classList.toggle('sidebar-collapsed', isCollapsed);
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

    // Mobile menu button opens the sidebar overlay
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            if (window.innerWidth <= 992) {
                toggleSidebar();
            }
        });
    }

    // Close mobile sidebar when clicking outside of it
    document.addEventListener('click', (e) => {
        if (window.innerWidth > 992) return;
        if (!sidebar.classList.contains('show')) return;
        if (
            sidebar.contains(e.target) ||
            e.target.closest('#sidebarToggle') ||
            e.target.closest('#menuToggle') ||
            e.target.closest('.sidebar-overlay')
        ) {
            return;
        }

        closeMobileSidebar();
    });

    const initialOverlay = document.querySelector('.sidebar-overlay');
    if (initialOverlay) {
        initialOverlay.addEventListener('click', closeMobileSidebar);
    }

    // Re-evaluate on resize to clear mobile states
    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) {
            sidebar.classList.remove('show');
            document.body.style.overflow = '';
            setOverlayActive(false);
        }

        if (window.innerWidth <= 992 && sidebar.classList.contains('show')) {
            sidebar.classList.remove('collapsed');
            document.body.classList.remove('sidebar-collapsed');
            updateToggleIcon(false);
            setOverlayActive(true);
        }
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
    }
    
    // Set active nav item on page load
    setActiveNavItem();

    // Keyboard shortcut: Ctrl/Cmd + B to toggle
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });

    // -----------------------------
    // Sidebar student search (UCC)
    // -----------------------------
    const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? (window.location.port === '5002' ? '/api' : `${window.location.protocol}//${window.location.hostname}:5002/api`)
      : 'http://localhost:5002/api';
    const sidebarSearchInput = document.getElementById('sidebarSearchInput');
    const sidebarSearchResults = document.getElementById('sidebarSearchResults');

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
        const exactMatch = students.find(s => String(s.studentId || s.roll || s._id || '').toLowerCase() === normalizedQuery);
        if (exactMatch || students.length === 1) {
            const target = exactMatch || students[0];
            const idParam = target.roll || target.studentId || target._id || target.id || '';
            // Redirect to UCC student profile page with roll param
            window.location.href = `student-profile.html?roll=${encodeURIComponent(idParam)}`;
            return;
        }

        sidebarSearchResults.classList.add('active');
        sidebarSearchResults.innerHTML = students.map(student => `
            <button type="button" class="search-result-item" data-id="${student.roll || student.studentId || student._id}">
                <div class="search-result-meta">
                    <strong>${student.roll || student.studentId || 'N/A'}</strong>
                    <span>${student.name || 'Unnamed student'}</span>
                </div>
                <span class="search-result-phone">${student.phone || 'No phone'}</span>
            </button>
        `).join('');

        sidebarSearchResults.querySelectorAll('.search-result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.dataset.id;
                if (studentId) {
                    window.location.href = `student-profile.html?roll=${encodeURIComponent(studentId)}`;
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
            const response = await fetch(`${API_BASE_URL}/ucc/students?search=${encodeURIComponent(trimmed)}`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.students)) {
                renderSearchError();
                return;
            }
            renderSearchResults(data.students, trimmed);
        } catch (error) {
            console.error('UCC sidebar student search failed:', error);
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

})();
