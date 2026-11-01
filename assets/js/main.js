// Toggle menu mobile
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    if (toggle) {
      toggle.addEventListener('click', () => {
        nav.classList.toggle('open');
        toggle.textContent = nav.classList.contains('open') ? 'TUTUP' : 'MENU';
      });
      nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        nav.classList.remove('open');
        toggle.textContent = 'MENU';
      }));
    }

    // Smooth scroll elegan & responsif untuk klik menu (Tentang, Karya, Perjalanan, Kontak)
    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }
    let scrollAnimId = null;
    let userInterrupted = false;

    function cancelSmoothScroll() {
      if (scrollAnimId !== null) {
        cancelAnimationFrame(scrollAnimId);
        scrollAnimId = null;
      }
    }

    function smoothScrollTo(targetY) {
      cancelSmoothScroll();
      userInterrupted = false;

      const startY = window.scrollY;
      const diff = targetY - startY;
      // Durasi menyesuaikan jarak: dekat = cepat & responsif, jauh = tetap dibatasi agar tidak lama
      const duration = Math.min(650, Math.max(200, Math.abs(diff) * 0.4));
      let startTime = null;

      function stopOnUserInput() {
        userInterrupted = true;
      }
      window.addEventListener('wheel', stopOnUserInput, { passive: true, once: true });
      window.addEventListener('touchstart', stopOnUserInput, { passive: true, once: true });

      function step(timestamp) {
        if (userInterrupted) {
          cancelSmoothScroll();
          return;
        }
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo({ top: startY + diff * easeOutExpo(progress), left: 0, behavior: 'auto' });
        if (progress < 1) {
          scrollAnimId = requestAnimationFrame(step);
        } else {
          scrollAnimId = null;
        }
      }
      scrollAnimId = requestAnimationFrame(step);
    }
    document.querySelectorAll('nav a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const headerOffset = 90;
        const targetY = target.getBoundingClientRect().top + window.scrollY - headerOffset;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
          window.scrollTo(0, Math.max(targetY, 0));
        } else {
          smoothScrollTo(Math.max(targetY, 0));
        }
        history.pushState(null, '', link.getAttribute('href'));
      });
    });

    // Scroll reveal
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // Scroll progress bar
    const scrollProgress = document.getElementById('scrollProgress');
    function updateScrollProgress() {
      const h = document.documentElement;
      const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight || 1) * 100;
      scrollProgress.style.width = scrolled + '%';
    }
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    updateScrollProgress();

    // Back to top button
    const backToTop = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        window.scrollTo(0, 0);
      } else {
        smoothScrollTo(0);
      }
    });

    // Active nav link based on section in view
    const navLinksList = document.querySelectorAll('nav a');
    const navSections = Array.from(navLinksList)
      .map(a => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinksList.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    navSections.forEach(s => navObserver.observe(s));

    // Form kontak — kirim ke Formspree via AJAX (tanpa reload halaman)
    const contactForm = document.getElementById('contactForm');
    const formNote = document.getElementById('formNote');
    const formSubmitBtn = contactForm ? contactForm.querySelector('.form-submit') : null;
    if (contactForm) {
      contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formNote.classList.remove('success', 'error');
        formNote.textContent = 'Mengirim pesan...';
        if (formSubmitBtn) formSubmitBtn.disabled = true;

        try {
          const response = await fetch(contactForm.action, {
            method: 'POST',
            body: new FormData(contactForm),
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            formNote.textContent = 'Pesan terkirim, terima kasih! Aku akan segera membalas.';
            formNote.classList.add('success');
            contactForm.reset();
          } else {
            formNote.textContent = 'Gagal mengirim. Coba lagi atau hubungi lewat email di atas.';
            formNote.classList.add('error');
          }
        } catch (err) {
          formNote.textContent = 'Gagal mengirim. Coba lagi atau hubungi lewat email di atas.';
          formNote.classList.add('error');
        } finally {
          if (formSubmitBtn) formSubmitBtn.disabled = false;
        }
      });
    }

    // Cursor glow + subtle tilt (desktop / fine pointer only)
    if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      const glow = document.createElement('div');
      glow.className = 'cursor-glow';
      document.body.appendChild(glow);

      let mx = 0, my = 0, gx = 0, gy = 0;
      window.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        glow.classList.add('active');
      });
      (function loop() {
        gx += (mx - gx) * 0.18;
        gy += (my - gy) * 0.18;
        glow.style.left = gx + 'px';
        glow.style.top = gy + 'px';
        requestAnimationFrame(loop);
      })();

      document.querySelectorAll('a, button, .work-card').forEach(el => {
        el.addEventListener('mouseenter', () => glow.classList.add('hovering'));
        el.addEventListener('mouseleave', () => glow.classList.remove('hovering'));
      });

      // Subtle 3D tilt on portrait & work visuals
      document.querySelectorAll('.portrait, .work-visual').forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) scale(1.02)`;
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'perspective(900px) rotateY(0) rotateX(0) scale(1)';
        });
      });
    }

    // YouTube Video Player Manager (Autoplay, single-active instance & instant stop on modal close)
    function stopAllYouTubeCards(scope = document) {
      if (!scope) return;
      const cards = scope.querySelectorAll('.youtube-card');
      cards.forEach(card => {
        const iframe = card.querySelector('iframe');
        if (iframe) {
          try {
            iframe.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            iframe.src = 'about:blank';
          } catch (err) { }
          if (card.dataset.originalContent) {
            card.innerHTML = card.dataset.originalContent;
          } else {
            iframe.remove();
          }
        }
      });
    }

    function initYouTubePlayer() {
      const cards = document.querySelectorAll('.youtube-card');
      cards.forEach(card => {
        if (!card.dataset.originalContent) {
          card.dataset.originalContent = card.innerHTML;
        }
      });

      document.addEventListener('click', (e) => {
        const card = e.target.closest('.youtube-card');
        if (!card) return;
        if (e.target.closest('.youtube-link')) return;

        if (card.querySelector('iframe')) return;

        stopAllYouTubeCards(document);

        const videoId = card.dataset.videoId;
        if (!videoId) return;

        if (!card.dataset.originalContent) {
          card.dataset.originalContent = card.innerHTML;
        }

        card.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1" title="YouTube Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      });
    }
    initYouTubePlayer();

    // Seamless Image Loading Fade-in + Natural Aspect-Ratio auto-detect for Graphic Design cards
    function initSeamlessImageLoading() {
      const images = document.querySelectorAll('.work-visual img, .tl-media img, .portrait img');
      images.forEach(img => {
        const applyNaturalRatio = () => {
          const wrapper = img.parentElement;
          if (wrapper && wrapper.classList.contains('work-visual--natural')) {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            if (w && h) {
              wrapper.style.aspectRatio = `${w} / ${h}`;
            }
          }
        };

        const markLoaded = () => {
          img.classList.add('loaded');
          if (img.parentElement) {
            img.parentElement.classList.add('loaded');
          }
          applyNaturalRatio();
        };

        if (img.complete && img.naturalWidth !== 0) {
          markLoaded();
        } else {
          img.addEventListener('load', markLoaded);
          img.addEventListener('error', () => {
            img.classList.add('loaded');
            if (img.parentElement) img.parentElement.classList.add('loaded');
          });
        }
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSeamlessImageLoading);
    } else {
      initSeamlessImageLoading();
    }

    // Graphic Design Image Zoom / Lightbox
    (() => {
      const lightbox = document.getElementById('imageLightbox');
      const stage = document.getElementById('lightboxStage');
      const image = document.getElementById('lightboxImage');
      const closeBtn = document.getElementById('lightboxClose');
      const zoomInBtn = document.getElementById('zoomIn');
      const zoomOutBtn = document.getElementById('zoomOut');
      const zoomResetBtn = document.getElementById('zoomReset');
      const caption = document.getElementById('lightboxCaption');

      if (!lightbox || !stage || !image) return;

      let scale = 1;
      let posX = 0;
      let posY = 0;
      let dragging = false;
      let startX = 0;
      let startY = 0;

      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

      function renderZoom() {
        if (!image || !stage) return;

        const scaledWidth = image.offsetWidth * scale;
        const scaledHeight = image.offsetHeight * scale;
        const maxPosX = Math.max(0, (scaledWidth - stage.offsetWidth) / 2);
        const maxPosY = Math.max(0, (scaledHeight - stage.offsetHeight) / 2);

        posX = clamp(posX, -maxPosX, maxPosX);
        posY = clamp(posY, -maxPosY, maxPosY);

        image.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        zoomResetBtn.textContent = `${scale % 1 === 0 ? scale : scale.toFixed(1)}×`;
      }

      function resetZoom() {
        scale = 1;
        posX = 0;
        posY = 0;
        stage.classList.remove('zoomed');
        renderZoom();
      }

      function setZoom(nextScale) {
        const oldScale = scale;
        scale = clamp(nextScale, 1, 4);

        // Keep the image centered when returning to 1×.
        if (scale === 1) {
          posX = 0;
          posY = 0;
        } else if (oldScale === 1) {
          posX = 0;
          posY = 0;
        }

        stage.classList.toggle('zoomed', scale > 1);
        renderZoom();
      }

      function openLightbox(img) {
        image.src = img.currentSrc || img.src;
        image.alt = img.alt || 'Graphic Design';
        const title = img.closest('.work-card')?.querySelector('.work-title')?.textContent?.trim();
        const meta = img.closest('.work-card')?.querySelector('.work-meta')?.textContent?.trim();
        caption.textContent = [title, meta].filter(Boolean).join('  /  ');

        resetZoom();
        lightbox.classList.add('open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      function closeLightbox() {
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        setTimeout(() => {
          if (!lightbox.classList.contains('open')) image.src = '';
        }, 250);
      }

      document.addEventListener('click', (e) => {
        const img = e.target.closest('.work-visual--natural img');
        if (img) {
          e.stopPropagation();
          openLightbox(img);
        }
      });

      closeBtn.addEventListener('click', closeLightbox);

      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });

      zoomInBtn.addEventListener('click', () => setZoom(scale + 0.5));
      zoomOutBtn.addEventListener('click', () => setZoom(scale - 0.5));
      zoomResetBtn.addEventListener('click', resetZoom);

      // Mouse wheel zoom.
      stage.addEventListener('wheel', (e) => {
        if (!lightbox.classList.contains('open')) return;
        e.preventDefault();
        setZoom(scale + (e.deltaY < 0 ? 0.25 : -0.25));
      }, { passive: false });

      // Drag the image while zoomed.
      stage.addEventListener('mousedown', (e) => {
        if (scale <= 1 || e.button !== 0) return;
        dragging = true;
        startX = e.clientX - posX;
        startY = e.clientY - posY;
        stage.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        posX = e.clientX - startX;
        posY = e.clientY - startY;
        renderZoom();
      });

      window.addEventListener('mouseup', () => {
        dragging = false;
        stage.classList.remove('dragging');
      });

      // Touch events for iOS Pinch-to-zoom and Pan
      let initialDistance = null;
      let initialScale = 1;

      stage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          initialDistance = Math.hypot(dx, dy);
          initialScale = scale;
        } else if (e.touches.length === 1 && scale > 1) {
          dragging = true;
          startX = e.touches[0].clientX - posX;
          startY = e.touches[0].clientY - posY;
          stage.classList.add('dragging');
        }
      }, { passive: false });

      stage.addEventListener('touchmove', (e) => {
        if (!lightbox.classList.contains('open')) return;

        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.hypot(dx, dy);

          if (initialDistance) {
            const scaleChange = distance / initialDistance;
            setZoom(initialScale * scaleChange);
          }
        } else if (e.touches.length === 1 && dragging) {
          e.preventDefault();
          posX = e.touches[0].clientX - startX;
          posY = e.touches[0].clientY - startY;
          renderZoom();
        }
      }, { passive: false });

      stage.addEventListener('touchend', (e) => {
        initialDistance = null;
        if (e.touches.length < 1) {
          dragging = false;
          stage.classList.remove('dragging');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('open')) return;

        if (e.key === 'Escape') closeLightbox();
        if (e.key === '+' || e.key === '=') setZoom(scale + 0.5);
        if (e.key === '-' || e.key === '_') setZoom(scale - 0.5);
        if (e.key === '0') resetZoom();
      });
    })();

    // Skill & Software detail modal
    (() => {
      const ICON_STYLE = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
      const ICONS = {
        zap: `<svg ${ICON_STYLE}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        penTool: `<svg ${ICON_STYLE}><path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
        film: `<svg ${ICON_STYLE}><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/></svg>`,
        activity: `<svg ${ICON_STYLE}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        streaming: `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="35" r="2.5" fill="#C99A5A"/><path d="M16.5 28C18.57 25.93 21.18 24.9 24 24.9C26.82 24.9 29.43 25.93 31.5 28" stroke="#C99A5A" stroke-width="2" stroke-linecap="round"/><path d="M11 22.5C14.59 18.91 19.11 17.1 24 17.1C28.89 17.1 33.41 18.91 37 22.5" stroke="#C99A5A" stroke-width="2" stroke-linecap="round"/><path d="M5.5 17C10.45 12.05 16.99 9.5 24 9.5C31.01 9.5 37.55 12.05 42.5 17" stroke="#C99A5A" stroke-width="2" stroke-linecap="round"/></svg>`,
        kamera: '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="16" width="28" height="18" rx="4" stroke="#C99A5A" stroke-width="2"/><path d="M16 16L19 12H29L32 16" stroke="#C99A5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="25" r="6" stroke="#C99A5A" stroke-width="2"/><circle cx="33" cy="20" r="1.5" fill="#C99A5A"/></svg>',
        users: `<svg ${ICON_STYLE}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        Drone: '<svg width="80" height="80" viewBox="4 4 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="17" y="19" width="14" height="10" rx="3" stroke="#C99A5A" strokeWidth="1.8"/><path d="M17 22H11C9.9 22 9 21.1 9 20V16" stroke="#C99A5A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M31 22H37C38.1 22 39 21.1 39 20V16" stroke="#C99A5A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 15C8.5 13.2 12.5 13.2 15 15" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><path d="M7 18C9.5 19.8 12.5 19.8 15 18" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><path d="M33 15C35.5 13.2 39.5 13.2 42 15" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><path d="M33 18C35.5 19.8 38.5 19.8 41 18" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><rect x="21" y="29" width="6" height="5" rx="1.5" stroke="#C99A5A" strokeWidth="1.6"/><circle cx="24" cy="31.5" r="1.4" stroke="#C99A5A" strokeWidth="1.4"/><path d="M19 29L16 34" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><path d="M29 29L32 34" stroke="#C99A5A" strokeWidth="1.6" strokeLinecap="round"/><path d="M21 10C22.7 8.5 25.3 8.5 27 10" stroke="#C99A5A" strokeWidth="1.5" strokeLinecap="round"/><path d="M19 7.5C21.8 5 26.2 5 29 7.5" stroke="#C99A5A" strokeWidth="1.5" strokeLinecap="round"/></svg>',
        scissors: `<svg ${ICON_STYLE}><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>`,
        image: `<svg ${ICON_STYLE}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
        shapes: `<svg ${ICON_STYLE}><path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198 0L16.3 8.9a.7.7 0 0 1-.628 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>`,
        smartphone: `<svg ${ICON_STYLE}><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>`
      };

      const SKILLS = {
        'motion-graphic': {
          category: 'Adobe After Effect',
          title: 'Motion Graphic Design',
          icon: 'layers',
          desc: 'Menciptakan animasi grafis untuk kebutuhan bumper, lower third, teaser, dan elemen visual dinamis lainnya, dengan perhatian pada ritme, transisi, dan storytelling visual.'
        },
        'graphic-design': {
          category: 'Canva, Adobe Photoshop',
          title: 'Graphic Design',
          icon: 'penTool',
          desc: 'Merancang identitas visual, poster, dan elemen desain 2D yang komunikatif, konsisten dengan branding, serta siap digunakan di berbagai media.'
        },
        'video-editing': {
          category: 'Capcut, Adobe Premiere Pro',
          title: 'Video Editing',
          icon: 'film',
          desc: 'Menyunting footage menjadi konten yang terstruktur dan menarik, mulai dari pemotongan, penataan alur, hingga penyelarasan audio-visual.'
        },
        'av-sync': {
          category: 'Adobe Audition, Premiere Pro',
          title: 'Audio-Visual Synchronization',
          icon: 'activity',
          desc: 'Menyelaraskan elemen suara dan visual secara presisi agar setiap detik konten terasa mulus dan profesional.'
        },
        'branding': {
          category: 'Vmix, OBS Studio',
          title: 'Streaming & Broadcasting',
          icon: 'streaming',
          desc: 'Menguasai vMix dan OBS Studio untuk pengelolaan live streaming, switching, dan broadcasting secara real-time.'
        },
        'leadership': {
          category: 'Broadcasting',
          title: 'Camera Skills',
          icon: 'kamera',
          desc: 'Berpengalaman mengoperasikan berbagai kamera profesional untuk kebutuhan produksi, dokumentasi, dan broadcasting. Camera: Sony PXW-Z190 • PXW-Z90 • NX200 • NX100 • MC88 • MC2500 • A7 II • A7C • A6000'
        },
        'after-effects': {
          category: 'DJI Mini 2',
          title: 'Drone Pilot',
          icon: 'Drone',
          desc: 'Menghasilkan aerial footage cinematic untuk kebutuhan dokumentasi, promosi, dan produksi visual.'
        },
      };

      const skillModal = document.getElementById('skillModal');
      const skillModalBackdrop = document.getElementById('skillModalBackdrop');
      const skillModalClose = document.getElementById('skillModalClose');
      const skillModalIcon = document.getElementById('skillModalIcon');
      const skillModalCategory = document.getElementById('skillModalCategory');
      const skillModalTitle = document.getElementById('skillModalTitle');
      const skillModalDesc = document.getElementById('skillModalDesc');

      if (!skillModal) return;

      function openSkillModal(key) {
        const data = SKILLS[key];
        if (!data) return;
        skillModalIcon.innerHTML = ICONS[data.icon] || '';
        skillModalCategory.textContent = data.category;
        skillModalTitle.textContent = data.title;
        skillModalDesc.textContent = data.desc;
        skillModal.classList.add('open');
        skillModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      function closeSkillModal() {
        skillModal.classList.remove('open');
        skillModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.skill-tag');
        if (btn && btn.dataset.skill) {
          openSkillModal(btn.dataset.skill);
        }
      });

      skillModalClose.addEventListener('click', closeSkillModal);
      skillModalBackdrop.addEventListener('click', closeSkillModal);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && skillModal.classList.contains('open')) closeSkillModal();
      });
    })();

    // Portfolio category modal (Graphic Design / Motion Graphic)
    (() => {
      const openers = document.querySelectorAll('.portfolio-filter-btn[data-portfolio-target]');
      const modals = document.querySelectorAll('.portfolio-modal');
      if (!openers.length || !modals.length) return;

      let activeModal = null;
      let lastFocused = null;

      function openPortfolioModal(modal, trigger) {
        if (!modal) return;
        activeModal = modal;
        lastFocused = trigger || document.activeElement;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        const closeBtn = modal.querySelector('.portfolio-modal-close');
        if (closeBtn) closeBtn.focus({ preventScroll: true });
      }

      function closePortfolioModal(modal) {
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (typeof stopAllYouTubeCards === 'function') {
          stopAllYouTubeCards(modal);
        }
        if (lastFocused && typeof lastFocused.focus === 'function') {
          lastFocused.focus({ preventScroll: true });
        }
        activeModal = null;
      }

      openers.forEach(btn => {
        btn.addEventListener('click', () => {
          const modal = document.getElementById(btn.dataset.portfolioTarget);
          openPortfolioModal(modal, btn);
        });
      });

      modals.forEach(modal => {
        modal.querySelectorAll('[data-portfolio-close]').forEach(el => {
          el.addEventListener('click', () => closePortfolioModal(modal));
        });
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activeModal) closePortfolioModal(activeModal);
      });
    })();



    // ==========================================================================
    // Experience Projects Floating Modal Manager (KIAN Company & Al Bahjah)
    // ==========================================================================
    (function () {
      const expTriggers = document.querySelectorAll('.tl-stat-item[data-exp-target]');
      const expModals = document.querySelectorAll('.exp-modal');
      let activeExpModal = null;
      let prevFocusedElement = null;

      function openExpModal(modalId, triggerEl) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        prevFocusedElement = triggerEl || document.activeElement;
        activeExpModal = modal;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focus close button inside modal
        const closeBtn = modal.querySelector('.exp-modal-close');
        if (closeBtn) {
          setTimeout(() => closeBtn.focus({ preventScroll: true }), 100);
        }
      }

      function closeExpModal(modal) {
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');

        // Restore body scroll only if no other modals are open
        const anyModalOpen = document.querySelector('.portfolio-modal.open, .skill-modal.open, .exp-modal.open, .lightbox.open');
        if (!anyModalOpen) {
          document.body.style.overflow = '';
        }

        if (prevFocusedElement && typeof prevFocusedElement.focus === 'function') {
          prevFocusedElement.focus({ preventScroll: true });
        }
        activeExpModal = null;
      }

      // Trigger click and Enter/Space key listeners on stat items
      expTriggers.forEach(item => {
        item.addEventListener('click', () => {
          const targetId = item.getAttribute('data-exp-target');
          if (targetId) openExpModal(targetId, item);
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const targetId = item.getAttribute('data-exp-target');
            if (targetId) openExpModal(targetId, item);
          }
        });
      });

      // Close handlers for experience modals
      expModals.forEach(modal => {
        modal.querySelectorAll('[data-exp-close]').forEach(btn => {
          btn.addEventListener('click', () => closeExpModal(modal));
        });
      });

      // Escape key to close active experience modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activeExpModal) {
          closeExpModal(activeExpModal);
        }
      });

      // Interactive Filter Tabs & Real-time Search within Experience Modals
      function initModalFilters() {
        const filterGroups = document.querySelectorAll('.exp-filter-group[data-target]');
        filterGroups.forEach(group => {
          const containerId = group.getAttribute('data-target');
          const container = document.getElementById(containerId);
          if (!container) return;

          const filterBtns = group.querySelectorAll('.exp-filter-btn');
          const cards = container.querySelectorAll('.exp-project-card');

          filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
              filterBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');

              const filterVal = btn.getAttribute('data-filter');
              applyFilters(container);
            });
          });
        });

        const searchInputs = document.querySelectorAll('.exp-search-box input[data-search-target]');
        searchInputs.forEach(input => {
          const containerId = input.getAttribute('data-search-target');
          const container = document.getElementById(containerId);
          if (!container) return;

          input.addEventListener('input', () => {
            applyFilters(container);
          });
        });

        function applyFilters(container) {
          const containerId = container.id;
          const filterGroup = document.querySelector(`.exp-filter-group[data-target="${containerId}"]`);
          const searchInput = document.querySelector(`.exp-search-box input[data-search-target="${containerId}"]`);

          const activeBtn = filterGroup ? filterGroup.querySelector('.exp-filter-btn.active') : null;
          const filterVal = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
          const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

          const cards = container.querySelectorAll('.exp-project-card');
          let visibleCount = 0;

          cards.forEach(card => {
            const cardCat = (card.getAttribute('data-category') || '').toLowerCase();
            const cardKeywords = (card.getAttribute('data-keywords') || '').toLowerCase();
            const cardText = card.textContent.toLowerCase();

            let matchesFilter = (filterVal === 'all') || cardCat.includes(filterVal);
            let matchesQuery = !query || cardKeywords.includes(query) || cardText.includes(query);

            if (matchesFilter && matchesQuery) {
              card.style.display = 'flex';
              visibleCount++;
            } else {
              card.style.display = 'none';
            }
          });

          // Handle no results message
          let noResultsMsg = container.querySelector('.exp-no-results');
          if (visibleCount === 0) {
            if (!noResultsMsg) {
              noResultsMsg = document.createElement('div');
              noResultsMsg.className = 'exp-no-results';
              noResultsMsg.innerHTML = '🔍 Tidak ada proyek yang cocok dengan kata kunci atau filter ini.';
              container.appendChild(noResultsMsg);
            }
            noResultsMsg.style.display = 'block';
          } else if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
          }
        }
      }

      initModalFilters();
    })();

    // ============================================================
    // SINKRONISASI OTOMATIS JUMLAH PROYEK & KARYA BERDASARKAN ELEMEN ASLI
    // Menghitung jumlah proyek secara dinamis dari DOM dan memperbarui
    // nomor stat, badge modal, filter tombol, dan aria-label secara otomatis.
    // Ketika ada proyek baru ditambahkan, angka langsung terupdate.
    // ============================================================
    function syncProjectCounts() {
      // 1. Sinkronisasi Statistik Proyek Pengalaman (Timeline .tl-stat-item)
      const expStatItems = document.querySelectorAll('.tl-stat-item[data-exp-target]');
      expStatItems.forEach(item => {
        const targetId = item.getAttribute('data-exp-target');
        if (!targetId) return;

        const modal = document.getElementById(targetId);
        if (!modal) return;

        const projectCards = modal.querySelectorAll('.exp-project-card');
        const count = projectCards.length;

        // Perbarui atribut data-count dan angka di badge timeline
        const numEl = item.querySelector('.tl-stat-number');
        if (numEl) {
          const prevCount = parseInt(numEl.getAttribute('data-count'), 10);
          numEl.setAttribute('data-count', count);
          // Selalu update angka langsung bila animasi selesai atau terjadi perubahan nilai
          if (numEl.dataset.hasAnimated === 'true' || (numEl.textContent && numEl.textContent !== '0') || prevCount !== count) {
            numEl.textContent = count;
          }
        }

        // Perbarui aria-label pada tombol stat
        const oldAria = item.getAttribute('aria-label') || '';
        if (oldAria) {
          const updatedAria = oldAria.replace(/\d+\+?\s*Proyek/i, `${count}+ Proyek`);
          item.setAttribute('aria-label', updatedAria);
        }

        // Perbarui badge di dalam modal header (contoh: "17+ Proyek Selesai")
        const badgeCount = modal.querySelector('.exp-modal-badge--count');
        if (badgeCount) {
          badgeCount.textContent = `${count}+ Proyek Selesai`;
        }

        // Perbarui tombol filter "Semua" di toolbar modal (contoh: "Semua (17)")
        const allFilterBtn = modal.querySelector('.exp-filter-btn[data-filter="all"]');
        if (allFilterBtn) {
          allFilterBtn.textContent = `Semua (${count})`;
        }

        // Otomatisasi penomoran indeks kartu proyek (#01, #02, ...)
        projectCards.forEach((card, idx) => {
          const indexEl = card.querySelector('.exp-card-index');
          if (indexEl) {
            const formattedIndex = '#' + String(idx + 1).padStart(2, '0');
            if (indexEl.textContent !== formattedIndex) {
              indexEl.textContent = formattedIndex;
            }
          }
        });
      });

      // 2. Sinkronisasi Jumlah Karya Portofolio (.portfolio-filter-btn)
      const portfolioBtns = document.querySelectorAll('.portfolio-filter-btn[data-portfolio-target]');
      portfolioBtns.forEach(btn => {
        const targetId = btn.getAttribute('data-portfolio-target');
        if (!targetId) return;

        const pModal = document.getElementById(targetId);
        if (!pModal) return;

        const workCards = pModal.querySelectorAll('.work-card');
        const count = workCards.length;
        const formatted = String(count).padStart(2, '0');

        // Perbarui teks jumlah karya pada tombol filter (contoh: "08 Karya")
        const countEl = btn.querySelector('.pf-count');
        if (countEl) {
          countEl.textContent = `${formatted} Karya`;
        }

        // Perbarui teks jumlah karya pada header modal galeri
        const eyebrowEl = pModal.querySelector('.portfolio-modal-eyebrow');
        if (eyebrowEl) {
          const catNum = targetId.includes('Graphic') ? '01' : (targetId.includes('Motion') ? '02' : '03');
          eyebrowEl.textContent = `Kategori ${catNum} • ${formatted} Karya`;
        }

        // Otomatisasi penomoran karya di dalam modal galeri (contoh: "01 / Graphic Design")
        workCards.forEach((wCard, idx) => {
          const indexEl = wCard.querySelector('.work-index');
          if (indexEl) {
            const num = String(idx + 1).padStart(2, '0');
            const parts = indexEl.textContent.split('/');
            if (parts.length > 1) {
              indexEl.textContent = `${num} / ${parts.slice(1).join('/').trim()}`;
            } else {
              const defaultCat = targetId.includes('Graphic') ? 'Graphic Design' : (targetId.includes('Motion') ? 'Motion Graphic' : 'Video Showcase');
              indexEl.textContent = `${num} / ${defaultCat}`;
            }
          }
        });
      });
    }

    // Expose fungsi ke window agar dapat dipanggil kapan saja secara global
    window.syncProjectCounts = syncProjectCounts;

    // Pantau penambahan/penghapusan proyek secara real-time via MutationObserver
    if (window.MutationObserver) {
      let mutationDebounce = null;
      const projectObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const hasProjectCard = (nodes) => {
              for (const node of nodes) {
                if (node.nodeType === 1) {
                  if (node.matches && (node.matches('.exp-project-card, .work-card, .tl-stat-item, .tl-item'))) return true;
                  if (node.querySelector && node.querySelector('.exp-project-card, .work-card, .tl-stat-item, .tl-item')) return true;
                }
              }
              return false;
            };
            if (hasProjectCard(mutation.addedNodes) || hasProjectCard(mutation.removedNodes)) {
              shouldUpdate = true;
              break;
            }
          }
        }
        if (shouldUpdate) {
          if (mutationDebounce) cancelAnimationFrame(mutationDebounce);
          mutationDebounce = requestAnimationFrame(() => {
            syncProjectCounts();
          });
        }
      });

      // Mulai observasi DOM untuk mendeteksi perubahan proyek baru
      projectObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Animasi Counter Angka Proyek Ditangani (Count-up dari awal hingga target)
    function initStatCounters() {
      // Jalankan sinkronisasi awal sebelum animasi agar data-count selalu akurat
      syncProjectCounts();

      const statNumbers = document.querySelectorAll('.tl-stat-number[data-count]');
      if (!statNumbers.length) return;

      const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            counterObserver.unobserve(el);
            animateCountUp(el);
          }
        });
      }, { threshold: 0.2 });

      function animateCountUp(el) {
        const target = parseInt(el.getAttribute('data-count'), 10) || 0;
        const duration = 1600; // durasi animasi dalam milidetik
        let startTime = null;

        function easeOutQuart(x) {
          return 1 - Math.pow(1 - x, 4);
        }

        function step(timestamp) {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easeOutQuart(progress);
          const currentVal = Math.floor(easedProgress * target);

          el.textContent = currentVal;

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.textContent = target;
            el.dataset.hasAnimated = 'true';
          }
        }

        requestAnimationFrame(step);
      }

      statNumbers.forEach(num => counterObserver.observe(num));
    }
    initStatCounters();

    // ============================================================
    // CMS DYNAMIC HYDRATION & ARTICLE READER CONTROLLER
    // Menghubungkan Beranda secara real-time dengan Studio CMS
    // (LocalStorage & PostMessage Iframe Simulator)
    // ============================================================
    (function () {
      let currentArticles = [
        {
          id: "art-1",
          title: "Membangun Motion Graphic Interaktif untuk Acara Skala Besar",
          category: "Motion Design",
          coverUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80",
          excerpt: "Bagaimana merancang visual bumper, lower third dinamis, dan sinkronisasi audio-visual agar suasana acara terasa spektakuler.",
          date: "14 Oktober 2026",
          body: `## Pengantar\n\nMenghasilkan motion graphic untuk acara langsung dengan ribuan peserta membutuhkan perencanaan matang mulai dari frame rate, kontras warna pada LED Screen, hingga ketepatan sinkronisasi audio.\n\n### Tahap Kunci Produksi:\n1. **Briefing & Color Palette:** Menyesuaikan dengan tone branding acara.\n2. **Sound Design Sync:** Motion tanpa ritme audio yang pas akan kehilangan tenaganya.\n3. **Render Optimization:** Menyiapkan format video H.264/ProRes yang ringan dimainkan operator VT.\n\n> "Kunci dari visual panggung adalah kejelasan informasi dalam sepersekian detik."`
        },
        {
          id: "art-2",
          title: "Panduan Memilih Antara Premiere Pro dan After Effects",
          category: "Workflow",
          coverUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
          excerpt: "Kapan sebaiknya Anda menyelesaikan editing di Premiere Pro dan kapan saatnya berpindah ke After Effects untuk animasi kompleks.",
          date: "10 Oktober 2026",
          body: `## Workflow Efisien\n\nBanyak editor pemula mencoba melakukan semuanya di After Effects, padahal Premiere Pro jauh lebih efisien untuk cutting audio-visual utama.\n\n- Gunakan **Adobe Premiere Pro** untuk timeline assembly, multi-camera, dan sound grading.\n- Gunakan **After Effects** untuk kinetic typography, compositing, dan lower third dinamis.`
        }
      ];

      function parseMarkdown(md) {
        if (!md) return '';
        return md
          .replace(/^### (.*$)/gim, '<h4>$1</h4>')
          .replace(/^## (.*$)/gim, '<h3>$1</h3>')
          .replace(/^# (.*$)/gim, '<h2>$1</h2>')
          .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
          .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/gim, '<em>$1</em>')
          .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .replace(/^[-\*]\s+(.*$)/gim, '<li>$1</li>')
          .replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>')
          .replace(/\n\n/gim, '</p><p>')
          .replace(/\n/gim, '<br>');
      }

      function openArticleModal(id) {
        const modal = document.getElementById('articleModal');
        const art = currentArticles.find(a => a.id === id);
        if (!modal || !art) return;

        const badge = document.getElementById('artModalCategory');
        const date = document.getElementById('artModalDate');
        const coverWrap = document.getElementById('artModalCoverWrap');
        const cover = document.getElementById('artModalCover');
        const title = document.getElementById('artModalTitle');
        const body = document.getElementById('artModalBody');

        if (badge) badge.textContent = art.category || 'Artikel';
        if (date) date.textContent = art.date || '';
        if (title) title.textContent = art.title || '';

        if (cover && coverWrap) {
          if (art.coverUrl) {
            cover.src = art.coverUrl;
            cover.alt = art.title;
            coverWrap.style.display = 'block';
          } else {
            coverWrap.style.display = 'none';
          }
        }

        if (body) {
          body.innerHTML = `<p>${parseMarkdown(art.body || art.excerpt || '')}</p>`;
        }

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const closeBtn = modal.querySelector('.article-modal-close');
        if (closeBtn) closeBtn.focus({ preventScroll: true });
      }

      function closeArticleModal() {
        const modal = document.getElementById('articleModal');
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        const anyModalOpen = document.querySelector('.portfolio-modal.open, .skill-modal.open, .exp-modal.open, .lightbox.open');
        if (!anyModalOpen) {
          document.body.style.overflow = '';
        }
      }

      // Event listener tombol tutup artikel
      document.addEventListener('click', (e) => {
        if (e.target.matches('[data-article-close]') || e.target.closest('[data-article-close]')) {
          closeArticleModal();
        }
        const readBtn = e.target.closest('.article-read-btn, .article-card');
        if (readBtn && !e.target.closest('a')) {
          const artId = readBtn.getAttribute('data-article-id');
          if (artId) {
            e.preventDefault();
            openArticleModal(artId);
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const modal = document.getElementById('articleModal');
          if (modal && modal.classList.contains('open')) {
            closeArticleModal();
          }
        }
      });

      function getYouTubeId(url) {
        if (!url) return '';
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        return match ? match[1] : '';
      }

      function formatCategoryTag(cat) {
        if (!cat) return 'Event & Broadcast';
        const c = String(cat).trim();
        if (c.toLowerCase() === 'event & broadcast') return 'Event & Broadcast';
        if (c.toLowerCase() === 'production') return 'Production';
        return c.replace(/\b\w/g, l => l.toUpperCase());
      }

      // Terapkan CMS Data ke Tampilan DOM Beranda
      function applyCmsDataToDOM(cmsData) {
        if (!cmsData) return;

        // 1. Profil
        if (cmsData.profile) {
          const p = cmsData.profile;
          const eyebrow = document.querySelector('.eyebrow');
          if (eyebrow && p.eyebrow) eyebrow.innerHTML = p.eyebrow;

          const nameEl = document.querySelector('.name');
          if (nameEl && p.name) nameEl.innerHTML = `${p.name}<br><em>${p.italicName || ''}</em>`;

          const heroDesc = document.querySelector('.hero-desc');
          if (heroDesc && p.heroDesc) heroDesc.innerHTML = p.heroDesc;

          const portraitImg = document.querySelector('.portrait img');
          if (portraitImg && p.photoUrl) {
            portraitImg.src = p.photoUrl;
            portraitImg.alt = `${p.name} ${p.italicName || ''}`.trim();
          }

          const aboutText = document.querySelector('.about-text');
          if (aboutText && p.aboutParagraphs && p.aboutParagraphs.length) {
            const factsEl = aboutText.querySelector('.facts');
            const paragraphsHtml = p.aboutParagraphs.map(text => `<p>${text}</p>`).join('\n          ');
            if (factsEl) {
              const factValues = factsEl.querySelectorAll('.fact-value');
              if (factValues.length >= 4 && p.facts) {
                if (p.facts.location) factValues[0].textContent = p.facts.location;
                if (p.facts.experience) factValues[1].textContent = p.facts.experience;
                if (p.facts.discipline) factValues[2].textContent = p.facts.discipline;
                if (p.facts.availability) factValues[3].textContent = p.facts.availability;
              }
              aboutText.innerHTML = paragraphsHtml + '\n          ' + factsEl.outerHTML;
            }
          }

          if (p.social) {
            const contactBig = document.querySelector('.contact-big');
            if (contactBig && p.social.email) {
              contactBig.href = `mailto:${p.social.email}`;
              contactBig.textContent = p.social.email;
            }
            const socialsEl = document.querySelector('.socials');
            if (socialsEl) {
              let sHtml = '';
              if (p.social.instagram) sHtml += `<a href="${p.social.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a>`;
              if (p.social.linkedin) sHtml += `<a href="${p.social.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`;
              if (p.social.whatsapp) sHtml += `<a href="${p.social.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`;
              if (sHtml) socialsEl.innerHTML = sHtml;
            }
          }
        }

        // 2. Portofolio (Graphic Design, Motion Graphic, & Video Showcase)
        if (Array.isArray(cmsData.portfolio)) {
          const graphicItems = cmsData.portfolio.filter(item => item.category === 'graphic');
          const motionItems = cmsData.portfolio.filter(item => item.category === 'motion');
          const videoItems = cmsData.portfolio.filter(item => item.category === 'video');

          // Update count badge tombol kategori
          const graphicBtnCount = document.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalGraphic"] .pf-count');
          if (graphicBtnCount) graphicBtnCount.textContent = `${String(graphicItems.length).padStart(2, '0')} Karya`;

          const motionBtnCount = document.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalMotion"] .pf-count');
          if (motionBtnCount) motionBtnCount.textContent = `${String(motionItems.length).padStart(2, '0')} Karya`;

          const videoBtnCount = document.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalVideo"] .pf-count');
          if (videoBtnCount) videoBtnCount.textContent = `${String(videoItems.length).padStart(2, '0')} Karya`;

          // Update eyebrow header modal
          const graphicEyebrow = document.querySelector('#portfolioModalGraphic .portfolio-modal-eyebrow');
          if (graphicEyebrow) graphicEyebrow.textContent = `Kategori 01 • ${String(graphicItems.length).padStart(2, '0')} Karya`;
          const motionEyebrow = document.querySelector('#portfolioModalMotion .portfolio-modal-eyebrow');
          if (motionEyebrow) motionEyebrow.textContent = `Kategori 02 • ${String(motionItems.length).padStart(2, '0')} Karya`;
          const videoEyebrow = document.querySelector('#portfolioModalVideo .portfolio-modal-eyebrow');
          if (videoEyebrow) videoEyebrow.textContent = `Kategori 03 • ${String(videoItems.length).padStart(2, '0')} Karya`;

          // Render Graphic Gallery Grid
          const graphicGallery = document.getElementById('pmGraphicGallery') || document.querySelector('#portfolioModalGraphic .work-grid');
          if (graphicGallery && graphicItems.length) {
            graphicGallery.innerHTML = graphicItems.map((item, idx) => `
              <div class="work-card">
                <span class="work-index">${String(idx + 1).padStart(2, '0')} / Graphic Design</span>
                <div class="work-visual work-visual--natural"><img src="${item.imageUrl}" alt="${item.title}" loading="lazy"></div>
                <div class="work-title">${item.title}</div>
                <div class="work-meta">${item.meta}</div>
              </div>
            `).join('');
          }

          // Render Motion Gallery Grid
          const motionGallery = document.getElementById('pmMotionGallery') || document.querySelector('#portfolioModalMotion .work-grid');
          if (motionGallery && motionItems.length) {
            motionGallery.innerHTML = motionItems.map((item, idx) => {
              const videoId = getYouTubeId(item.videoUrl);
              return `
                <div class="work-card">
                  <span class="work-index">${String(idx + 1).padStart(2, '0')} / Motion Graphic</span>
                  <div class="work-visual youtube-card" data-video-id="${videoId}" data-url="${item.videoUrl}">
                    <img src="${item.imageUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '')}" alt="${item.title}" loading="lazy">
                    <button class="play-btn" aria-label="Putar Video">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div class="work-title">${item.title}</div>
                  <div class="work-meta">${item.meta}</div>
                  ${item.videoUrl ? `
                  <div class="work-action">
                    <a href="${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="youtube-link">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                      Tonton di YouTube
                    </a>
                  </div>` : ''}
                </div>
              `;
            }).join('');
          }

          // Render Video Showcase Gallery Grid
          const videoGallery = document.getElementById('pmVideoGallery') || document.querySelector('#portfolioModalVideo .work-grid');
          if (videoGallery && videoItems.length) {
            videoGallery.innerHTML = videoItems.map((item, idx) => {
              const videoId = getYouTubeId(item.videoUrl);
              return `
                <div class="work-card">
                  <span class="work-index">${String(idx + 1).padStart(2, '0')} / Video Showcase</span>
                  <div class="work-visual youtube-card" data-video-id="${videoId}" data-url="${item.videoUrl || ''}">
                    <img src="${item.imageUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '')}" alt="${item.title}" loading="lazy">
                    <button class="play-btn" aria-label="Putar Video">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div class="work-title">${item.title}</div>
                  <div class="work-meta">${item.meta}</div>
                  ${item.videoUrl ? `
                  <div class="work-action">
                    <a href="${item.videoUrl}" target="_blank" rel="noopener noreferrer" class="youtube-link">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                      Tonton di YouTube
                    </a>
                  </div>` : ''}
                </div>
              `;
            }).join('');
          }
        }

        // 2b. Proyek Pengalaman KIAN (Experience Projects)
        if (Array.isArray(cmsData.experienceProjects)) {
          const expItems = cmsData.experienceProjects;
          const expTotal = expItems.length;

          const expKianBody = document.getElementById('expKianBody');
          if (expKianBody && expItems.length) {
            expKianBody.innerHTML = expItems.map((item, idx) => `
              <div class="exp-project-card" data-category="${item.category || ''}" data-keywords="${((item.role || '') + ' ' + (item.title || '') + ' ' + (item.output || '')).trim()}">
                <div class="exp-card-header">
                  <span class="exp-card-index">#${String(idx + 1).padStart(2, '0')}</span>
                  <span class="exp-card-tag">${formatCategoryTag(item.category)}</span>
                  <span class="exp-card-date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>${item.date || ''}</span>
                </div>
                <h4 class="exp-card-title">${item.title || ''}</h4>
                <div class="exp-card-role"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg><span class="exp-role-label">Posisi:</span><span class="exp-role-val">${item.role || ''}</span></div>
                <p class="exp-card-desc">${item.desc || ''}</p>
                <div class="exp-card-output">
                  <strong>Hasil Produksi:</strong> ${item.output || ''}
                </div>
                ${item.tools ? `<div class="exp-card-tools">${(Array.isArray(item.tools) ? item.tools : String(item.tools).split(',')).map(t => `<span class="exp-tool-pill">${t.trim()}</span>`).join('')}</div>` : ''}
              </div>
            `).join('\n        ');
          }

          const expBadge = document.querySelector('#expModalKian .exp-modal-badge--count');
          if (expBadge) expBadge.textContent = `${expTotal}+ Proyek Selesai`;

          const expAllBtn = document.querySelector('#expModalKian .exp-filter-btn[data-filter="all"]');
          if (expAllBtn) expAllBtn.textContent = `Semua (${expTotal})`;

          const kianStatItem = document.querySelector('.tl-stat-item[data-exp-target="expModalKian"]');
          if (kianStatItem) {
            const numEl = kianStatItem.querySelector('.tl-stat-number');
            if (numEl) {
              numEl.setAttribute('data-count', expTotal);
              numEl.textContent = expTotal;
            }
            kianStatItem.setAttribute('aria-label', `Buka detail ${expTotal}+ Proyek Ditangani di KIAN Company`);
          }
        }

        // 3. Keahlian & Software
        if (Array.isArray(cmsData.skills) && cmsData.skills.length) {
          const skillContainer = document.getElementById('skillTagsContainer');
          if (skillContainer) {
            skillContainer.innerHTML = cmsData.skills.map(sk => {
              const slug = sk.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return `<button class="skill-tag" type="button" data-skill="${slug}">${sk}</button>`;
            }).join('');
          }
        }

        // 4. Artikel & Blog
        if (Array.isArray(cmsData.articles) && cmsData.articles.length) {
          currentArticles = cmsData.articles;
          const grid = document.getElementById('articlesGrid');
          if (grid) {
            grid.innerHTML = cmsData.articles.map(art => `
              <div class="article-card" data-article-id="${art.id}">
                <div class="article-cover">
                  <img src="${art.coverUrl}" alt="${art.title}" loading="lazy">
                  <span class="article-badge">${art.category}</span>
                </div>
                <div class="article-info">
                  <span class="article-date">${art.date}</span>
                  <h3 class="article-title">${art.title}</h3>
                  <p class="article-excerpt">${art.excerpt}</p>
                  <button class="article-read-btn" type="button" data-article-id="${art.id}">
                    Baca Artikel <span class="arrow">&rarr;</span>
                  </button>
                </div>
              </div>
            `).join('');
          }
        }

        // Jalankan ulang fungsi sinkronisasi proyek dan gambar
        if (typeof syncProjectCounts === 'function') syncProjectCounts();
        if (typeof initSeamlessImageLoading === 'function') initSeamlessImageLoading();

        // Reveal observer update
        document.querySelectorAll('.reveal:not(.in)').forEach(el => {
          if (observer) observer.observe(el);
        });
      }

      // Expose ke global
      window.applyCmsDataToDOM = applyCmsDataToDOM;

      // Inisialisasi awal saat load
      try {
        const saved = localStorage.getItem('bayu_cms_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          applyCmsDataToDOM(parsed);
        } else if (window.__INITIAL_CMS_STATE__) {
          applyCmsDataToDOM(window.__INITIAL_CMS_STATE__);
        }
      } catch (e) {
        console.warn('Gagal memuat CMS state:', e);
      }

      // Listener storage event (bila tab admin melakukan save)
      window.addEventListener('storage', (e) => {
        if (e.key === 'bayu_cms_data' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            applyCmsDataToDOM(data);
          } catch (err) { }
        }
      });

      // Listener postMessage (ketika berjalan di dalam Iframe simulator Live Visual Editor)
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'CMS_UPDATE' && e.data.data) {
          applyCmsDataToDOM(e.data.data);
        }
      });
    })();
