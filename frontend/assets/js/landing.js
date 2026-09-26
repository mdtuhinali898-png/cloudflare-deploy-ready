/* ==========================================================================
   EduSmart Landing Page JavaScript - Interactive Core
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const copyrightYear = document.getElementById('landingCopyrightYear');
  if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();
  applyLandingSettings();
  loadSharedLandingSettings();
  initNavbar();
  initSearchFilter();
  initCounters();
  initTestimonials();
  initFAQ();
  initModals();
  initSmoothScroll();
});

/* --------------------------------------------------------------------------
   Landing content managed from Admin Settings.  Existing markup is used until
   the admin creates at least one custom program card.
   -------------------------------------------------------------------------- */
function applyLandingSettings() {
  let settings;
  try { settings = JSON.parse(localStorage.getItem('erp_settings') || '{}'); } catch (_) { settings = {}; }
  applyLandingData(settings.landing);
}

async function loadSharedLandingSettings() {
  try {
    const response = await fetch('/api/landing-settings');
    const result = await response.json();
    if (result.success && result.data) applyLandingData(result.data);
  } catch (_) {
    // The landing page continues with the local/default content when offline.
  }
}

function applyLandingData(landing) {
  if (!landing) return;

  setBrandName(landing.brandName);
  setText('landingHeroTitle', landing.heroTitle);
  setText('landingHeroDescription', landing.heroDescription);
  setText('landingFooterDescription', landing.footerDescription);
  setText('landingOfficeHours', landing.officeHours);
  renderLandingFooter(landing);
  if (Object.prototype.hasOwnProperty.call(landing, 'heroImage')) {
    const heroImage = document.getElementById('landingHeroImage');
    if (heroImage) heroImage.src = landing.heroImage || 'assets/images/hero-student.jpg';
  }
  if (Array.isArray(landing.programs) && landing.programs.length) renderCustomPrograms(landing.programs);
  if (landing.whyUs) renderWhyUs(landing.whyUs);
  if (landing.teachers) renderTeachers(landing.teachers);
  
  // Load dynamic notices
  loadNotices();
}

function renderLandingFooter(landing) {
  const footer = landing.footer || {};
  const footerRoot = document.querySelector('.footer');
  if (!footerRoot) return;
  const brand = footerRoot.querySelector('.footer-col-brand h3');
  if (brand && landing.brandName) brand.lastChild.textContent = ` ${landing.brandName}`;
  const socialHeading = footerRoot.querySelector('#landingFooterSocialHeading');
  if (socialHeading) {
    socialHeading.textContent = footer.socialHeading || '';
    socialHeading.hidden = !footer.socialHeading;
  }
  const columns = footerRoot.querySelectorAll('.footer-grid > .footer-col');
  [footer.quickHeading, footer.programsHeading, footer.contactHeading].forEach((heading, index) => {
    if (heading && columns[index]?.querySelector('h4')) columns[index].querySelector('h4').textContent = heading;
  });
  const contactItems = footerRoot.querySelectorAll('.footer-grid > .footer-col:nth-child(4) .footer-contact-item span');
  const address = contactItems[0];
  const phone = contactItems[1];
  const email = contactItems[2];
  if (address && footer.address) address.textContent = footer.address;
  if (phone && footer.phone) phone.textContent = footer.phone;
  if (email && footer.email) email.textContent = footer.email;
  const social = footerRoot.querySelector('.social-links');
  if (social) {
    const socials = [['facebook','Facebook','fab fa-facebook-f'],['youtube','YouTube','fab fa-youtube'],['linkedin','LinkedIn','fab fa-linkedin-in'],['instagram','Instagram','fab fa-instagram']];
    social.innerHTML = socials.filter(([key]) => footer[key]).map(([key,label,icon]) => `<a href="${safeLandingHref(footer[key])}" class="social-btn" aria-label="${label}" target="_blank" rel="noopener noreferrer"><i class="${icon}"></i></a>`).join('');
  }
  const linkGroups = [footer.quickLinks, footer.programLinks, footer.bottomLinks];
  const containers = [columns[0]?.querySelector('.footer-links'), columns[1]?.querySelector('.footer-links'), footerRoot.querySelector('.footer-bottom-links')];
  linkGroups.forEach((links, index) => {
    if (!Array.isArray(links) || !containers[index]) return;
    containers[index].innerHTML = links.map(link => `<a href="${safeLandingHref(link.url)}">${escapeLandingHtml(link.label)}</a>`).join('');
  });
}

