// ==========================================
// MESIN UTAMA: NAVIGASI SPA & ORKESTRATOR TEMA (V8 DRIVER-FIRST CYBER-LUXURY)
// ARSITEKTUR: SINGLE-ENTRY DRIVER CATALOG HOME & 3-TAB SYMMETRIC NAV (ZERO FALLBACK)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
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
                if (window.ChatHandshake && typeof window.ChatHandshake.aktifkanKoneksiChat === 'function') {
                    window.ChatHandshake.aktifkanKoneksiChat();
                }
                panel.style.display = 'flex';
                panel.style.animation = 'none';
                void panel.offsetWidth;
                panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                btnPulihkanChat.classList.add('hidden');
                
                const dotNotif = document.getElementById('chat-notif-dot-global');
                if (dotNotif) dotNotif.classList.add('hidden-state');
            } else if (window.ChatHandshake && typeof window.ChatHandshake.pulihkanSesiAktif === 'function') {
                window.ChatHandshake.pulihkanSesiAktif();
                btnPulihkanChat.classList.add('hidden');
                
                const dotNotif = document.getElementById('chat-notif-dot-global');
                if (dotNotif) dotNotif.classList.add('hidden-state');
            }
        });
    }

    // 1. MESIN TEMA
    const btnThemeToggle = document.getElementById('btnThemeToggleSettings');
    let manualTheme = null; 

    function applyThemeIcon() {
        if (!btnThemeToggle) return;
        let iconEl = btnThemeToggle.querySelector('i');
        if (!iconEl) {
            iconEl = document.createElement('i');
            btnThemeToggle.appendChild(iconEl);
        }
        
        const isLight = document.body.classList.contains('light-mode');
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
            const sysCtrl = window.BGN_CONFIG?.rules_app?.system_controls;
            const startHour = sysCtrl ? sysCtrl.night_mode_start_hour : new Date().getHours();
            const endHour = sysCtrl ? sysCtrl.night_mode_end_hour : new Date().getHours();
            const hour = new Date().getHours();
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (hour >= startHour || hour < endHour || prefersDark) document.body.classList.remove('light-mode');
            else document.body.classList.add('light-mode');
        }
        applyThemeIcon();
    }
    
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { 
        if (manualTheme === null) updateTheme(); 
    });

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const isCurrentlyLight = document.body.classList.contains('light-mode');
            manualTheme = isCurrentlyLight ? 'dark' : 'light';
            updateTheme();
        });
    }

    // 2. SISTEM NAVIGASI SPA (BERANDA = KATALOG MITRA)
    window.spaNavigateTo = function(viewId) {
        const resolvedId = (viewId === 'view-dashboard') ? 'view-mitra-map' : viewId;
        const views = document.querySelectorAll('.spa-view');
        views.forEach(view => {
            if (view.id === resolvedId) {
                view.classList.remove('hidden-view');
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
                view.classList.add('hidden-view');
            }
        });

        const orderPanel = document.getElementById('dynamicOrderPanel');
        if (orderPanel) {
            orderPanel.style.display = (resolvedId === 'view-map') ? 'block' : 'none';
        }
    };

    // 3. LOGIKA NAVIGASI BAWAH 3-TAB SIMETRIS
    const navHome = document.getElementById('navHome');
    const navAbout = document.getElementById('navAbout');
    const navSettings = document.getElementById('navSettings');
    const settingsOverlay = document.getElementById('settings-overlay');
    
    function resetNavs() {
        if (navHome) navHome.classList.remove('active');
        if (navAbout) navAbout.classList.remove('active');
        if (navSettings) navSettings.classList.remove('active');
    }

    if (navHome) {
        navHome.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navHome.classList.add('active');
            window.spaNavigateTo('view-mitra-map');
            
            const adaSesiChat = localStorage.getItem('bgt_active_chat');
            if (!adaSesiChat && window.SystemReset) {
                window.SystemReset(); 
            } else if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                window.UIManager.initMitraCatalog();
            }
            
            if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
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
            if (settingsOverlay) settingsOverlay.classList.remove('hidden');
        });
    }

    document.getElementById('btnBackFromAbout')?.addEventListener('click', () => {
        resetNavs();
        if (navHome) navHome.classList.add('active');
        window.spaNavigateTo('view-mitra-map');
    });

    document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        resetNavs();
        if (navHome) navHome.classList.add('active');
    });

    // 4. GERBANG GEOSPASIAL & SAKELAR LAYANAN PADA KATALOG BERANDA
    function initServiceFlagsOnCatalog() {
        try {
            const services = window.BGN_CONFIG.layanan.services;
            const defaultFilter = window.BGN_CONFIG.rules_app.radar_mitra.default_filter;
            document.querySelectorAll('#radarFilterContainer .radar-chip').forEach(chip => {
                const flt = chip.getAttribute('data-filter');
                if (flt && flt !== defaultFilter && services[flt] === false) {
                    chip.style.display = 'none';
                }
            });
        } catch (err) {}
    }

    function initGeoGatekeeper() {
        try {
            const zoneData = window.BGN_CONFIG.zones;
            const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;
            const earthR = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
            window.BAGANTARA_ZONE_LOCKED = false;

            const getHaversine = (lat1, lon1, lat2, lon2) => {
                if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                    return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                }
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                return earthR * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
            };

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const userLat = pos.coords.latitude;
                    const userLng = pos.coords.longitude;
                    let isInsideZone = false;

                    window.BAGANTARA_ACTIVE_COORD = { lat: userLat, lng: userLng };

                    if (zoneData && Array.isArray(zoneData.active_zones)) {
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

                    window.BAGANTARA_ZONE_LOCKED = !isInsideZone;
                    if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                        window.UIManager.initMitraCatalog();
                    }
                }, () => {
                    if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                        window.UIManager.initMitraCatalog();
                    }
                }, {
                    enableHighAccuracy: false,
                    timeout: mapRouting.gps_gatekeeper_timeout_ms,
                    maximumAge: mapRouting.gps_max_age_ms
                });
            } else {
                if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                    window.UIManager.initMitraCatalog();
                }
            }
        } catch (err) {
            if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                window.UIManager.initMitraCatalog();
            }
        }
    }
    
    // 5. MITIGASI BACKGROUND GEOLOCATION (WAKE LOCK API)
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

    const bootApplication = () => {
        updateTheme();
        initServiceFlagsOnCatalog();
        initGeoGatekeeper();
        window.dispatchEvent(new Event('app_ready'));
    };

    if (window.ConfigManager && window.ConfigManager.isLoaded) {
        bootApplication();
    } else {
        window.addEventListener('bgn_config_loaded', bootApplication, { once: true });
    }
});