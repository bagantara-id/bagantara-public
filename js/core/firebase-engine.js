// ==========================================
// MESIN KATALOG DRIVER AKTIF (TWO-STAGE HYDRATION) - V8 DRIVER-FIRST EDITION
// ARSITEKTUR: GEOHASH BOUNDARY NEIGHBORS, 60S RTDB RAM CACHE, STRICT MAX_FIRESTORE_READS, ZERO FALLBACK
// ==========================================

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

const GeohashEngine = {
    encode: function(lat, lon, precision) {
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
    },

    // Pengaman Perbatasan Geohash: Memastikan driver dekat di seberang garis grid tetap terdeteksi
    getQueryPrefixes: function(lat, lon, precision, enableNeighbors, offsetKm) {
        const centerHash = this.encode(lat, lon, precision);
        if (!enableNeighbors) return [centerHash];

        const prefixes = new Set([centerHash]);
        const dLat = offsetKm / 110.574;
        const dLon = offsetKm / (111.320 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));

        const offsets = [
            [dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon],
            [dLat, dLon], [dLat, -dLon], [-dLat, dLon], [-dLat, -dLon]
        ];

        for (let i = 0; i < offsets.length; i++) {
            const nLat = Math.max(-89.9, Math.min(89.9, lat + offsets[i][0]));
            const nLon = Math.max(-179.9, Math.min(179.9, lon + offsets[i][1]));
            prefixes.add(this.encode(nLat, nLon, precision));
        }

        return Array.from(prefixes);
    }
};

