// ==========================================
// MESIN GEOCODER TRIPLE-SHIELD + GOOGLE MAPS SMART EXTRACTOR & LOCAL VAULT (V5)
// ARSITEKTUR: STRICT INDONESIA BBOX, OLC PLUS-CODE DECODER, URL/COORD PARSER, & GAS UNFURLER
// ==========================================

window.GeocoderAPI = {
    _searchCacheKey: 'bgn_geo_fwd_cache_v3',
    _reverseCacheKey: 'bgn_geo_rev_cache_v3',
    _recentPlacesKey: 'bgn_recent_places_v1',
    _vaultPlacesKey: 'bgn_saved_places_vault_v1',
    _cacheTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 Hari

    _getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
            return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
        }
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    },

    // ==========================================
    // 1. BRANKAS LOKASI TERSIMPAN & RIWAYAT (LOCAL ADDRESS VAULT - 0 API REQUEST)
    // ==========================================
    getVaultPlaces: function() {
        try {
            const raw = localStorage.getItem(this._vaultPlacesKey);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    saveToVault: function(label, lat, lng, rawAddress = '') {
        try {
            if (!label || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return false;
            const cleanLabel = label.trim();
            const nLat = parseFloat(parseFloat(lat).toFixed(6));
            const nLng = parseFloat(parseFloat(lng).toFixed(6));

            let vault = this.getVaultPlaces();
            vault = vault.filter(item => {
                const sameName = (item.title || '').toLowerCase() === cleanLabel.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= 0.03;
                return !sameName && !nearCoord;
            });

            vault.unshift({
                title: cleanLabel,
                subtitle: rawAddress || `GMaps (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`,
                lat: nLat,
                lng: nLng,
                isVault: true,
                ts: Date.now()
            });

            if (vault.length > 30) vault = vault.slice(0, 30);
            localStorage.setItem(this._vaultPlacesKey, JSON.stringify(vault));
            return true;
        } catch (e) {
            return false;
        }
    },

    removeFromVault: function(title) {
        try {
            let vault = this.getVaultPlaces();
            vault = vault.filter(item => item.title !== title);
            localStorage.setItem(this._vaultPlacesKey, JSON.stringify(vault));
        } catch (e) {}
    },

    // Menggabungkan Brankas Favorit GMaps (⭐) + Riwayat Pencarian Terakhir (🕒)
    getRecentPlaces: function() {
        try {
            const vault = this.getVaultPlaces();
            const rawRecent = localStorage.getItem(this._recentPlacesKey);
            const recent = rawRecent ? JSON.parse(rawRecent) : [];
            const validRecent = Array.isArray(recent) ? recent : [];

            const combined = [...vault];
            validRecent.forEach(r => {
                const exists = combined.some(v =>
                    (v.title || '').toLowerCase() === (r.title || '').toLowerCase() ||
                    this._getHaversineDistance(v.lat, v.lng, r.lat, r.lng) <= 0.05
                );
                if (!exists) combined.push(r);
            });

            return combined.slice(0, 10);
        } catch (e) {
            return [];
        }
    },

    saveRecentPlace: function(title, lat, lng, subtitle = '') {
        try {
            if (!title || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return;
            const cleanTitle = title.trim();
            if (cleanTitle.startsWith('Titik Peta') || cleanTitle.includes('Lokasi GPS')) return;

            const nLat = parseFloat(parseFloat(lat).toFixed(6));
            const nLng = parseFloat(parseFloat(lng).toFixed(6));

            const raw = localStorage.getItem(this._recentPlacesKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            list = list.filter(item => {
                const sameName = (item.title || '').toLowerCase() === cleanTitle.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= 0.05;
                return !sameName && !nearCoord;
            });

            list.unshift({
                title: cleanTitle,
                subtitle: subtitle || 'Riwayat Tersimpan',
                lat: nLat,
                lng: nLng,
                isVault: false,
                ts: Date.now()
            });

            if (list.length > 6) list = list.slice(0, 6);
            localStorage.setItem(this._recentPlacesKey, JSON.stringify(list));
        } catch (e) {}
    },

    // ==========================================
    // 2. MESIN EKSTRAKTOR PINTAR GOOGLE MAPS (4-ENGINE HYBRID)
    // ==========================================
    // A. Dekoder Offline Open Location Code (Google Plus Code seperti "65JX+QJM Pare")
    _decodePlusCode: function(plusCodeStr, refLat, refLng) {
        const ALPHABET = "23456789CFGHJMPQRVWX";
        const match = plusCodeStr.toUpperCase().match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/);
        if (!match) return null;

        let code = match[1];
        const parts = code.split('+');
        const prefix = parts[0];
        const suffix = parts[1] || '';

        // Decode bagian lokal (setelah karakter ke-4 pada full code)
        let fullCode = code;
        if (prefix.length < 8) {
            // Short Plus Code (mis. 65JX+QJM -> panjang prefix 4). Gunakan refLat & refLng untuk memulihkan 4 digit area
            const padCount = 8 - prefix.length;
            let latVal = Math.min(Math.max(refLat + 90, 0), 179.999999);
            let lngVal = Math.min(Math.max(refLng + 180, 0), 359.999999);

            // Resolusi digit 1-2 (20 deg), digit 3-4 (1 deg)
            const d1Lat = Math.floor(latVal / 20);
            const d1Lng = Math.floor(lngVal / 20);
            const d2Lat = Math.floor(latVal % 20);
            const d2Lng = Math.floor(lngVal % 20);

            let areaPrefix = ALPHABET[d1Lat] + ALPHABET[d1Lng] + ALPHABET[d2Lat] + ALPHABET[d2Lng];
            fullCode = areaPrefix.substring(0, padCount) + prefix + '+' + suffix;
        }

        const clean = fullCode.replace('+', '');
        let southLat = -90.0;
        let westLng = -180.0;
        let latRes = 20.0;
        let lngRes = 20.0;

        for (let i = 0; i < Math.min(clean.length, 10); i += 2) {
            if (i > 0) {
                latRes /= 20.0;
                lngRes /= 20.0;
            }
            const latIdx = ALPHABET.indexOf(clean[i]);
            const lngIdx = ALPHABET.indexOf(clean[i + 1]);
            if (latIdx < 0 || lngIdx < 0) return null;

            southLat += latIdx * latRes;
            westLng += lngIdx * lngRes;
        }

        // Jika ada karakter ke-11 (grid 5x4)
        if (clean.length > 10) {
            const gIdx = ALPHABET.indexOf(clean[10]);
            if (gIdx >= 0) {
                latRes /= 5.0;
                lngRes /= 4.0;
                southLat += Math.floor(gIdx / 4) * latRes;
                westLng += (gIdx % 4) * lngRes;
            }
        }

        let centerLat = southLat + (latRes / 2.0);
        let centerLng = westLng + (lngRes / 2.0);

        // Koreksi kuadran terdekat terhadap titik referensi jika short code berada di dekat batas 1 derajat
        if (prefix.length === 4) {
            if (centerLat - refLat > 0.5) centerLat -= 1.0;
            else if (refLat - centerLat > 0.5) centerLat += 1.0;

            if (centerLng - refLng > 0.5) centerLng -= 1.0;
            else if (refLng - centerLng > 0.5) centerLng += 1.0;
        }

        return { lat: parseFloat(centerLat.toFixed(6)), lng: parseFloat(centerLng.toFixed(6)), code: match[1] };
    },

    // B. Parser URL Panjang Google Maps & Koordinat Mentah
    _parseGmapsStringOffline: function(rawText, defaultRefLat, defaultRefLng) {
        if (!rawText) return null;
        const text = rawText.trim();

        // 1. Cek Nama Tempat di dalam URL /place/Nama+Tempat/ atau parameter q=
        let extractedName = "";
        try {
            const decodedUrl = decodeURIComponent(text.replace(/\+/g, ' '));
            const placeMatch = decodedUrl.match(/\/maps\/place\/([^/@?]+)/i);
            if (placeMatch && placeMatch[1]) {
                extractedName = placeMatch[1].trim();
            }
        } catch (e) {}

        // Jika teks mengandung baris judul sebelum URL (format Share Google Maps HP)
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const nonUrlLines = lines.filter(l => !/^https?:\/\//i.test(l));
        if (!extractedName && nonUrlLines.length > 0) {
            extractedName = nonUrlLines[0].replace(/https?:\/\/\S+/gi, '').trim();
        }

        // 2. Prioritas Utama URL: Parameter Pin Bangunan Presisi (!3dLAT!4dLNG)
        const bangMatch = text.match(/!3d(-?\d{1,2}\.\d{3,12})!4d(\d{2,3}\.\d{3,12})/);
        if (bangMatch) {
            const lat = parseFloat(bangMatch[1]);
            const lng = parseFloat(bangMatch[2]);
            if (lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141) {
                return { lat, lng, name: extractedName || "Lokasi Pin Google Maps", method: "GMAPS_PIN_URL" };
            }
        }

        // 3. Prioritas Kedua URL: Parameter @LAT,LNG atau ?q=LAT,LNG atau ll=LAT,LNG
        const atMatch = text.match(/(?:@|[?&](?:q|ll|query|destination|daddr)=)(-?\d{1,2}\.\d{3,12})\s*,\s*(\d{2,3}\.\d{3,12})/i);
        if (atMatch) {
            const lat = parseFloat(atMatch[1]);
            const lng = parseFloat(atMatch[2]);
            if (lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141) {
                return { lat, lng, name: extractedName || "Titik Google Maps", method: "GMAPS_COORD_URL" };
            }
        }

        // 4. Prioritas Ketiga: Koordinat Desimal Mentah (Cth: "-7.768049, 112.196514")
        const rawCoordMatch = text.match(/(-?\d{1,2}\.\d{3,12})\s*,\s*(\d{2,3}\.\d{3,12})/);
        if (rawCoordMatch) {
            const lat = parseFloat(rawCoordMatch[1]);
            const lng = parseFloat(rawCoordMatch[2]);
            if (lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141) {
                const cleanLabel = text.replace(rawCoordMatch[0], '').replace(/[()]/g, '').trim();
                return { lat, lng, name: cleanLabel || extractedName || `Titik Presisi (${lat.toFixed(5)}, ${lng.toFixed(5)})`, method: "RAW_DECIMAL" };
            }
        }

        // 5. Prioritas Keempat: Koordinat DMS (Cth: 7°46'05.0"S 112°11'47.5"E)
        const dmsMatch = text.match(/(\d{1,2})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([NSns])\s*[, ]+\s*(\d{2,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([EWew])/);
        if (dmsMatch) {
            let lat = parseInt(dmsMatch[1], 10) + (parseInt(dmsMatch[2], 10) / 60) + (parseFloat(dmsMatch[3]) / 3600);
            if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
            let lng = parseInt(dmsMatch[5], 10) + (parseInt(dmsMatch[6], 10) / 60) + (parseFloat(dmsMatch[7]) / 3600);
            if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)), name: extractedName || "Titik DMS Google Maps", method: "DMS_COORD" };
        }

        // 6. Prioritas Kelima: Google Plus Code (Cth: "65JX+QJM Pare, Kediri")
        let refLat = defaultRefLat || -7.768049;
        let refLng = defaultRefLng || 112.196514;
        const activeZones = window.BGN_CONFIG?.zones?.active_zones || [];
        for (const z of activeZones) {
            if (z.city_name && text.toLowerCase().includes(z.city_name.toLowerCase())) {
                refLat = z.center.lat;
                refLng = z.center.lng;
                break;
            }
        }

        const plusDecoded = this._decodePlusCode(text, refLat, refLng);
        if (plusDecoded) {
            const labelAfterCode = text.replace(plusDecoded.code, '').replace(/^[\s,.-]+/, '').trim();
            return {
                lat: plusDecoded.lat,
                lng: plusDecoded.lng,
                name: labelAfterCode || extractedName || `Plus Code ${plusDecoded.code}`,
                method: "PLUS_CODE"
            };
        }

        return null;
    },

    // C. Orkestrator Utama Ekstraksi Input Google Maps (Offline First -> GAS Shortlink Unfurl -> Bounded Search)
    extractFromGoogleMapsInput: async function(rawInput) {
        if (!rawInput || rawInput.trim().length < 3) {
            return { ok: false, error: "Masukkan link Google Maps, Plus Code (XXXX+XXX), atau koordinat terlebih dahulu." };
        }

        const text = rawInput.trim();
        const refLat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : -7.768049;
        const refLng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : 112.196514;

        // TAHAP 1: Coba Ekstraksi Instan 0ms di Memori HP (Koordinat / URL Panjang / Plus Code)
        const offlineParsed = this._parseGmapsStringOffline(text, refLat, refLng);
        if (offlineParsed) {
            return {
                ok: true,
                lat: offlineParsed.lat,
                lng: offlineParsed.lng,
                name: offlineParsed.name,
                method: offlineParsed.method
            };
        }

        // TAHAP 2: Cek Apakah Mengandung Shortlink Google Maps (maps.app.goo.gl / goo.gl/maps)
        const shortUrlMatch = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[a-zA-Z0-9_-]+/i);
        if (shortUrlMatch) {
            const shortUrl = shortUrlMatch[0];
            const prefixTitle = text.replace(shortUrl, '').replace(/\r?\n/g, ' ').trim();
            const mb = window.BGN_CONFIG?.settings?.micro_backend || {};
            const gasUrl = (mb.gas_unfurl_url && mb.gas_unfurl_url.trim() !== "") ? mb.gas_unfurl_url.trim() : mb.gas_fcm_url;

            // Coba Unfurl melalui Micro-Backend GAS doGet(?action=unfurl&url=...)
            if (gasUrl) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6500);
                    const unfurlEndpoint = `${gasUrl}?action=unfurl&url=${encodeURIComponent(shortUrl)}`;
                    const res = await fetch(unfurlEndpoint, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.lat && data.lng) {
                            return {
                                ok: true,
                                lat: parseFloat(data.lat),
                                lng: parseFloat(data.lng),
                                name: prefixTitle || data.name || "Lokasi Share Google Maps",
                                method: "GAS_UNFURL"
                            };
                        } else if (data && data.finalUrl) {
                            const fromFinal = this._parseGmapsStringOffline(data.finalUrl, refLat, refLng);
                            if (fromFinal) {
                                return {
                                    ok: true,
                                    lat: fromFinal.lat,
                                    lng: fromFinal.lng,
                                    name: prefixTitle || fromFinal.name,
                                    method: "GAS_REDIRECT_URL"
                                };
                            }
                            // Jika redirect Google Maps menuju /maps/search/Nama+Tempat tanpa koordinat di URL
                            try {
                                const dec = decodeURIComponent(data.finalUrl.replace(/\+/g, ' '));
                                const searchMatch = dec.match(/\/maps\/(?:search|place)\/([^/?@]+)/i);
                                if (searchMatch && searchMatch[1]) {
                                    const extractedQuery = searchMatch[1].trim();
                                    const searchFeatures = await this.search(extractedQuery, refLat, refLng);
                                    if (searchFeatures && searchFeatures.length > 0) {
                                        return {
                                            ok: true,
                                            lat: searchFeatures[0].geometry.coordinates[1],
                                            lng: searchFeatures[0].geometry.coordinates[0],
                                            name: prefixTitle || extractedQuery,
                                            method: "GAS_SEARCH_FALLBACK"
                                        };
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {
                    console.warn("[GMaps Bridge] GAS Unfurler belum diaktifkan atau timeout, mencoba ekstraksi teks prefix...");
                }
            }

            // Jika ada nama tempat di depan link pendek (Cth: "RSUD Pare https://maps.app.goo.gl/...")
            if (prefixTitle.length >= 3) {
                const features = await this.search(prefixTitle, refLat, refLng);
                if (features && features.length > 0) {
                    return {
                        ok: true,
                        lat: features[0].geometry.coordinates[1],
                        lng: features[0].geometry.coordinates[0],
                        name: prefixTitle,
                        method: "SHORTLINK_PREFIX_SEARCH"
                    };
                }
            }

            return {
                ok: false,
                error: "Tautan pendek (maps.app.goo.gl) membutuhkan update fungsi doGet di GAS Anda, ATAU salin Koordinat / Kode Plus (Cth: 65JX+QJM) langsung dari detail tempat di Google Maps."
            };
        }

        // TAHAP 3: Jika Pengguna Menempelkan Alamat Lengkap Teks dari Google Maps
        const features = await this.search(text, refLat, refLng);
        if (features && features.length > 0) {
            return {
                ok: true,
                lat: features[0].geometry.coordinates[1],
                lng: features[0].geometry.coordinates[0],
                name: features[0].text || text,
                method: "ADDRESS_TEXT_SEARCH"
            };
        }

        return {
            ok: false,
            error: "Lokasi tidak terdeteksi dari teks tersebut. Tips Akurat 100%: Tekan & tahan titik di Google Maps lalu salin angka koordinatnya (Cth: -7.7680, 112.1965)."
        };
    },

    // ==========================================
    // 3. CACHE PENCARIAN & SPATIAL REVERSE (TTL 30 HARI)
    // ==========================================
    _getSearchCache: function(queryKey) {
        try {
            const raw = localStorage.getItem(this._searchCacheKey);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            const entry = cache[queryKey];
            if (!entry) return null;

            if (entry.ts && (Date.now() - entry.ts < this._cacheTtlMs) && Array.isArray(entry.data)) {
                return entry.data;
            }
            delete cache[queryKey];
            localStorage.setItem(this._searchCacheKey, JSON.stringify(cache));
            return null;
        } catch (e) {
            return null;
        }
    },

    _setSearchCache: function(queryKey, features) {
        try {
            const raw = localStorage.getItem(this._searchCacheKey);
            let cache = raw ? JSON.parse(raw) : {};
            const keys = Object.keys(cache);
            if (keys.length >= 80) delete cache[keys[0]];
            cache[queryKey] = { ts: Date.now(), data: features };
            localStorage.setItem(this._searchCacheKey, JSON.stringify(cache));
        } catch (e) {}
    },

    _getReverseCache: function(lat, lng) {
        try {
            const raw = localStorage.getItem(this._reverseCacheKey);
            if (!raw) return null;
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return null;

            const now = Date.now();
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (item.ts && (now - item.ts < this._cacheTtlMs)) {
                    if (this._getHaversineDistance(lat, lng, item.lat, item.lng) <= 0.075) {
                        return item.address;
                    }
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    _setReverseCache: function(lat, lng, address) {
        try {
            if (!address || address.startsWith('Titik Peta')) return;
            const raw = localStorage.getItem(this._reverseCacheKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            const now = Date.now();
            list = list.filter(item => item.ts && (now - item.ts < this._cacheTtlMs));
            if (list.length >= 80) list.shift();

            list.push({
                lat: parseFloat(parseFloat(lat).toFixed(6)),
                lng: parseFloat(parseFloat(lng).toFixed(6)),
                address: address,
                ts: now
            });
            localStorage.setItem(this._reverseCacheKey, JSON.stringify(list));
        } catch (e) {}
    },

    // FILTER KETAT INDONESIA & BOUNDING BOX ZONA (ANTI NYASAR KE LITUANIA / LUAR NEGERI!)
    _normalizeAndFilterIndonesia: function(features, refLat = null, refLng = null) {
        if (!Array.isArray(features)) return [];
        const valid = [];

        for (let i = 0; i < features.length; i++) {
            const item = features[i];
            if (!item.geometry || !Array.isArray(item.geometry.coordinates)) continue;

            const lon = parseFloat(item.geometry.coordinates[0]);
            const lat = parseFloat(item.geometry.coordinates[1]);
            if (isNaN(lat) || isNaN(lon)) continue;

            // 1. Kunci Geografis Mutlak Kepulauan Indonesia (Lat: -11 s/d 6, Lon: 95 s/d 141)
            if (lat < -11.2 || lat > 6.2 || lon < 94.8 || lon > 141.2) continue;

            const p = item.properties || {};
            const cc = (p.countrycode || p.country_code || '').toUpperCase();
            if (cc && cc !== 'ID') continue;

            const title = item.text || p.name || p.street || p.locality || p.district || p.city || "Lokasi Terdeteksi";
            const subtitle = item.place_name || [p.street, p.locality, p.district, p.city, p.state].filter(Boolean).join(', ') || "Jawa Timur, Indonesia";

            const distKm = (refLat !== null && refLng !== null && !isNaN(refLat) && !isNaN(refLng))
                ? this._getHaversineDistance(refLat, refLng, lat, lon)
                : 0;

            valid.push({
                geometry: item.geometry,
                text: title,
                place_name: subtitle,
                _distKm: distKm,
                properties: {
                    ...p,
                    name: title,
                    place_name: subtitle
                }
            });
        }

        // Urutkan hasil yang paling dekat dengan posisi pengguna/zona aktif
        if (refLat !== null && refLng !== null) {
            valid.sort((a, b) => a._distKm - b._distKm);
        }

        return valid;
    },

    // ==========================================
    // 4. PENCARIAN ALAMAT (BOUNDED INDONESIA + TRIPLE-SHIELD)
    // ==========================================
    search: async function(query, lat = null, lng = null) {
        if (!query || query.trim().length < 3) return [];
        const cleanQuery = query.trim().toLowerCase();

        const refLat = (lat !== null && !isNaN(lat)) ? parseFloat(lat) : (window.BAGANTARA_ACTIVE_COORD?.lat || -7.768049);
        const refLng = (lng !== null && !isNaN(lng)) ? parseFloat(lng) : (window.BAGANTARA_ACTIVE_COORD?.lng || 112.196514);

        // 0. Jika pengguna langsung mengetik koordinat atau Plus Code di kolom pencarian biasa, ekstrak instan!
        if (/(-?\d{1,2}\.\d{3,12}\s*,\s*\d{2,3}\.\d{3,12})|([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i.test(query)) {
            const direct = this._parseGmapsStringOffline(query, refLat, refLng);
            if (direct) {
                return [{
                    geometry: { type: 'Point', coordinates: [direct.lng, direct.lat] },
                    text: direct.name,
                    place_name: `Koordinat Presisi (${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)})`,
                    properties: { name: direct.name, place_name: `Koordinat Presisi (${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)})` }
                }];
            }
        }

        // 1. CEK CACHE LOKAL PERMANEN (0 REQUEST API)
        const cached = this._getSearchCache(cleanQuery);
        if (cached && cached.length > 0) return cached;

        const geoCfg = window.BGN_CONFIG?.settings?.geocoder_api || {};

        // Hitung Bounding Box Regional (~65 KM di sekitar pengguna/zona aktif agar hasil tetap relevan di Jawa Timur)
        const minLon = (refLng - 0.65).toFixed(4);
        const minLat = (refLat - 0.65).toFixed(4);
        const maxLon = (refLng + 0.65).toFixed(4);
        const maxLat = (refLat + 0.65).toFixed(4);
        const bboxParam = `${minLon},${minLat},${maxLon},${maxLat}`;

        // 2. PRIORITAS 1: PHOTON KOMOOT API DENGAN BBOX LOKAL (0 KUOTA MAPTILER & ANTI LUAR NEGERI)
        if (geoCfg.photon_search_url) {
            try {
                let photonUrl = geoCfg.photon_search_url.replace('{query}', encodeURIComponent(query.trim()));
                photonUrl += `&lat=${refLat}&lon=${refLng}&location_bias_scale=0.2&bbox=${bboxParam}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4500);

                const res = await fetch(photonUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const filtered = this._normalizeAndFilterIndonesia(data.features || [], refLat, refLng);
                    if (filtered.length > 0) {
                        this._setSearchCache(cleanQuery, filtered);
                        return filtered;
                    }
                }
            } catch (photonErr) {
                console.warn("[GeocoderAPI] Photon Search sibuk, beralih ke cadangan MapTiler...");
            }
        }

        // 3. PRIORITAS 2 (FALLBACK): MAPTILER API DENGAN FILTER NEGARA ID & PROXIMITY
        const templates = [geoCfg.search_url_template, geoCfg.backup_search_url_template].filter(Boolean);
        for (let i = 0; i < templates.length; i++) {
            try {
                let url = templates[i].replace('{query}', encodeURIComponent(query.trim()));
                url += `&country=id&proximity=${refLng},${refLat}&bbox=${bboxParam}`;

                const res = await fetch(url);
                if (!res.ok) continue;

                const data = await res.json();
                const filtered = this._normalizeAndFilterIndonesia(data.features || [], refLat, refLng);
                if (filtered.length > 0) {
                    this._setSearchCache(cleanQuery, filtered);
                    return filtered;
                }
            } catch (err) {}
        }

        return [];
    },

    // ==========================================
    // 5. REVERSE GEOCODE (SPATIAL 75M -> PHOTON REVERSE -> MAPTILER)
    // ==========================================
    reverseGeocode: async function(lat, lng) {
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return "Koordinat Tidak Valid";

        const nLat = parseFloat(lat);
        const nLng = parseFloat(lng);

        // 1. CEK SPATIAL CACHE 75 METER DI LOCALSTORAGE (0 REQUEST API)
        const cachedAddress = this._getReverseCache(nLat, nLng);
        if (cachedAddress) return cachedAddress;

        const geoCfg = window.BGN_CONFIG?.settings?.geocoder_api || {};
        const fallbackCoordText = `Titik Peta (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`;

        // 2. PRIORITAS 1: PHOTON REVERSE API (100% GRATIS & 0 KUOTA MAPTILER)
        const photonRevTemplate = geoCfg.photon_reverse_url || "https://photon.komoot.io/reverse?lon={lng}&lat={lat}";
        try {
            const photonRevUrl = photonRevTemplate.replace('{lat}', nLat).replace('{lng}', nLng);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(photonRevUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                    const p = data.features[0].properties || {};
                    const parts = [p.name, p.street, p.locality || p.district, p.city].filter(Boolean);
                    const uniqueParts = [...new Set(parts)];
                    if (uniqueParts.length > 0) {
                        const address = uniqueParts.slice(0, 3).join(', ');
                        this._setReverseCache(nLat, nLng, address);
                        this.saveRecentPlace(address, nLat, nLng, 'Titik Peta Terkunci');
                        return address;
                    }
                }
            }
        } catch (e) {
            console.warn("[GeocoderAPI] Photon Reverse sibuk, beralih ke cadangan MapTiler...");
        }

        // 3. PRIORITAS 2 (FALLBACK DARURAT): MAPTILER REVERSE (KEY UTAMA -> KEY CADANGAN)
        const revTemplates = [geoCfg.reverse_url_template, geoCfg.backup_reverse_url_template].filter(Boolean);
        for (let i = 0; i < revTemplates.length; i++) {
            try {
                const url = revTemplates[i].replace('{lat}', nLat).replace('{lng}', nLng);
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();

                if (data.features && data.features.length > 0) {
                    const feat = data.features[0];
                    const p = feat.properties || {};
                    const address = feat.place_name || feat.text || p.place_name || p.text || p.name || p.street || p.city || fallbackCoordText;
                    this._setReverseCache(nLat, nLng, address);
                    this.saveRecentPlace(address, nLat, nLng, 'Titik Peta Terkunci');
                    return address;
                }
            } catch (e) {}
        }

        return fallbackCoordText;
    }
};