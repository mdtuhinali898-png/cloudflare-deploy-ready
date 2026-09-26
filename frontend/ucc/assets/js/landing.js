/* ==========================================================================
   UCC পাবনা Landing Page JavaScript
   SMS EduSmart-এর same functionality — UCC-specific content
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  loadMainInstituteAcronym();
  initNavbar();
  initSearchFilter();
  initCounters();
  initTestimonials();
  initFAQ();
  initModals();
  initSmoothScroll();
});

async function loadMainInstituteAcronym() {
  const brand = document.getElementById('mainInstituteAcronym');
  if (!brand) return;

  // Use the immediately available settings first, then prefer the shared value.
  try {
    const localSettings = JSON.parse(localStorage.getItem('erp_settings') || '{}');
    const localName = localSettings?.landing?.brandName;
    if (localName) updateMainInstituteAcronym(brand, localName);
  } catch (_) {
    // Ignore malformed local settings and continue with the shared source.
  }

  try {
    const response = await fetch('/api/landing-settings');
    const result = await response.json();
    const name = result?.success && result.data?.brandName;
    if (!name) return;

    updateMainInstituteAcronym(brand, name);
  } catch (_) {
    // Keep the short default label if the main landing settings are unavailable.
  }
}

function updateMainInstituteAcronym(brand, name) {
  brand.textContent = createInstituteAcronym(name);
  brand.closest('a')?.setAttribute('title', `${name}-এ ফিরে যান`);
}

function createInstituteAcronym(name) {
  const words = String(name)
    .replace(/[’']/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.slice(0, 3).map(word => word.charAt(0).toUpperCase()).join('') || 'EDU';
}

/* --------------------------------------------------------------------------
   1. Navbar & Mobile Menu
   -------------------------------------------------------------------------- */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navMenu = document.querySelector('.nav-menu');

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
      navMenu.classList.contains('active') ? closeMenu() : openMenu();
    });
    overlay.addEventListener('click', closeMenu);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('active')) closeMenu();
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

        const matchesClass = (selectedClassVal === 'all' || classTag.includes(selectedClassVal));
        const matchesProg = (selectedProgVal === 'all' || progTag.includes(selectedProgVal));
        const matchesType = (selectedTypeVal === 'all' || typeTag.includes(selectedTypeVal));

        if (matchesClass && matchesProg && matchesType) {
          card.style.display = 'flex';
          card.style.animation = 'fadeInUp 0.4s ease forwards';
          matchCount++;
        } else {
          card.style.display = 'none';
        }
      });

      const progSection = document.getElementById('programs');
      if (progSection) progSection.scrollIntoView({ behavior: 'smooth' });
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
  if (statsSection) observer.observe(statsSection);
}

/* --------------------------------------------------------------------------
   4. Student Testimonial Slider — UCC Students
   -------------------------------------------------------------------------- */
const testimonialsData = [
  {
    quote: "UCC পাবনার Biology শিক্ষক আমাকে এমনভাবে পড়িয়েছেন যে Medical Admission পরীক্ষায় Biology-তে ফুল মার্কস পেয়েছি। সত্যিই অসাধারণ!",
    name: "Tasnim Rahman",
    achievement: "Admitted to Rajshahi Medical College (22nd Position)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"
  },
  {
    quote: "UCC-এর Physics ও Math শিক্ষকরা অনেক ধৈর্য সহকারে শেখান। BUET-এর কঠিন সমস্যাগুলো এখন সহজ মনে হয়। Weekly model test সত্যিই কার্যকর।",
    name: "Nafis Ahmed",
    achievement: "Admitted to BUET EEE (Merit 35th)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200"
  },
  {
    quote: "Student Portal-এ payment history, result সব একসাথে দেখতে পারি। অভিভাবকও SMS-এ আপডেট পান। UCC পাবনা সেরা!",
    name: "Sadia Islam",
    achievement: "DU A-Unit — 12th Rank (Admission 2026)",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200"
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
        faqItems.forEach(other => other.classList.remove('active'));
        if (!isActive) item.classList.add('active');
      });
    }
  });
}

/* --------------------------------------------------------------------------
   6. Modals — UCC Program Details & Login
   -------------------------------------------------------------------------- */
