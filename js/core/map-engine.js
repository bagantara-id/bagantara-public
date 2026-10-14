// ==========================================
// MESIN PEMETAAN GLOBAL (NAVIGASI KLIEN & RADAR MITRA)
// ARSITEKTUR: SINGLE ENGINE, STRICT RULES JSON, MEMORY SAFE
// ==========================================

window.MapEngine = {
    mainMap: null,
    mitraMap: null,
    wizardLayer: null,
    mitraLayer: null,
    osrmAbortController: null,
    
    activeMode: 'DROPOFF',
    pickupCoords: null,
    dropoffCoords: null,
    
    pinElements: {
        container: document.createElement('div'),
        label: document.createElement('div'),
        marker: document.createElement('div'),
        shadow: document.createElement('div')
    },

    init: function() {
        this.setupEventListeners();
    },

    setupEventListeners: function() {
        window.addEventListener('wizardState', (e) => this.handleWizardState(e.detail));
        window.addEventListener('initMitraMapEvent', () => this.initMitraMap());
        
        const btnMyGPS = document.getElementById('btnMyGPS');
        if (btnMyGPS) {
            btnMyGPS.addEventListener('click', () => {
                if (navigator.geolocation && this.mainMap) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                        this.mainMap.flyTo([pos.coords.latitude, pos.coords.longitude], 17, { duration: 1 });
                    });
                }
            });
        }

        // Saraf Pengalih Tema (Siang/Malam) menggunakan Click Proxy
        const btnMapThemeToggle = document.getElementById('btnMapThemeToggle');
        if (btnMapThemeToggle) {
            btnMapThemeToggle.addEventListener('click', () => {
                const settingThemeBtn = document.getElementById('btnThemeToggleSettings');
                if (settingThemeBtn) settingThemeBtn.click(); // Memicu pergantian tema di app.js
                
                // Animasi & Ganti Ikon dinamis di Peta
                const icon = btnMapThemeToggle.querySelector('i');
                if (document.body.classList.contains('light-mode')) {
                    icon.className = 'fa-solid fa-moon';
                    btnMapThemeToggle.style.color = '#60a5fa';
                    btnMapThemeToggle.style.borderColor = 'rgba(96, 165, 250, 0.5)';
                } else {
                    icon.className = 'fa-solid fa-sun';
                    btnMapThemeToggle.style.color = '#f59e0b';
                    btnMapThemeToggle.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                }
            });
        }

        const btnRefresh = document.getElementById('btnRefreshMitraMap');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                const icon = btnRefresh.querySelector('i');
                if (icon) {
                    // Animasi putar balik halus 360 derajat ala iOS
                    icon.dataset.rot = (parseInt(icon.dataset.rot) || 0) - 360;
                    icon.style.transform = `rotate(${icon.dataset.rot}deg)`;
                }
                this.loadMitraData();
            });
        }
    },

    initMainMap: function() {
        if (this.mainMap) {
            setTimeout(() => { this.mainMap.invalidateSize(); }, 100);
            return; 
        }

        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        let startLat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : -7.768851;
        let startLng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : 112.196443;

        this.mainMap = L.map('map-container', { zoomControl: false, attributionControl: false }).setView([startLat, startLng], 15);
        
        if (!window.BAGANTARA_ACTIVE_COORD) {
            window.BAGANTARA_ACTIVE_COORD = { lat: startLat, lng: startLng };
        }

        // TAHAP AMAN (SAFE-FETCH): Menggunakan Optional Chaining (?.) untuk mencegah fatal crash
        const mapUrl = window.BGN_CONFIG?.settings?.map_config?.tile_layer_url;
        const mapZoom = window.BGN_CONFIG?.settings?.map_config?.max_zoom || 19;
        
        if (mapUrl) {
            L.tileLayer(mapUrl, { maxZoom: mapZoom }).addTo(this.mainMap);
        }
        
        this.wizardLayer = L.featureGroup().addTo(this.mainMap);

        if (navigator.geolocation && !window.LOCKED_SEARCH_COORD) {
            navigator.geolocation.getCurrentPosition((pos) => {
                this.mainMap.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
                window.BAGANTARA_ACTIVE_COORD = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            }, () => {});
        }

        this.setupCenterPin(mapContainer);
    },

    setupCenterPin: function(mapContainer) {
        this.pinElements.container.className = 'center-pin-container';
        this.pinElements.label.className = 'pin-label';
        this.pinElements.marker.className = 'css-pin-marker';
        this.pinElements.shadow.className = 'pin-shadow-base';
        
        this.pinElements.container.appendChild(this.pinElements.label);
        this.pinElements.container.appendChild(this.pinElements.shadow);
        this.pinElements.container.appendChild(this.pinElements.marker);
        mapContainer.appendChild(this.pinElements.container);

        this.updatePinVisual(this.activeMode);

        let mapMoveTimeout = null;

        this.mainMap.on('movestart', () => {
            mapContainer.classList.add('map-is-moving');
            this.pinElements.label.innerText = window.BGN_CONFIG?.wording?.map_pins?.scanning || "MEMINDAI KOORDINAT...";
            window.dispatchEvent(new Event('mapIsMoving')); 
        });

        this.mainMap.on('moveend', () => {
            mapContainer.classList.remove('map-is-moving');
            window.dispatchEvent(new Event('mapStopped')); 
            if (navigator.vibrate) navigator.vibrate(40); 

            const center = this.mainMap.getCenter();
            window.BAGANTARA_ACTIVE_COORD = { lat: center.lat, lng: center.lng };
            this.updatePinVisual(this.activeMode); 
            
            let isLockedBySearch = false;
            if (window.LOCKED_SEARCH_COORD && window.LOCKED_SEARCH_TEXT) {
                const distanceShifted = this.getHaversineDistance(center.lat, center.lng, window.LOCKED_SEARCH_COORD.lat, window.LOCKED_SEARCH_COORD.lng);
                if (distanceShifted <= 0.05) isLockedBySearch = true;
            }
            
            clearTimeout(mapMoveTimeout);
            mapMoveTimeout = setTimeout(() => {
                if (isLockedBySearch) {
                    window.TEMPORARY_GEOCODE = window.LOCKED_SEARCH_TEXT;
                    const liveAddress = document.getElementById('liveAddressTitle');
                    if (liveAddress) liveAddress.innerText = window.TEMPORARY_GEOCODE;
                } else {
                    window.LOCKED_SEARCH_TEXT = null;
                    window.LOCKED_SEARCH_COORD = null;
                    this.fetchAddressForForm(center.lat, center.lng);
                }
            }, 800);
            
            if (this.activeMode === 'DROPOFF') this.dropoffCoords = center;
            else if (this.activeMode === 'PICKUP' || this.activeMode === 'JASTIP_STORE') this.pickupCoords = center;
        });
    },

    updatePinVisual: function(mode) {
        const mapContainer = document.getElementById('map-container');
        const pinTypeIcon = document.getElementById('pinTypeIcon');
        const inputInlineNotes = document.getElementById('inputInlineNotes');
        const service = window.BAGANTARA_SERVICE || 'RIDE';
        const wMap = window.BGN_CONFIG?.wording?.map_pins || {};
        
        let labelDropoff = wMap.dropoff_default || 'TUJUAN (GESER)';
        let labelPickup = wMap.pickup_default || 'JEMPUT (GESER)';
        let placeholderNotes = wMap.notes_default || 'Ketik patokan akurat...';

        if (service === 'JASTIP') {
            if (mode === 'JASTIP_STORE') {
                labelPickup = wMap.pickup_jastip || 'LOKASI TOKO (GESER)';
                placeholderNotes = wMap.notes_jastip_store || 'Detail alamat toko / patokan...';
            } else {
                labelDropoff = wMap.dropoff_jastip || 'LOKASI PENGANTARAN (GESER)';
                placeholderNotes = wMap.notes_jastip_drop || 'Detail patokan pengantaran...';
            }
        } else if (service === 'EXPRESS') {
            labelPickup = wMap.pickup_express || 'AMBIL BARANG (GESER)';
            labelDropoff = wMap.dropoff_express || 'TUJUAN PENGIRIMAN';
            placeholderNotes = wMap.notes_express || 'Detail barang & kontak penerima...';
        } else if (service === 'CAR') {
            placeholderNotes = wMap.notes_car || 'Patokan, jumlah org, & brg bawaan...';
        }

        if (mode === 'DROPOFF') {
            this.pinElements.label.innerText = labelDropoff;
            this.pinElements.label.style.borderColor = '#ef4444'; 
            this.pinElements.label.style.color = '#ef4444';
            mapContainer.classList.remove('pickup-mode', 'jastip-store-mode'); 
            if(pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-location-dot'; pinTypeIcon.style.color = '#ef4444'; }
            this.pinElements.marker.style.background = '#ef4444';
            this.pinElements.marker.style.boxShadow = '0 0 10px #ef4444';
        } else if (mode === 'JASTIP_STORE') {
            this.pinElements.label.innerText = labelPickup; 
            this.pinElements.label.style.borderColor = '#3b82f6'; 
            this.pinElements.label.style.color = '#3b82f6';
            mapContainer.classList.remove('pickup-mode');
            mapContainer.classList.add('jastip-store-mode'); 
            if(pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-store'; pinTypeIcon.style.color = '#3b82f6'; }
            this.pinElements.marker.style.background = '#3b82f6';
            this.pinElements.marker.style.boxShadow = '0 0 10px #3b82f6';
        } else {
            this.pinElements.label.innerText = labelPickup;
            this.pinElements.label.style.borderColor = '#bd8c11'; 
            this.pinElements.label.style.color = '#bd8c11';
            mapContainer.classList.remove('jastip-store-mode');
            mapContainer.classList.add('pickup-mode'); 
            if(pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-location-crosshairs'; pinTypeIcon.style.color = '#bd8c11'; }
            this.pinElements.marker.style.background = '#bd8c11';
            this.pinElements.marker.style.boxShadow = '0 0 10px #bd8c11';
        }
        
        if (inputInlineNotes) inputInlineNotes.placeholder = placeholderNotes;
    },

    dropStaticMarker: function(mode, coords, indexLabel = '') {
        const pinColor = mode === 'PICKUP' ? '#bd8c11' : '#ef4444'; 
        const labelHtml = indexLabel ? `<div style="position: absolute; top: -20px; left: 16px; transform: translateX(-50%); background: rgba(0,0,0,0.85); border: 1px solid #bd8c11; border-radius: 12px; padding: 2px 8px; color: #bd8c11; font-weight: 900; font-size: 12px; font-family: 'Space Grotesk', sans-serif; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.8); pointer-events: none; white-space: nowrap;">${indexLabel}</div>` : '';
        
        const customIcon = L.divIcon({
            className: 'static-css-icon',
            html: `
                <div style="position:relative; width: 32px; height: 40px;">
                    <div class="pin-shadow-base"></div>
                    <div class="css-pin-marker" style="background: ${pinColor}; border-color: #fff; animation: none; box-shadow: 0 0 8px ${pinColor};"></div>
                    ${labelHtml}
                </div>
            `,
            iconSize: [32, 40], iconAnchor: [16, 38] 
        });

        L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(this.wizardLayer);
    },

    handleWizardState: function(state) {
        this.initMainMap();

        let isJumpingFromSearch = false;
        if (window.BAGANTARA_ACTIVE_COORD && window.TEMPORARY_GEOCODE) {
            const currentCenter = this.mainMap.getCenter();
            const distFromSearch = this.getHaversineDistance(currentCenter.lat, currentCenter.lng, window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng);

            if (distFromSearch > 0.01) {
                window.LOCKED_SEARCH_COORD = { lat: window.BAGANTARA_ACTIVE_COORD.lat, lng: window.BAGANTARA_ACTIVE_COORD.lng };
                window.LOCKED_SEARCH_TEXT = window.TEMPORARY_GEOCODE;
                isJumpingFromSearch = true;
            }
        }

        if (this.wizardLayer) this.wizardLayer.clearLayers();
        if (this.osrmAbortController) { this.osrmAbortController.abort(); this.osrmAbortController = null; }

        if (state === 'DROPOFF_PIN') {
            this.activeMode = 'DROPOFF';
            this.pinElements.container.style.display = 'flex';
            this.updatePinVisual('DROPOFF');
            
            const targetIdx = window.BAGANTARA_MAP_TARGET_INDEX || 1;
            let existingCoord = null;
            
            const multi = window.BAGANTARA_MULTI_DROPOFFS || [];
            multi.forEach((m, idx) => {
                if (m && (idx + 1) !== targetIdx && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                }
            });
            
            if (targetIdx === 1 && window.BAGANTARA_DROPOFF_COORD) existingCoord = window.BAGANTARA_DROPOFF_COORD;
            else if (multi && multi[targetIdx - 1]) existingCoord = `${multi[targetIdx - 1].lat},${multi[targetIdx - 1].lng}`;
            
            if (isJumpingFromSearch) {
                this.mainMap.setView([window.LOCKED_SEARCH_COORD.lat, window.LOCKED_SEARCH_COORD.lng], 17, { animate: false });
                setTimeout(() => { this.mainMap.invalidateSize(); }, 100);
            } else {
                this.flyToCoordinate(existingCoord);
            }
        } 
        else if (state === 'PICKUP' || state === 'JASTIP_STORE') {
            this.activeMode = state;
            this.pinElements.container.style.display = 'flex';
            this.updatePinVisual(state); 
            
            const multi = window.BAGANTARA_MULTI_DROPOFFS || [];
            if (multi.length > 0) {
                multi.forEach((m, idx) => {
                    if (m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                        this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                    }
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(lat), lng: parseFloat(lng) }, "1");
                }
            }
            
            setTimeout(() => { this.mainMap.invalidateSize(); }, 100);
            
            if (isJumpingFromSearch) {
                this.mainMap.setView([window.LOCKED_SEARCH_COORD.lat, window.LOCKED_SEARCH_COORD.lng], 17, { animate: false });
            } else {
                this.flyToCoordinate(window.BAGANTARA_PICKUP_COORD);
            }
        }
        else if (state === 'CALCULATE') {
            this.pinElements.container.style.display = 'none';
            
            let finalPickup = null;
            if (window.BAGANTARA_PICKUP_COORD) {
                const [lat, lng] = window.BAGANTARA_PICKUP_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    finalPickup = { lat: parseFloat(lat), lng: parseFloat(lng) };
                    this.dropStaticMarker('PICKUP', finalPickup);
                }
            }

            const multi = window.BAGANTARA_MULTI_DROPOFFS || [];
            if (multi.length > 0) {
                multi.forEach((m, idx) => {
                    if (m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                        this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                    }
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(lat), lng: parseFloat(lng) }, "1");
                }
            }
            
            if (finalPickup) this.calculatePrecisionRouteMulti(finalPickup);
        }
    },

    flyToCoordinate: function(coordStr) {
        if (coordStr) {
            const [lat, lng] = coordStr.split(',');
            if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                this.mainMap.flyTo([parseFloat(lat), parseFloat(lng)], 16, { duration: 0.5 });
            }
        } else if (window.BAGANTARA_ACTIVE_COORD) {
            this.mainMap.flyTo([window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng], 16, { duration: 0.5 });
        } else if (navigator.geolocation && !this.dropoffCoords) {
            navigator.geolocation.getCurrentPosition((pos) => { 
                this.mainMap.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.5 }); 
            });
        }
    },

    fetchAddressForForm: async function(lat, lng) {
        window.TEMPORARY_GEOCODE = window.BGN_CONFIG?.wording?.map_pins?.syncing || "Menyinkronkan data...";
        try {
            if (window.GeocoderAPI) {
                const address = await window.GeocoderAPI.reverseGeocode(lat, lng);
                window.TEMPORARY_GEOCODE = address;
            } else {
                window.TEMPORARY_GEOCODE = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }
        } catch (error) {
            window.TEMPORARY_GEOCODE = window.BGN_CONFIG?.wording?.map_pins?.sync_failed || "Gagal memuat detail wilayah.";
        }
        
        const liveAddress = document.getElementById('liveAddressTitle');
        if (liveAddress) liveAddress.innerText = window.TEMPORARY_GEOCODE;
    },

    getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    calculatePrecisionRouteMulti: function(startPoint) {
        if (this._routeTimeout) clearTimeout(this._routeTimeout);
        
        this._routeTimeout = setTimeout(async () => {
            const multi = window.BAGANTARA_MULTI_DROPOFFS || [];
            let segments = [startPoint];
            
            if (multi.length > 0) {
                multi.forEach(m => { 
                    if(m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) segments.push({ lat: parseFloat(m.lat), lng: parseFloat(m.lng) }); 
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) segments.push({ lat: parseFloat(lat), lng: parseFloat(lng) });
            }
            
            if (segments.length < 2) return;

            let coordStrs = segments.map(s => `${s.lng},${s.lat}`);
            
            // TAHAP AMAN (SAFE-FETCH): Menambahkan pengaman untuk API OSRM
            const osrmBase = window.BGN_CONFIG?.settings?.routing_api?.osrm_base_url;
            if (!osrmBase) {
                console.warn("[MapEngine] URL Routing OSRM tidak ditemukan di konfigurasi.");
                return; // Membatalkan proses dengan aman tanpa error layar putih
            }
            
            const osrmUrl = `${osrmBase}${coordStrs.join(';')}?overview=full&geometries=geojson`;
            
            let fallbackDistance = 0;
            for (let i = 0; i < segments.length - 1; i++) {
                fallbackDistance += this.getHaversineDistance(segments[i].lat, segments[i].lng, segments[i+1].lat, segments[i+1].lng);
            }
            fallbackDistance = fallbackDistance * 1.30; 

            let finalDistanceKm = 0;
            if (this.osrmAbortController) { this.osrmAbortController.abort(); }
            this.osrmAbortController = new AbortController();

            try {
                const response = await fetch(osrmUrl, { signal: this.osrmAbortController.signal });
                const data = await response.json();

                if (data.code === 'Ok') {
                    const route = data.routes[0];
                    const compensatedOsrm = (route.distance / 1000) * 1.15;
                    finalDistanceKm = (compensatedOsrm > fallbackDistance * 2) ? fallbackDistance : compensatedOsrm;

                    L.geoJSON(route.geometry, { style: { color: 'var(--route-line, #3b82f6)', weight: 6, opacity: 0.9 } }).addTo(this.wizardLayer);
                    setTimeout(() => { if (this.wizardLayer) this.mainMap.fitBounds(this.wizardLayer.getBounds(), { padding: [40, 40] }); }, 500);
                }
            } catch (error) {
                if (error.name === 'AbortError') return; 
                finalDistanceKm = fallbackDistance;
            }

            finalDistanceKm = parseFloat(finalDistanceKm.toFixed(2));
            window.dispatchEvent(new CustomEvent('priceCalculated', { detail: { distance: finalDistanceKm } }));
        }, 800); 
    },

    // ==========================================
    // 2. MESIN RADAR MITRA (RULES-APP TERPUSAT)
    // ==========================================
    initMitraMap: function() {
        if (this.mitraMap) {
            setTimeout(() => { this.mitraMap.invalidateSize(); }, 200);
            return;
        }

        const container = document.getElementById('mitra-map-container');
        if (!container) return;

        this.mitraMap = L.map('mitra-map-container', { zoomControl: false, attributionControl: false }).setView([-7.768851, 112.196443], 13);
        
        // TAHAP AMAN (SAFE-FETCH): Menggunakan Optional Chaining (?.) untuk mencegah fatal crash
        const mapUrl = window.BGN_CONFIG?.settings?.map_config?.tile_layer_url;
        
        if (mapUrl) {
            L.tileLayer(mapUrl, { maxZoom: 18 }).addTo(this.mitraMap);
        }
        
        this.mitraLayer = L.featureGroup().addTo(this.mitraMap);

        const updateMapFilter = () => {
            const pane = document.querySelector('#mitra-map-container .leaflet-tile-pane');
            if (pane) pane.style.filter = !document.body.classList.contains('light-mode') ? 'invert(90%) grayscale(20%) sepia(20%) hue-rotate(195deg) saturate(350%) brightness(85%) contrast(110%)' : 'none';
        };
        
        this.mitraMap.on('load', updateMapFilter);
        setTimeout(updateMapFilter, 300);

        this.loadMitraData();

        try {
            const appRules = window.BGN_CONFIG?.rules_app;
            if (appRules && appRules.radar_mitra && appRules.radar_mitra.polling_type === "interval") {
                const intervalSec = parseInt(appRules.radar_mitra.polling_interval_sec) || 20;
                let currentSec = intervalSec;
                
                const timerUI = document.getElementById('mitraCountdownText');
                if (this.radarInterval) clearInterval(this.radarInterval);
                
                this.radarInterval = setInterval(() => {
                    const viewRadar = document.getElementById('view-mitra-map');
                    if (viewRadar && viewRadar.classList.contains('active-view')) {
                        currentSec--;
                        
                        if (timerUI) {
                            timerUI.innerText = `${currentSec}d`;
                            timerUI.style.color = currentSec <= 5 ? '#ef4444' : '#10b981';
                            timerUI.style.background = currentSec <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';
                        }

                        if (currentSec <= 0) {
                            currentSec = intervalSec;
                            this.loadMitraData();
                        }
                    }
                }, 1000);
            }
        } catch (err) {
            console.warn("Sistem interval dihentikan karena rules gagal dimuat.", err);
        }
    },

    loadMitraData: async function() {
        const statusText = document.getElementById('mitraMapStatusText');
        const wRadar = window.BGN_CONFIG?.wording?.radar || {};
        if (statusText) statusText.innerText = wRadar.loading || "MEMUAT DATA...";

        if (!window.AegisEngine) return;

        try {
            const appRules = window.BGN_CONFIG?.rules_app;
            if (!appRules || !appRules.radar_mitra || !appRules.radar_mitra.is_active) {
                if (statusText) statusText.innerText = wRadar.disabled || "FITUR NONAKTIF";
                return;
            }

            const radarRules = appRules.radar_mitra;

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    
                    if (!this._userMarker) {
                        this.mitraMap.flyTo([lat, lng], 14, { duration: 1 });
                        const userIcon = L.divIcon({
                            className: 'custom-user-pin',
                            html: `<div style="width:14px; height:14px; background:#ef4444; border-radius:50%; border:2px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
                            iconSize: [14, 14], iconAnchor: [7, 7]
                        });
                        this._userMarker = L.marker([lat, lng], { icon: userIcon, interactive: false }).addTo(this.mitraLayer);
                    } else {
                        this._userMarker.setLatLng([lat, lng]);
                    }

                    const rtdbDrivers = await window.AegisEngine.getFirebaseDriversByGeohash(lat, lng);
                    
                    const maxRender = parseInt(radarRules.max_drivers_rendered) || 20;
                    const maxRadius = parseFloat(appRules.matchmaking?.max_scan_radius_km) || 5.0; 
                    let validDrivers = [];

                    Object.keys(rtdbDrivers).forEach(uid => {
                        const status = rtdbDrivers[uid].status || {};
                        const waktuSekarang = Date.now();
                        const isWaktuValid = !status.expiresAt || status.expiresAt > waktuSekarang;

                        if (status.isOnline && status.lat && status.lng && isWaktuValid) {
                            const dLat = parseFloat(status.lat);
                            const dLng = parseFloat(status.lng);
                            const jarak = this.getHaversineDistance(lat, lng, dLat, dLng);
                            const radDriver = parseFloat(status.radius) || 3.0;
                            
                            if (jarak <= maxRadius) {
                                validDrivers.push({ 
                                    uid: uid, lat: dLat, lng: dLng, jarak: jarak, 
                                    svc: status.layanan || "",
                                    armada: status.armada || "MOTOR",
                                    tarif_min: status.tarif_min || 10000,
                                    radius: radDriver,
                                    agenda: status.agenda || ""
                                });
                            }
                        }
                    });

                    validDrivers.sort((a, b) => a.jarak - b.jarak);
                    const limitedDrivers = validDrivers.slice(0, maxRender);

                    window.BAGANTARA_DRIVER_CACHE = window.BAGANTARA_DRIVER_CACHE || {};
                    this._driverMarkers = this._driverMarkers || {};
                    const currentActiveUids = new Set(limitedDrivers.map(d => d.uid));

                    limitedDrivers.forEach(driver => {
                        window.BAGANTARA_DRIVER_CACHE[driver.uid] = { 
                            layanan: driver.svc ? driver.svc.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0) : [],
                            armada: driver.armada,
                            tarif_min: driver.tarif_min,
                            radius: driver.radius,
                            agenda: driver.agenda
                        };
                        
                        if (this._driverMarkers[driver.uid]) {
                            this._driverMarkers[driver.uid].setLatLng([driver.lat, driver.lng]);
                            
                            const el = this._driverMarkers[driver.uid].getElement();
                            if (el && window.BAGANTARA_RADAR_FILTER) {
                                const targetFilter = window.BAGANTARA_RADAR_FILTER.toUpperCase();
                                let isMatch = true; 
                                if (targetFilter !== 'ALL') {
                                    if (targetFilter === 'CAR') isMatch = (driver.armada.toUpperCase() === 'MOBIL');
                                    else isMatch = (driver.armada.toUpperCase() === 'MOTOR' && window.BAGANTARA_DRIVER_CACHE[driver.uid].layanan.includes(targetFilter));
                                }
                                el.style.display = isMatch ? 'block' : 'none';
                            }
                        } else {
                            this._driverMarkers[driver.uid] = this.plotMitraPin(driver.uid, driver.lat, driver.lng, driver.armada);
                        }
                    });

                    Object.keys(this._driverMarkers).forEach(uid => {
                        if (!currentActiveUids.has(uid)) {
                            this.mitraLayer.removeLayer(this._driverMarkers[uid]);
                            delete this._driverMarkers[uid];
                        }
                    });
                    
                    if (statusText) statusText.innerText = "Mitra Aktif";
                }, () => {
                    if (statusText) statusText.innerText = wRadar.gps_denied || "GPS DITOLAK";
                }, { enableHighAccuracy: false, maximumAge: 30000 }); 
            }
        } catch (e) {
            if (statusText) statusText.innerText = wRadar.system_locked || "SISTEM TERKUNCI";
        }
    },

    plotMitraPin: function(uid, lat, lng, armada = "MOTOR") {
        let htmlPin = '';
        const jenisArmada = (armada || "MOTOR").toUpperCase();
        
        if (jenisArmada === 'MOBIL') {
            htmlPin = `
                <div class="bgn-vehicle-car">
                    <div class="windshield"></div>
                    <div class="rear-window"></div>
                </div>
            `;
        } else {
            htmlPin = `
                <div class="bgn-vehicle-bike">
                    <div class="helmet"></div>
                </div>
            `;
        }

        const driverIcon = L.divIcon({
            className: 'driver-pin-wrapper',
            html: htmlPin,
            iconSize: jenisArmada === 'MOBIL' ? [22, 38] : [14, 28], 
            iconAnchor: jenisArmada === 'MOBIL' ? [11, 19] : [7, 14]
        });

        const marker = L.marker([lat, lng], { icon: driverIcon, driverUid: uid }).addTo(this.mitraLayer);
        const popupContentNode = document.createElement('div');
        
        const tplLoading = document.getElementById('tpl-mitra-popup-loading');
        if (tplLoading) popupContentNode.appendChild(tplLoading.content.cloneNode(true));
        
        marker.bindPopup(popupContentNode, { closeButton: false, offset: [0, -10], minWidth: 160 });

        marker.on('popupopen', async () => {
            let cacheData = window.BAGANTARA_DRIVER_CACHE[uid];
            
            if (!cacheData) {
                try {
                    const dbUrl = window.BGN_CONFIG?.settings?.firebase_core?.databaseURL;
                    if (dbUrl) {
                        const rtdbRes = await fetch(`${dbUrl}/drivers.json?orderBy="$key"&equalTo="${uid}"`);
                        const rtdbData = await rtdbRes.json();
                        if (rtdbData && rtdbData[uid] && rtdbData[uid].status) {
                            const st = rtdbData[uid].status;
                            cacheData = {
                                layanan: st.layanan ? st.layanan.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0) : [],
                                armada: st.armada || "MOTOR",
                                tarif_min: st.tarif_min || 0,
                                radius: st.radius || 3.0,
                                agenda: st.agenda || ""
                            };
                            window.BAGANTARA_DRIVER_CACHE[uid] = cacheData;
                        }
                    }
                } catch (e) {
                    console.warn("[MapEngine] Gagal memulihkan cache popup pengemudi.", e);
                }
            }

            const fsData = await window.AegisEngine.fetchFirestoreDriver(uid);
            popupContentNode.innerHTML = ''; 
            
            if (cacheData && fsData && fsData.profile) {
                const tplPopup = document.getElementById('tpl-mitra-popup');
                if (tplPopup) {
                    const clone = tplPopup.content.cloneNode(true);
                    
                    const tarif = cacheData.tarif_min;
                    const arrayLayanan = cacheData.layanan || [];
                    const batasJarak = cacheData.radius;
                    const infoAgenda = cacheData.agenda && cacheData.agenda.trim() !== "" ? cacheData.agenda : "Tidak ada catatan khusus.";
                    const armadaType = (cacheData.armada || "MOTOR").toUpperCase();
                    
                    const spesifikasiDriver = armadaType === "MOBIL" ? "DRIVER MOBIL" : "DRIVER MOTOR";
                    
                    clone.querySelector('.tpl-driver-type').textContent = spesifikasiDriver;
                    
                    const elKendaraan = clone.querySelector('.tpl-kendaraan');
                    if (elKendaraan) elKendaraan.textContent = fsData.profile.kendaraan || 'Kendaraan Standar';
                    
                    clone.querySelector('.tpl-layanan').textContent = armadaType === "MOBIL" ? "CAR" : (arrayLayanan.join(", ") || "Tidak ditentukan");
                    clone.querySelector('.tpl-radius').textContent = `Radius ${batasJarak} KM`;
                    clone.querySelector('.tpl-info-agenda').textContent = `"${infoAgenda}"`;
                    clone.querySelector('.tpl-tarif').textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(tarif);
                    
                    const statusEl = clone.querySelector('.tpl-feasibility-status');
                    const containerServices = clone.querySelector('.tpl-dynamic-services');
                    
                    let userLat = 0, userLng = 0;
                    if (navigator.geolocation) {
                        try {
                            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout: 3000}));
                            userLat = pos.coords.latitude; 
                            userLng = pos.coords.longitude;
                        } catch(e) {
                            const center = this.mitraMap.getCenter();
                            userLat = center.lat; 
                            userLng = center.lng;
                        }
                    } else {
                        const center = this.mitraMap.getCenter();
                        userLat = center.lat; 
                        userLng = center.lng;
                    }

                    const jarakAktual = this.getHaversineDistance(userLat, userLng, lat, lng);
                    
                    if (jarakAktual <= batasJarak) {
                        statusEl.style.background = 'rgba(16, 185, 129, 0.15)';
                        statusEl.style.color = '#059669';
                        statusEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                        statusEl.innerHTML = `🟢 Jangkauan Aman (${jarakAktual.toFixed(1)} KM)`;
                        
                        if (containerServices) {
                            containerServices.style.display = 'flex';
                            containerServices.innerHTML = '';
                            
                            const listLayananTombol = armadaType === "MOBIL" ? ["CAR"] : arrayLayanan;
                            
                            if (listLayananTombol.length > 0) {
                                listLayananTombol.forEach(srvItem => {
                                    const srv = srvItem.toUpperCase();
                                    const btnSrv = document.createElement('button');
                                    
                                    let iconHtml = '<i class="fa-solid fa-crosshairs"></i>';
                                    if (srv === 'RIDE') iconHtml = '<i class="fa-solid fa-motorcycle"></i>';
                                    if (srv === 'CAR') iconHtml = '<i class="fa-solid fa-car"></i>';
                                    if (srv === 'EXPRESS') iconHtml = '<i class="fa-solid fa-cube"></i>';
                                    if (srv === 'JASTIP') iconHtml = '<i class="fa-solid fa-bag-shopping"></i>';

                                    btnSrv.innerHTML = `${iconHtml} PESAN ${srv}`;
                                    btnSrv.style.cssText = 'width: 100%; background: #02040a; color: #ceab6b; border: 1px solid #ceab6b; padding: 8px; font-size: 10px; font-weight: 900; border-radius: 6px; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s;';
                                    
                                    btnSrv.addEventListener('click', () => {
                                        const prelockedData = {
                                            uid: uid,
                                            nama: fsData.profile.nama || 'Driver',
                                            wa: fsData.profile.wa || '',
                                            fotoProfile: fsData.profile.fotoUrl || './assets/icon-192.png',
                                            tarifMin: tarif,
                                            info: infoAgenda,
                                            kendaraan: fsData.profile.kendaraan || 'Kendaraan Standar',
                                            armada: armadaType,
                                            layanan: arrayLayanan 
                                        };
                                        
                                        if (window.SystemReset) window.SystemReset(); 
                                        window.BAGANTARA_PRELOCKED_DRIVER = prelockedData;
                                        
                                        if (window.ServiceRouter) window.ServiceRouter.route(srv); 
                                        else window.spaNavigateTo('view-dashboard'); 
                                        
                                        const alertExact = window.BGN_CONFIG?.wording?.alerts?.driver_locked_exact || "Driver <b>{nama}</b> dikunci untuk layanan <b>{srv}</b>.<br><br>Silakan tentukan titik jemput dan tujuan Anda.";
                                        const msgExact = alertExact.replace('{nama}', prelockedData.nama).replace('{srv}', srv);
                                        
                                        if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msgExact);
                                        else window.alert(msgExact.replace(/<[^>]*>?/gm, ''));
                                    });
                                    
                                    containerServices.appendChild(btnSrv);
                                });
                            } else {
                                containerServices.innerHTML = `<div style="font-size: 9px; color: #ef4444; text-align: center;">Layanan tidak diset</div>`;
                            }
                        }
                    } else {
                        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
                        statusEl.style.color = '#ef4444';
                        statusEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                        statusEl.innerHTML = `🔴 Di Luar Radius (${jarakAktual.toFixed(1)} KM)`;
                        if (containerServices) containerServices.style.display = 'none';
                    }

                    try {
                        const appRules = window.BGN_CONFIG?.rules_app || {};
                        const batasOfflineMs = (appRules.matchmaking?.max_offline_age_minutes || 5) * 60000;
                        
                        const dbUrl = window.BGN_CONFIG?.settings?.firebase_core?.databaseURL;
                        if (dbUrl) {
                            const rtdbRes = await fetch(`${dbUrl}/drivers/${uid}/status/timestamp.json`);
                            const rtdbTimestamp = await rtdbRes.json();
                            
                            if (rtdbTimestamp) {
                                const selisihWaktu = Date.now() - rtdbTimestamp; 
                                const staleEl = clone.querySelector('.tpl-stale-warning');
                                const btnManualWa = clone.querySelector('.tpl-btn-manual-wa');
                                
                                let textWaktu = "";
                                const selisihMenit = Math.floor(selisihWaktu / 60000);
                                if (selisihMenit < 1) textWaktu = "Baru saja aktif";
                                else if (selisihMenit < 60) textWaktu = `Aktif ${selisihMenit} menit lalu`;
                                else {
                                    const selisihJam = Math.floor(selisihMenit / 60);
                                    if (selisihJam < 24) textWaktu = `Aktif ${selisihJam} jam lalu`;
                                    else textWaktu = "Aktif kemarin";
                                }

                                if (selisihWaktu > batasOfflineMs) {
                                    if (staleEl) {
                                        staleEl.style.display = 'block';
                                        staleEl.style.background = '#fef2f2';
                                        staleEl.style.border = '1px solid #fecaca';
                                        staleEl.innerHTML = `<div style="font-size: 8px; color: #ef4444; font-weight: bold; text-align: center;"><i class="fa-solid fa-clock"></i> ${textWaktu}</div>`;
                                    }
                                    if (containerServices) containerServices.style.display = 'none'; 
                                    statusEl.style.display = 'none'; 
                                    
                                    if (btnManualWa && fsData.profile.wa) {
                                        btnManualWa.style.display = 'block';
                                        btnManualWa.addEventListener('click', () => {
                                            window.open(`https://wa.me/${fsData.profile.wa}?text=Halo,%20apakah%20Anda%20masih%20aktif%20menerima%20pesanan%20Bagantara?`, '_blank');
                                        });
                                    }
                                } else {
                                    if (selisihMenit >= 2 && staleEl) {
                                        staleEl.style.display = 'block';
                                        staleEl.style.background = '#fefce8';
                                        staleEl.style.border = '1px solid #fef08a';
                                        staleEl.innerHTML = `<div style="font-size: 8px; color: #a16207; font-weight: bold; text-align: center;"><i class="fa-solid fa-clock"></i> ${textWaktu}</div>`;
                                    }
                                }
                            }
                        }
                    } catch(e) {
                        console.warn("Gagal mengecek timestamp:", e);
                    }

                    popupContentNode.appendChild(clone);
                    
                    setTimeout(() => {
                        if (marker.getPopup()) marker.getPopup().update();
                    }, 50);
                }
            } else {
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = "font-family:Outfit; font-size: 12px; text-align:center;";
                errorDiv.textContent = "Info tidak tersedia.";
                popupContentNode.appendChild(errorDiv);
            }
        });

        return marker;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MapEngine.init();
});

