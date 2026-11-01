/**
 * ==========================================================================
 * SECTION: KARTU KATEGORI PORTOFOLIO LOGIC
 * Lokasi modul: sections/categories/categories.js
 * Bertanggung jawab atas interaksi, aksesibilitas, dan sinkronisasi kartu kategori
 * ==========================================================================
 */
(function () {
  'use strict';

  function initCategories() {
    const filterBtns = document.querySelectorAll('.portfolio-filter-btn[data-portfolio-target]');

    // Aksesibilitas keyboard (Enter & Space)
    filterBtns.forEach(function (btn) {
      if (!btn.getAttribute('role')) {
        btn.setAttribute('role', 'button');
      }
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCategories);
  } else {
    initCategories();
  }
})();
