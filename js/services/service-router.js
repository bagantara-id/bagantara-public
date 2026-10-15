// ==========================================
// PENGATUR LALU LINTAS & SARAF INTI GLOBAL (SERVICE ROUTER V6 - DRIVER-FIRST)
// ARSITEKTUR: MODULAR ISOLATED ROUTING & CLEAN CATALOG HOME RESET
// ==========================================

window.ServiceRouter = {
    route: function(service) {
        console.log("[ServiceRouter] Menerima instruksi layanan:", service);
        window.BAGANTARA_SERVICE = service;
        
        const labelLayanan = document.getElementById('labelLayananPeta');
        if (labelLayanan) labelLayanan.innerText = service;

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

        if (!window.BAGANTARA_ACTIVE_ZONE_ID) {
            let fallbackZoneId = null;
            const zoneData = window.BGN_CONFIG?.zones;
            
            if (window.BAGANTARA_ACTIVE_COORD && zoneData && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
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

        if (window.UIManager && typeof window.UIManager.updatePrelockedBannerUI === 'function') {
            window.UIManager.updatePrelockedBannerUI(service);
        }

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

window.bindSafeButton = function(btnId, callback) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', callback);
};

window.SystemReset = function() {
    if (localStorage.getItem('bgt_active_chat')) return;
    console.log("[System] Mereset SPA kembali ke Beranda Katalog Driver...");
    
    const bottomNav = document.getElementById('mainBottomNav');
    if (bottomNav) bottomNav.classList.remove('hidden');

    const navHome = document.getElementById('navHome');
    const navAbout = document.getElementById('navAbout');
    const navSettings = document.getElementById('navSettings');
    if (navHome) navHome.classList.add('active');
    if (navAbout) navAbout.classList.remove('active');
    if (navSettings) navSettings.classList.remove('active');

    if (window.spaNavigateTo) window.spaNavigateTo('view-mitra-map');

    window.BAGANTARA_SERVICE = null;
    window.BAGANTARA_PICKUP_COORD = null;
    window.BAGANTARA_DROPOFF_COORD = null;
    window.BAGANTARA_MULTI_DROPOFFS = [];
    window.BAGANTARA_PICKUP_DETAIL = null;
    window.BAGANTARA_DROPOFF_DETAIL = null; 
    window.BAGANTARA_JASTIP_STORE = null;
    window.BAGANTARA_JASTIP_ITEMS = [];
    window.BAGANTARA_JASTIP_VALUE = 0;
    window.BAGANTARA_FINAL_PRICE = 0;
    window.BAGANTARA_DISTANCE_KM = 0;
    window.BAGANTARA_PRELOCKED_DRIVER = null;
    window.BAGANTARA_MAP_TARGET_INDEX = 1;
    window.TEMPORARY_GEOCODE = null;
    window.LOCKED_SEARCH_COORD = null;
    window.LOCKED_SEARCH_TEXT = null;

    if (window.UIManager && typeof window.UIManager.updatePrelockedBannerUI === 'function') {
        window.UIManager.updatePrelockedBannerUI(null);
    }

    const row2 = document.getElementById('rowDropoff2');
    const row3 = document.getElementById('rowDropoff3');
    if (row2) row2.remove();
    if (row3) row3.remove();
    if (window.UIManager) window.UIManager.stopCount = 1;

    const btnAddStop = document.getElementById('btnAddStop');
    if (btnAddStop) btnAddStop.style.display = 'block';

    const container = document.getElementById('jastipItemsContainer');
    if (container) container.innerHTML = '';
    
    document.querySelectorAll('input:not(.chat-input)').forEach(input => {
        if (input.type === 'text' || input.type === 'number' || input.type === 'tel') input.value = '';
        input.removeAttribute('readonly');
        input.style.color = '';
        input.style.fontWeight = '';
    });

    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.style.display = 'none';
    });

    const stickyContinue = document.getElementById('stickyContinueArea');
    if (stickyContinue) stickyContinue.classList.add('hidden');

    const stickyJastip = document.getElementById('stickyJastipCheckout');
    if (stickyJastip) stickyJastip.style.display = 'none';

    document.getElementById('searchRouteResults')?.classList.add('hidden');
    document.getElementById('jastipStoreResults')?.classList.add('hidden');
    document.getElementById('jastipDropoffResults')?.classList.add('hidden');
    document.getElementById('tariff-match-overlay')?.classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('mapStopped', () => {
        const liveAddressTitle = document.getElementById('liveAddressTitle');
        if (liveAddressTitle) liveAddressTitle.innerText = window.TEMPORARY_GEOCODE || "Mencari Lokasi GPS...";
    });

    window.addEventListener('forceWizardState', (e) => {
        const state = e.detail;
        const srv = window.BAGANTARA_SERVICE;
        
        if ((srv === 'RIDE' || srv === 'CAR' || srv === 'EXPRESS') && window.FlowEngine) {
            window.FlowEngine.setManualState(state);
        } else if (srv === 'JASTIP' && window.FlowJastip) {
            if (typeof window.FlowJastip.setManualState === 'function') window.FlowJastip.setManualState(state);
        }
    });

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
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
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
                } else {
                    activeZone = null;
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
            
            if (distance <= minDist) {
                finalPriceRaw = rules.base_price;
            } else {
                finalPriceRaw = rules.base_price + ((distance - minDist) * rules.price_per_km);
            }

            if (window.BAGANTARA_MULTI_DROPOFFS) {
                const totalTitik = window.BAGANTARA_MULTI_DROPOFFS.filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))).length;
                if (totalTitik > 1 && rules.multi_stop_fee) {
                    finalPriceRaw += ((totalTitik - 1) * rules.multi_stop_fee);
                }
            }

            window.BAGANTARA_FINAL_PRICE = Math.ceil(finalPriceRaw / 100) * 100; 
            
            if (service === 'JASTIP' && window.FlowJastip && typeof window.FlowJastip.overrideJastipPriceDisplay === 'function') {
                window.FlowJastip.overrideJastipPriceDisplay();
            } else {
                const formatHarga = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(window.BAGANTARA_FINAL_PRICE);
                const priceValueEl = document.getElementById('priceValue');
                if (priceValueEl) {
                    priceValueEl.innerHTML = `${formatHarga} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">(${distance.toFixed(1)} KM)</span>`;
                }
            }
        } catch (err) {
            console.error("[Tariff Engine Error]", err);
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