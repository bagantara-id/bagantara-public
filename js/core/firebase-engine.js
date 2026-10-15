// ==========================================
// MESIN KATALOG DRIVER AKTIF (TWO-STAGE HYDRATION) - V7 DRIVER-FIRST EDITION
// ARSITEKTUR: 1-REQ GEOHASH PREFIX, 30S RTDB RAM CACHE, L1/L2 24H FIRESTORE CACHE, SMART TARIFF MATCH
// ==========================================

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

const GeohashEngine = {
    encode: function(lat, lon, precision = 4) {
        let idx = 0, bit = 0, evenBit = true, hash = "";
        let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
        while (hash.length < precision) {
            if (evenBit) {
                let lonMid = (lonMin + lonMax) / 2;
                if (lon >= lonMid) { idx = idx * 2 + 1; lonMin = lonMid; } else { idx = idx * 2; lonMax = lonMid; }
            } else {
                let latMid = (latMin + latMax) / 2;
                if (lat >= latMid) { idx = idx * 2 + 1; latMin = latMid; } else { idx = idx * 2; latMax = latMid; }
            }
            evenBit = !evenBit;
            if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
        }
        return hash;
    }
};

window.AegisEngine = {
    _rtdbScanCache: {
        hashPrefix: null,
        timestamp: 0,
        data: null
    },

    _memoryProfileCache: {},

    sanitizeText: function(text) {
        if (!text) return "";
        let clean = text.toString().trim().replace(/[<>]/g, '');
        clean = clean.replace(/(https?:\/\/(?!res\.cloudinary\.com)[^\s]+|www\.[^\s]+|\b\w+\.(com|id|me|net|org)\b)/gi, '[TAUTAN DIBLOKIR]');
        const badWords = ['anjing', 'bangsat', 'babi', 'kontol', 'memek', 'penipu', 'bajingan']; 
        const regexBad = new RegExp(`\\b(${badWords.join('|')})\\b`, 'gi');
        return clean.replace(regexBad, '***');
    },

    extractNumber: function(text) {
        if (!text) return 0;
        const numStr = text.toString().replace(/[^0-9]/g, '');
        return numStr ? parseInt(numStr, 10) : 0;
    },

    validateWA: function(text) {
        if (!text) return null;
        let numStr = text.toString().replace(/[^0-9]/g, '');
        if (numStr.startsWith('0')) numStr = '62' + numStr.substring(1);
        if (numStr.length < 10 || !numStr.startsWith('62')) return null;
        return numStr;
    },

    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; 
    },

    getFirebaseDriversByGeohash: async function(lat, lng, forceRefresh = false, useRamOnly = false) {
        if (useRamOnly && this._rtdbScanCache.data) {
            return this._rtdbScanCache.data;
        }

        const rtdbUrl = window.BGN_CONFIG?.settings?.firebase_core?.databaseURL;
        if (!rtdbUrl) { console.error("URL RTDB hilang dari settings.json"); return {}; }

        const matchmaking = window.BGN_CONFIG?.rules_app?.matchmaking || {};
        const precision = Math.min(parseInt(matchmaking.geohash_precision_level) || 4, 4); 
        const cacheTtlMs = (parseInt(matchmaking.rtdb_cache_ttl_sec) || 30) * 1000;

        const hashPrefix = GeohashEngine.encode(lat, lng, precision);
        const now = Date.now();

        if (!forceRefresh && this._rtdbScanCache.data && this._rtdbScanCache.hashPrefix === hashPrefix && (now - this._rtdbScanCache.timestamp < cacheTtlMs)) {
            return this._rtdbScanCache.data;
        }

        const orderBy = encodeURIComponent('"status/geohash"');
        const startAt = encodeURIComponent('"' + hashPrefix + '"');
        const endAt = encodeURIComponent('"' + hashPrefix + '\uf8ff"'); 
        const url = `${rtdbUrl}/drivers.json?orderBy=${orderBy}&startAt=${startAt}&endAt=${endAt}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); 
        
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return this._rtdbScanCache.data || {};
            const boxData = await res.json();
            const finalDrivers = (boxData && typeof boxData === 'object') ? boxData : {};

            this._rtdbScanCache = {
                hashPrefix: hashPrefix,
                timestamp: now,
                data: finalDrivers
            };
            return finalDrivers;
        } catch (err) {
            clearTimeout(timeoutId);
            return this._rtdbScanCache.data || {};
        }
    },

    fetchFirestoreDriver: async function(uid) {
        if (!uid) return null;

        const dataOpt = window.BGN_CONFIG?.rules_app?.data_optimization;
        const ttlMinutes = (dataOpt?.profile_cache_ttl_minutes !== undefined) ? dataOpt.profile_cache_ttl_minutes : 1440;
        const CACHE_EXPIRY_MS = ttlMinutes * 60 * 1000; 
        const waktuSekarang = Date.now();

        const memEntry = this._memoryProfileCache[uid];
        if (memEntry && memEntry._timestamp && (waktuSekarang - memEntry._timestamp < CACHE_EXPIRY_MS)) {
            return memEntry.data;
        }

        const cacheKey = `bgn_driver_profile_${uid}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                const parsedCache = JSON.parse(cachedData);
                if (parsedCache._timestamp && (waktuSekarang - parsedCache._timestamp < CACHE_EXPIRY_MS)) {
                    this._memoryProfileCache[uid] = parsedCache;
                    return parsedCache.data; 
                }
            } catch (e) {}
            localStorage.removeItem(cacheKey);
        }

        try {
            const projectId = window.BGN_CONFIG?.settings?.firebase_core?.firestore_project_id;
            if (!projectId) return null;

            const fsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${uid}`;
            const res = await fetch(fsUrl);

            if (res.status === 404) {
                const negData = {
                    profile: null,
                    admin_status: { isApproved: false, isBanned: true }
                };
                const negPayload = { data: negData, _timestamp: waktuSekarang };
                this._memoryProfileCache[uid] = negPayload;
                try { localStorage.setItem(cacheKey, JSON.stringify(negPayload)); } catch (e) {}
                return negData;
            }

            if (!res.ok) return null;
            const data = await res.json();
            if (!data.fields) return null;

            const getStr = (f) => f ? f.stringValue || "" : "";
            const pf = data.fields.profile ? data.fields.profile.mapValue.fields : {};
            let af = {};
            if (data.fields.admin_status) af = data.fields.admin_status.mapValue.fields;
            else if (data.fields['admin-status']) af = data.fields['admin-status'].mapValue.fields;

            const finalData = {
                profile: { 
                    nama: this.sanitizeText(getStr(pf.nama)), 
                    plat: this.sanitizeText(getStr(pf.plat)), 
                    wa: getStr(pf.wa), 
                    fotoUrl: getStr(pf.fotoUrl), 
                    kendaraan: this.sanitizeText(getStr(pf.kendaraan)) 
                },
                admin_status: { 
                    isApproved: af.isApproved ? af.isApproved.booleanValue : false, 
                    isBanned: af.isBanned ? af.isBanned.booleanValue : false 
                }
            };

            const cachePayload = { data: finalData, _timestamp: waktuSekarang };
            this._memoryProfileCache[uid] = cachePayload;
            try { localStorage.setItem(cacheKey, JSON.stringify(cachePayload)); } catch (e) {}
            return finalData;
        } catch(e) { return null; }
    },

    // ==========================================
    // MESIN TWO-STAGE HYDRATION: KATALOG DRIVER AKTIF (URUTAN PERTAMA = TERDEKAT)
    // ==========================================
    scanKatalogMitra: async function(userLat, userLng, filterService = 'ALL', forceRefresh = false, customLimit = null, useRamOnly = false) {
        try {
            if (isNaN(parseFloat(userLat)) || isNaN(parseFloat(userLng))) {
                return { drivers: [], totalTersedia: 0, hasMore: false };
            }

            const lat = parseFloat(userLat);
            const lng = parseFloat(userLng);

            const rulesApp = window.BGN_CONFIG?.rules_app || {};
            const matchmaking = rulesApp.matchmaking || {};
            const radarRules = rulesApp.radar_mitra || {};
            const activeServiceFlags = window.BGN_CONFIG?.layanan?.services || {};

            const maxOfflineMinutes = parseFloat(matchmaking.max_offline_age_minutes) || 5;
            const batasRadiusGlobal = parseFloat(matchmaking.max_scan_radius_km) || 15.0;
            const maxOfflineMs = maxOfflineMinutes * 60000;
            const maxRender = customLimit || parseInt(radarRules.max_drivers_rendered) || 10;

            const rtdbDrivers = await this.getFirebaseDriversByGeohash(lat, lng, forceRefresh, useRamOnly);
            const driverUids = Object.keys(rtdbDrivers);
            const waktuSekarang = Date.now();
            const targetFilter = (filterService || 'ALL').toUpperCase();

            window.BAGANTARA_DRIVER_CACHE = window.BAGANTARA_DRIVER_CACHE || {};
            let kandidatStage1 = [];

            for (let i = 0; i < driverUids.length; i++) {
                const uid = driverUids[i];
                const statusData = rtdbDrivers[uid]?.status || {};

                const isModeAktif = statusData.mode === 'aktif';
                const isModeMangkal = statusData.mode === 'standby';
                const isWaktuMangkalValid = statusData.expiresAt && (statusData.expiresAt > waktuSekarang);
                const isTimestampValid = statusData.timestamp && ((waktuSekarang - statusData.timestamp) <= maxOfflineMs);

                const isValidStatus = statusData.isOnline === true && isTimestampValid && (isModeAktif || (isModeMangkal && isWaktuMangkalValid));
                if (!isValidStatus) continue;

                const dLat = parseFloat(statusData.lat);
                const dLng = parseFloat(statusData.lng);
                if (isNaN(dLat) || isNaN(dLng)) continue;

                const jarakKePenumpang = this.calculateDistance(lat, lng, dLat, dLng);
                const batasRadiusDriver = statusData.radius ? parseFloat(statusData.radius) : batasRadiusGlobal;

                if (jarakKePenumpang > batasRadiusDriver || jarakKePenumpang > batasRadiusGlobal) continue;

                const armadaDriver = (statusData.armada || "MOTOR").toUpperCase();
                const rawLayanan = (statusData.layanan || "").toUpperCase();
                let arrayLayanan = armadaDriver === 'MOBIL'
                    ? ['CAR']
                    : rawLayanan.split(',').map(s => s.trim()).filter(s => s.length > 0);

                arrayLayanan = arrayLayanan.filter(srv => activeServiceFlags[srv] !== false);
                if (arrayLayanan.length === 0) continue;

                const tarifMin = statusData.tarif_min ? parseInt(statusData.tarif_min, 10) : 10000;
                const agenda = statusData.agenda || "";
                const fcmToken = statusData.fcmToken || "";

                window.BAGANTARA_DRIVER_CACHE[uid] = {
                    layanan: arrayLayanan,
                    armada: armadaDriver,
                    tarif_min: tarifMin,
                    radius: batasRadiusDriver,
                    agenda: agenda,
                    lat: dLat,
                    lng: dLng,
                    jarak: jarakKePenumpang,
                    timestamp: statusData.timestamp,
                    fcmToken: fcmToken
                };

                if (targetFilter !== 'ALL') {
                    if (targetFilter === 'CAR') {
                        if (armadaDriver !== 'MOBIL') continue;
                    } else {
                        if (armadaDriver !== 'MOTOR' || !arrayLayanan.includes(targetFilter)) continue;
                    }
                }

                kandidatStage1.push({
                    uid: uid,
                    lat: dLat,
                    lng: dLng,
                    jarak: jarakKePenumpang,
                    radius: batasRadiusDriver,
                    tarifMin: tarifMin,
                    agenda: agenda,
                    layananList: arrayLayanan,
                    armada: armadaDriver,
                    timestamp: statusData.timestamp,
                    fcmToken: fcmToken
                });
            }

            // Urutkan mutlak dari jarak terdekat ke terjauh
            kandidatStage1.sort((a, b) => a.jarak - b.jarak);

            const totalTersedia = kandidatStage1.length;
            const kandidatTeratas = kandidatStage1.slice(0, maxRender);

            const hidrasiPromises = kandidatTeratas.map(async (kandidat) => {
                const fsDriver = await this.fetchFirestoreDriver(kandidat.uid);

                if (!fsDriver || !fsDriver.profile || fsDriver.admin_status?.isBanned === true || fsDriver.admin_status?.isApproved === false) {
                    return null;
                }

                const profile = fsDriver.profile;
                const wa = this.validateWA(profile.wa);
                if (!wa) return null;

                let fotoProfile = profile.fotoUrl ? profile.fotoUrl.trim() : '';
                if (!fotoProfile.startsWith('http')) fotoProfile = './assets/icon-192.png';

                return {
                    uid: kandidat.uid,
                    nama: this.sanitizeText(profile.nama || 'Driver Bagantara'),
                    wa: wa,
                    plat: this.sanitizeText(profile.plat || '-'),
                    kendaraan: this.sanitizeText(profile.kendaraan || (kandidat.armada === 'MOBIL' ? 'Mobil Standar' : 'Motor Standar')),
                    fotoProfile: fotoProfile,
                    armada: kandidat.armada,
                    layanan: kandidat.layananList,
                    tarifMin: kandidat.tarifMin,
                    radius: kandidat.radius,
                    jarak: kandidat.jarak,
                    lat: kandidat.lat,
                    lng: kandidat.lng,
                    info: kandidat.agenda && kandidat.agenda.trim() !== '' ? this.sanitizeText(kandidat.agenda) : '',
                    timestamp: kandidat.timestamp,
                    fcmToken: kandidat.fcmToken
                };
            });

            const hasilHidrasi = await Promise.all(hidrasiPromises);
            const driversValid = hasilHidrasi.filter(Boolean);

            // Pastikan urutan tetap mutlak dari jarak terdekat setelah Promise.all
            driversValid.sort((a, b) => a.jarak - b.jarak);

            return {
                drivers: driversValid,
                totalTersedia: totalTersedia,
                hasMore: totalTersedia > maxRender
            };
        } catch (err) {
            console.error("[Catalog Hydration Error]", err);
            return { drivers: [], totalTersedia: 0, hasMore: false };
        }
    },

    _openClientIdentityForm: function(driverObj) {
        window.BAGANTARA_DRIVER = { 
            uid: driverObj.uid, 
            nama: driverObj.nama, 
            wa: driverObj.wa,
            fcmToken: driverObj.fcmToken || ""
        };
        
        const inputCatatan = document.getElementById('inputCatatanDriver');
        if (inputCatatan && window.BAGANTARA_PICKUP_DETAIL && window.BAGANTARA_PICKUP_DETAIL.patokan) {
            const patokan = window.BAGANTARA_PICKUP_DETAIL.patokan;
            inputCatatan.value = (patokan !== '-' && patokan.trim() !== '') ? patokan : '';
        }
        
        const overlay = document.getElementById('client-form-overlay');
        if (overlay) overlay.classList.remove('hidden');
    },

    renderMitraList: async function(targetService, routePrice) {
        const pd = window.BAGANTARA_PRELOCKED_DRIVER;
        if (!pd) {
            const msgNoDriver = window.BGN_CONFIG?.wording?.alerts?.uid_not_found || "Silakan pilih driver terlebih dahulu di Beranda.";
            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msgNoDriver);
            else window.alert(msgNoDriver);
            if (window.SystemReset) window.SystemReset();
            return;
        }

        const tarifMinDriver = parseInt(pd.tarifMin, 10) || 0;
        const hargaRute = parseInt(routePrice, 10) || 0;

        if (hargaRute >= tarifMinDriver) {
            this._openClientIdentityForm(pd);
            return;
        }

        const selisih = tarifMinDriver - hargaRute;
        const modalBoost = document.getElementById('tariff-match-overlay');
        if (!modalBoost) {
            window.BAGANTARA_FINAL_PRICE = tarifMinDriver;
            this._openClientIdentityForm(pd);
            return;
        }

        const fmt = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
        const elDriverName = document.getElementById('tmDriverName');
        const elRoutePrice = document.getElementById('tmRoutePrice');
        const elMinTariff = document.getElementById('tmMinTariff');
        const elDiffPrice = document.getElementById('tmDiffPrice');

        if (elDriverName) elDriverName.textContent = pd.nama;
        if (elRoutePrice) elRoutePrice.textContent = fmt(hargaRute);
        if (elMinTariff) elMinTariff.textContent = fmt(tarifMinDriver);
        if (elDiffPrice) elDiffPrice.textContent = `+${fmt(selisih)}`;

        modalBoost.classList.remove('hidden');

        window.bindSafeButton('btnApproveTariffMatch', () => {
            modalBoost.classList.add('hidden');
            window.BAGANTARA_FINAL_PRICE = tarifMinDriver;

            if (targetService === 'JASTIP' && window.FlowJastip && typeof window.FlowJastip.overrideJastipPriceDisplay === 'function') {
                window.FlowJastip.overrideJastipPriceDisplay();
            } else {
                const priceValueEl = document.getElementById('priceValue');
                if (priceValueEl) {
                    priceValueEl.innerHTML = `${fmt(tarifMinDriver)} <span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: normal; margin-left: 4px;">(Tarif Min. Driver)</span>`;
                }
            }

            this._openClientIdentityForm(pd);
        });

        window.bindSafeButton('btnRejectTariffMatch', () => {
            modalBoost.classList.add('hidden');
            if (window.SystemReset) window.SystemReset();
        });
    }
};