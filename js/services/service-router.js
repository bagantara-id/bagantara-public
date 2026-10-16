// ==========================================
// PENGATUR LALU LINTAS & SARAF INTI GLOBAL (SERVICE ROUTER V8 - DRIVER-FIRST & PEAK HOURS)
// ARSITEKTUR: MODULAR ISOLATED ROUTING, PEAK HOURS SURGE ENGINE, & ZERO FALLBACK
// ==========================================

window.ServiceRouter = {
    route: function(service) {
        console.log("[ServiceRouter] Menerima instruksi layanan:", service);
        window.BAGANTARA_SERVICE = service;
        
        const labelLayanan = document.getElementById('labelLayananPeta');
        if (labelLayanan) labelLayanan.innerText = service;

        const layananConfig = window.BGN_CONFIG.layanan.services;
        if (!layananConfig || layananConfig[service] === false) {
            const txtAlert = window.BGN_CONFIG.wording.alerts.service_disabled;
            if (window.UIManager && window.UIManager.alertConfig) {
                window.UIManager.alertConfig('service_disabled', txtAlert);
            } else {
                alert(txtAlert);
            }
            return;
        }

        if (!window.BAGANTARA_ACTIVE_ZONE_ID) {
            let fallbackZoneId = null;
            const zoneData = window.BGN_CONFIG.zones;
            const earthR = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
            const refCoord = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD : window.BAGANTARA_ACTIVE_COORD;
            
            if (refCoord && zoneData && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    return earthR * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                };

                for (const z of zoneData.active_zones) {
                    if (z.is_open && z.center && z.center.lat && z.center.lng) {
                        const dist = getHaversine(refCoord.lat, refCoord.lng, z.center.lat, z.center.lng);
                        if (dist <= z.radius_km) {
                            fallbackZoneId = z.zone_id;
                            window.BAGANTARA_ACTIVE_ZONE_ID = fallbackZoneId;
                            break;
                        }
                    }
                }
            }

            if (!fallbackZoneId) {
                const zMsg = window.BGN_CONFIG.zones.default_locked_message;
                const txtAlertZone = `${zMsg.title}\n\n${zMsg.body}`;
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
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            alert(wAlerts.service_empty);
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
    if (localStorage.getItem('bgt_active_chat') || (window.ChatHandshake && typeof window.ChatHandshake.isSesiAktif === 'function' && window.ChatHandshake.isSesiAktif())) return;
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
    window.BAGANTARA_ACTIVE_PEAK_RULE = null;
    window.BAGANTARA_PRELOCKED_DRIVER = null;
    window.BAGANTARA_MAP_TARGET_INDEX = 1;
    window.TEMPORARY_GEOCODE = null;
    window.LOCKED_SEARCH_COORD = null;
    window.LOCKED_SEARCH_TEXT = null;
    window.LOCKED_SEARCH_TARGET = null;

    if (window.FlowEngine) window.FlowEngine._initialPickupAutoLocked = false;
    if (window.FlowJastip) window.FlowJastip._initialDropoffAutoLocked = false;

    if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
        window.BAGANTARA_ACTIVE_COORD = {
            lat: parseFloat(window.BAGANTARA_USER_GPS_COORD.lat),
            lng: parseFloat(window.BAGANTARA_USER_GPS_COORD.lng)
        };
    }

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
        const searchingGps = window.BGN_CONFIG.wording.map_pins.searching_gps;
        if (liveAddressTitle) liveAddressTitle.innerText = window.TEMPORARY_GEOCODE ? window.TEMPORARY_GEOCODE : searchingGps;
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
        const distance = parseFloat(e.detail.distance);
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        const alertRoute = wAlerts.route_invalid;
        
        if (isNaN(distance) || distance <= 0) {
            if (window.SystemReset) window.SystemReset();
            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('route_invalid', alertRoute);
            else alert(alertRoute);
            return;
        }
        
        window.BAGANTARA_DISTANCE_KM = distance; 
        const service = window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : wPopup.default_service;
        
        try {
            const tariffData = window.BGN_CONFIG.tariffs;
            const zoneData = window.BGN_CONFIG.zones;
            const peakData = window.BGN_CONFIG.peak_hours;
            const sysCtrl = window.BGN_CONFIG.rules_app.system_controls;
            
            if (!tariffData || !tariffData.zones) throw new Error("TARIF_KOSONG");
            if (!zoneData) throw new Error("ZONA_KOSONG");

            let activeZone = window.BAGANTARA_ACTIVE_ZONE_ID; 

            if (window.BAGANTARA_PICKUP_COORD && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
                    const R = sysCtrl.earth_radius_km; 
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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

            const zoneTariffs = tariffData.zones;
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

            // INTEGRASI KALKULASI JAM SIBUK (PEAK HOURS) DARI data/peak-hours.json
            window.BAGANTARA_ACTIVE_PEAK_RULE = null;
            if (peakData && peakData.zones && peakData.zones[activeZone]) {
                const zonePeak = peakData.zones[activeZone];
                if (zonePeak.is_active === true && Array.isArray(zonePeak.rules)) {
                    const now = new Date();
                    const nowMinutes = (now.getHours() * 60) + now.getMinutes();

                    const parseTimeMinutes = (timeStr) => {
                        if (!timeStr) return -1;
                        const parts = String(timeStr).split(':');
                        if (parts.length < 2) return -1;
                        return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
                    };

                    for (let i = 0; i < zonePeak.rules.length; i++) {
                        const pRule = zonePeak.rules[i];
                        const startMin = parseTimeMinutes(pRule.start_time);
                        const endMin = parseTimeMinutes(pRule.end_time);

                        if (startMin >= 0 && endMin >= 0) {
                            const isInWindow = startMin <= endMin
                                ? (nowMinutes >= startMin && nowMinutes <= endMin)
                                : (nowMinutes >= startMin || nowMinutes <= endMin);

                            if (isInWindow) {
                                const mult = parseFloat(pRule.multiplier_factor);
                                const flat = parseFloat(pRule.markup_flat);
                                if (!isNaN(mult) && mult > 0) finalPriceRaw = finalPriceRaw * mult;
                                if (!isNaN(flat) && flat > 0) finalPriceRaw = finalPriceRaw + flat;
                                window.BAGANTARA_ACTIVE_PEAK_RULE = pRule.name;
                                break;
                            }
                        }
                    }
                }
            }

            const roundingStep = sysCtrl.price_rounding_step;
            window.BAGANTARA_FINAL_PRICE = Math.ceil(finalPriceRaw / roundingStep) * roundingStep; 
            
            if (service === 'JASTIP' && window.FlowJastip && typeof window.FlowJastip.overrideJastipPriceDisplay === 'function') {
                window.FlowJastip.overrideJastipPriceDisplay();
            } else {
                const formatHarga = new Intl.NumberFormat('id-ID', { style: 'currency', currency: tariffData.currency, minimumFractionDigits: 0 }).format(window.BAGANTARA_FINAL_PRICE);
                const priceValueEl = document.getElementById('priceValue');
                if (priceValueEl) {
                    const peakHtml = window.BAGANTARA_ACTIVE_PEAK_RULE
                        ? ` <span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: bold; margin-left: 6px;">(${wPopup.peak_hour_badge_prefix} ${window.BAGANTARA_ACTIVE_PEAK_RULE})</span>`
                        : '';
                    priceValueEl.innerHTML = `${formatHarga} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">(${distance.toFixed(1)} KM)</span>${peakHtml}`;
                }
            }
        } catch (err) {
            console.error("[Tariff Engine Error]", err);
            let pesanError = wAlerts.calc_failed;
            
            if (err.message === "LOKASI_LUAR_ZONA") pesanError = wAlerts.out_of_zone;
            else if (err.message === "TARIF_KOSONG") pesanError = wAlerts.tariff_empty;
            else if (err.message === "LAYANAN_KOSONG") pesanError = wAlerts.service_empty;

            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', pesanError);
            else alert(pesanError); 
        }
    });
});

window.resetWizard = function() { window.SystemReset(); };