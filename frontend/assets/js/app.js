/* ==========================================================================
   EduSmart Global App JavaScript - Shared across all pages
   ========================================================================== */

window.API_BASE_URL = window.API_BASE_URL || (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? (window.location.port === '5002' ? '/api' : 'http://localhost:5002/api')
        : '/api'
);
var API_BASE_URL = window.API_BASE_URL;

let globalInstituteInfo = {
    name: 'EduSmart Coaching Center',
    logo: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    established: '',
    about: '',
    director: ''
};

// Load institute info globally
async function loadGlobalInstituteInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/institute/public`);
        const result = await response.json();
        
        if (result.success && result.data) {
            globalInstituteInfo = { ...globalInstituteInfo, ...result.data };
            updateAllInstituteInfo();
        }
    } catch (error) {
        console.warn('Could not load global institute info:', error);
    }
}

// Update institute info across all pages
function updateAllInstituteInfo() {
    // Update title
    if (globalInstituteInfo.name) {
        if (!document.title.includes(globalInstituteInfo.name)) {
            const pagePrefix = document.title.split(' - ')[0] || document.title;
            document.title = `${pagePrefix} - ${globalInstituteInfo.name}`;
        }
        
        // Update sidebar logo
        const brandName = document.getElementById('landingBrandName');
        if (brandName) brandName.textContent = globalInstituteInfo.name;

        if (typeof window.updateSidebarInstituteInfo === 'function') {
            window.updateSidebarInstituteInfo();
        } else {
            const sidebarLogo = document.querySelector('.sidebar-logo');
            if (sidebarLogo) {
                const logoTextSpan = sidebarLogo.querySelector('span');
                if (logoTextSpan) {
                    const adminBadge = logoTextSpan.querySelector('.admin-badge');
                    const badgeHtml = adminBadge ? adminBadge.outerHTML : '<small class="admin-badge">Admin</small>';
                    const nameParts = globalInstituteInfo.name.trim().split(/\s+/);
                    let formattedHtml = '';
                    if (nameParts.length > 1) {
                        const firstPart = nameParts.slice(0, -1).join(' ');
                        const lastPart = nameParts[nameParts.length - 1];
                        formattedHtml = `${firstPart} <span class="gradient-text">${lastPart}</span>`;
                    } else {
                        formattedHtml = `<span class="gradient-text">${globalInstituteInfo.name}</span>`;
                    }
                    logoTextSpan.innerHTML = `${formattedHtml} ${badgeHtml}`;
                    logoTextSpan.title = globalInstituteInfo.name;
                }
                if (globalInstituteInfo.logo) {
                    const logoIcon = sidebarLogo.querySelector('.logo-icon');
                    if (logoIcon) {
                        logoIcon.innerHTML = `<img src="${globalInstituteInfo.logo}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`;
                    }
                }
            }
        }
    }
    
    // Update footer
    const footerDesc = document.getElementById('landingFooterDescription');
    if (footerDesc && globalInstituteInfo.about) {
        footerDesc.textContent = globalInstituteInfo.about;
    }
    
    // Update any element with institute classes
    if (globalInstituteInfo.name) {
        document.querySelectorAll('.institute-name').forEach(el => {
            el.textContent = globalInstituteInfo.name;
        });
    }
    if (globalInstituteInfo.phone) {
        document.querySelectorAll('.institute-phone').forEach(el => {
            el.textContent = globalInstituteInfo.phone;
        });
    }
    if (globalInstituteInfo.email) {
        document.querySelectorAll('.institute-email').forEach(el => {
            el.textContent = globalInstituteInfo.email;
        });
    }
    if (globalInstituteInfo.address) {
        document.querySelectorAll('.institute-address').forEach(el => {
            el.textContent = globalInstituteInfo.address;
        });
    }
    if (globalInstituteInfo.logo) {
        document.querySelectorAll('.institute-logo').forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = globalInstituteInfo.logo;
            }
        });
    }
}

// Get institute info
function getInstituteInfo() {
    return globalInstituteInfo;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGlobalInstituteInfo);
} else {
    loadGlobalInstituteInfo();
}