/* ==========================================
   SMART RADAR 2.0 - HYBRID ENGINE FILTER
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    window.BAGANTARA_RADAR_FILTER = 'ALL';
    window.BAGANTARA_DRIVER_CACHE = window.BAGANTARA_DRIVER_CACHE || {};

    const filterChips = document.querySelectorAll('.radar-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', async (e) => {
            filterChips.forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            window.BAGANTARA_RADAR_FILTER = e.target.getAttribute('data-filter');
            
            try {
                if(window.MapEngine && window.MapEngine.mitraLayer) {
                    window.MapEngine.mitraLayer.eachLayer((marker) => {
                        const uid = marker.options.driverUid;
                        if(!uid) return;
                        
                        const cacheData = window.BAGANTARA_DRIVER_CACHE[uid];
                        if (!cacheData) return;
                        
                        const armada = (cacheData.armada || "MOTOR").toUpperCase();
                        const layananList = cacheData.layanan || [];
                        const targetFilter = window.BAGANTARA_RADAR_FILTER.toUpperCase();
                        let isMatch = true; 
                        
                        if (targetFilter !== 'ALL') {
                            if (targetFilter === 'CAR') {
                                isMatch = (armada === 'MOBIL');
                            } else {
                                if (armada === 'MOTOR' && layananList.length > 0) {
                                    isMatch = layananList.map(l => l.toUpperCase()).includes(targetFilter);
                                } else {
                                    isMatch = false;
                                }
                            }
                        }
                        
                        const iconEl = marker.getElement();
                        if (iconEl) {
                            if(isMatch) {
                                iconEl.style.display = 'block'; 
                            } else {
                                iconEl.style.display = 'none'; 
                                if (marker.isPopupOpen()) marker.closePopup();
                            }
                        }
                    });
                }
            } catch (error) {
                console.warn("[Filter] Eksekusi filter gagal.");
            }
        });
    });
    
    if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const el = document.getElementById('radarUserAddress');
            
            if(el && window.GeocoderAPI) {
                const address = await window.GeocoderAPI.reverseGeocode(lat, lng);
                el.textContent = address;
            } else if(el) {
                el.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        }, null, {enableHighAccuracy: true, timeout: 5000, maximumAge: 60000});
    }
});