// ==========================================
// MESIN RADAR PENGEMUDI (ZERO-SOCKET & HYBRID CACHE) - FINAL
// ARSITEKTUR: STRICT RULES JSON, ZERO FALLBACK, OTA READY
// ==========================================

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const NEIGHBORS = {
    top: { even: "p0r21436x8zb9dcf5h7kjnmqesgutwvy", odd: "bc01fg45238967deuvhjyznpkmstqrwx" },
    bottom: { even: "14365h7k9dcfesgujnmqp0r2twvyx8zb", odd: "238967debc01fg45kmstqrwxuvhjyznp" },
    right: { even: "bc01fg45238967deuvhjyznpkmstqrwx", odd: "p0r21436x8zb9dcf5h7kjnmqesgutwvy" },
    left: { even: "238967debc01fg45kmstqrwxuvhjyznp", odd: "14365h7k9dcfesgujnmqp0r2twvyx8zb" }
};
const BORDERS = {
    top: { even: "prxz", odd: "bcfguvyz" },
    bottom: { even: "028b", odd: "0145hjnp" },
    right: { even: "bcfguvyz", odd: "prxz" },
    left: { even: "0145hjnp", odd: "028b" }
};

const GeohashEngine = {
    encode: function(lat, lon, precision = 6) {
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
    calculateAdjacent: function(hash, dir) {
        hash = hash.toLowerCase();
        const lastChr = hash.charAt(hash.length - 1);
        const type = (hash.length % 2) ? 'odd' : 'even';
        let base = hash.substring(0, hash.length - 1);
        if (BORDERS[dir][type].indexOf(lastChr) !== -1) {
            if (base === "") return "";
            base = this.calculateAdjacent(base, dir);
        }
        return base + BASE32[NEIGHBORS[dir][type].indexOf(lastChr)];
    },
    getNeighbors: function(hash) {
        const top = this.calculateAdjacent(hash, 'top');
        const bottom = this.calculateAdjacent(hash, 'bottom');
        const right = this.calculateAdjacent(hash, 'right');
        const left = this.calculateAdjacent(hash, 'left');
        return [
            hash, top, bottom, right, left,
            this.calculateAdjacent(top, 'left'), this.calculateAdjacent(top, 'right'),
            this.calculateAdjacent(bottom, 'left'), this.calculateAdjacent(bottom, 'right')
        ];
    }
};

window.AegisEngine = {

    sanitizeText: function(text) {
        if (!text) return "";
        let clean = text.trim();
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

    getFirebaseDriversByGeohash: async function(lat, lng, precision = 5) {
        const rtdbUrl = window.BGN_CONFIG?.settings?.firebase_core?.databaseURL;
        if (!rtdbUrl) { console.error("URL RTDB hilang dari settings.json"); return {}; }

        const centerHash = GeohashEngine.encode(lat, lng, precision);
        const neighborHashes = GeohashEngine.getNeighbors(centerHash);
        let allDrivers = {};

        const fetchPromises = neighborHashes.map(hash => {
            const orderBy = encodeURIComponent('"status/geohash"');
            const startAt = encodeURIComponent('"' + hash + '"');
            const endAt = encodeURIComponent('"' + hash + '\uf8ff"'); 
            const url = `${rtdbUrl}/drivers.json?orderBy=${orderBy}&startAt=${startAt}&endAt=${endAt}`;
            
            // FIX TAHAP 3: Timeout proteksi agar tidak hang jika jaringan bermasalah
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); 
            
            return fetch(url, { signal: controller.signal })
                .then(res => { clearTimeout(timeoutId); return res.json(); })
                .catch(() => { clearTimeout(timeoutId); return null; });
        });

        const results = await Promise.all(fetchPromises);
        results.forEach(boxData => {
            if (boxData && typeof boxData === 'object') {
                Object.assign(allDrivers, boxData);
            }
        });

        return allDrivers;
    },

    fetchFirestoreDriver: async function(uid) {
        const dataOpt = window.BGN_CONFIG?.rules_app?.data_optimization;
        const ttlMinutes = dataOpt?.profile_cache_ttl_minutes;
        
        // ZERO HARDCODE: Bypass cache dan langsung fetch jika aturan TTL tidak ada di JSON
        const CACHE_EXPIRY_MS = (ttlMinutes !== undefined) ? (ttlMinutes * 60 * 1000) : 0; 
        
        const cacheKey = `bgn_driver_profile_${uid}`;
        const cachedData = localStorage.getItem(cacheKey);
        const waktuSekarang = Date.now();
        
        if (cachedData) {
            try {
                const parsedCache = JSON.parse(cachedData);
                if (parsedCache._timestamp && (waktuSekarang - parsedCache._timestamp < CACHE_EXPIRY_MS)) {
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
                    nama: getStr(pf.nama), 
                    plat: getStr(pf.plat), 
                    wa: getStr(pf.wa), 
                    fotoUrl: getStr(pf.fotoUrl), 
                    kendaraan: getStr(pf.kendaraan) 
                },
                admin_status: { 
                    isApproved: af.isApproved ? af.isApproved.booleanValue : false, 
                    isBanned: af.isBanned ? af.isBanned.booleanValue : false 
                }
            };

            localStorage.setItem(cacheKey, JSON.stringify({ data: finalData, _timestamp: waktuSekarang }));
            return finalData;
        } catch(e) { return null; }
    },

    scanPengemudi: async function(targetService, routePrice) {
        try {
            let keranjang1 = []; 
            let keranjang2 = []; 

            let pickupLat = null, pickupLng = null;
            if (window.BAGANTARA_PICKUP_COORD) {
                const parts = window.BAGANTARA_PICKUP_COORD.split(',');
                pickupLat = parseFloat(parts[0]); pickupLng = parseFloat(parts[1]);
            }

            if (!pickupLat || !pickupLng) return { lolosMutlak: [], zonaBoost: [] };

            const rulesApp = window.BGN_CONFIG?.rules_app;
            const matchmaking = rulesApp?.matchmaking;
            
            // FIX TAHAP 3: Menambahkan fallback nilai agar logika radar tidak lumpuh
            const maxOfflineMinutes = matchmaking?.max_offline_age_minutes || 5;
            const geohashPrecision = matchmaking?.geohash_precision_level || 5;
            const batasRadiusGlobal = matchmaking?.max_scan_radius_km || 5.0; 
            
            const maxOfflineMs = maxOfflineMinutes * 60000;

            const firebaseDrivers = await this.getFirebaseDriversByGeohash(pickupLat, pickupLng, geohashPrecision);
            const driverUids = Object.keys(firebaseDrivers);
            const waktuSekarangServer = Date.now();

            let kandidatAwal = [];

            for (let i = 0; i < driverUids.length; i++) {
                const uid = driverUids[i];
                const statusData = firebaseDrivers[uid].status || {};

                const isModeAktif = statusData.mode === 'aktif';
                const isModeMangkal = statusData.mode === 'standby';
                const isWaktuMangkalValid = statusData.expiresAt && (statusData.expiresAt > waktuSekarangServer);
                const isTimestampValid = statusData.timestamp && ((waktuSekarangServer - statusData.timestamp) <= maxOfflineMs); 
                
                const isValidStatus = statusData.isOnline === true && isTimestampValid && (isModeAktif || (isModeMangkal && isWaktuMangkalValid));
                if (!isValidStatus) continue;

                const armadaDriver = (statusData.armada || "MOTOR").toUpperCase();
                const layananDriver = (statusData.layanan || "").toUpperCase();
                const ts = targetService.toUpperCase();

                if (ts === 'CAR') {
                    if (armadaDriver !== 'MOBIL') continue; 
                } else {
                    if (armadaDriver !== 'MOTOR' || !layananDriver.includes(ts)) continue; 
                }

                const latPengemudi = parseFloat(statusData.lat);
                const lngPengemudi = parseFloat(statusData.lng);
                if (isNaN(latPengemudi) || isNaN(lngPengemudi)) continue;

                const jarakKePenumpang = this.calculateDistance(pickupLat, pickupLng, latPengemudi, lngPengemudi);
                
                const batasRadius = statusData.radius ? parseFloat(statusData.radius) : batasRadiusGlobal; 
                if (jarakKePenumpang > batasRadius) continue; 
                if (jarakKePenumpang > batasRadiusGlobal) continue;

                kandidatAwal.push({
                    uid: uid,
                    lat: latPengemudi,
                    lng: lngPengemudi,
                    jarak: jarakKePenumpang,
                    tarifMinRTDB: statusData.tarif_min ? parseInt(statusData.tarif_min) : 0,
                    agendaRTDB: statusData.agenda || "",
                    layananRTDB: layananDriver,
                    armadaRTDB: armadaDriver
                });
            }

            kandidatAwal.sort((a, b) => a.jarak - b.jarak);
            
            const limitReads = matchmaking?.max_firestore_reads || 5;
            const kandidatFinal = kandidatAwal.slice(0, limitReads);

            // OPTIMASI ARSITEKTUR: Eksekusi Serentak (Concurrent Promise.all)
            const validasiPromises = kandidatFinal.map(async (kandidat) => {
                const fsDriver = await this.fetchFirestoreDriver(kandidat.uid);
                
                if (!fsDriver || fsDriver.admin_status.isBanned === true || fsDriver.admin_status.isApproved === false) return null;

                const profile = fsDriver.profile;
                const wa = this.validateWA(profile.wa);
                if (!wa) return null;

                let fotoProfile = profile.fotoUrl ? profile.fotoUrl.trim() : '';
                if (!fotoProfile.startsWith('http')) fotoProfile = './assets/icon-192.png';
                
                const tarifMin = kandidat.tarifMinRTDB;

                return {
                    driverData: { 
                        uid: kandidat.uid,
                        nama: this.sanitizeText(profile.nama), 
                        wa: wa, 
                        plat: this.sanitizeText(profile.plat), 
                        info: this.sanitizeText(kandidat.agendaRTDB || "-"), 
                        tarifMin: tarifMin, 
                        fotoProfile: fotoProfile, 
                        jarakAktual: kandidat.jarak,
                        selisihBoost: 0 
                    },
                    tarifMin: tarifMin
                };
            });

            const hasilValidasiSerentak = await Promise.all(validasiPromises);

            for (let i = 0; i < hasilValidasiSerentak.length; i++) {
                const hasil = hasilValidasiSerentak[i];
                if (!hasil) continue; 

                const { driverData, tarifMin } = hasil;

                if (routePrice >= tarifMin) {
                    keranjang1.push(driverData);
                } else if (matchmaking?.enable_boost_zone) {
                    const selisihTarif = tarifMin - routePrice;
                    const maxBoost = matchmaking.max_boost_amount || 0;
                    if (selisihTarif > 0 && selisihTarif <= maxBoost) {
                        driverData.selisihBoost = selisihTarif;
                        keranjang2.push(driverData);
                    }
                }
            }
            
            keranjang1.sort((a, b) => a.jarakAktual - b.jarakAktual);
            keranjang2.sort((a, b) => a.jarakAktual - b.jarakAktual);
            
            return { lolosMutlak: keranjang1, zonaBoost: keranjang2 };
        } catch (err) { 
            console.error("[Matchmaking Error]", err);
            return { lolosMutlak: [], zonaBoost: [] }; 
        }
    },

    _cetakKartuPengemudi: function(driversArray, containerEl) {
        containerEl.innerHTML = '';
        const template = document.getElementById('tpl-driver-card');
        if (!template) return;

        driversArray.forEach(d => {
            const clone = template.content.cloneNode(true);
            
            const imgEl = clone.querySelector('.tpl-foto');
            if (imgEl) imgEl.src = d.fotoProfile;
            
            const namaEl = clone.querySelector('.tpl-nama');
            if (namaEl) namaEl.textContent = d.nama;
            
            const platEl = clone.querySelector('.tpl-plat');
            if (platEl) platEl.textContent = d.plat;
            
            const jarakEl = clone.querySelector('.tpl-jarak');
            if (jarakEl) jarakEl.textContent = d.jarakAktual.toFixed(1);
            
            const infoEl = clone.querySelector('.tpl-info');
            if (infoEl && d.info && d.info !== "-") {
                infoEl.textContent = `"${d.info}"`;
                infoEl.style.display = 'block';
            }
            
            const btnPilih = clone.querySelector('.tpl-btn-pilih');
            if (btnPilih) {
                btnPilih.addEventListener('click', () => {
                    window.BAGANTARA_DRIVER = { 
                        uid: d.uid, 
                        nama: d.nama, 
                        wa: d.wa 
                    };

                    const inputCatatan = document.getElementById('inputCatatanDriver');
                    if (inputCatatan && window.BAGANTARA_PICKUP_DETAIL && window.BAGANTARA_PICKUP_DETAIL.patokan) {
                        const patokan = window.BAGANTARA_PICKUP_DETAIL.patokan;
                        if (patokan !== '-' && patokan.trim() !== '') {
                            inputCatatan.value = patokan;
                        } else {
                            inputCatatan.value = ''; 
                        }
                    }

                    const overlay = document.getElementById('client-form-overlay');
                    if (overlay) overlay.classList.remove('hidden');
                });
            }
            
            containerEl.appendChild(clone);
        });
    },

    renderMitraList: async function(targetService, routePrice) {
        const container = document.getElementById('driverListContainer');
        if (!container) return;

        let k1_LolosMutlak = [];
        let k2_ZonaBoost = [];

        if (window.BAGANTARA_PRELOCKED_DRIVER) {
            const pd = window.BAGANTARA_PRELOCKED_DRIVER;
            let layananValid = false;
            
            const ts = targetService.toUpperCase();
            if (ts === 'CAR' && pd.armada === 'MOBIL') layananValid = true;
            else if (ts !== 'CAR' && pd.armada === 'MOTOR' && pd.layanan.includes(ts)) layananValid = true;

            if (layananValid) {
                const fsDriver = await this.fetchFirestoreDriver(pd.uid);
                const driverData = {
                    uid: pd.uid,
                    nama: pd.nama,
                    wa: pd.wa,
                    plat: (fsDriver && fsDriver.profile) ? (fsDriver.profile.plat || "-") : "-",
                    info: pd.info,
                    tarifMin: pd.tarifMin,
                    fotoProfile: pd.fotoProfile,
                    jarakAktual: window.BAGANTARA_DISTANCE_KM || 0 
                };

                if (routePrice >= pd.tarifMin) {
                    k1_LolosMutlak.push(driverData);
                    
                    setTimeout(() => {
                        window.BAGANTARA_DRIVER = { 
                            uid: driverData.uid, 
                            nama: driverData.nama, 
                            wa: driverData.wa 
                        };
                        
                        const inputCatatan = document.getElementById('inputCatatanDriver');
                        if (inputCatatan && window.BAGANTARA_PICKUP_DETAIL && window.BAGANTARA_PICKUP_DETAIL.patokan) {
                            const patokan = window.BAGANTARA_PICKUP_DETAIL.patokan;
                            inputCatatan.value = (patokan !== '-' && patokan.trim() !== '') ? patokan : '';
                        }
                        
                        const overlay = document.getElementById('client-form-overlay');
                        if (overlay) overlay.classList.remove('hidden');
                    }, 100);

                } else {
                    const selisih = pd.tarifMin - routePrice;
                    const maxBoost = window.BGN_CONFIG?.rules_app?.matchmaking?.max_boost_amount || 5000;
                    if (selisih > 0 && selisih <= maxBoost) {
                        driverData.selisihBoost = selisih;
                        k2_ZonaBoost.push(driverData);
                    }
                }
            } else {
                let txtAlert = window.BGN_CONFIG?.wording?.alerts?.driver_unavailable || "Maaf, Driver {nama} tidak melayani pesanan {layanan}. Sistem beralih ke radar otomatis.";
                txtAlert = txtAlert.replace('{nama}', `<b>${pd.nama}</b>`).replace('{layanan}', `<b>${targetService}</b>`);
                
                if(window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('dynamic', txtAlert);
                } else if(window.UIManager && window.UIManager.alert) {
                    window.UIManager.alert(txtAlert);
                } else {
                    alert(txtAlert.replace(/<[^>]*>?/gm, ''));
                }
            }
            window.BAGANTARA_PRELOCKED_DRIVER = null; 
        }

        if (k1_LolosMutlak.length === 0 && k2_ZonaBoost.length === 0) {
            const dataScan = await this.scanPengemudi(targetService, routePrice);
            k1_LolosMutlak = dataScan.lolosMutlak;
            k2_ZonaBoost = dataScan.zonaBoost;
        }

        container.innerHTML = ''; 

        if (k1_LolosMutlak.length > 0) {
            this._cetakKartuPengemudi(k1_LolosMutlak, container);
        } else if (k2_ZonaBoost.length > 0) {
            let maxBoost = 0;
            k2_ZonaBoost.forEach(d => { if (d.selisihBoost > maxBoost) maxBoost = d.selisihBoost; });
            
            const formatBoost = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(maxBoost);
            const templateBoost = document.getElementById('tpl-boost-card');
            
            if (templateBoost) {
                const clone = templateBoost.content.cloneNode(true);
                
                clone.querySelector('.tpl-boost-count').textContent = k2_ZonaBoost.length;
                clone.querySelector('.tpl-boost-price').textContent = formatBoost;
                
                const btnSetuju = clone.querySelector('.tpl-btn-setuju');
                btnSetuju.addEventListener('click', () => {
                    window.BAGANTARA_FINAL_PRICE += maxBoost;
                    const priceValueEl = document.getElementById('priceValue');
                    if (priceValueEl) {
                        const formatBaru = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(window.BAGANTARA_FINAL_PRICE);
                        const txtBoost = window.BGN_CONFIG?.wording?.buttons?.boost_active || "Boost Aktif";
                        priceValueEl.innerHTML = `${formatBaru} <span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: normal; margin-left: 4px;">(${txtBoost})</span>`;
                    }
                    this._cetakKartuPengemudi(k2_ZonaBoost, container);
                });

                const btnTolak = clone.querySelector('.tpl-btn-tolak');
                btnTolak.addEventListener('click', () => {
                    if (window.SystemReset) window.SystemReset();
                });
                
                container.appendChild(clone);
            }
        } else {
            const templateEmpty = document.getElementById('tpl-empty-drivers');
            if (templateEmpty) {
                container.appendChild(templateEmpty.content.cloneNode(true));
            }
        }
    }
};