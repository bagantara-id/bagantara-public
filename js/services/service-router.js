// ==========================================
// PENGATUR LALU LINTAS & SARAF INTI GLOBAL (SERVICE ROUTER V8.0)
// ARSITEKTUR: MODULAR ISOLATED ROUTING & ZERO CACHE TARIFF
// ==========================================

window.ServiceRouter = {
    route: function(service) {
        console.log("[ServiceRouter] Menerima instruksi layanan:", service);
        window.BAGANTARA_SERVICE = service;
        
        // MANIPULASI VISUAL DASAR
        const mainHeader = document.getElementById('mainHeader');
        if (mainHeader) mainHeader.classList.add('hidden');

        const labelLayanan = document.getElementById('labelLayananPeta');
        if (labelLayanan) labelLayanan.innerText = service;

        // VALIDASI OTORITAS LAYANAN (MURNI JSON)
        const layananConfig = window.BGN_CONFIG?.layanan?.services;
        if (!layananConfig || layananConfig[service] === false) {
            const txtAlert = window.BGN_CONFIG?.wording?.alerts?.service_disabled || "Layanan ini sedang tidak aktif.";
            if (window.UIManager && window.UIManager.alertConfig) {
                window.UIManager.alertConfig('dynamic', txtAlert);
            } else {
                alert(txtAlert);
            }
            return;
        }

        // FIX TAHAP 1: KUNCI GERBANG GEOSPASIAL DENGAN FALLBACK LOKAL
        // Mencegah eksploitasi bypass UI, tetapi toleran jika GPS baru saja terkunci
        if (!window.BAGANTARA_ACTIVE_ZONE_ID) {
            let fallbackZoneId = null;
            const zoneData = window.BGN_CONFIG?.zones;
            
            // Pencocokan Haversine Sesaat
            if (window.BAGANTARA_ACTIVE_COORD && zoneData && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    const R = 6371; 
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
                    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                };

                for (const z of zoneData.active_zones) {
                    if (z.is_open && z.center && z.center.lat && z.center.lng) {
                        const dist = getHaversine(window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng, z.center.lat, z.center.lng);
                        if (dist <= z.radius_km) {
                            fallbackZoneId = z.zone_id;
                            window.BAGANTARA_ACTIVE_ZONE_ID = fallbackZoneId;
                            break;
                        }
                    }
                }
            }

            // Jika tetap tidak ditemukan, kunci dengan aman
            if (!fallbackZoneId) {
                const zMsg = window.BGN_CONFIG?.zones?.default_locked_message;
                const txtAlertZone = zMsg ? `${zMsg.title}\n\n${zMsg.body}` : "Zona layanan belum tersedia atau GPS masih memindai. Silakan coba lagi sebentar.";
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('dynamic', txtAlertZone.replace(/\n/g, '<br>'));
                } else {
                    alert(txtAlertZone);
                }
                return;
            }
        }

        // DISTRIBUSI JALUR MODULAR (ISOLASI PER FITUR LAYANAN)
        if (service === 'RIDE' || service === 'CAR' || service === 'EXPRESS') {
            if (window.FlowEngine) window.FlowEngine.init();
            else console.error("FlowEngine tidak ditemukan!");
        } else if (service === 'JASTIP') {
            if (window.FlowJastip) window.FlowJastip.init();
            else console.error("FlowJastip tidak ditemukan!");
        } else {
            const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
            alert(wAlerts.service_empty || "Layanan belum tersedia.");
        }
    }
};

// ==========================================
// UTILITAS MURNI SPA & MANAJEMEN STATE
// ==========================================

window.bindSafeButton = function(btnId, callback) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', callback);
};

window.SystemReset = function() {
    if (localStorage.getItem('bgt_active_chat')) return;

    console.log("[System] Mereset SPA ke state awal...");
    
    const mainHeader = document.getElementById('mainHeader');
    const bottomNav = document.getElementById('mainBottomNav');
    
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden');

    if (window.spaNavigateTo) window.spaNavigateTo('view-dashboard');

    if (localStorage.getItem('bgt_active_chat')) return;

    // Bersihkan Memori
    window.BAGANTARA_SERVICE = null;
    window.BAGANTARA_ACTIVE_COORD = null;
    window.BAGANTARA_PICKUP_COORD = null;
    window.BAGANTARA_DROPOFF_COORD = null;
    window.BAGANTARA_MULTI_DROPOFFS = [];
    window.BAGANTARA_PICKUP_DETAIL = null;
    window.BAGANTARA_DROPOFF_DETAIL = null; 
    window.BAGANTARA_JASTIP_STORE = null; // Penambahan pembersihan memori toko Jastip
    window.BAGANTARA_JASTIP_ITEMS = [];
    window.BAGANTARA_JASTIP_VALUE = 0;
    window.BAGANTARA_FINAL_PRICE = 0; 
    window.TEMPORARY_GEOCODE = null;

    // Bersihkan DOM UI
    const container = document.getElementById('jastipItemsContainer');
    if(container) container.innerHTML = '';
    
    document.querySelectorAll('input:not(.chat-input)').forEach(input => {
        if(input.type === 'text' || input.type === 'number' || input.type === 'tel') input.value = '';
        input.removeAttribute('readonly');
        input.style.color = '';
        input.style.fontWeight = '';
    });

    const sv = document.getElementById('view-search-route');
    if (sv) { sv.classList.remove('expanded-mode'); sv.classList.add('compact-mode'); }
    
    const stickyContinue = document.getElementById('stickyContinueArea');
    if (stickyContinue) stickyContinue.classList.add('hidden');
};