function safeLandingHref(value) {
  const href = String(value || '').trim();
  return /^(https?:\/\/|#|\/|[a-z0-9][a-z0-9._/-]*$)/i.test(href) ? escapeLandingHtml(href) : '#';
}

function setBrandName(name) {
  if (!name) return;
  const brandName = document.getElementById('landingBrandName');
  if (!brandName) return;

  brandName.textContent = name;
  brandName.dataset.shortName = createInstituteAcronym(name);
  brandName.title = name;
}

function createInstituteAcronym(name) {
  const words = String(name)
    .replace(/[’']/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.slice(0, 3).map(word => word.charAt(0).toUpperCase()).join('') || 'EDU';
}

function setText(id, value) {
  if (!value) return;
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderCustomPrograms(programs) {
  const grid = document.getElementById('programsGrid');
  if (!grid) return;
  grid.innerHTML = programs.map((program, index) => {
    const title = escapeLandingHtml(program.title);
    const description = escapeLandingHtml(program.description);
    const price = escapeLandingHtml(program.price || 'Contact for price');
    const icon = /^[a-zA-Z0-9 -]+$/.test(program.icon || '') ? program.icon : 'fas fa-book';
    const className = escapeLandingHtml(program.className || 'all');
    const category = escapeLandingHtml(program.category || 'general');
    const type = escapeLandingHtml(program.type || 'regular');
    return `<div class="program-card" data-class="${className}" data-program="${category}" data-type="${type}">
      <div><div class="prog-icon-box prog-icon-medical"><i class="${icon}"></i></div><h3>${title}</h3><p>${description}</p></div>
      <div class="card-footer-action"><div class="price-tag">${price}</div><button class="btn btn-outline btn-sm btn-view-details" data-program-key="custom-${index}">View Details <i class="fas fa-chevron-right"></i></button></div>
    </div>`;
  }).join('');
}

function renderWhyUs(whyUs) {
  setText('whyUsEyebrow', whyUs.eyebrow);
  setText('whyUsTitle', whyUs.title);
  setText('whyUsDescription', whyUs.description);

  if (!Array.isArray(whyUs.cards) || !whyUs.cards.length) return;
  const grid = document.getElementById('whyUsGrid');
  if (!grid) return;

  grid.innerHTML = whyUs.cards.map(card => {
    const icon = /^[a-zA-Z0-9 -]+$/.test(card.icon || '') ? card.icon : 'fas fa-star';
    return `<div class="why-card"><div class="why-icon-wrapper"><i class="${icon}"></i></div><h3>${escapeLandingHtml(card.title)}</h3><p>${escapeLandingHtml(card.description)}</p></div>`;
  }).join('');
}

function renderTeachers(teachers) {
  setText('teachersEyebrow', teachers.eyebrow);
  setText('teachersTitle', teachers.title);
  setText('teachersDescription', teachers.description);
  if (!Array.isArray(teachers.cards) || !teachers.cards.length) return;

  const grid = document.getElementById('teachersGrid');
  if (!grid) return;
  grid.innerHTML = teachers.cards.map(card => {
    const photo = safeLandingUrl(card.photo, 'assets/images/hero-student.jpg');
    const linkedin = safeLandingUrl(card.linkedin, '');
    const youtube = safeLandingUrl(card.youtube, '');
    const facebook = safeLandingUrl(card.facebook, '');
    const socialLinks = [
      linkedin && `<a href="${linkedin}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i class="fab fa-linkedin-in"></i></a>`,
      youtube && `<a href="${youtube}" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i class="fab fa-youtube"></i></a>`,
      facebook && `<a href="${facebook}" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>`
    ].filter(Boolean).join('');
    return `<div class="teacher-card"><div class="teacher-img-wrapper"><img src="${photo}" alt="${escapeLandingHtml(card.name)}"></div><div class="teacher-info"><span class="teacher-subject-tag">${escapeLandingHtml(card.subject)}</span><h3>${escapeLandingHtml(card.name)}</h3><div class="teacher-deg">${escapeLandingHtml(card.qualification)}</div><p class="teacher-description">${escapeLandingHtml(card.description)}</p>${socialLinks ? `<div class="teacher-socials">${socialLinks}</div>` : ''}</div></div>`;
  }).join('');
}

function safeLandingUrl(value, fallback) {
  const url = String(value || '').trim();
  return /^(https?:\/\/|\/|assets\/)/i.test(url) ? escapeLandingHtml(url) : fallback;
}

function escapeLandingHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[char]));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[char]));
}

/* --------------------------------------------------------------------------
   Dynamic Notice Loading
   -------------------------------------------------------------------------- */