window.AegisEngine = {
    _rtdbScanCache: {
        hashKey: null,
        timestamp: 0,
        data: null
    },

    _memoryProfileCache: {},

    sanitizeText: function(text) {
        if (!text) return "";
        const secCfg = window.BGN_CONFIG.rules_app.security;
        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        let clean = text.toString().trim().replace(/[<>]/g, '');
        clean = clean.replace(/(https?:\/\/(?!res\.cloudinary\.com)[^\s]+|www\.[^\s]+|\b\w+\.(com|id|me|net|org)\b)/gi, wPopup.blocked_link_placeholder);
        const badWords = secCfg.bad_words;
        const regexBad = new RegExp(`\\b(${badWords.join('|')})\\b`, 'gi');
        return clean.replace(regexBad, secCfg.censored_replacement);
    },

    extractNumber: function(text) {
        if (!text) return 0;
        const numStr = text.toString().replace(/[^0-9]/g, '');
        return numStr ? parseInt(numStr, 10) : 0;
    },

    validateWA: function(text) {
        if (!text) return null;
        const mm = window.BGN_CONFIG.rules_app.matchmaking;
        const prefix = mm.wa_country_prefix;
        let numStr = text.toString().replace(/[^0-9]/g, '');
        if (numStr.startsWith('0')) numStr = prefix + numStr.substring(1);
        if (numStr.length < mm.wa_min_length || !numStr.startsWith(prefix)) return null;
        return numStr;
    },

    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const R = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    getFirebaseDriversByGeohash: async function(lat, lng, forceRefresh = false, useRamOnly = false) {
        if (useRamOnly && this._rtdbScanCache.data) {
            return this._rtdbScanCache.data;
        }

        const rtdbUrl = window.BGN_CONFIG.settings.firebase_core.databaseURL;
        const matchmaking = window.BGN_CONFIG.rules_app.matchmaking;
        const precision = parseInt(matchmaking.geohash_precision_level, 10);
        const cacheTtlMs = parseInt(matchmaking.rtdb_cache_ttl_sec, 10) * 1000;
        const fetchTimeoutMs = parseInt(matchmaking.rtdb_fetch_timeout_ms, 10);
        const enableNeighbors = matchmaking.enable_boundary_neighbors === true;
        const offsetKm = parseFloat(matchmaking.boundary_neighbor_offset_km);

        const prefixes = GeohashEngine.getQueryPrefixes(lat, lng, precision, enableNeighbors, offsetKm);
        const hashKey = prefixes.join('|');
        const now = Date.now();

        if (!forceRefresh && this._rtdbScanCache.data && this._rtdbScanCache.hashKey === hashKey && (now - this._rtdbScanCache.timestamp < cacheTtlMs)) {
            return this._rtdbScanCache.data;
        }

        const fetchPrefixBox = async (prefix) => {
            const orderBy = encodeURIComponent('"status/geohash"');
            const startAt = encodeURIComponent('"' + prefix + '"');
            const endAt = encodeURIComponent('"' + prefix + '\uf8ff"');
            const url = `${rtdbUrl}/drivers.json?orderBy=${orderBy}&startAt=${startAt}&endAt=${endAt}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);
            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) return {};
                const boxData = await res.json();
                return (boxData && typeof boxData === 'object') ? boxData : {};
            } catch (err) {
                clearTimeout(timeoutId);
                return {};
            }
        };

        try {
            const results = await Promise.all(prefixes.map(p => fetchPrefixBox(p)));
            const mergedDrivers = {};
            results.forEach(box => {
                Object.keys(box).forEach(uid => {
                    mergedDrivers[uid] = box[uid];
                });
            });

            this._rtdbScanCache = {
                hashKey: hashKey,
                timestamp: now,
                data: mergedDrivers
            };
            return mergedDrivers;
        } catch (err) {
            return this._rtdbScanCache.data ? this._rtdbScanCache.data : {};
        }
    },

    _getCachedFirestoreDriver: function(uid) {
        if (!uid) return null;
        const dataOpt = window.BGN_CONFIG.rules_app.data_optimization;
        const CACHE_EXPIRY_MS = parseInt(dataOpt.profile_cache_ttl_minutes, 10) * 60 * 1000;
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
        return null;
    },

    fetchFirestoreDriver: async function(uid) {
        if (!uid) return null;

        const cached = this._getCachedFirestoreDriver(uid);
        if (cached) return cached;

        const waktuSekarang = Date.now();
        const cacheKey = `bgn_driver_profile_${uid}`;

        try {
            const fbCore = window.BGN_CONFIG.settings.firebase_core;
            const projectId = fbCore.firestore_project_id;
            const fsBaseUrl = fbCore.firestore_base_url;
            const fetchTimeoutMs = parseInt(window.BGN_CONFIG.rules_app.matchmaking.rtdb_fetch_timeout_ms, 10) || 8000;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

            const fsUrl = `${fsBaseUrl}/${projectId}/databases/(default)/documents/drivers/${uid}`;
            const res = await fetch(fsUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

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

            const getStr = (f) => (f && f.stringValue) ? f.stringValue : "";
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
    // MESIN TWO-STAGE HYDRATION: KATALOG DRIVER AKTIF (PATUH MAX_FIRESTORE_READS)
    // ==========================================
    scanKatalogMitra: async function(userLat, userLng, filterService, forceRefresh = false, customLimit = null, useRamOnly = false) {
        try {
            if (isNaN(parseFloat(userLat)) || isNaN(parseFloat(userLng))) {
                return { drivers: [], totalTersedia: 0, hasMore: false };
            }

            const lat = parseFloat(userLat);
            const lng = parseFloat(userLng);

            const rulesApp = window.BGN_CONFIG.rules_app;
            const matchmaking = rulesApp.matchmaking;
            const radarRules = rulesApp.radar_mitra;
            const activeServiceFlags = window.BGN_CONFIG.layanan.services;
            const wPopup = window.BGN_CONFIG.wording.mitra_popup;
            const defaultAvatar = window.BGN_CONFIG.settings.map_config.default_avatar_url;

            const maxOfflineMinutes = parseFloat(matchmaking.max_offline_age_minutes);
            const batasRadiusGlobal = parseFloat(matchmaking.max_scan_radius_km);
            const maxOfflineMs = maxOfflineMinutes * 60000;
            const maxRender = customLimit ? parseInt(customLimit, 10) : parseInt(radarRules.max_drivers_rendered, 10);
            const maxFirestoreReads = parseInt(matchmaking.max_firestore_reads, 10);
            const defaultMinTariff = parseInt(matchmaking.default_min_tariff, 10);

            const rtdbDrivers = await this.getFirebaseDriversByGeohash(lat, lng, forceRefresh, useRamOnly);
            const driverUids = Object.keys(rtdbDrivers);
            const waktuSekarang = Date.now();
            const targetFilter = (filterService ? filterService : radarRules.default_filter).toUpperCase();

            if (!window.BAGANTARA_DRIVER_CACHE) window.BAGANTARA_DRIVER_CACHE = {};
            let kandidatStage1 = [];

            for (let i = 0; i < driverUids.length; i++) {
                const uid = driverUids[i];
                const statusData = rtdbDrivers[uid]?.status;
                if (!statusData) continue;

                const isModeAktif = statusData.mode === 'aktif';
                const isModeMangkal = statusData.mode === 'standby';
                const isWaktuMangkalValid = Boolean(statusData.expiresAt && (Number(statusData.expiresAt) > waktuSekarang));
                const isTimestampValid = Boolean(statusData.timestamp && ((waktuSekarang - Number(statusData.timestamp)) <= maxOfflineMs));

                // SYNC-01 FIX: Mode Aktif divalidasi dengan isTimestampValid (<= 5 menit),
                // sedangkan Mode Standby/Mangkal (1/6/12 jam, 0 heartbeat) divalidasi dengan isWaktuMangkalValid (expiresAt > waktuSekarang)!
                const isValidStatus = statusData.isOnline === true && ((isModeAktif && isTimestampValid) || (isModeMangkal && isWaktuMangkalValid));
                if (!isValidStatus) continue;

                const dLat = parseFloat(statusData.lat);
                const dLng = parseFloat(statusData.lng);
                if (isNaN(dLat) || isNaN(dLng)) continue;

                const jarakKePenumpang = this.calculateDistance(lat, lng, dLat, dLng);
                const batasRadiusDriver = statusData.radius ? parseFloat(statusData.radius) : batasRadiusGlobal;

                if (jarakKePenumpang > batasRadiusDriver || jarakKePenumpang > batasRadiusGlobal) continue;

                const armadaDriver = (statusData.armada ? statusData.armada : wPopup.driver_bike).toUpperCase();
                const rawLayanan = (statusData.layanan ? statusData.layanan : "").toUpperCase();
                let arrayLayanan = armadaDriver === wPopup.driver_car
                    ? ['CAR']
                    : rawLayanan.split(',').map(s => s.trim()).filter(s => s.length > 0);

                arrayLayanan = arrayLayanan.filter(srv => activeServiceFlags[srv] !== false);
                if (arrayLayanan.length === 0) continue;

                const tarifMin = statusData.tarif_min ? parseInt(statusData.tarif_min, 10) : defaultMinTariff;
                const agenda = statusData.agenda ? statusData.agenda : "";
                const fcmToken = statusData.fcmToken ? statusData.fcmToken : "";
                const effectiveTimestamp = isModeMangkal ? waktuSekarang : statusData.timestamp;

                window.BAGANTARA_DRIVER_CACHE[uid] = {
                    layanan: arrayLayanan,
                    armada: armadaDriver,
                    tarif_min: tarifMin,
                    radius: batasRadiusDriver,
                    agenda: agenda,
                    lat: dLat,
                    lng: dLng,
                    jarak: jarakKePenumpang,
                    timestamp: effectiveTimestamp,
                    fcmToken: fcmToken
                };

                if (targetFilter !== radarRules.default_filter) {
                    if (targetFilter === 'CAR') {
                        if (armadaDriver !== wPopup.driver_car) continue;
                    } else {
                        if (armadaDriver !== wPopup.driver_bike || !arrayLayanan.includes(targetFilter)) continue;
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
                    timestamp: effectiveTimestamp,
                    fcmToken: fcmToken
                });
            }

            // Urutkan mutlak dari jarak terdekat ke terjauh
            kandidatStage1.sort((a, b) => a.jarak - b.jarak);

            const totalTersedia = kandidatStage1.length;
            const kandidatTeratas = kandidatStage1.slice(0, maxRender);

            // PATUHI BATAS MAX_FIRESTORE_READS PADA PEMBACAAN JARINGAN BARU (Cache L1/L2 = 0 Read)
            let networkReadsCount = 0;
            const kandidatTerseleksi = [];

            for (let i = 0; i < kandidatTeratas.length; i++) {
                const k = kandidatTeratas[i];
                const isCached = this._getCachedFirestoreDriver(k.uid) !== null;
                if (isCached) {
                    kandidatTerseleksi.push(k);
                } else if (networkReadsCount < maxFirestoreReads) {
                    networkReadsCount++;
                    kandidatTerseleksi.push(k);
                }
            }

            const hidrasiPromises = kandidatTerseleksi.map(async (kandidat) => {
                const fsDriver = await this.fetchFirestoreDriver(kandidat.uid);

                if (!fsDriver || !fsDriver.profile || fsDriver.admin_status?.isBanned === true || fsDriver.admin_status?.isApproved === false) {
                    return null;
                }

                const profile = fsDriver.profile;
                const wa = this.validateWA(profile.wa);
                if (!wa) return null;

                let fotoProfile = profile.fotoUrl ? profile.fotoUrl.trim() : '';
                if (!fotoProfile.startsWith('http')) fotoProfile = defaultAvatar;

                const defaultVeh = kandidat.armada === wPopup.driver_car ? wPopup.default_vehicle_car : wPopup.default_vehicle_bike;

                return {
                    uid: kandidat.uid,
                    nama: this.sanitizeText(profile.nama ? profile.nama : wPopup.default_driver_name),
                    wa: wa,
                    plat: this.sanitizeText(profile.plat ? profile.plat : wPopup.no_notes),
                    kendaraan: this.sanitizeText(profile.kendaraan ? profile.kendaraan : defaultVeh),
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

            driversValid.sort((a, b) => a.jarak - b.jarak);

            return {
                drivers: driversValid,
                totalTersedia: totalTersedia,
                hasMore: totalTersedia > driversValid.length
            };
        } catch (err) {
            console.error("[Catalog Hydration Error]", err);
            return { drivers: [], totalTersedia: 0, hasMore: false };
        }
    },

    _openClientIdentityForm: function(driverObj) {
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        window.BAGANTARA_DRIVER = { 
            uid: driverObj.uid, 
            nama: driverObj.nama, 
            wa: driverObj.wa,
            fcmToken: driverObj.fcmToken ? driverObj.fcmToken : ""
        };
        
        const inputCatatan = document.getElementById('inputCatatanDriver');
        if (inputCatatan && window.BAGANTARA_PICKUP_DETAIL && window.BAGANTARA_PICKUP_DETAIL.patokan) {
            const patokan = window.BAGANTARA_PICKUP_DETAIL.patokan;
            inputCatatan.value = (patokan !== noNotes && patokan.trim() !== '') ? patokan : '';
        }
        
        const overlay = document.getElementById('client-form-overlay');
        if (overlay) overlay.classList.remove('hidden');
    },

    renderMitraList: async function(targetService, routePrice) {
        const pd = window.BAGANTARA_PRELOCKED_DRIVER;
        if (!pd) {
            const msgNoDriver = window.BGN_CONFIG.wording.alerts.uid_not_found;
            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('uid_not_found', msgNoDriver);
            else window.alert(msgNoDriver);
            if (window.SystemReset) window.SystemReset();
            return;
        }

        const tarifMinDriver = parseInt(pd.tarifMin, 10);
        const hargaRute = parseInt(routePrice, 10);

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

        const currencyCode = window.BGN_CONFIG.tariffs.currency;
        const fmt = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(val);
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
                const badgeText = window.BGN_CONFIG.wording.radar.min_driver_tariff_badge;
                if (priceValueEl) {
                    priceValueEl.innerHTML = `${fmt(tarifMinDriver)} <span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: normal; margin-left: 4px;">${badgeText}</span>`;
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