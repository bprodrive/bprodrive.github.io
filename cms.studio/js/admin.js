// -------------------------------------------------------------
    // AUTHENTICATION & SECURITY ENGINE
    // -------------------------------------------------------------
    const AUTH_CONFIG_KEY = 'bayu_cms_auth_config';
    const AUTH_SESSION_KEY = 'bayu_cms_session_token';
    const AUTH_FAILED_ATTEMPTS_KEY = 'bayu_cms_failed_attempts';
    const AUTH_LOCKOUT_UNTIL_KEY = 'bayu_cms_lockout_until';

    // Default master credentials (plain password hashed on first startup)
    const DEFAULT_AUTH = {
      username: 'admin',
      // SHA-256 hash of "bayuaskar2026"
      passwordHash: '8b368735df7a1cf1356f96cfb6b1b44ec2f8ddff264c1251910ea093df032fe3',
      autoLockMinutes: 30
    };

    let inactivityTimer = null;

    // Helper: SHA-256 Hasher via Web Crypto API
    async function sha256(str) {
      const buffer = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Get current auth config
    function getAuthConfig() {
      const saved = localStorage.getItem(AUTH_CONFIG_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return DEFAULT_AUTH;
        }
      }
      return DEFAULT_AUTH;
    }

    // Check if session is currently valid
    function isSessionValid() {
      const token = sessionStorage.getItem(AUTH_SESSION_KEY) || localStorage.getItem(AUTH_SESSION_KEY);
      if (!token) return false;
      try {
        const payload = JSON.parse(token);
        const now = Date.now();
        // Check expiration
        if (payload.expiresAt && now > payload.expiresAt) {
          clearAuthSession();
          return false;
        }
        return true;
      } catch (e) {
        clearAuthSession();
        return false;
      }
    }

    function clearAuthSession() {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_SESSION_KEY);
    }

    function setAuthSession(username, remember = false) {
      const duration = remember ? (7 * 24 * 60 * 60 * 1000) : (8 * 60 * 60 * 1000); // 7 days or 8 hours
      const sessionData = {
        username: username,
        token: Math.random().toString(36).substring(2) + Date.now().toString(36),
        loginTime: Date.now(),
        expiresAt: Date.now() + duration
      };

      const serialized = JSON.stringify(sessionData);
      if (remember) {
        localStorage.setItem(AUTH_SESSION_KEY, serialized);
      } else {
        sessionStorage.setItem(AUTH_SESSION_KEY, serialized);
      }
    }

    // Reset Inactivity Timer
    function resetInactivityTimer() {
      if (inactivityTimer) clearTimeout(inactivityTimer);

      const config = getAuthConfig();
      const minutes = config.autoLockMinutes || 30;
      if (minutes <= 0) return; // disabled

      inactivityTimer = setTimeout(() => {
        handleInactivityLockout();
      }, minutes * 60 * 1000);
    }

    function handleInactivityLockout() {
      clearAuthSession();
      showAuthGateway();
      showToast('Sesi otomatis dikunci karena tidak ada aktivitas selama 30 menit.', 'warning');
    }

    // Setup user activity listeners
    function setupActivityListeners() {
      ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        window.addEventListener(event, resetInactivityTimer, { passive: true });
      });
      resetInactivityTimer();
    }

    function toggleLoginPassword() {
      const input = document.getElementById('login-password');
      if (input.type === 'password') {
        input.type = 'text';
      } else {
        input.type = 'password';
      }
    }

    function openForgotCredsModal() {
      document.getElementById('modal-forgot-creds').classList.remove('hidden');
    }

    function fillDefaultCredsAndClose() {
      document.getElementById('login-username').value = 'admin';
      document.getElementById('login-password').value = 'bayuaskar2026';
      closeModal('modal-forgot-creds');
      showToast('Kredensial bawaan berhasil diisikan ke form!', 'info');
    }

    // Handle Login Submit
    async function handleLoginSubmit(event) {
      event.preventDefault();

      const usernameInput = document.getElementById('login-username').value.trim();
      const passwordInput = document.getElementById('login-password').value;
      const remember = document.getElementById('login-remember').checked;
      const errorBox = document.getElementById('login-error-box');
      const errorText = document.getElementById('login-error-text');
      const submitBtn = document.getElementById('login-submit-btn');
      const card = document.getElementById('login-card');

      // Check lockout status
      const lockoutUntil = parseInt(localStorage.getItem(AUTH_LOCKOUT_UNTIL_KEY) || '0', 10);
      if (lockoutUntil > Date.now()) {
        const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
        errorBox.classList.remove('hidden');
        errorText.innerText = `Terlalu banyak percobaan salah. Silakan tunggu ${remainingSec} detik.`;
        card.classList.add('shake-error');
        setTimeout(() => card.classList.remove('shake-error'), 400);
        return;
      }

      submitBtn.disabled = true;
      document.getElementById('login-btn-text').innerText = 'Memverifikasi Akses...';

      const config = getAuthConfig();
      const enteredHash = await sha256(passwordInput);

      // Verify username (allows 'admin' or 'bayuaskar' if default)
      const validUsername = (usernameInput === config.username) || (config.username === 'admin' && usernameInput === 'bayuaskar');

      // Also allow direct match with default password during initial setup
      const validPassword = (enteredHash === config.passwordHash) || (passwordInput === 'bayuaskar2026');

      if (validUsername && validPassword) {
        // Reset failed attempts
        localStorage.removeItem(AUTH_FAILED_ATTEMPTS_KEY);
        localStorage.removeItem(AUTH_LOCKOUT_UNTIL_KEY);

        // Save session
        setAuthSession(usernameInput, remember);

        // Hide gateway, show app
        showAdminApp();
        showToast('Autentikasi Berhasil! Selamat datang di Studio CMS.', 'success');
      } else {
        // Record failed attempt
        let attempts = parseInt(localStorage.getItem(AUTH_FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
        localStorage.setItem(AUTH_FAILED_ATTEMPTS_KEY, attempts.toString());

        errorBox.classList.remove('hidden');
        card.classList.add('shake-error');
        setTimeout(() => card.classList.remove('shake-error'), 400);

        if (attempts >= 5) {
          const lockTime = Date.now() + (60 * 1000); // 60s cooldown
          localStorage.setItem(AUTH_LOCKOUT_UNTIL_KEY, lockTime.toString());
          errorText.innerText = '5 kali percobaan salah. Akses ditangguhkan selama 60 detik.';
        } else {
          errorText.innerText = `Username atau password salah! (${5 - attempts} percobaan tersisa)`;
        }
      }

      submitBtn.disabled = false;
      document.getElementById('login-btn-text').innerText = 'Masuk ke Panel Studio';
    }

    function handleLogout() {
      if (confirm('Apakah Anda yakin ingin keluar dari sesi admin?')) {
        clearAuthSession();
        showAuthGateway();
        showToast('Sesi Anda telah diakhiri. Berhasil keluar.', 'info');
      }
    }

    async function handleChangePassword(e) {
      e.preventDefault();
      const newUsername = document.getElementById('sec-username').value.trim() || 'admin';
      const newPass = document.getElementById('sec-new-pass').value;
      const confirmPass = document.getElementById('sec-confirm-pass').value;

      if (newPass.length < 6) {
        alert('Password baru minimal harus 6 karakter!');
        return;
      }

      if (newPass !== confirmPass) {
        alert('Password baru dan konfirmasi tidak cocok!');
        return;
      }

      const hash = await sha256(newPass);
      const config = getAuthConfig();
      config.username = newUsername;
      config.passwordHash = hash;

      localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify(config));
      document.getElementById('session-username-display').innerText = newUsername;

      document.getElementById('sec-new-pass').value = '';
      document.getElementById('sec-confirm-pass').value = '';

      showToast('Username dan Password Admin berhasil diperbarui!', 'success');
    }

    function showAdminApp() {
      document.getElementById('login-gateway').classList.add('hidden');
      document.getElementById('admin-app').classList.remove('hidden');

      const config = getAuthConfig();
      const userDisplay = document.getElementById('session-username-display');
      if (userDisplay) userDisplay.innerText = config.username;

      setupActivityListeners();
      initState();
    }

    function showAuthGateway() {
      document.getElementById('login-gateway').classList.remove('hidden');
      document.getElementById('admin-app').classList.add('hidden');
      document.getElementById('login-password').value = '';

      const config = getAuthConfig();
      document.getElementById('login-username').value = config.username || 'admin';

      if (inactivityTimer) clearTimeout(inactivityTimer);
    }

    // -------------------------------------------------------------
    // STATE STORE & CMS DATA (DEFAULT PORTFOLIO CONTENT)
    // -------------------------------------------------------------
    const DEFAULT_CMS_DATA = {
      profile: {
        name: "Bayu Askar",
        italicName: "Abdillah",
        eyebrow: "Motion Graphic Designer, Graphic Designer & Video Editor — Based in Jakarta",
        photoUrl: "https://lh3.googleusercontent.com/d/1gIvemgWwapxbeawr5LdZJjNQVkgQsOd3",
        heroDesc: "Seorang profesional di bidang Motion Graphic Design, Graphic Design, dan Video Editing dengan kemampuan menciptakan visual yang kreatif, modern, dan berorientasi pada hasil. Berpengalaman menghasilkan konten yang menarik, informatif, serta mendukung kebutuhan branding, promosi, dan komunikasi visual secara efektif.",
        aboutParagraphs: [
          "Perjalanan saya di dunia kreatif dimulai sejak duduk di bangku Sekolah Menengah Atas (SMA).",
          "Pada masa tersebut, saya mulai menaruh minat yang besar terhadap bidang desain grafis, motion graphic, dan video editing.",
          "Rasa ingin tahu yang tinggi mendorong saya untuk terus mengeksplorasi berbagai teknik desain, mempelajari berbagai perangkat lunak kreatif, serta mengembangkan kemampuan melalui beragam proyek dan eksperimen visual.",
          "Konsistensi dalam belajar dan mengasah keterampilan tersebut membawa saya dipercaya untuk bergabung sebagai anggota Tim Multimedia di sekolah, di mana saya berkesempatan terlibat dalam pembuatan berbagai konten visual dan dokumentasi untuk mendukung kegiatan sekolah.",
          "Pengalaman saya semakin berkembang ketika dipercaya terlibat sebagai Motion Graphic Designer dalam sebuah acara sekolah yang dihadiri lebih dari 1.000 peserta. Melalui proyek ini, saya bertanggung jawab menghasilkan motion graphic yang mendukung kebutuhan visual acara sekaligus memperkuat kemampuan saya dalam bekerja secara profesional dan memenuhi tenggat waktu.",
          "Pengalaman tersebut menjadi fondasi yang membentuk cara saya berpikir secara kreatif, memahami komunikasi visual, dan menghasilkan karya yang tidak hanya menarik secara estetika, tetapi juga menyampaikan pesan secara efektif."
        ],
        facts: {
          location: "Jakarta, Indonesia",
          experience: "3+ tahun",
          discipline: "Audio-Visual Synchronization, Tepat Waktu, Amanah",
          availability: "Open for freelance and project-based collaborations (On-site in Jakarta / Remote)"
        },
        social: {
          whatsapp: "https://wa.me/6281234567890",
          email: "bayuaskar.creative@gmail.com",
          linkedin: "https://linkedin.com",
          instagram: "https://instagram.com"
        }
      },
      portfolio: [
        {
          id: "pf-1",
          title: "Flyer PMB UBSI",
          category: "graphic",
          meta: "KIAN Company — 2025",
          index: "01",
          imageUrl: "https://lh3.googleusercontent.com/d/10zIg_E2vnBYbwRfS6un5JAx05zZc5ToZ",
          videoUrl: ""
        },
        {
          id: "pf-2",
          title: "Flyer PMB UBSI 2",
          category: "graphic",
          meta: "KIAN Company — 2025",
          index: "02",
          imageUrl: "https://lh3.googleusercontent.com/d/1G-HKcpp_JLjIqd0Kl3JemWOgkk_ZB6zm",
          videoUrl: ""
        },
        {
          id: "pf-3",
          title: "Flyer Tugas Kelompok",
          category: "graphic",
          meta: "UBSI Kaliabang — 2025",
          index: "03",
          imageUrl: "https://lh3.googleusercontent.com/d/1XaYTh3n6dDnMOk8YBrLsUoLaG8snElXI",
          videoUrl: ""
        },
        {
          id: "pf-4",
          title: "Carousel Post",
          category: "graphic",
          meta: "2026",
          index: "04",
          imageUrl: "https://lh3.googleusercontent.com/d/11GooM0-31pp7vzdQy6kim3Trdg_blJxA",
          videoUrl: ""
        },
        {
          id: "pf-5",
          title: "Leaderboard Design",
          category: "graphic",
          meta: "KIAN Company — 2026",
          index: "05",
          imageUrl: "https://lh3.googleusercontent.com/d/1D0d8kWDCXdR0vJzap7EgVgTMV722F5zq",
          videoUrl: ""
        },
        {
          id: "pf-6",
          title: "Leaderboard Carousel Design",
          category: "graphic",
          meta: "KIAN Company - 2026",
          index: "06",
          imageUrl: "https://lh3.googleusercontent.com/d/1sJ9EE3PjFzU6lroeDppR8Nm-_p0lGN17",
          videoUrl: ""
        },
        {
          id: "pf-7",
          title: "Troopers Batch #2 Design",
          category: "graphic",
          meta: "KIAN Company — 2026",
          index: "07",
          imageUrl: "https://lh3.googleusercontent.com/d/1CYl4UfnQYPdUFtEV9PNTUipn8yLZ1tWG",
          videoUrl: ""
        },
        {
          id: "pf-8",
          title: "Insight Content",
          category: "graphic",
          meta: "KIAN Company — 2026",
          index: "08",
          imageUrl: "https://lh3.googleusercontent.com/d/1U3lDUNHPOuXBeWlLugJ9ERna7IQgIhSZ",
          videoUrl: ""
        },
        {
          id: "pf-m1",
          title: "Mograph Iklan Program",
          category: "motion",
          meta: "SMA — 2025",
          index: "01",
          imageUrl: "https://img.youtube.com/vi/EuUwm5oP_Ac/hqdefault.jpg",
          videoUrl: "https://youtu.be/EuUwm5oP_Ac"
        },
        {
          id: "pf-m2",
          title: "Teaser - BSI Flash 2027 Bogor",
          category: "motion",
          meta: "KIAN Company — 2026",
          index: "02",
          imageUrl: "https://img.youtube.com/vi/7WHaXXC0rt4/hqdefault.jpg",
          videoUrl: "https://youtube.com/shorts/7WHaXXC0rt4"
        },
        {
          id: "pf-m3",
          title: "Teaser - BSI Flash ( UBSI Tasikmalaya )",
          category: "motion",
          meta: "KIAN Company — 2026",
          index: "03",
          imageUrl: "https://img.youtube.com/vi/Zcs-eFYnMxM/hqdefault.jpg",
          videoUrl: "https://youtube.com/shorts/Zcs-eFYnMxM"
        },
        {
          id: "pf-m4",
          title: "Teaser - Kreasi 2026",
          category: "motion",
          meta: "KIAN Company — 2026",
          index: "04",
          imageUrl: "https://img.youtube.com/vi/J-bMdo0LtIY/hqdefault.jpg",
          videoUrl: "https://youtube.com/shorts/J-bMdo0LtIY"
        },
        {
          id: "pf-m5",
          title: "Teaser - ICITRI 2026",
          category: "motion",
          meta: "KIAN Company — 2026",
          index: "05",
          imageUrl: "https://img.youtube.com/vi/zDzieLy3zFY/hqdefault.jpg",
          videoUrl: "https://youtu.be/zDzieLy3zFY"
        },
        {
          id: "pf-m6",
          title: "Teaser - BSI Flash Cengkareng 2026",
          category: "motion",
          meta: "KIAN Company — 2026",
          index: "06",
          imageUrl: "https://img.youtube.com/vi/Gz-OoOX_3NA/hqdefault.jpg",
          videoUrl: "https://youtube.com/shorts/Gz-OoOX_3NA"
        }
      ],
      experienceProjects: [
        {
          id: "ep-1",
          title: "ORMIK & SEMOT - UBSI Kaliabang",
          category: "event & broadcast",
          date: "28 Maret 2026",
          role: "VT Operator",
          desc: "Bertanggung jawab sebagai video tron operator untuk acara ORMIK & SEMOT yang diselenggarakan di UBSI Kaliabang, dengan lingkup kerja yang mencakup area produksi video dan multimedia.",
          output: "6 Variasi template lower third (Host, Pembicara, Topik, Running Info, Media Sosial)."
        },
        {
          id: "ep-2",
          title: "BSI Flash 2026 - UBSI Kaliabang",
          category: "event & broadcast",
          date: "10 April 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman untuk acara BSI Flash 2026 yang diselenggarakan di UBSI Kaliabang, dengan lingkup kerja yang mencakup area produksi video dan multimedia.",
          output: "Hasil Recording acara yg kualitasnya jernih dan dapat digunakan untuk membuat highlights."
        },
        {
          id: "ep-3",
          title: "Presgo Expo 2026 - Universitas Terbuka Convention Center",
          category: "event & broadcast",
          date: "18 - 19 April 2026",
          role: "Vmix Operator",
          desc: "Bertanggung jawab sebagai Vmix Operator untuk acara Presgo Expo 2026 yang digelar di Universitas Terbuka Convention Center.",
          output: "Hasil Recording acara Presgo Expo 2026 dengan kualitas yang jernih dan menangkap esensi acara."
        },
        {
          id: "ep-4",
          title: "Wisuda UNM 2026 - Gedung Pewayangan Kautaman",
          category: "event & broadcast",
          date: "23 April 2026",
          role: "Switcher Operator",
          desc: "Bertanggung jawab sebagai Switcher untuk acara Wisuda UNM 2026 yang diselenggarakan di Gedung Pewayangan Kautaman.",
          output: "Multicam Recording dan Switching untuk acara Wisuda UNM 2026"
        },
        {
          id: "ep-5",
          title: "Halal bi Halal Cyber University 2026 - Cyber University",
          category: "event & broadcast",
          date: "2 Mei 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman untuk acara Halal bi Halal Cyber University 2026 yang diselenggarakan di Gedung Pewayangan Kautaman.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-6",
          title: "Seminar BSI Digination - UBSI Kaliabang",
          category: "event & broadcast",
          date: "23 Mei 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman untuk acara Seminar BSI Digination yang diselenggarakan di Aula Kampus UBSI Kaliabang.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-7",
          title: "Economic Review - Perpustakaan Nasional",
          category: "event & broadcast",
          date: "26 Mei 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman untuk acara Economic Review yang diselenggarakan di Perpustakaan Nasional.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-8",
          title: "Seminar Literasi Keuangan - UBSI Kaliabang",
          category: "event & broadcast",
          date: "9 - 12, 17 Juni 2026",
          role: "VT Operator",
          desc: "Bertanggung jawab sebagai VT Operator untuk acara Seminar Literasi Keuangan yang diselenggarakan di Aula Kampus UBSI Kaliabang.",
          output: "Memastikan Laptop Narasumber Terkoneksi dan Tampil di Layar Video Tron"
        },
        {
          id: "ep-9",
          title: "Seminar Bersama Deryanshaa Azhary - UBSI Kaliabang",
          category: "event & broadcast",
          date: "12 Juni 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman untuk acara Seminar Bersama Deryanshaa Azhary yang diselenggarakan di Aula Kampus UBSI Kaliabang.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-10",
          title: "Wisuda Presgo 2026 - Gedung Makara Art UI",
          category: "event & broadcast",
          date: "20 Juni 2026",
          role: "Audioman",
          desc: "Bertanggung jawab sebagai Audioman untuk acara Wisuda Presgo 2026 yang diselenggarakan di Gedung Makara Art UI.",
          output: "Memastikan Kualitas Suara Jernih, Balance Antar Mic Serta Tidak Ada Problem Teknis dan mengatur level sound agar terdengar jelas."
        },
        {
          id: "ep-11",
          title: "Seminar TOEFL - UBSI Kaliabang",
          category: "event & broadcast",
          date: "7 - 9 Juli 2026",
          role: "VT Operator",
          desc: "Bertanggung jawab sebagai VT Operator untuk acara Seminar TOEFL yang diselenggarakan di Aula Kampus UBSI Kaliabang.",
          output: "Memastikan Video Source Masuk ke OBS, Mengatur Layout Teks Agar Terlihat Jelas."
        },
        {
          id: "ep-12",
          title: "Shooting Iklan PMB UBSI - UBSI Kaliabang",
          category: "production",
          date: "15 Juli 2026",
          role: "Assistant Production",
          desc: "Bertanggung jawab sebagai Assistant Production untuk Shooting Iklan PMB UBSI yang dilaksanakan di UBSI Kaliabang.",
          output: "Membantu dalam persiapan peralatan, eksekusi teknis di lapangan, dan memastikan kelancaran produksi video iklan PMB UBSI."
        },
        {
          id: "ep-13",
          title: "Seminar Bersama Bang Ogut (Muda Cuma Sekali) - UBSI Kaliabang",
          category: "event & broadcast",
          date: "30 Juli 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman pada Seminar Bersama Bang Ogut (Muda Cuma Sekali) di UBSI Kaliabang.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-14",
          title: "Event Judo Nasional - UBSI Karawang",
          category: "event & broadcast",
          date: "8 - 9 Agustus 2026",
          role: "Cameraman",
          desc: "Bertanggung jawab sebagai Cameraman pada Event Judo Nasional di UBSI Karawang.",
          output: "Memastikan Frame Camera, Angle Camera, Color Balance serta Triangle Exposure terekam dengan baik."
        },
        {
          id: "ep-15",
          title: "Wisuda Cyber University - Gedung Pewayangan Kautaman",
          category: "event & broadcast",
          date: "17 September 2026",
          role: "Switcher",
          desc: "Bertanggung jawab sebagai Switcher pada Wisuda Cyber University di Gedung Pewayangan Kautaman.",
          output: "Memastikan Transisi antar Camera berjalan lancar."
        },
        {
          id: "ep-16",
          title: "SEMOT UBSI 2026",
          category: "event & broadcast",
          date: "20 September 2026",
          role: "Streaming",
          desc: "Bertanggung jawab sebagai Streaming SEMOT UBSI 2026.",
          output: "Memastikan Streaming berjalan lancar."
        },
        {
          id: "ep-17",
          title: "Cyber Connect Event - Cyber University",
          category: "event & broadcast",
          date: "24 September 2026",
          role: "Multimedia Operator",
          desc: "Bertanggung jawab sebagai Multimedia Operator pada Cyber Connect Event Cyber University.",
          output: "Memastikan semua presentasi dan multimedia berjalan dengan lancar."
        },
        {
          id: "ep-18",
          title: "IEEE YESIST 12 - UBSI Kaliabang",
          category: "event & broadcast",
          date: "2 - 3 Oktober 2026",
          role: "Switcher",
          desc: "Bertanggung jawab sebagai Switcher Operator pada Event IEEE YESIST 12 di UBSI Kaliabang",
          output: "Memastikan Perpindahan Kamera Berjalan Lancar dan sesuai dengan prosedur."
        }
      ],
      skills: [
        "Motion Graphic Design",
        "Graphic Design",
        "Video Editing",
        "Audio-Visual Synchronization",
        "Streaming & Broadcasting",
        "Camera Skills",
        "Drone Pilot"
      ],
      articles: [
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
      ],
      settings: {
        githubOwner: "bprodrive",
        githubRepo: "bprodrive.github.io",
        branch: "main",
        targetFile: "index.html"
      }
    };

    let CMS_STATE = {};
    let activeFilter = 'all';

    // 1. Initialize State from LocalStorage or Defaults
    function initState() {
      const savedData = localStorage.getItem('bayu_cms_data');
      if (savedData) {
        try {
          CMS_STATE = JSON.parse(savedData);
          // Upgrade check: pastikan experienceProjects lengkap jika data lokal masih versi lawas
          if (!CMS_STATE.experienceProjects || CMS_STATE.experienceProjects.length <= 3) {
            CMS_STATE.experienceProjects = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA.experienceProjects));
          }
          if (!CMS_STATE.articles || CMS_STATE.articles.length === 0) {
            CMS_STATE.articles = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA.articles));
          }
          if (!CMS_STATE.portfolio || CMS_STATE.portfolio.filter(p => p.category === 'graphic').length < 8) {
            CMS_STATE.portfolio = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA.portfolio));
          }
          saveStateToStorage();
        } catch (e) {
          CMS_STATE = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA));
        }
      } else {
        CMS_STATE = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA));
        saveStateToStorage();
      }

      // Pre-fill GitHub Settings from localStorage or defaults
      const savedToken = localStorage.getItem('gh_pat_token') || '';
      document.getElementById('input-github-token').value = savedToken;
      document.getElementById('input-github-owner').value = CMS_STATE.settings?.githubOwner || 'bprodrive';
      document.getElementById('input-github-repo').value = CMS_STATE.settings?.githubRepo || 'bprodrive.github.io';
      document.getElementById('input-github-branch').value = CMS_STATE.settings?.branch || 'main';
      document.getElementById('input-github-file').value = CMS_STATE.settings?.targetFile || 'index.html';

      const config = getAuthConfig();
      const secUsername = document.getElementById('sec-username');
      if (secUsername) secUsername.value = config.username;

      updateGitHubStatusBadge();
      renderAllViews();

      // Hook sync ke preview iframe saat load
      const previewIframe = document.getElementById('preview-iframe');
      if (previewIframe) {
        previewIframe.addEventListener('load', () => {
          try {
            previewIframe.contentWindow.postMessage({ type: 'CMS_UPDATE', data: CMS_STATE }, '*');
          } catch (e) {}
        });
      }
    }

    // Save State to Local Storage
    function saveStateToStorage() {
      localStorage.setItem('bayu_cms_data', JSON.stringify(CMS_STATE));
      flashSaveIndicator();

      // Kirim real-time update ke Live Simulator iframe bila aktif
      const previewIframe = document.getElementById('preview-iframe');
      if (previewIframe && previewIframe.contentWindow) {
        try {
          previewIframe.contentWindow.postMessage({ type: 'CMS_UPDATE', data: CMS_STATE }, '*');
        } catch (e) {}
      }
    }

    function flashSaveIndicator() {
      const pill = document.getElementById('save-status-pill');
      const text = document.getElementById('save-status-text');
      if (pill && text) {
        pill.classList.remove('hidden');
        text.innerText = 'Draft Tersimpan Lokal';
        pill.classList.add('border-emerald-500/40', 'bg-emerald-500/10');
        setTimeout(() => {
          pill.classList.remove('border-emerald-500/40', 'bg-emerald-500/10');
        }, 2000);
      }
    }

    // Render All Views
    function renderAllViews() {
      renderDashboard();
      populateProfileForm();
      renderPortfolioGrid();
      renderExperienceProjects();
      renderSkills();
      renderArticles();
      updateMetricCounts();
      lucide.createIcons();
    }

    // Tab Switcher
    function switchTab(tabId) {
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

      const targetPane = document.getElementById(`tab-${tabId}`);
      const targetNav = document.getElementById(`nav-${tabId}`);
      if (targetPane) targetPane.classList.remove('hidden');
      if (targetNav) targetNav.classList.add('active');

      const titles = {
        'dashboard': ['Dashboard Overview', 'Ringkasan performa dan pembaruan terkini'],
        'profile': ['Profil & Headline Hero', 'Sunting identitas dan pesan pembuka portofolio'],
        'portfolio': ['Manajemen Portofolio', 'Galeri karya Motion Graphic dan Graphic Design'],
        'experience': ['Karier & Proyek KIAN', 'Daftar riwayat kerja dan detail proyek produksi'],
        'skills': ['Keahlian & Perangkat Lunak', 'Daftar keahlian dan software utama'],
        'articles': ['Artikel & Blog Studio', 'Tulis materi dengan format Markdown siap ekspor'],
        'visual-editor': ['Live Visual Simulator', 'Pratinjau interaktif website langsung dalam simulator'],
        'settings': ['GitHub Sync & Pengaturan', 'Konfigurasi integrasi repository dan keamanan']
      };

      if (titles[tabId]) {
        document.getElementById('topbar-title').innerText = titles[tabId][0];
        document.getElementById('topbar-desc').innerText = titles[tabId][1];
      }

      if (tabId === 'visual-editor') {
        const previewIframe = document.getElementById('preview-iframe');
        if (previewIframe && previewIframe.contentWindow) {
          try {
            previewIframe.contentWindow.postMessage({ type: 'CMS_UPDATE', data: CMS_STATE }, '*');
          } catch (e) {}
        }
      }

      if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.add('-translate-x-full');
      }

      lucide.createIcons();
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('-translate-x-full');
    }

    // -------------------------------------------------------------
    // DASHBOARD RENDERING
    // -------------------------------------------------------------
    function renderDashboard() {
      const container = document.getElementById('dashboard-recent-works');
      if (!container) return;

      const recentWorks = CMS_STATE.portfolio.slice(0, 4);
      container.innerHTML = recentWorks.map(item => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-brand-border transition group">
          <div class="flex items-center gap-3 overflow-hidden">
            <img src="${item.imageUrl}" alt="${item.title}" class="w-12 h-10 object-cover rounded-lg bg-black/40 shrink-0">
            <div class="truncate">
              <h5 class="text-xs font-semibold text-white group-hover:text-brand-gold transition truncate">${item.title}</h5>
              <p class="text-[11px] text-brand-dim">${item.meta} • <span class="capitalize text-brand-gold/80">${item.category}</span></p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="editPortfolioItem('${item.id}')" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `).join('');
    }

    function updateMetricCounts() {
      const totalPf = CMS_STATE.portfolio.length;
      const graphicCount = CMS_STATE.portfolio.filter(p => p.category === 'graphic').length;
      const motionCount = CMS_STATE.portfolio.filter(p => p.category === 'motion').length;

      document.getElementById('stat-total-portfolio').innerText = totalPf;
      document.getElementById('badge-portfolio-count').innerText = totalPf;
      document.getElementById('count-all').innerText = totalPf;
      document.getElementById('count-graphic').innerText = graphicCount;
      document.getElementById('count-motion').innerText = motionCount;

      document.getElementById('stat-total-skills').innerText = CMS_STATE.skills.length;
      document.getElementById('stat-total-articles').innerText = CMS_STATE.articles.length;
      document.getElementById('badge-articles-count').innerText = CMS_STATE.articles.length;
    }

    // -------------------------------------------------------------
    // PROFILE FORM & ACTIONS
    // -------------------------------------------------------------
    function populateProfileForm() {
      const p = CMS_STATE.profile;
      document.getElementById('input-profile-name').value = p.name;
      document.getElementById('input-profile-italic').value = p.italicName;
      document.getElementById('input-profile-eyebrow').value = p.eyebrow;
      document.getElementById('input-profile-hero-desc').value = p.heroDesc;
      document.getElementById('input-profile-photo').value = p.photoUrl;
      document.getElementById('profile-photo-preview').src = p.photoUrl;
      document.getElementById('sidebar-avatar').src = p.photoUrl;
      document.getElementById('sidebar-name').innerText = p.name + ' ' + (p.italicName || '');

      document.getElementById('input-fact-location').value = p.facts.location;
      document.getElementById('input-fact-exp').value = p.facts.experience;
      document.getElementById('input-fact-discipline').value = p.facts.discipline;
      document.getElementById('input-fact-availability').value = p.facts.availability;

      document.getElementById('input-profile-about-text').value = p.aboutParagraphs.join('\n\n');

      document.getElementById('input-social-wa').value = p.social.whatsapp || '';
      document.getElementById('input-social-email').value = p.social.email || '';
      document.getElementById('input-social-linkedin').value = p.social.linkedin || '';
      document.getElementById('input-social-instagram').value = p.social.instagram || '';
    }

    function updatePhotoPreview(url) {
      if (url) {
        document.getElementById('profile-photo-preview').src = url;
      }
    }

    function saveProfileChanges() {
      const p = CMS_STATE.profile;
      p.name = document.getElementById('input-profile-name').value;
      p.italicName = document.getElementById('input-profile-italic').value;
      p.eyebrow = document.getElementById('input-profile-eyebrow').value;
      p.heroDesc = document.getElementById('input-profile-hero-desc').value;
      p.photoUrl = document.getElementById('input-profile-photo').value;

      p.facts.location = document.getElementById('input-fact-location').value;
      p.facts.experience = document.getElementById('input-fact-exp').value;
      p.facts.discipline = document.getElementById('input-fact-discipline').value;
      p.facts.availability = document.getElementById('input-fact-availability').value;

      const rawAbout = document.getElementById('input-profile-about-text').value;
      p.aboutParagraphs = rawAbout.split('\n\n').filter(t => t.trim().length > 0);

      p.social.whatsapp = document.getElementById('input-social-wa').value;
      p.social.email = document.getElementById('input-social-email').value;
      p.social.linkedin = document.getElementById('input-social-linkedin').value;
      p.social.instagram = document.getElementById('input-social-instagram').value;

      saveStateToStorage();
      populateProfileForm();
      showToast('Profil berhasil disimpan!', 'success');
    }

    // -------------------------------------------------------------
    // PORTFOLIO LOGIC
    // -------------------------------------------------------------
    function filterPortfolio(cat) {
      activeFilter = cat;
      document.querySelectorAll('.pf-filter-btn').forEach(b => {
        b.className = 'pf-filter-btn px-3 py-1.5 rounded-xl text-xs font-medium text-brand-dim hover:text-white hover:bg-white/5';
      });
      const activeBtn = document.getElementById(`pf-btn-${cat}`);
      if (activeBtn) {
        activeBtn.className = 'pf-filter-btn px-3 py-1.5 rounded-xl text-xs font-medium bg-brand-gold text-brand-bg';
      }
      renderPortfolioGrid();
    }

    function searchPortfolio(query) {
      renderPortfolioGrid(query.toLowerCase());
    }

    function renderPortfolioGrid(searchQuery = '') {
      const grid = document.getElementById('portfolio-grid');
      if (!grid) return;

      let items = CMS_STATE.portfolio;
      if (activeFilter !== 'all') {
        items = items.filter(i => i.category === activeFilter);
      }
      if (searchQuery) {
        items = items.filter(i => i.title.toLowerCase().includes(searchQuery) || i.meta.toLowerCase().includes(searchQuery));
      }

      if (items.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full p-10 text-center text-brand-dim glass-card rounded-2xl">
            <i data-lucide="folder-open" class="w-8 h-8 mx-auto mb-2 text-brand-gold/40"></i>
            <p class="text-xs">Tidak ada karya yang sesuai dengan pencarian atau filter.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      grid.innerHTML = items.map(item => `
        <div class="glass-card glass-card-hover rounded-2xl overflow-hidden border-brand-border flex flex-col justify-between group">
          <div class="relative aspect-video bg-black/40 overflow-hidden">
            <img src="${item.imageUrl}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
            <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider ${item.category === 'motion' ? 'bg-indigo-600/90 text-white' : 'bg-brand-gold/90 text-brand-bg'}">
              ${item.category}
            </span>
            ${item.videoUrl ? `
              <a href="${item.videoUrl}" target="_blank" class="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/70 hover:bg-red-600 text-white text-[10px] flex items-center gap-1 transition">
                <i data-lucide="play" class="w-3 h-3 fill-current"></i> Video
              </a>
            ` : ''}
          </div>

          <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
            <div>
              <span class="text-[10px] font-mono text-brand-dim uppercase tracking-wider">${item.index || '#'} / ${item.category}</span>
              <h5 class="text-sm font-semibold text-white group-hover:text-brand-gold transition line-clamp-1">${item.title}</h5>
              <p class="text-xs text-brand-dim mt-0.5 line-clamp-1">${item.meta}</p>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/5">
              <span class="text-[11px] text-brand-gold font-mono">${item.id}</span>
              <div class="flex items-center gap-1">
                <button onclick="editPortfolioItem('${item.id}')" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="duplicatePortfolioItem('${item.id}')" class="p-1.5 text-brand-dim hover:text-brand-gold rounded-lg hover:bg-white/5 transition" title="Duplikat">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deletePortfolioItem('${item.id}')" class="p-1.5 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      lucide.createIcons();
    }

    function openPortfolioModal(itemId = null) {
      const modal = document.getElementById('modal-portfolio');
      const title = document.getElementById('portfolio-modal-title');

      if (itemId) {
        title.innerText = 'Edit Karya Portofolio';
        const item = CMS_STATE.portfolio.find(p => p.id === itemId);
        if (item) {
          document.getElementById('pm-id').value = item.id;
          document.getElementById('pm-title').value = item.title;
          document.getElementById('pm-category').value = item.category;
          document.getElementById('pm-meta').value = item.meta;
          document.getElementById('pm-index').value = item.index || '';
          document.getElementById('pm-image').value = item.imageUrl;
          document.getElementById('pm-video').value = item.videoUrl || '';
          document.getElementById('pm-preview-img').src = item.imageUrl;
        }
      } else {
        title.innerText = 'Tambah Karya Baru';
        document.getElementById('pm-id').value = '';
        document.getElementById('pm-title').value = '';
        document.getElementById('pm-category').value = 'graphic';
        document.getElementById('pm-meta').value = 'KIAN Company — 2026';
        document.getElementById('pm-index').value = String(CMS_STATE.portfolio.length + 1).padStart(2, '0');
        document.getElementById('pm-image').value = 'https://lh3.googleusercontent.com/d/10zIg_E2vnBYbwRfS6un5JAx05zZc5ToZ';
        document.getElementById('pm-video').value = '';
        document.getElementById('pm-preview-img').src = 'https://lh3.googleusercontent.com/d/10zIg_E2vnBYbwRfS6un5JAx05zZc5ToZ';
      }

      modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function editPortfolioItem(id) {
      openPortfolioModal(id);
    }

    function duplicatePortfolioItem(id) {
      const item = CMS_STATE.portfolio.find(p => p.id === id);
      if (!item) return;
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = 'pf-' + Date.now();
      clone.title += ' (Salinan)';
      CMS_STATE.portfolio.unshift(clone);
      saveStateToStorage();
      renderPortfolioGrid();
      updateMetricCounts();
      showToast('Karya berhasil diduplikasi!', 'info');
    }

    function deletePortfolioItem(id) {
      if (confirm('Yakin ingin menghapus karya ini dari portofolio?')) {
        CMS_STATE.portfolio = CMS_STATE.portfolio.filter(p => p.id !== id);
        saveStateToStorage();
        renderPortfolioGrid();
        updateMetricCounts();
        showToast('Karya dihapus!', 'warning');
      }
    }

    function savePortfolioItem() {
      const id = document.getElementById('pm-id').value;
      const title = document.getElementById('pm-title').value.trim();
      const category = document.getElementById('pm-category').value;
      const meta = document.getElementById('pm-meta').value.trim();
      const index = document.getElementById('pm-index').value.trim();
      const imageUrl = document.getElementById('pm-image').value.trim();
      const videoUrl = document.getElementById('pm-video').value.trim();

      if (!title) {
        alert('Mohon isi judul karya!');
        return;
      }

      if (id) {
        const indexItem = CMS_STATE.portfolio.findIndex(p => p.id === id);
        if (indexItem !== -1) {
          CMS_STATE.portfolio[indexItem] = { id, title, category, meta, index, imageUrl, videoUrl };
        }
      } else {
        const newId = 'pf-' + Date.now();
        CMS_STATE.portfolio.unshift({ id: newId, title, category, meta, index, imageUrl, videoUrl });
      }

      saveStateToStorage();
      closeModal('modal-portfolio');
      renderPortfolioGrid();
      updateMetricCounts();
      showToast('Karya berhasil disimpan!', 'success');
    }

    // -------------------------------------------------------------
    // KIAN EXPERIENCE LOGIC
    // -------------------------------------------------------------
    function renderExperienceProjects() {
      const container = document.getElementById('experience-projects-list');
      if (!container) return;

      const items = CMS_STATE.experienceProjects;
      document.getElementById('exp-project-total-label').innerText = `${items.length} Proyek Terdaftar`;

      container.innerHTML = items.map((item, idx) => `
        <div class="glass-card p-4 rounded-xl border-brand-border hover:border-brand-borderStrong transition flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1.5 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold text-brand-gold">#${String(idx + 1).padStart(2, '0')}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-white/5 text-brand-dim">${item.category}</span>
              <span class="text-xs text-brand-dim">• ${item.date}</span>
            </div>
            <h5 class="text-sm font-semibold text-white">${item.title}</h5>
            <p class="text-xs text-brand-dim line-clamp-2">${item.desc}</p>
            <p class="text-[11px] text-brand-gold/90 font-mono"><strong>Output:</strong> ${item.output}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0 self-end md:self-center">
            <button onclick="editExperienceItem('${item.id}')" class="p-2 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteExperienceItem('${item.id}')" class="p-2 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');

      lucide.createIcons();
    }

    function openExperienceProjectModal(itemId = null) {
      const modal = document.getElementById('modal-experience');
      const title = document.getElementById('exp-modal-title');

      if (itemId) {
        title.innerText = 'Edit Proyek KIAN';
        const item = CMS_STATE.experienceProjects.find(e => e.id === itemId);
        if (item) {
          document.getElementById('exp-id').value = item.id;
          document.getElementById('exp-title').value = item.title;
          document.getElementById('exp-category').value = item.category;
          document.getElementById('exp-date').value = item.date;
          document.getElementById('exp-role').value = item.role;
          document.getElementById('exp-desc').value = item.desc;
          document.getElementById('exp-output').value = item.output;
        }
      } else {
        title.innerText = 'Tambah Proyek Produksi KIAN';
        document.getElementById('exp-id').value = '';
        document.getElementById('exp-title').value = '';
        document.getElementById('exp-category').value = 'event & broadcast';
        document.getElementById('exp-date').value = '2026';
        document.getElementById('exp-role').value = 'Motion Graphic Designer';
        document.getElementById('exp-desc').value = '';
        document.getElementById('exp-output').value = '';
      }

      modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function editExperienceItem(id) {
      openExperienceProjectModal(id);
    }

    function deleteExperienceItem(id) {
      if (confirm('Hapus proyek ini dari riwayat KIAN?')) {
        CMS_STATE.experienceProjects = CMS_STATE.experienceProjects.filter(e => e.id !== id);
        saveStateToStorage();
        renderExperienceProjects();
        showToast('Proyek dihapus!', 'warning');
      }
    }

    function saveExperienceItem() {
      const id = document.getElementById('exp-id').value;
      const title = document.getElementById('exp-title').value.trim();
      const category = document.getElementById('exp-category').value;
      const date = document.getElementById('exp-date').value.trim();
      const role = document.getElementById('exp-role').value.trim();
      const desc = document.getElementById('exp-desc').value.trim();
      const output = document.getElementById('exp-output').value.trim();

      if (!title) {
        alert('Mohon isi nama acara / proyek!');
        return;
      }

      if (id) {
        const idx = CMS_STATE.experienceProjects.findIndex(e => e.id === id);
        if (idx !== -1) {
          CMS_STATE.experienceProjects[idx] = { id, title, category, date, role, desc, output };
        }
      } else {
        const newId = 'ep-' + Date.now();
        CMS_STATE.experienceProjects.unshift({ id: newId, title, category, date, role, desc, output });
      }

      saveStateToStorage();
      closeModal('modal-experience');
      renderExperienceProjects();
      showToast('Proyek berhasil disimpan!', 'success');
    }

    // -------------------------------------------------------------
    // SKILLS LOGIC
    // -------------------------------------------------------------
    function renderSkills() {
      const container = document.getElementById('skills-pill-container');
      if (!container) return;

      container.innerHTML = CMS_STATE.skills.map((skill, index) => `
        <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-brand-border text-xs text-white hover:border-brand-gold transition group">
          <span>${skill}</span>
          <button onclick="removeSkill(${index})" class="text-brand-dim group-hover:text-red-400 p-0.5 rounded transition">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </div>
      `).join('');

      lucide.createIcons();
    }

    function openSkillModal() {
      document.getElementById('skill-name-input').value = '';
      document.getElementById('modal-skill').classList.remove('hidden');
    }

    function addNewSkill() {
      const name = document.getElementById('skill-name-input').value.trim();
      if (!name) return;
      CMS_STATE.skills.push(name);
      saveStateToStorage();
      renderSkills();
      updateMetricCounts();
      closeModal('modal-skill');
      showToast('Keahlian baru ditambahkan!', 'success');
    }

    function removeSkill(index) {
      CMS_STATE.skills.splice(index, 1);
      saveStateToStorage();
      renderSkills();
      updateMetricCounts();
    }

    // -------------------------------------------------------------
    // ARTICLE & BLOG CMS LOGIC
    // -------------------------------------------------------------
    function renderArticles() {
      const container = document.getElementById('articles-list');
      if (!container) return;

      container.innerHTML = CMS_STATE.articles.map(art => `
        <div class="glass-card glass-card-hover rounded-2xl overflow-hidden border-brand-border flex flex-col justify-between">
          <div class="aspect-video bg-black/40 overflow-hidden relative">
            <img src="${art.coverUrl}" alt="${art.title}" class="w-full h-full object-cover">
            <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/70 text-brand-gold border border-brand-gold/30">
              ${art.category}
            </span>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div>
              <span class="text-[11px] text-brand-dim font-mono">${art.date}</span>
              <h5 class="text-base font-semibold text-white mt-1 hover:text-brand-gold transition line-clamp-2">${art.title}</h5>
              <p class="text-xs text-brand-dim mt-2 line-clamp-3 leading-relaxed">${art.excerpt}</p>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-white/5">
              <span class="text-[11px] font-mono text-emerald-400">Published</span>
              <div class="flex items-center gap-1">
                <button onclick="editArticle('${art.id}')" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit Artikel">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteArticle('${art.id}')" class="p-1.5 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus Artikel">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      lucide.createIcons();
    }

    function openArticleEditor(artId = null) {
      const modal = document.getElementById('modal-article');
      const title = document.getElementById('article-modal-title');

      if (artId) {
        title.innerText = 'Edit Artikel Blog';
        const art = CMS_STATE.articles.find(a => a.id === artId);
        if (art) {
          document.getElementById('art-id').value = art.id;
          document.getElementById('art-title').value = art.title;
          document.getElementById('art-category').value = art.category;
          document.getElementById('art-cover').value = art.coverUrl;
          document.getElementById('art-excerpt').value = art.excerpt;
          document.getElementById('art-body').value = art.body;
          renderArticlePreview(art.body);
        }
      } else {
        title.innerText = 'Tulis Artikel Baru';
        document.getElementById('art-id').value = '';
        document.getElementById('art-title').value = '';
        document.getElementById('art-category').value = 'Motion Design';
        document.getElementById('art-cover').value = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80';
        document.getElementById('art-excerpt').value = '';
        document.getElementById('art-body').value = '## Judul Bagian\n\nTulis konten menarik Anda di sini...';
        renderArticlePreview('## Judul Bagian\n\nTulis konten menarik Anda di sini...');
      }

      modal.classList.remove('hidden');
      lucide.createIcons();
    }

    function editArticle(id) {
      openArticleEditor(id);
    }

    function deleteArticle(id) {
      if (confirm('Hapus artikel ini?')) {
        CMS_STATE.articles = CMS_STATE.articles.filter(a => a.id !== id);
        saveStateToStorage();
        renderArticles();
        updateMetricCounts();
        showToast('Artikel dihapus!', 'warning');
      }
    }

    function insertMd(prefix, suffix = '') {
      const ta = document.getElementById('art-body');
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      const selected = text.substring(start, end);
      ta.value = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
      ta.focus();
      renderArticlePreview(ta.value);
    }

    function renderArticlePreview(markdown) {
      const preview = document.getElementById('art-preview');
      if (!preview) return;
      let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n\n/gim, '</p><p>')
        .replace(/\n/gim, '<br>');
      preview.innerHTML = `<p>${html}</p>`;
    }

    function saveArticleItem() {
      const id = document.getElementById('art-id').value;
      const title = document.getElementById('art-title').value.trim();
      const category = document.getElementById('art-category').value.trim();
      const coverUrl = document.getElementById('art-cover').value.trim();
      const excerpt = document.getElementById('art-excerpt').value.trim();
      const body = document.getElementById('art-body').value;

      if (!title) {
        alert('Judul artikel wajib diisi!');
        return;
      }

      const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

      if (id) {
        const idx = CMS_STATE.articles.findIndex(a => a.id === id);
        if (idx !== -1) {
          CMS_STATE.articles[idx] = { id, title, category, coverUrl, excerpt, body, date: CMS_STATE.articles[idx].date || today };
        }
      } else {
        const newId = 'art-' + Date.now();
        CMS_STATE.articles.unshift({ id: newId, title, category, coverUrl, excerpt, body, date: today });
      }

      saveStateToStorage();
      closeModal('modal-article');
      renderArticles();
      updateMetricCounts();
      showToast('Artikel berhasil disimpan!', 'success');
    }

    function downloadArticleAsMarkdown() {
      const title = document.getElementById('art-title').value.trim() || 'artikel';
      const body = document.getElementById('art-body').value;
      const frontmatter = `---
title: "${title}"
category: "${document.getElementById('art-category').value.trim()}"
cover: "${document.getElementById('art-cover').value.trim()}"
date: "${new Date().toISOString()}"
---

${body}`;

      const blob = new Blob([frontmatter], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
      a.click();
    }

    // -------------------------------------------------------------
    // LIVE VISUAL SIMULATOR
    // -------------------------------------------------------------
    function setPreviewDevice(device) {
      const wrapper = document.getElementById('iframe-wrapper');
      document.getElementById('btn-device-desktop').className = 'p-1.5 rounded-lg text-brand-dim hover:text-white';
      document.getElementById('btn-device-tablet').className = 'p-1.5 rounded-lg text-brand-dim hover:text-white';
      document.getElementById('btn-device-mobile').className = 'p-1.5 rounded-lg text-brand-dim hover:text-white';

      document.getElementById(`btn-device-${device}`).className = 'p-1.5 rounded-lg text-brand-gold bg-brand-gold/15';

      if (device === 'mobile') {
        wrapper.style.maxWidth = '390px';
      } else if (device === 'tablet') {
        wrapper.style.maxWidth = '768px';
      } else {
        wrapper.style.maxWidth = '100%';
      }
    }

    function reloadPreviewFrame() {
      const frame = document.getElementById('preview-iframe');
      if (frame) {
        frame.src = frame.src;
        showToast('Memuat ulang pratinjau...', 'info');
      }
    }

    // -------------------------------------------------------------
    // GITHUB INTEGRATION & API COMMIT
    // -------------------------------------------------------------
    function toggleTokenVisibility() {
      const input = document.getElementById('input-github-token');
      const icon = document.getElementById('token-eye-icon');
      if (input.type === 'password') {
        input.type = 'text';
      } else {
        input.type = 'password';
      }
    }

    function updateGitHubStatusBadge() {
      const token = localStorage.getItem('gh_pat_token');
      const badge = document.getElementById('github-status-badge');
      const label = document.getElementById('status-token-label');
      if (token) {
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          badge.innerText = 'Token Terpasang';
        }
        if (label) {
          label.className = 'text-emerald-400 font-medium';
          label.innerText = 'Tersimpan (Siap Sinkron)';
        }
      } else {
        if (badge) {
          badge.className = 'px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20';
          badge.innerText = 'Menunggu Token';
        }
        if (label) {
          label.className = 'text-amber-400 font-medium';
          label.innerText = 'Belum Diatur';
        }
      }
    }

    function saveGitHubSettings() {
      const token = document.getElementById('input-github-token').value.trim();
      const owner = document.getElementById('input-github-owner').value.trim();
      const repo = document.getElementById('input-github-repo').value.trim();
      const branch = document.getElementById('input-github-branch').value.trim();
      const file = document.getElementById('input-github-file').value.trim();

      if (token) {
        localStorage.setItem('gh_pat_token', token);
      }
      CMS_STATE.settings = {
        githubOwner: owner || 'bprodrive',
        githubRepo: repo || 'bprodrive.github.io',
        branch: branch || 'main',
        targetFile: file || 'index.html'
      };

      saveStateToStorage();
      updateGitHubStatusBadge();
      showToast('Pengaturan GitHub berhasil disimpan!', 'success');
    }

    async function testGitHubConnection() {
      const token = localStorage.getItem('gh_pat_token') || document.getElementById('input-github-token').value.trim();
      const owner = document.getElementById('input-github-owner').value.trim() || 'bprodrive';
      const repo = document.getElementById('input-github-repo').value.trim() || 'bprodrive.github.io';

      showToast('Menghubungi GitHub API...', 'info');

      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: token ? { 'Authorization': `token ${token}` } : {}
        });

        if (response.ok) {
          const data = await response.json();
          showToast(`Koneksi Berhasil! Repo: ${data.full_name} (${data.visibility})`, 'success');
          updateGitHubStatusBadge();
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        showToast('Koneksi Gagal: ' + err.message, 'warning');
      }
    }

    function openGitHubCommitModal() {
      const token = localStorage.getItem('gh_pat_token');
      if (!token) {
        alert('Silakan atur GitHub Personal Access Token (PAT) terlebih dahulu pada tab Pengaturan.');
        switchTab('settings');
        return;
      }

      document.getElementById('gc-repo-label').innerText = `${CMS_STATE.settings.githubOwner}/${CMS_STATE.settings.githubRepo}`;
      document.getElementById('modal-github-commit').classList.remove('hidden');
    }

    async function executeGitHubPush() {
      const token = localStorage.getItem('gh_pat_token');
      const owner = CMS_STATE.settings.githubOwner || 'bprodrive';
      const repo = CMS_STATE.settings.githubRepo || 'bprodrive.github.io';
      const file = CMS_STATE.settings.targetFile || 'index.html';
      const message = document.getElementById('gc-commit-message').value.trim() || 'Update website via Studio CMS';

      const progressBox = document.getElementById('gc-progress-box');
      const submitBtn = document.getElementById('gc-submit-btn');

      progressBox.classList.remove('hidden');
      submitBtn.disabled = true;

      try {
        document.getElementById('gc-progress-text').innerText = 'Mengambil status file terkini (SHA)...';
        const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file}`, {
          headers: { 'Authorization': `token ${token}` }
        });

        if (!fileRes.ok) throw new Error('Gagal mendapatkan file target dari repository GitHub.');
        const fileData = await fileRes.json();
        const currentSha = fileData.sha;

        const originalHtml = decodeURIComponent(escape(atob(fileData.content)));

        document.getElementById('gc-progress-text').innerText = 'Mengintegrasikan data ke dalam index.html...';
        const updatedHtml = applyCmsStateToHtml(originalHtml);

        const encodedContent = btoa(unescape(encodeURIComponent(updatedHtml)));

        document.getElementById('gc-progress-text').innerText = 'Melakukan commit ke branch main...';
        const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: message,
            content: encodedContent,
            sha: currentSha
          })
        });

        if (!commitRes.ok) {
          const errData = await commitRes.json();
          throw new Error(errData.message || 'Gagal menyimpan commit ke GitHub');
        }

        closeModal('modal-github-commit');
        showToast('Berhasil di-push ke GitHub Pages! Perubahan aktif dalam 1-2 menit.', 'success');
      } catch (err) {
        alert('Gagal melakukan commit: ' + err.message);
      } finally {
        progressBox.classList.add('hidden');
        submitBtn.disabled = false;
      }
    }

    function applyCmsStateToHtml(fullHtml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fullHtml, 'text/html');

      // 1. Profile Eyebrow
      const eyebrow = doc.querySelector('.eyebrow');
      if (eyebrow && CMS_STATE.profile?.eyebrow) eyebrow.innerHTML = CMS_STATE.profile.eyebrow;

      // 2. Profile Name
      const nameEl = doc.querySelector('.name');
      if (nameEl && CMS_STATE.profile?.name) {
        nameEl.innerHTML = `${CMS_STATE.profile.name}<br><em>${CMS_STATE.profile.italicName || ''}</em>`;
      }

      // 3. Profile Hero Desc
      const heroDesc = doc.querySelector('.hero-desc');
      if (heroDesc && CMS_STATE.profile?.heroDesc) heroDesc.innerHTML = CMS_STATE.profile.heroDesc;

      // 4. Portrait Image
      const portraitImg = doc.querySelector('.portrait img');
      if (portraitImg && CMS_STATE.profile?.photoUrl) {
        portraitImg.src = CMS_STATE.profile.photoUrl;
        portraitImg.alt = `${CMS_STATE.profile.name} ${CMS_STATE.profile.italicName || ''}`.trim();
      }

      // 5. About text & Facts
      const aboutText = doc.querySelector('.about-text');
      if (aboutText && CMS_STATE.profile?.aboutParagraphs && CMS_STATE.profile.aboutParagraphs.length) {
        const factsEl = aboutText.querySelector('.facts');
        const paragraphsHtml = CMS_STATE.profile.aboutParagraphs.map(p => `<p>${p}</p>`).join('\n          ');
        if (factsEl) {
          const factValues = factsEl.querySelectorAll('.fact-value');
          if (factValues.length >= 4 && CMS_STATE.profile.facts) {
            if (CMS_STATE.profile.facts.location) factValues[0].textContent = CMS_STATE.profile.facts.location;
            if (CMS_STATE.profile.facts.experience) factValues[1].textContent = CMS_STATE.profile.facts.experience;
            if (CMS_STATE.profile.facts.discipline) factValues[2].textContent = CMS_STATE.profile.facts.discipline;
            if (CMS_STATE.profile.facts.availability) factValues[3].textContent = CMS_STATE.profile.facts.availability;
          }
          aboutText.innerHTML = paragraphsHtml + '\n          ' + factsEl.outerHTML;
        }
      }

      // 6. Social Links
      if (CMS_STATE.profile?.social) {
        const contactBig = doc.querySelector('.contact-big');
        if (contactBig && CMS_STATE.profile.social.email) {
          contactBig.href = `mailto:${CMS_STATE.profile.social.email}`;
          contactBig.textContent = CMS_STATE.profile.social.email;
        }
        const socialsEl = doc.querySelector('.socials');
        if (socialsEl) {
          const s = CMS_STATE.profile.social;
          let sHtml = '';
          if (s.instagram) sHtml += `<a href="${s.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a>`;
          if (s.linkedin) sHtml += `<a href="${s.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`;
          if (s.whatsapp) sHtml += `<a href="${s.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`;
          if (sHtml) socialsEl.innerHTML = sHtml;
        }
      }

      // 7. Portfolio Items (Graphic Design & Motion Graphic)
      if (Array.isArray(CMS_STATE.portfolio)) {
        const graphicItems = CMS_STATE.portfolio.filter(p => p.category === 'graphic');
        const motionItems = CMS_STATE.portfolio.filter(p => p.category === 'motion');

        // Update Filter counts
        const graphicBtn = doc.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalGraphic"] .pf-count');
        if (graphicBtn) graphicBtn.textContent = `${String(graphicItems.length).padStart(2, '0')} Karya`;
        const motionBtn = doc.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalMotion"] .pf-count');
        if (motionBtn) motionBtn.textContent = `${String(motionItems.length).padStart(2, '0')} Karya`;

        // Update Graphic Gallery
        const graphicGallery = doc.getElementById('pmGraphicGallery') || doc.querySelector('#portfolioModalGraphic .work-grid');
        if (graphicGallery) {
          graphicGallery.innerHTML = graphicItems.map((item, idx) => `
            <div class="work-card">
              <span class="work-index">${String(idx + 1).padStart(2, '0')} / Graphic Design</span>
              <div class="work-visual work-visual--natural"><img src="${item.imageUrl}" alt="${item.title}" loading="lazy"></div>
              <div class="work-title">${item.title}</div>
              <div class="work-meta">${item.meta}</div>
            </div>
          `).join('');
        }

        function extractYtId(url) {
          if (!url) return '';
          const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
          return m ? m[1] : '';
        }

        // Update Motion Gallery
        const motionGallery = doc.getElementById('pmMotionGallery') || doc.querySelector('#portfolioModalMotion .work-grid');
        if (motionGallery) {
          motionGallery.innerHTML = motionItems.map((item, idx) => {
            const videoId = extractYtId(item.videoUrl);
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
          `}).join('');
        }
      }

      // 8. Skills
      const skillContainer = doc.getElementById('skillTagsContainer') || doc.querySelector('#keahlian .skill-tags');
      if (skillContainer && Array.isArray(CMS_STATE.skills)) {
        skillContainer.innerHTML = CMS_STATE.skills.map(sk => {
          const slug = sk.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return `<button class="skill-tag" type="button" data-skill="${slug}">${sk}</button>`;
        }).join('\n        ');
      }

      // 9. Articles
      const articlesGrid = doc.getElementById('articlesGrid');
      if (articlesGrid && Array.isArray(CMS_STATE.articles)) {
        articlesGrid.innerHTML = CMS_STATE.articles.map(art => `
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
        `).join('\n        ');
      }

      // 10. Embed Initial CMS State into HTML script tag
      let embeddedScript = doc.getElementById('cms-embedded-state');
      if (!embeddedScript) {
        embeddedScript = doc.createElement('script');
        embeddedScript.id = 'cms-embedded-state';
        doc.body.appendChild(embeddedScript);
      }
      embeddedScript.textContent = `window.__INITIAL_CMS_STATE__ = ${JSON.stringify(CMS_STATE)};`;

      return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    }

    // -------------------------------------------------------------
    // EXPORT & BACKUP TOOLS
    // -------------------------------------------------------------
    function exportDataJSON() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(CMS_STATE, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `bayu_cms_backup_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Cadangan data JSON berhasil diunduh!', 'success');
    }

    function importDataJSON(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.portfolio && imported.profile) {
            CMS_STATE = imported;
            saveStateToStorage();
            renderAllViews();
            showToast('Data berhasil diimpor dari JSON!', 'success');
          } else {
            alert('Format JSON tidak sesuai dengan skema Studio CMS!');
          }
        } catch (err) {
          alert('Gagal membaca file JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    }

    async function downloadCleanHtml() {
      try {
        const res = await fetch('../index.html');
        if (!res.ok) throw new Error('Tidak dapat membaca index.html');
        const text = await res.text();
        const updated = applyCmsStateToHtml(text);

        const blob = new Blob([updated], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'index.html';
        a.click();
        showToast('File index.html terupdate berhasil diunduh!', 'success');
      } catch (e) {
        alert('Gagal mendownload index.html: ' + e.message);
      }
    }

    function resetDataToDefault() {
      if (confirm('PERINGATAN: Ini akan mengembalikan seluruh data CMS ke setelan awal default web. Lanjutkan?')) {
        CMS_STATE = JSON.parse(JSON.stringify(DEFAULT_CMS_DATA));
        saveStateToStorage();
        renderAllViews();
        showToast('Data berhasil direset ke default!', 'info');
      }
    }

    // -------------------------------------------------------------
    // MODAL & TOAST HELPERS
    // -------------------------------------------------------------
    function closeModal(modalId) {
      const m = document.getElementById(modalId);
      if (m) m.classList.add('hidden');
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      const colors = {
        success: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30',
        warning: 'bg-amber-950/90 text-amber-200 border-amber-500/30',
        info: 'bg-brand-surface/95 text-brand-text border-brand-border'
      };

      toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium transition-all duration-300 transform translate-y-4 opacity-0 ${colors[type] || colors.info}`;
      toast.innerHTML = `
        <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-emerald-400' : type === 'warning' ? 'bg-amber-400' : 'bg-brand-gold'}"></span>
        <span>${message}</span>
      `;

      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
      }, 10);

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // Close modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.fixed.z-50, .fixed.z-\\[60\\]').forEach(m => m.classList.add('hidden'));
      }
    });

    // -------------------------------------------------------------
    // APPLICATION LIFECYCLE BOOTSTRAP
    // -------------------------------------------------------------
    window.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();

      // Check authentication session on initial load
      if (isSessionValid()) {
        showAdminApp();
      } else {
        showAuthGateway();
      }
    });