async function loadNotices() {
    const noticeGrid = document.getElementById('noticeGrid');
    if (!noticeGrid) return;

    try {
        const response = await fetch('/api/notices/public');
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            noticeGrid.innerHTML = result.data.map(notice => `
                <div class="notice-card">
                    <div>
                        <div class="notice-header">
                            <span class="badge badge-${notice.badgeColor || 'primary'}"><i class="${notice.icon || 'fas fa-bullhorn'}"></i> ${escapeHtml(notice.badge || 'Notice')}</span>
                            <div class="notice-date-badge"><i class="far fa-calendar-alt"></i> ${new Date(notice.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
                        </div>
                        <h3>${escapeHtml(notice.title)}</h3>
                        <p>${escapeHtml(notice.description)}</p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${notice.pdfUrl ? `<button class="btn btn-outline btn-sm btn-student-login" onclick="window.open('${notice.pdfUrl}', '_blank')"><i class="fas fa-file-pdf"></i> Download PDF</button>` : ''}
                        <button class="btn btn-outline btn-sm btn-student-login" onclick="window.location.href='${notice.buttonLink || '#'}'">
                            ${escapeHtml(notice.buttonText || 'Learn More')} <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.warn('Could not load notices from server:', error);
    }
}

/* --------------------------------------------------------------------------
   1. Navbar & Mobile Menu
   -------------------------------------------------------------------------- */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navMenu = document.querySelector('.nav-menu');

  // Create overlay element
  let overlay = document.querySelector('.nav-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);
  }

  function closeMenu() {
    navMenu.classList.remove('active');
    overlay.classList.remove('active');
    const icon = mobileToggle.querySelector('i');
    if (icon) icon.className = 'fas fa-bars';
    document.body.style.overflow = '';
  }

  function openMenu() {
    navMenu.classList.add('active');
    overlay.classList.add('active');
    const icon = mobileToggle.querySelector('i');
    if (icon) icon.className = 'fas fa-times';
    document.body.style.overflow = 'hidden';
  }

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.style.boxShadow = '0 15px 35px -10px rgba(15, 23, 42, 0.12)';
      navbar.style.background = 'rgba(255, 255, 255, 0.95)';
    } else {
      navbar.style.boxShadow = '0 10px 30px -10px rgba(15, 23, 42, 0.08)';
      navbar.style.background = 'rgba(255, 255, 255, 0.85)';
    }
  });

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      if (navMenu.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close menu when clicking overlay
    overlay.addEventListener('click', closeMenu);
  }

  // Close menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('active')) {
      closeMenu();
    }
  });
}

/* --------------------------------------------------------------------------
   2. Search & Program Filter
   -------------------------------------------------------------------------- */
function initSearchFilter() {
  const searchBtn = document.getElementById('searchProgramsBtn');
  const selectClass = document.getElementById('selectClass');
  const selectProgram = document.getElementById('selectProgram');
  const selectType = document.getElementById('selectType');

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const selectedClassVal = selectClass.value.toLowerCase();
      const selectedProgVal = selectProgram.value.toLowerCase();
      const selectedTypeVal = selectType.value.toLowerCase();

      let matchCount = 0;

      document.querySelectorAll('.program-card').forEach(card => {
        const progTag = (card.getAttribute('data-program') || '').toLowerCase();
        const classTag = (card.getAttribute('data-class') || '').toLowerCase();
        const typeTag = (card.getAttribute('data-type') || '').toLowerCase();

        const matchesClass = (selectedClassVal === 'all' || selectedClassVal === '' || classTag.includes(selectedClassVal));
        const matchesProg = (selectedProgVal === 'all' || selectedProgVal === '' || progTag.includes(selectedProgVal));
        const matchesType = (selectedTypeVal === 'all' || selectedTypeVal === '' || typeTag.includes(selectedTypeVal));

        if (matchesClass && matchesProg && matchesType) {
          card.style.display = 'flex';
          card.style.animation = 'fadeInUp 0.4s ease forwards';
          matchCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Smooth scroll to programs section
      const progSection = document.getElementById('programs');
      if (progSection) {
        progSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

/* --------------------------------------------------------------------------
   3. Animated Count-Up Counters
   -------------------------------------------------------------------------- */
function initCounters() {
  const statNumbers = document.querySelectorAll('.stat-number');
  if (!statNumbers.length) return;

  let animated = false;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !animated) {
        animated = true;
        statNumbers.forEach(stat => {
          const target = parseInt(stat.getAttribute('data-target') || '0', 10);
          const suffix = stat.getAttribute('data-suffix') || '';
          let count = 0;
          const duration = 2000;
          const stepTime = 30;
          const increment = Math.ceil(target / (duration / stepTime));

          const timer = setInterval(() => {
            count += increment;
            if (count >= target) {
              count = target;
              clearInterval(timer);
            }
            stat.textContent = count.toLocaleString() + suffix;
          }, stepTime);
        });
      }
    });
  }, { threshold: 0.4 });

  const statsSection = document.querySelector('.stats-section');
  if (statsSection) {
    observer.observe(statsSection);
  }
}

/* --------------------------------------------------------------------------
   4. Student Testimonial Slider
   -------------------------------------------------------------------------- */
const testimonialsData = [
  {
    quote: "EduSmart changed the way I prepare for exams. The weekly analytical model tests helped me pinpoint my exact weak areas in Organic Chemistry, securing my spot at DMC!",
    name: "Tanvir Hasan",
    achievement: "Admitted to Dhaka Medical College (14th Position)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"
  },
  {
    quote: "The faculty at EduSmart consists of top BUET grads who break down complex physics problems into effortless concepts. The online note archive was a lifesaver.",
    name: "Nusrat Jahan",
    achievement: "Admitted to BUET CSE (22nd Merit)",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=200"
  },
  {
    quote: "Parental SMS updates and instant mobile result dashboards kept me disciplined throughout HSC. Truly the best coaching management system!",
    name: "Abrar Shahriar",
    achievement: "DU A-Unit 4th Rank (Admission 2025)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200"
  }
];

function initTestimonials() {
  let currentIndex = 0;
  const card = document.getElementById('testimonialCard');
  const prevBtn = document.getElementById('prevTestimonial');
  const nextBtn = document.getElementById('nextTestimonial');

  if (!card) return;

  function renderTestimonial(index) {
    const data = testimonialsData[index];
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';

    setTimeout(() => {
      card.querySelector('.quote-text').textContent = `"${data.quote}"`;
      card.querySelector('.student-name').textContent = data.name;
      card.querySelector('.student-achievement').textContent = data.achievement;
      const avatarImg = card.querySelector('.student-avatar');
      if (avatarImg) avatarImg.src = data.avatar;

      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 200);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % testimonialsData.length;
      renderTestimonial(currentIndex);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + testimonialsData.length) % testimonialsData.length;
      renderTestimonial(currentIndex);
    });
  }

  // Auto slide every 6 seconds
  setInterval(() => {
    currentIndex = (currentIndex + 1) % testimonialsData.length;
    renderTestimonial(currentIndex);
  }, 6000);
}

/* --------------------------------------------------------------------------
   5. FAQ Accordion
   -------------------------------------------------------------------------- */
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all other items
        faqItems.forEach(otherItem => {
          otherItem.classList.remove('active');
        });

        // Toggle current item
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });
}

/* --------------------------------------------------------------------------
   6. Modals (Program Details & Login Modal)
   -------------------------------------------------------------------------- */
const programModalDetails = {
  medical: {
    title: "Medical Admission Masterclass 2026",
    details: "Designed specifically for aspiring doctors aiming for Top Medical Colleges (DMC, SSMC, SOMC). Complete coverage of Biology, Chemistry, Physics, and General Knowledge with 100+ Model Tests & OMR evaluation.",
    duration: "6 Months Intensive",
    schedule: "Sun, Tue, Thu (8:00 AM - 12:00 PM)",
    fee: "৳ 18,500 BDT"
  },
  engineering: {
    title: "BUET & Engineering Admission Care",
    details: "Focuses on high-level mathematical problem solving, conceptual physics, and analytical organic chemistry. Includes 40+ engineering standard written model tests and BUET alumnus mentorship.",
    duration: "6 Months Comprehensive",
    schedule: "Sat, Mon, Wed (2:00 PM - 6:00 PM)",
    fee: "৳ 20,000 BDT"
  },
  varsity_a: {
    title: "Varsity A Unit Science Special",
    details: "Targeted preparation for Dhaka University A Unit, Jahangirnagar University, and Agriculture Alliance. Short-cut MCQ solving tricks and speed tests.",
    duration: "5 Months",
    schedule: "Daily Afternoon Batches",
    fee: "৳ 15,000 BDT"
  },
  varsity_b: {
    title: "Varsity B Unit Arts & General Unit",
    details: "Specialized coaching in Advanced English Grammar, Bangla Literature, General Knowledge, and Critical Thinking for DU B Unit.",
    duration: "5 Months",
    schedule: "Morning & Evening Options",
    fee: "৳ 14,000 BDT"
  },
  hsc: {
    title: "HSC 1st & 2nd Year Academic Care",
    details: "Chapter-wise basic clearing, CQ (Creative Question) mastering, Board paper solutions, and practical lab concept clearing for Science stream.",
    duration: "Full Academic Year",
    schedule: "3 Days a Week",
    fee: "৳ 2,500 BDT / Month"
  },
  ssc: {
    title: "SSC Foundation & Golden A+ Program",
    details: "Building a rock-solid foundation for Class 9 & 10 students. Board question solving, regular CQ/MCQ model tests, and personalized weak topic resolution.",
    duration: "Full Academic Year",
    schedule: "4 Days a Week",
    fee: "৳ 2,000 BDT / Month"
  }
};

function initModals() {
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContainer = document.getElementById('modalContainer');
  const closeBtn = document.getElementById('modalCloseBtn');

  const studentLoginBtns = document.querySelectorAll('.btn-student-login');
  const adminLoginBtns = document.querySelectorAll('.btn-admin-login');
  const viewDetailBtns = document.querySelectorAll('.btn-view-details');

  function openModal(contentHtml) {
    if (!modalOverlay || !modalContainer) return;
    modalContainer.innerHTML = `
      <button class="modal-close-btn" id="modalCloseBtn"><i class="fas fa-times"></i></button>
      ${contentHtml}
    `;
    modalOverlay.classList.add('active');

    const newClose = modalContainer.querySelector('#modalCloseBtn');
    if (newClose) {
      newClose.addEventListener('click', closeModal);
    }
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Student / Login Button handlers
  studentLoginBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      openModal(`
        <div class="modal-header">
          <h3><i class="fas fa-user-graduate gradient-text"></i> Student & Parent Portal</h3>
          <p style="color: var(--gray-500); font-size: 0.9rem;">Select your portal to continue to EduSmart Portal</p>
        </div>
        <div class="login-options-grid">
          <div class="login-opt-card" onclick="window.location.href='/login.html'">
            <i class="fas fa-user-graduate"></i>
            <h4>Student Login</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">View marks, routine & payments</p>
          </div>
          <div class="login-opt-card" onclick="window.location.href='/login.html'">
            <i class="fas fa-users-cog"></i>
            <h4>Parent Login</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Track attendance & progress</p>
          </div>
        </div>
      `);
    });
  });

  adminLoginBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      openModal(`
        <div class="modal-header">
          <h3><i class="fas fa-shield-alt gradient-text"></i> Administration & Faculty Portal</h3>
          <p style="color: var(--gray-500); font-size: 0.9rem;">Management & Teacher Access</p>
        </div>
        <div class="login-options-grid">
          <div class="login-opt-card" onclick="window.location.href='/admin-login.html'">
            <i class="fas fa-user-shield"></i>
            <h4>Admin Dashboard</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Full institute management</p>
          </div>
          <div class="login-opt-card" onclick="window.location.href='/login.html'">
            <i class="fas fa-chalkboard-teacher"></i>
            <h4>Teacher Portal</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Grade exams & post notices</p>
          </div>
        </div>
      `);
    });
  });

  // View Details handlers
  viewDetailBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const progKey = btn.getAttribute('data-program-key');
      const details = programModalDetails[progKey] || {
        title: "EduSmart Program Overview",
        details: "Comprehensive coaching program with expert faculty and weekly evaluation tests.",
        duration: "Flexible",
        schedule: "Standard Timings",
        fee: "Contact for Pricing"
      };

      openModal(`
        <div class="modal-header">
          <span class="badge badge-primary" style="margin-bottom: 0.5rem;">Admissions Open 2026</span>
          <h3>${details.title}</h3>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 1.25rem;">${details.details}</p>
          <div style="background: var(--gray-50); padding: 1.25rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.75rem; border: 1px solid var(--gray-200);">
            <div><strong><i class="far fa-clock"></i> Duration:</strong> ${details.duration}</div>
            <div><strong><i class="far fa-calendar-alt"></i> Schedule:</strong> ${details.schedule}</div>
            <div><strong><i class="fas fa-tag"></i> Course Fee:</strong> <span style="color: var(--primary-600); font-weight: 700;">${details.fee}</span></div>
          </div>
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <a href="/login.html" class="btn btn-primary" style="flex: 1;"><i class="fas fa-paper-plane"></i> Apply / Enroll Now</a>
          <button class="btn btn-secondary" onclick="document.getElementById('modalOverlay').classList.remove('active')">Close</button>
        </div>
      `);
    });
  });
}

/* --------------------------------------------------------------------------
   7. Smooth Scrolling
   -------------------------------------------------------------------------- */
function initSmoothScroll() {
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);

      if (targetEl) {
        // Close mobile nav if open
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu) navMenu.classList.remove('active');

        // Update active link
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