// ==========================================
// SARAF GLOBAL LISTENER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const serviceCards = document.querySelectorAll('.service-card');
    serviceCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const service = e.currentTarget.getAttribute('data-service');
            window.ServiceRouter.route(service);
        });
    });

    window.addEventListener('mapStopped', () => {
        const liveAddressTitle = document.getElementById('liveAddressTitle');
        if (liveAddressTitle) liveAddressTitle.innerText = window.TEMPORARY_GEOCODE || "Memindai Sinyal GPS...";
    });

    // Mengamankan State Paksaan ke Layanan Spesifik (Dynamic Binding)
    window.addEventListener('forceWizardState', (e) => {
        const state = e.detail;
        const srv = window.BAGANTARA_SERVICE;
        
        if ((srv === 'RIDE' || srv === 'CAR' || srv === 'EXPRESS') && window.FlowEngine) {
            window.FlowEngine.setManualState(state);
        } else if (srv === 'JASTIP' && window.FlowJastip) {
            if (typeof window.FlowJastip.setManualState === 'function') window.FlowJastip.setManualState(state);
        }
    });

    // ==========================================
    // KALKULATOR TARIF DINAMIS (OTA RAM - ZERO FETCH)
    // ARSITEKTUR UPDATE: GLOBAL TARIFF (TANPA JAM SIBUK LOKAL)
    // ==========================================
    window.addEventListener('priceCalculated', async (e) => {
        const distance = parseFloat(e.detail.distance) || 0;
        const alertRoute = window.BGN_CONFIG?.wording?.alerts?.route_invalid || "Gagal menghitung rute. Titik tidak valid.";
        
        if (distance <= 0) {
            if (window.SystemReset) window.SystemReset();
            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('route_invalid', alertRoute);
            else alert(alertRoute);
            return;
        }
        
        window.BAGANTARA_DISTANCE_KM = distance; 
        const service = window.BAGANTARA_SERVICE || 'RIDE';
        
        try {
            const tariffData = window.BGN_CONFIG?.tariffs;
            const zoneData = window.BGN_CONFIG?.zones;
            
            if (!tariffData || !tariffData.zones) throw new Error("TARIF_KOSONG");
            if (!zoneData) throw new Error("ZONA_KOSONG");

            let activeZone = window.BAGANTARA_ACTIVE_ZONE_ID; 

            if (window.BAGANTARA_PICKUP_COORD && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    const R = 6371; 
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
                    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                };

                const [pLat, pLng] = window.BAGANTARA_PICKUP_COORD.split(',').map(Number);
                let foundZone = null;

                for (const z of zoneData.active_zones) {
                    if (z.is_open && z.center && z.center.lat && z.center.lng) {
                        const dist = getHaversine(pLat, pLng, z.center.lat, z.center.lng);
                        if (dist <= z.radius_km) {
                            foundZone = z.zone_id;
                            break;
                        }
                    }
                }
                
                if (foundZone) {
                    activeZone = foundZone;
                    window.BAGANTARA_ACTIVE_ZONE_ID = foundZone; 
                }
            }

            if (!activeZone) throw new Error("LOKASI_LUAR_ZONA");

            const zoneTariffs = tariffData.zones || {};
            const currentZoneRules = zoneTariffs[activeZone];
            
            if (!currentZoneRules) throw new Error("TARIF_KOSONG");
            
            const rules = currentZoneRules[service];
            if (!rules) throw new Error("LAYANAN_KOSONG");

            let finalPriceRaw = 0;
            const minDist = rules.min_distance_km;
            
            // Kalkulasi Jarak Murni
            if (distance <= minDist) {
                finalPriceRaw = rules.base_price;
            } else {
                finalPriceRaw = rules.base_price + ((distance - minDist) * rules.price_per_km);
            }

            // Tambahan Titik Antar (Multi-stop JASTIP)
            if (service === 'JASTIP' && window.BAGANTARA_MULTI_DROPOFFS) {
                const totalTitik = window.BAGANTARA_MULTI_DROPOFFS.filter(m => m !== null && m !== undefined).length;
                if (totalTitik > 1) {
                    finalPriceRaw += ((totalTitik - 1) * rules.multi_stop_fee);
                }
            }

            // Pembulatan ke ratusan terdekat
            window.BAGANTARA_FINAL_PRICE = Math.ceil(finalPriceRaw / 100) * 100; 
            
            const formatHarga = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(window.BAGANTARA_FINAL_PRICE);
            
            const priceValueEl = document.getElementById('priceValue');
            if (priceValueEl) {
                priceValueEl.innerHTML = `${formatHarga} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">(${distance.toFixed(1)} KM)</span>`;
            }

        } catch (err) {
            console.error("[Tariff Engine Error]", err);
            
            // FIX TAHAP 1: window.SystemReset() dihapus.
            // Membiarkan pengguna tetap di layar peta untuk memperbaiki pin koordinat mereka.
            
            const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
            let pesanError = wAlerts.calc_failed || "Gagal memproses data.";
            
            if (err.message === "LOKASI_LUAR_ZONA") pesanError = wAlerts.out_of_zone || "Titik penjemputan berada di luar zona operasional yang aktif.";
            else if (err.message === "TARIF_KOSONG") pesanError = wAlerts.tariff_empty || `Struktur tarif wilayah belum dikonfigurasi.`;
            else if (err.message === "LAYANAN_KOSONG") pesanError = wAlerts.service_empty || `Layanan '${service}' tidak tersedia di wilayah ini.`;

            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', pesanError);
            else alert(pesanError); 
        }
    });

});

window.resetWizard = function() { window.SystemReset(); };