const programModalDetails = {
  medical: {
    title: "Medical Admission Masterclass 2026",
    details: "DMC, SSMC, SOMC-সহ সকল মেডিকেল কলেজের জন্য Biology, Chemistry, Physics ও GK-এর সম্পূর্ণ প্রস্তুতি। ১০০+ OMR মডেল টেস্ট ও অভিজ্ঞ Doctor Mentor।",
    duration: "৬ মাস Intensive",
    schedule: "রবি, মঙ্গল, বৃহঃ (সকাল ৮:০০ – ১২:০০)",
    fee: "৳ 15,000 BDT"
  },
  engineering: {
    title: "Engineering Admission Care 2026",
    details: "BUET, CUET, RUET ও অন্যান্য প্রকৌশল বিশ্ববিদ্যালয়ের জন্য Higher Math, Physics ও Chemistry। ৪০+ Written Model Test এবং BUET Alumni শিক্ষক।",
    duration: "৬ মাস Comprehensive",
    schedule: "শনি, সোম, বুধ (দুপুর ২:০০ – ৬:০০)",
    fee: "৳ 18,000 BDT"
  },
  varsity_a: {
    title: "Varsity A Unit Science Special",
    details: "ঢাকা বিশ্ববিদ্যালয় A Unit, জাহাঙ্গীরনগর ও GST Science Alliance-এর জন্য বিশেষ প্রস্তুতি। MCQ Shortcut ও Speed Test।",
    duration: "৫ মাস",
    schedule: "প্রতিদিন বিকেলের ব্যাচ",
    fee: "৳ 12,000 BDT"
  },
  varsity_b: {
    title: "Varsity B Unit Arts Special",
    details: "ঢাকা বিশ্ববিদ্যালয় B Unit-এর জন্য English Grammar, Bangla Literature, GK ও Critical Thinking।",
    duration: "৫ মাস",
    schedule: "সকাল ও সন্ধ্যা ব্যাচ",
    fee: "৳ 10,000 BDT"
  },
  hsc: {
    title: "HSC Academic Care Program",
    details: "HSC ১ম ও ২য় বর্ষের শিক্ষার্থীদের Board পরীক্ষার সম্পূর্ণ প্রস্তুতি। CQ ও MCQ দক্ষতা বৃদ্ধি এবং সাপ্তাহিক মূল্যায়ন পরীক্ষা।",
    duration: "সম্পূর্ণ শিক্ষাবর্ষ",
    schedule: "সপ্তাহে ৩ দিন",
    fee: "৳ 2,000 BDT / মাস"
  },
  ssc: {
    title: "SSC Golden A+ Program",
    details: "৯ম ও ১০ম শ্রেণির শিক্ষার্থীদের জন্য সমন্বিত পাঠ পরিকল্পনা। Fundamental Math ও Science Focus এবং Regular Model Test।",
    duration: "সম্পূর্ণ শিক্ষাবর্ষ",
    schedule: "সপ্তাহে ৪ দিন",
    fee: "৳ 1,500 BDT / মাস"
  }
};

function initModals() {
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContainer = document.getElementById('modalContainer');

  function openModal(contentHtml) {
    if (!modalOverlay || !modalContainer) return;
    modalContainer.innerHTML = `
      <button class="modal-close-btn" id="modalCloseBtn"><i class="fas fa-times"></i></button>
      ${contentHtml}
    `;
    modalOverlay.classList.add('active');
    modalContainer.querySelector('#modalCloseBtn').addEventListener('click', closeModal);
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Student Login buttons → UCC Student Portal
  document.querySelectorAll('.btn-student-login').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal(`
        <div class="modal-header">
          <h3><i class="fas fa-user-graduate gradient-text"></i> UCC Student Portal</h3>
          <p style="color: var(--gray-500); font-size: 0.9rem;">আপনার UCC Student Portal-এ প্রবেশ করুন</p>
        </div>
        <div class="login-options-grid">
          <div class="login-opt-card" onclick="window.location.href='login.html'">
            <i class="fas fa-user-graduate"></i>
            <h4>Student Login</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Payment, Result ও Notice দেখুন</p>
          </div>
          <div class="login-opt-card" onclick="window.location.href='login.html'">
            <i class="fas fa-users-cog"></i>
            <h4>Parent Login</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">সন্তানের অগ্রগতি দেখুন</p>
          </div>
        </div>
      `);
    });
  });

  // Admin Login buttons → UCC Admin Portal
  document.querySelectorAll('.btn-admin-login').forEach(btn => {
    btn.addEventListener('click', () => {
      openModal(`
        <div class="modal-header">
          <h3><i class="fas fa-shield-alt gradient-text"></i> UCC Admin Portal</h3>
          <p style="color: var(--gray-500); font-size: 0.9rem;">UCC পাবনা শাখা Management</p>
        </div>
        <div class="login-options-grid">
          <div class="login-opt-card" onclick="window.location.href='admin-login.html'">
            <i class="fas fa-user-shield"></i>
            <h4>Admin Dashboard</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Payment, Admission ও Reports</p>
          </div>
          <div class="login-opt-card" onclick="window.location.href='admin-login.html'">
            <i class="fas fa-chalkboard-teacher"></i>
            <h4>Teacher Portal</h4>
            <p style="font-size: 0.8rem; color: var(--gray-500);">Result দিন ও Notice পোস্ট করুন</p>
          </div>
        </div>
      `);
    });
  });

  // View Details buttons
  document.querySelectorAll('.btn-view-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const progKey = btn.getAttribute('data-program-key');
      const details = programModalDetails[progKey] || {
        title: "UCC Program",
        details: "অভিজ্ঞ শিক্ষক ও সাপ্তাহিক মডেল টেস্ট সহ সম্পূর্ণ কোর্স।",
        duration: "Flexible",
        schedule: "Standard",
        fee: "যোগাযোগ করুন"
      };

      openModal(`
        <div class="modal-header">
          <span class="badge badge-primary" style="margin-bottom: 0.5rem;">ভর্তি চলছে ২০২৬</span>
          <h3>${details.title}</h3>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 1.25rem;">${details.details}</p>
          <div style="background: var(--gray-50); padding: 1.25rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.75rem; border: 1px solid var(--gray-200);">
            <div><strong><i class="far fa-clock"></i> মেয়াদ:</strong> ${details.duration}</div>
            <div><strong><i class="far fa-calendar-alt"></i> সময়সূচি:</strong> ${details.schedule}</div>
            <div><strong><i class="fas fa-tag"></i> কোর্স ফি:</strong> <span style="color: var(--primary-600); font-weight: 700;">${details.fee}</span></div>
          </div>
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <a href="login.html" class="btn btn-primary" style="flex: 1;"><i class="fas fa-paper-plane"></i> ভর্তি হন এখনই</a>
          <button class="btn btn-secondary" onclick="document.getElementById('modalOverlay').classList.remove('active')">বন্ধ করুন</button>
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
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu) navMenu.classList.remove('active');

        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
