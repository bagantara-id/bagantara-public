// ==========================================
// MESIN UTAMA: NAVIGASI SPA & ORKESTRATOR TEMA
// ARSITEKTUR: PURE DOM CLASS MANIPULATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // DETEKTOR SESI CHAT AKTIF
    // ==========================================
    const btnPulihkanChat = document.getElementById('btnPulihkanChat');
    window.periksaSesiChatAktif = function() {
        const sesiTersimpan = localStorage.getItem('bgt_active_chat');
        if (sesiTersimpan && btnPulihkanChat) {
            btnPulihkanChat.classList.remove('hidden');
        } else if (btnPulihkanChat) {
            btnPulihkanChat.classList.add('hidden');
        }
    };
    window.periksaSesiChatAktif();

    if (btnPulihkanChat) {
        btnPulihkanChat.addEventListener('click', () => {
            const panel = document.getElementById('panel-komunikasi-utama');
            if (panel) {
                // JIKA PANEL SUDAH ADA DI DOM (Metode Preservasi)
                panel.style.display = 'flex'; // Munculkan kembali
                panel.style.animation = 'none'; // Reset animasi penutup
                void panel.offsetWidth; // Paksa DOM Reflow
                panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                btnPulihkanChat.classList.add('hidden');
                
                const dotNotif = document.getElementById('chat-notif-dot-global');
                if (dotNotif) dotNotif.classList.add('hidden-state');
            } else if (window.ChatHandshake && typeof window.ChatHandshake.pulihkanSesiAktif === 'function') {
                // JIKA BROWSER DI-REFRESH SEHINGGA DOM HILANG (Metode Recovery)
                window.ChatHandshake.pulihkanSesiAktif();
                btnPulihkanChat.classList.add('hidden');
                
                const dotNotif = document.getElementById('chat-notif-dot-global');
                if (dotNotif) dotNotif.classList.add('hidden-state');
            }
        });
    }

    // ==========================================
    // 1. MESIN TEMA (Otomatis & Manual Cerdas)
    // ==========================================
    const btnThemeToggle = document.getElementById('btnThemeToggleSettings');
    let manualTheme = null; 

    function applyThemeIcon() {
        if (!btnThemeToggle) return;
        // PURE DOM: Mencari tag <i> di dalam tombol dan memanipulasi class-nya, BUKAN innerHTML
        let iconEl = btnThemeToggle.querySelector('i');
        if (!iconEl) {
            iconEl = document.createElement('i');
            btnThemeToggle.appendChild(iconEl);
        }
        
        const isLight = document.body.classList.contains('light-mode');
        
        // Reset kelas ikon
        iconEl.className = ''; 
        
        if (isLight) {
            iconEl.classList.add('fa-solid', 'fa-sun');
            iconEl.style.color = '#f59e0b';
            iconEl.style.textShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
        } else {
            iconEl.classList.add('fa-solid', 'fa-moon');
            iconEl.style.color = '#60a5fa';
            iconEl.style.textShadow = '0 0 10px rgba(96, 165, 250, 0.5)';
        }
    }

    function updateTheme() {
        if (manualTheme !== null) {
            if (manualTheme === 'light') document.body.classList.add('light-mode');
            else document.body.classList.remove('light-mode');
        } else {
            const hour = new Date().getHours();
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (hour >= 18 || hour < 6 || prefersDark) document.body.classList.remove('light-mode');
            else document.body.classList.add('light-mode');
        }
        applyThemeIcon();
    }
    
    updateTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { 
        if(manualTheme === null) updateTheme(); 
    });

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const isCurrentlyLight = document.body.classList.contains('light-mode');
            manualTheme = isCurrentlyLight ? 'dark' : 'light';
            updateTheme();
        });
    }

    // ==========================================
    // 2. SISTEM NAVIGASI SPA
    // ==========================================
    window.spaNavigateTo = function(viewId) {
        const views = document.querySelectorAll('.spa-view');
        views.forEach(view => {
            if (view.id === viewId) {
                view.classList.remove('hidden-view');
                view.classList.add('active-view');
            } else if (viewId === 'view-search-route' && view.id === 'view-map') {
                // Pengecualian UX: Peta tetap hidup di belakang laci pencarian (Bottom Sheet)
                view.classList.remove('hidden-view');
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
                view.classList.add('hidden-view');
            }
        });

        const orderPanel = document.getElementById('dynamicOrderPanel');
        if (orderPanel) {
            orderPanel.style.display = (viewId === 'view-search-route') ? 'none' : 'block';
        }
    };

    // ==========================================
    // 3. LOGIKA NAVIGASI BAWAH & PANEL OVERLAY
    // ==========================================
    const navHome = document.getElementById('navHome');
    const navMitraMap = document.getElementById('navMitraMap');
    const navAbout = document.getElementById('navAbout');
    const navSettings = document.getElementById('navSettings');
    
    const aboutOverlay = document.getElementById('about-overlay');
    const settingsOverlay = document.getElementById('settings-overlay');
    
    function resetNavs() {
        if(navHome) navHome.classList.remove('active');
        if(navMitraMap) navMitraMap.classList.remove('active');
        if(navAbout) navAbout.classList.remove('active');
        if(navSettings) navSettings.classList.remove('active');
    }

    if (navHome) {
        navHome.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navHome.classList.add('active');
            window.spaNavigateTo('view-dashboard');
            
            // Periksa apakah sedang ada chat aktif
            const adaSesiChat = localStorage.getItem('bgt_active_chat');
            
            // Cegah SystemReset membunuh sesi jika chat sedang berjalan
            if (!adaSesiChat && window.SystemReset) {
                window.SystemReset(); 
            }
            
            if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        });
    }

    if (navMitraMap) {
        navMitraMap.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navMitraMap.classList.add('active');
            window.spaNavigateTo('view-mitra-map');
            window.dispatchEvent(new Event('initMitraMapEvent'));
        });
    }

    if (navAbout) {
        navAbout.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navAbout.classList.add('active');
            window.spaNavigateTo('view-about');
        });
    }

    if (navSettings) {
        navSettings.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navSettings.classList.add('active');
            if(settingsOverlay) settingsOverlay.classList.remove('hidden');
        });
    }

    // Navigasi Kembali dari Layar Tentang
    document.getElementById('btnBackFromAbout')?.addEventListener('click', () => {
        resetNavs();
        if(navHome) navHome.classList.add('active');
        window.spaNavigateTo('view-dashboard');
    });

    document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
        if(settingsOverlay) settingsOverlay.classList.add('hidden');
        resetNavs();
        if(navHome) navHome.classList.add('active');
    });

    // ==========================================
    // 4. KENDALI MUNDUR DARI RADAR PENGEMUDI
    // ==========================================
    const btnBackFromDrivers = document.getElementById('btnBackFromDrivers');
    if (btnBackFromDrivers) {
        btnBackFromDrivers.addEventListener('click', () => {
            window.spaNavigateTo('view-map');
            const orderPanel = document.getElementById('dynamicOrderPanel');
            if (orderPanel) orderPanel.style.display = 'block';
        });
    }

    // ==========================================
    // 5. GERBANG GEOSPASIAL (GEO-GATEKEEPER)
    // ==========================================
    function initGeoGatekeeper() {
        try {
            // TARIK MURNI DARI RAM OTA (ZERO FETCH)
            const zoneData = window.BGN_CONFIG?.zones || {};

            // Fungsi Kunci (Soft-Lock) jika di luar zona atau GPS ditolak
            const applySoftLock = () => {
                const cards = document.querySelectorAll('.service-card');
                cards.forEach(card => {
                    card.style.filter = 'grayscale(100%)';
                    card.style.opacity = '0.4';
                    card.style.pointerEvents = 'none';
                });
                
                const grid = document.getElementById('serviceGrid');
                if (grid && !document.getElementById('btnRecruitmentLock')) {
                    const infoBtn = document.createElement('button');
                    infoBtn.id = 'btnRecruitmentLock';
                    infoBtn.className = 'btn-primary w-full mt-4';
                    infoBtn.style.gridColumn = '1 / -1'; 
                    infoBtn.style.background = 'rgba(212, 175, 55, 0.15)';
                    infoBtn.style.borderColor = 'var(--neon-gold)';
                    infoBtn.style.color = 'var(--neon-gold)';
                    infoBtn.style.padding = '12px';
                    
                    const lockedMsg = zoneData.default_locked_message || {};
                    const title = lockedMsg.title || "ZONA BELUM TERSEDIA";
                    const body = lockedMsg.body || "Jadilah Pelopor Kami!";
                    const wa = lockedMsg.wa_rekrutmen || "";
                    
                    infoBtn.innerHTML = `<i class="fa-brands fa-whatsapp" style="font-size:1.3rem;"></i> <span style="font-size:0.75rem;">${title}<br>${body}</span>`;
                    
                    infoBtn.addEventListener('click', () => {
                        const msg = encodeURIComponent(body);
                        window.open(`https://wa.me/${wa}?text=${msg}`, '_blank');
                    });
                    
                    grid.appendChild(infoBtn);
                }
            };

            // Rumus Haversine mandiri (Edge Computing)
            const getHaversine = (lat1, lon1, lat2, lon2) => {
                const R = 6371; 
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
                return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
            };

            // Tarik Lokasi GPS & Cocokkan Zona
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const userLat = pos.coords.latitude;
                    const userLng = pos.coords.longitude;
                    let isInsideZone = false;

                    // FIX TAHAP 1: Simpan Koordinat Awal untuk Fallback ServiceRouter
                    if (!window.BAGANTARA_ACTIVE_COORD) {
                        window.BAGANTARA_ACTIVE_COORD = { lat: userLat, lng: userLng };
                    }

                    if (zoneData.active_zones && Array.isArray(zoneData.active_zones)) {
                        for (const zone of zoneData.active_zones) {
                            if (zone.is_open) {
                                const dist = getHaversine(userLat, userLng, zone.center.lat, zone.center.lng);
                                if (dist <= zone.radius_km) {
                                    isInsideZone = true;
                                    window.BAGANTARA_ACTIVE_ZONE_ID = zone.zone_id; 
                                    break;
                                }
                            }
                        }
                    }

                    // Kunci jika tidak masuk radius manapun
                    if (!isInsideZone) applySoftLock();
                }, () => {
                    // Fallback: GPS Ditolak Pengguna atau Timeout
                    console.warn("[Gerbang Geospasial] Waktu pemindaian GPS habis atau akses ditolak.");
                    applySoftLock(); 
                }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); // Toleransi ditingkatkan ke 15 detik
            } else {
                applySoftLock();
            }
        } catch (err) {
            console.warn("[Gerbang Geospasial] Gagal memuat data zona. Melewati gerbang.");
        }
    }

    // ==========================================
    // SAKELAR FITUR LAYANAN (FEATURE FLAGS)
    // ==========================================
    function initServiceFlags() {
        try {
            // TARIK MURNI DARI RAM OTA (ZERO FETCH)
            const data = window.BGN_CONFIG?.layanan || {};
            const services = data.services || {};
            const txtPerbaikan = window.BGN_CONFIG?.wording?.alerts?.maintenance_badge || "PERBAIKAN";

            document.querySelectorAll('.service-card').forEach(card => {
                const srv = card.getAttribute('data-service');
                
                // Jika di JSON bernilai false
                if (services[srv] === false) {
                    // Kunci UI
                    card.style.filter = 'grayscale(100%)';
                    card.style.opacity = '0.4';
                    card.style.pointerEvents = 'none';
                    
                    // Matikan ikon emas
                    const icon = card.querySelector('i');
                    if (icon) {
                        icon.classList.remove('text-gold');
                        icon.classList.add('text-muted');
                    }

                    // Tambahkan badge perbaikan
                    if (!card.querySelector('.maintenance-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'maintenance-badge';
                        badge.style.cssText = 'font-size: 0.55rem; color: #ef4444; margin-top: 5px; font-weight: bold; border: 1px solid #ef4444; padding: 2px 6px; border-radius: 10px; text-align: center; display: block;';
                        badge.innerText = txtPerbaikan;
                        card.appendChild(badge);
                    }
                }
            });
        } catch (err) {
            console.warn("[Feature Flag] Gagal memuat status layanan, mode default digunakan.");
        }
    }
    
    // ==========================================
    // MITIGASI BACKGROUND GEOLOCATION (WAKE LOCK API)
    // ==========================================
    let wakeLockInstance = null;
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try { wakeLockInstance = await navigator.wakeLock.request('screen'); } catch (err) {}
        }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', async () => {
        if (wakeLockInstance !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    // SARAF PENUNGGU: Mengeksekusi Gatekeeper hanya SETELAH ConfigManager selesai mengunduh data
    if (window.ConfigManager && window.ConfigManager.isLoaded) {
        initGeoGatekeeper();
        initServiceFlags();
        window.dispatchEvent(new Event('app_ready'));
    } else {
        window.addEventListener('bgn_config_loaded', () => {
            initGeoGatekeeper();
            initServiceFlags();
            window.dispatchEvent(new Event('app_ready'));
        });
    }
});
