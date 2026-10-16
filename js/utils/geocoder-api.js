// ==========================================
// MESIN GEOCODER TRIPLE-SHIELD + GOOGLE MAPS SMART EXTRACTOR & LOCAL VAULT (V8 - ZERO FALLBACK)
// ARSITEKTUR: STRICT INDONESIA BBOX, OLC PLUS-CODE DECODER, URL/COORD PARSER, & GAS UNFURLER
// ==========================================

window.GeocoderAPI = {
    _searchCacheKey: 'bgn_geo_fwd_cache_v3',
    _reverseCacheKey: 'bgn_geo_rev_cache_v3',
    _recentPlacesKey: 'bgn_recent_places_v1',
    _vaultPlacesKey: 'bgn_saved_places_vault_v1',

    _getCacheTtlMs: function() {
        const days = window.BGN_CONFIG.rules_app.geocoder_rules.cache_ttl_days;
        return days * 24 * 60 * 60 * 1000;
    },

    _getDynamicDefaultCenter: function() {
        if (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function') {
            return window.ConfigManager.getActiveZoneCenter();
        }
        return window.BGN_CONFIG.settings.map_config.default_center;
    },

    _getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
            return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
        }
        const R = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;

            let vault = this.getVaultPlaces();
            vault = vault.filter(item => {
                const sameName = (item.title ? item.title : '').toLowerCase() === cleanLabel.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= geoRules.vault_dedup_radius_km;
                return !sameName && !nearCoord;
            });

            vault.unshift({
                title: cleanLabel,
                subtitle: rawAddress ? rawAddress : `GMaps (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`,
                lat: nLat,
                lng: nLng,
                isVault: true,
                ts: Date.now()
            });

            if (vault.length > geoRules.max_vault_places) vault = vault.slice(0, geoRules.max_vault_places);
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

    getRecentPlaces: function() {
        try {
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
            const vault = this.getVaultPlaces();
            const rawRecent = localStorage.getItem(this._recentPlacesKey);
            const recent = rawRecent ? JSON.parse(rawRecent) : [];
            const validRecent = Array.isArray(recent) ? recent : [];

            const combined = [...vault];
            validRecent.forEach(r => {
                const exists = combined.some(v =>
                    (v.title ? v.title : '').toLowerCase() === (r.title ? r.title : '').toLowerCase() ||
                    this._getHaversineDistance(v.lat, v.lng, r.lat, r.lng) <= geoRules.recent_dedup_radius_km
                );
                if (!exists) combined.push(r);
            });

            return combined.slice(0, geoRules.max_combined_recent_places);
        } catch (e) {
            return [];
        }
    },

    saveRecentPlace: function(title, lat, lng, subtitle = '') {
        try {
            if (!title || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return;
            const wPins = window.BGN_CONFIG.wording.map_pins;
            const wGeo = window.BGN_CONFIG.wording.geocoder;
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;

            const cleanTitle = title.trim();
            if (cleanTitle.startsWith(wPins.map_point_prefix) || cleanTitle === wPins.gps_current_accurate || cleanTitle === wPins.gps_home_current) return;

            const nLat = parseFloat(parseFloat(lat).toFixed(6));
            const nLng = parseFloat(parseFloat(lng).toFixed(6));

            const raw = localStorage.getItem(this._recentPlacesKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            list = list.filter(item => {
                const sameName = (item.title ? item.title : '').toLowerCase() === cleanTitle.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= geoRules.recent_dedup_radius_km;
                return !sameName && !nearCoord;
            });

            list.unshift({
                title: cleanTitle,
                subtitle: subtitle ? subtitle : wGeo.saved_history_subtitle,
                lat: nLat,
                lng: nLng,
                isVault: false,
                ts: Date.now()
            });

            if (list.length > geoRules.max_recent_places) list = list.slice(0, geoRules.max_recent_places);
            localStorage.setItem(this._recentPlacesKey, JSON.stringify(list));
        } catch (e) {}
    },

    // ==========================================
    // 2. MESIN EKSTRAKTOR PINTAR GOOGLE MAPS (4-ENGINE HYBRID)
    // ==========================================
    _decodePlusCode: function(plusCodeStr, refLat, refLng) {
        const ALPHABET = "23456789CFGHJMPQRVWX";
        const match = plusCodeStr.toUpperCase().match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/);
        if (!match) return null;

        let code = match[1];
        const parts = code.split('+');
        const prefix = parts[0];
        const suffix = parts[1] ? parts[1] : '';

        let fullCode = code;
        if (prefix.length < 8) {
            const padCount = 8 - prefix.length;
            let latVal = Math.min(Math.max(refLat + 90, 0), 179.999999);
            let lngVal = Math.min(Math.max(refLng + 180, 0), 359.999999);

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

        if (prefix.length === 4) {
            if (centerLat - refLat > 0.5) centerLat -= 1.0;
            else if (refLat - centerLat > 0.5) centerLat += 1.0;

            if (centerLng - refLng > 0.5) centerLng -= 1.0;
            else if (refLng - centerLng > 0.5) centerLng += 1.0;
        }

        return { lat: parseFloat(centerLat.toFixed(6)), lng: parseFloat(centerLng.toFixed(6)), code: match[1] };
    },

    _parseGmapsStringOffline: function(rawText, defaultRefLat, defaultRefLng) {
        if (!rawText) return null;
        const text = rawText.trim();
        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const idBbox = window.BGN_CONFIG.rules_app.geocoder_rules.indonesia_bbox;
        const defCenter = this._getDynamicDefaultCenter();

        let extractedName = "";
        try {
            const decodedUrl = decodeURIComponent(text.replace(/\+/g, ' '));
            const placeMatch = decodedUrl.match(/\/maps\/place\/([^/@?]+)/i);
            if (placeMatch && placeMatch[1]) {
                extractedName = placeMatch[1].trim();
            }
        } catch (e) {}

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const nonUrlLines = lines.filter(l => !/^https?:\/\//i.test(l));
        if (!extractedName && nonUrlLines.length > 0) {
            extractedName = nonUrlLines[0].replace(/https?:\/\/\S+/gi, '').trim();
        }

        const isInsideIndonesia = (lat, lng) => (
            lat >= idBbox.min_lat && lat <= idBbox.max_lat && lng >= idBbox.min_lng && lng <= idBbox.max_lng
        );

        const bangMatch = text.match(/!3d(-?\d{1,2}\.\d{3,12})!4d(\d{2,3}\.\d{3,12})/);
        if (bangMatch) {
            const lat = parseFloat(bangMatch[1]);
            const lng = parseFloat(bangMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                return { lat, lng, name: extractedName ? extractedName : wGeo.gmaps_pin_name, method: "GMAPS_PIN_URL" };
            }
        }

        const atMatch = text.match(/(?:@|[?&](?:q|ll|query|destination|daddr)=)(-?\d{1,2}\.\d{3,12})\s*,\s*(\d{2,3}\.\d{3,12})/i);
        if (atMatch) {
            const lat = parseFloat(atMatch[1]);
            const lng = parseFloat(atMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                return { lat, lng, name: extractedName ? extractedName : wGeo.gmaps_coord_name, method: "GMAPS_COORD_URL" };
            }
        }

        const rawCoordMatch = text.match(/(-?\d{1,2}\.\d{3,12})\s*,\s*(\d{2,3}\.\d{3,12})/);
        if (rawCoordMatch) {
            const lat = parseFloat(rawCoordMatch[1]);
            const lng = parseFloat(rawCoordMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                const cleanLabel = text.replace(rawCoordMatch[0], '').replace(/[()]/g, '').trim();
                const resolvedName = cleanLabel ? cleanLabel : (extractedName ? extractedName : `${wGeo.precision_point_prefix} (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                return { lat, lng, name: resolvedName, method: "RAW_DECIMAL" };
            }
        }

        const dmsMatch = text.match(/(\d{1,2})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([NSns])\s*[, ]+\s*(\d{2,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([EWew])/);
        if (dmsMatch) {
            let lat = parseInt(dmsMatch[1], 10) + (parseInt(dmsMatch[2], 10) / 60) + (parseFloat(dmsMatch[3]) / 3600);
            if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
            let lng = parseInt(dmsMatch[5], 10) + (parseInt(dmsMatch[6], 10) / 60) + (parseFloat(dmsMatch[7]) / 3600);
            if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
            return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)), name: extractedName ? extractedName : wGeo.gmaps_dms_name, method: "DMS_COORD" };
        }

        let refLat = defaultRefLat !== null && !isNaN(defaultRefLat) ? defaultRefLat : defCenter.lat;
        let refLng = defaultRefLng !== null && !isNaN(defaultRefLng) ? defaultRefLng : defCenter.lng;
        const activeZones = window.BGN_CONFIG.zones.active_zones;
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
            const resolvedPlusName = labelAfterCode ? labelAfterCode : (extractedName ? extractedName : `${wGeo.plus_code_prefix} ${plusDecoded.code}`);
            return {
                lat: plusDecoded.lat,
                lng: plusDecoded.lng,
                name: resolvedPlusName,
                method: "PLUS_CODE"
            };
        }

        return null;
    },

    extractFromGoogleMapsInput: async function(rawInput) {
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
        const defCenter = this._getDynamicDefaultCenter();
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;

        if (!rawInput || rawInput.trim().length < minLen) {
            return { ok: false, error: wAlerts.gmaps_input_empty };
        }

        const text = rawInput.trim();
        const refLat = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lat : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : defCenter.lat);
        const refLng = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lng : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : defCenter.lng);

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

        const shortUrlMatch = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[a-zA-Z0-9_-]+/i);
        if (shortUrlMatch) {
            const shortUrl = shortUrlMatch[0];
            const prefixTitle = text.replace(shortUrl, '').replace(/\r?\n/g, ' ').trim();
            const mb = window.BGN_CONFIG.settings.micro_backend;
            const gasUrl = (mb.gas_unfurl_url && mb.gas_unfurl_url.trim() !== "") ? mb.gas_unfurl_url.trim() : mb.gas_fcm_url;

            if (gasUrl) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), geoRules.gas_unfurl_timeout_ms);
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
                                name: prefixTitle ? prefixTitle : (data.name ? data.name : wGeo.gmaps_share_name),
                                method: "GAS_UNFURL"
                            };
                        } else if (data && data.finalUrl) {
                            const fromFinal = this._parseGmapsStringOffline(data.finalUrl, refLat, refLng);
                            if (fromFinal) {
                                return {
                                    ok: true,
                                    lat: fromFinal.lat,
                                    lng: fromFinal.lng,
                                    name: prefixTitle ? prefixTitle : fromFinal.name,
                                    method: "GAS_REDIRECT_URL"
                                };
                            }
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
                                            name: prefixTitle ? prefixTitle : extractedQuery,
                                            method: "GAS_SEARCH_FALLBACK"
                                        };
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {
                    console.warn("[GMaps Bridge] GAS Unfurler timeout, mencoba ekstraksi teks prefix...");
                }
            }

            if (prefixTitle.length >= minLen) {
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
                error: wAlerts.gmaps_shortlink_error
            };
        }

        const features = await this.search(text, refLat, refLng);
        if (features && features.length > 0) {
            return {
                ok: true,
                lat: features[0].geometry.coordinates[1],
                lng: features[0].geometry.coordinates[0],
                name: features[0].text ? features[0].text : text,
                method: "ADDRESS_TEXT_SEARCH"
            };
        }

        return {
            ok: false,
            error: wAlerts.gmaps_parse_failed
        };
    },

    // ==========================================
    // 3. CACHE PENCARIAN & SPATIAL REVERSE
    // ==========================================
    _getSearchCache: function(queryKey) {
        try {
            const raw = localStorage.getItem(this._searchCacheKey);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            const entry = cache[queryKey];
            if (!entry) return null;

            if (entry.ts && (Date.now() - entry.ts < this._getCacheTtlMs()) && Array.isArray(entry.data)) {
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
            const maxEntries = window.BGN_CONFIG.rules_app.geocoder_rules.max_cache_entries;
            const raw = localStorage.getItem(this._searchCacheKey);
            let cache = raw ? JSON.parse(raw) : {};
            const keys = Object.keys(cache);
            if (keys.length >= maxEntries) delete cache[keys[0]];
            cache[queryKey] = { ts: Date.now(), data: features };
            localStorage.setItem(this._searchCacheKey, JSON.stringify(cache));
        } catch (e) {}
    },

    _getReverseCache: function(lat, lng) {
        try {
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
            const raw = localStorage.getItem(this._reverseCacheKey);
            if (!raw) return null;
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return null;

            const now = Date.now();
            const ttlMs = this._getCacheTtlMs();
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (item.ts && (now - item.ts < ttlMs)) {
                    if (this._getHaversineDistance(lat, lng, item.lat, item.lng) <= geoRules.reverse_cache_radius_km) {
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
            const wPins = window.BGN_CONFIG.wording.map_pins;
            const maxEntries = window.BGN_CONFIG.rules_app.geocoder_rules.max_cache_entries;
            if (!address || address.startsWith(wPins.map_point_prefix)) return;
            const raw = localStorage.getItem(this._reverseCacheKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            const now = Date.now();
            const ttlMs = this._getCacheTtlMs();
            list = list.filter(item => item.ts && (now - item.ts < ttlMs));
            if (list.length >= maxEntries) list.shift();

            list.push({
                lat: parseFloat(parseFloat(lat).toFixed(6)),
                lng: parseFloat(parseFloat(lng).toFixed(6)),
                address: address,
                ts: now
            });
            localStorage.setItem(this._reverseCacheKey, JSON.stringify(list));
        } catch (e) {}
    },

    _normalizeAndFilterIndonesia: function(features, refLat = null, refLng = null) {
        if (!Array.isArray(features)) return [];
        const valid = [];
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        const idBbox = geoRules.indonesia_bbox;
        const wGeo = window.BGN_CONFIG.wording.geocoder;

        for (let i = 0; i < features.length; i++) {
            const item = features[i];
            if (!item.geometry || !Array.isArray(item.geometry.coordinates)) continue;

            const lon = parseFloat(item.geometry.coordinates[0]);
            const lat = parseFloat(item.geometry.coordinates[1]);
            if (isNaN(lat) || isNaN(lon)) continue;

            if (lat < idBbox.min_lat || lat > idBbox.max_lat || lon < idBbox.min_lng || lon > idBbox.max_lng) continue;

            const p = item.properties ? item.properties : {};
            const rawCc = p.countrycode ? p.countrycode : (p.country_code ? p.country_code : '');
            const cc = rawCc.toUpperCase();
            if (cc && cc !== geoRules.country_code) continue;

            const fallbackTitle = p.name ? p.name : (p.street ? p.street : (p.locality ? p.locality : (p.district ? p.district : (p.city ? p.city : wGeo.detected_location))));
            const title = item.text ? item.text : fallbackTitle;
            const joinedParts = [p.street, p.locality, p.district, p.city, p.state].filter(Boolean).join(', ');
            const subtitle = item.place_name ? item.place_name : (joinedParts ? joinedParts : wGeo.default_region);

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

        if (refLat !== null && refLng !== null) {
            valid.sort((a, b) => a._distKm - b._distKm);
        }

        return valid;
    },

    // ==========================================
    // 4. PENCARIAN ALAMAT (BOUNDED INDONESIA + TRIPLE-SHIELD)
    // ==========================================
    search: async function(query, lat = null, lng = null) {
        const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
        if (!query || query.trim().length < minLen) return [];
        const cleanQuery = query.trim().toLowerCase();

        const defCenter = this._getDynamicDefaultCenter();
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        const wGeo = window.BGN_CONFIG.wording.geocoder;

        const refLat = (lat !== null && !isNaN(lat)) ? parseFloat(lat) : (window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lat : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : defCenter.lat));
        const refLng = (lng !== null && !isNaN(lng)) ? parseFloat(lng) : (window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lng : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : defCenter.lng));

        if (/(-?\d{1,2}\.\d{3,12}\s*,\s*\d{2,3}\.\d{3,12})|([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i.test(query)) {
            const direct = this._parseGmapsStringOffline(query, refLat, refLng);
            if (direct) {
                const subText = `${wGeo.precision_coord_prefix} (${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)})`;
                return [{
                    geometry: { type: 'Point', coordinates: [direct.lng, direct.lat] },
                    text: direct.name,
                    place_name: subText,
                    properties: { name: direct.name, place_name: subText }
                }];
            }
        }

        const cacheKey = `${cleanQuery}_${refLat.toFixed(2)}_${refLng.toFixed(2)}`;
        const cached = this._getSearchCache(cacheKey);
        if (cached && cached.length > 0) return cached;

        const geoCfg = window.BGN_CONFIG.settings.geocoder_api;
        const bboxDelta = geoRules.local_bbox_delta_deg;

        const minLon = (refLng - bboxDelta).toFixed(4);
        const minLat = (refLat - bboxDelta).toFixed(4);
        const maxLon = (refLng + bboxDelta).toFixed(4);
        const maxLat = (refLat + bboxDelta).toFixed(4);
        const bboxParam = `${minLon},${minLat},${maxLon},${maxLat}`;

        if (geoCfg.photon_search_url) {
            try {
                let photonUrl = geoCfg.photon_search_url.replace('{query}', encodeURIComponent(query.trim()));
                photonUrl += `&lat=${refLat}&lon=${refLng}&location_bias_scale=${geoRules.photon_location_bias_scale}&bbox=${bboxParam}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), geoRules.photon_search_timeout_ms);

                const res = await fetch(photonUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const filtered = this._normalizeAndFilterIndonesia(Array.isArray(data.features) ? data.features : [], refLat, refLng);
                    if (filtered.length > 0) {
                        this._setSearchCache(cacheKey, filtered);
                        return filtered;
                    }
                }
            } catch (photonErr) {
                console.warn("[GeocoderAPI] Photon Search sibuk, beralih ke cadangan MapTiler...");
            }
        }

        const templates = [geoCfg.search_url_template, geoCfg.backup_search_url_template].filter(Boolean);
        for (let i = 0; i < templates.length; i++) {
            try {
                let url = templates[i].replace('{query}', encodeURIComponent(query.trim()));
                url += `&country=${geoRules.country_code.toLowerCase()}&proximity=${refLng},${refLat}&bbox=${bboxParam}`;

                const res = await fetch(url);
                if (!res.ok) continue;

                const data = await res.json();
                const filtered = this._normalizeAndFilterIndonesia(Array.isArray(data.features) ? data.features : [], refLat, refLng);
                if (filtered.length > 0) {
                    this._setSearchCache(cacheKey, filtered);
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
        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return wGeo.invalid_coord;

        const nLat = parseFloat(lat);
        const nLng = parseFloat(lng);

        const cachedAddress = this._getReverseCache(nLat, nLng);
        if (cachedAddress) return cachedAddress;

        const geoCfg = window.BGN_CONFIG.settings.geocoder_api;
        const fallbackCoordText = `${wPins.map_point_prefix} (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`;

        const photonRevTemplate = geoCfg.photon_reverse_url;
        try {
            const photonRevUrl = photonRevTemplate.replace('{lat}', nLat).replace('{lng}', nLng);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), geoRules.photon_reverse_timeout_ms);

            const res = await fetch(photonRevUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                    const p = data.features[0].properties ? data.features[0].properties : {};
                    const locOrDist = p.locality ? p.locality : p.district;
                    const parts = [p.name, p.street, locOrDist, p.city].filter(Boolean);
                    const uniqueParts = [...new Set(parts)];
                    if (uniqueParts.length > 0) {
                        const address = uniqueParts.slice(0, 3).join(', ');
                        this._setReverseCache(nLat, nLng, address);
                        this.saveRecentPlace(address, nLat, nLng, wGeo.locked_map_point_subtitle);
                        return address;
                    }
                }
            }
        } catch (e) {
            console.warn("[GeocoderAPI] Photon Reverse sibuk, beralih ke cadangan MapTiler...");
        }

        const revTemplates = [geoCfg.reverse_url_template, geoCfg.backup_reverse_url_template].filter(Boolean);
        for (let i = 0; i < revTemplates.length; i++) {
            try {
                const url = revTemplates[i].replace('{lat}', nLat).replace('{lng}', nLng);
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();

                if (data.features && data.features.length > 0) {
                    const feat = data.features[0];
                    const p = feat.properties ? feat.properties : {};
                    const address = feat.place_name ? feat.place_name : (feat.text ? feat.text : (p.place_name ? p.place_name : (p.name ? p.name : fallbackCoordText)));
                    this._setReverseCache(nLat, nLng, address);
                    this.saveRecentPlace(address, nLat, nLng, wGeo.locked_map_point_subtitle);
                    return address;
                }
            } catch (e) {}
        }

        return fallbackCoordText;
    }
};