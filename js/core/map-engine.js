// ==========================================
// MESIN PEMETAAN RUTE PENUMPANG (MAPTILER STREETS-V4 + QUOTA SHIELD)
// ARSITEKTUR: LAZY INIT, IDLE-ONLY TILE FETCH, ZERO-ANIMATION JUMP, AUTO-FAILOVER
// ==========================================

window.MapEngine = {
    mainMap: null,
    wizardLayer: null,
    osrmAbortController: null,
    _mainTileLoaded: false,
    _lastUserLat: -7.768049,
    _lastUserLng: 112.196514,
    
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

    _ensureTileLayer: function(mapInstance) {
        if (!mapInstance || this._mainTileLoaded) return;
        const defaultUrl = "https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=BaHHqDBvf8SyvIxFtx4r";
        const fallbackUrl = window.BGN_CONFIG?.settings?.map_config?.fallback_tile_url || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
        const mapUrl = window.BGN_CONFIG?.settings?.map_config?.tile_layer_url || defaultUrl;
        const mapZoom = window.BGN_CONFIG?.settings?.map_config?.max_zoom || 19;

        // KONFIGURASI HEMAT KUOTA MAPTILER:
        // updateWhenIdle: true -> Hanya muat tile setelah jari berhenti menggeser peta
        // updateWhenZooming: false -> Cegah request tile transisi saat zoom berubah
        const tileLayer = L.tileLayer(mapUrl, {
            maxZoom: mapZoom,
            tileSize: 256,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: 2
        }).addTo(mapInstance);

        let errorCount = 0;
        let usingFallback = false;
        tileLayer.on('tileerror', () => {
            errorCount++;
            if (!usingFallback && errorCount >= 4) {
                usingFallback = true;
                console.warn("[MapEngine] Beralih ke Basemap Cadangan...");
                tileLayer.setUrl(fallbackUrl);
            }
        });

        this._mainTileLoaded = true;
    },

    setupEventListeners: function() {
        window.addEventListener('wizardState', (e) => this.handleWizardState(e.detail));
        window.addEventListener('bgn_config_loaded', () => {
            if (this.mainMap) this._ensureTileLayer(this.mainMap);
        });
        
        const btnMyGPS = document.getElementById('btnMyGPS');
        if (btnMyGPS) {
            btnMyGPS.addEventListener('click', () => {
                if (navigator.geolocation && this.mainMap) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                        window.LOCKED_SEARCH_COORD = null;
                        window.LOCKED_SEARCH_TEXT = null;
                        // Gunakan setView tanpa animasi terbang jauh agar tidak memuat tile sepanjang lintasan
                        this.mainMap.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: false });
                    });
                }
            });
        }
    },

    initMainMap: function() {
        if (this.mainMap) {
            this._ensureTileLayer(this.mainMap);
            setTimeout(() => { this.mainMap.invalidateSize(); }, 100);
            return; 
        }
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        let startLat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : -7.768049;
        let startLng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : 112.196514;

        this.mainMap = L.map('map-container', {
            zoomControl: false,
            attributionControl: false,
            fadeAnimation: true,
            zoomAnimation: false // Hemat kuota tile transisi zoom
        }).setView([startLat, startLng], 16);
        
        if (!window.BAGANTARA_ACTIVE_COORD) {
            window.BAGANTARA_ACTIVE_COORD = { lat: startLat, lng: startLng };
        }

        this._ensureTileLayer(this.mainMap);
        this.wizardLayer = L.featureGroup().addTo(this.mainMap);

        if (navigator.geolocation && !window.LOCKED_SEARCH_COORD) {
            navigator.geolocation.getCurrentPosition((pos) => {
                this._lastUserLat = pos.coords.latitude;
                this._lastUserLng = pos.coords.longitude;
                if (!window.LOCKED_SEARCH_COORD) {
                    this.mainMap.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: false });
                    window.BAGANTARA_ACTIVE_COORD = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                }
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

        this.mainMap.on('movestart', () => {
            mapContainer.classList.add('map-is-moving');
            this.pinElements.label.innerText = window.BGN_CONFIG?.wording?.map_pins?.scanning || "MEMINDAI KOORDINAT...";
            window.dispatchEvent(new Event('mapIsMoving')); 
        });

        // ZERO REVERSE GEOCODE SAAT GESER PETA: Hemat >90% Kuota & Instan 0ms
        this.mainMap.on('moveend', () => {
            mapContainer.classList.remove('map-is-moving');
            if (navigator.vibrate) navigator.vibrate(30); 

            const center = this.mainMap.getCenter();
            window.BAGANTARA_ACTIVE_COORD = { lat: center.lat, lng: center.lng };
            this.updatePinVisual(this.activeMode); 
            
            let isLockedBySearch = false;
            if (window.LOCKED_SEARCH_COORD && window.LOCKED_SEARCH_TEXT) {
                const distanceShifted = this.getHaversineDistance(center.lat, center.lng, window.LOCKED_SEARCH_COORD.lat, window.LOCKED_SEARCH_COORD.lng);
                // Toleransi geser presisi rumah hingga 100 meter (0.1 KM) tetap mempertahankan nama hasil ketikan
                if (distanceShifted <= 0.1) isLockedBySearch = true;
            }
            
            if (isLockedBySearch) {
                window.TEMPORARY_GEOCODE = window.LOCKED_SEARCH_TEXT;
            } else {
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_COORD = null;
                window.TEMPORARY_GEOCODE = `Titik Peta (${center.lat.toFixed(5)}, ${center.lng.toFixed(5)})`;
            }

            const liveAddress = document.getElementById('liveAddressTitle');
            if (liveAddress) liveAddress.innerText = window.TEMPORARY_GEOCODE;
            window.dispatchEvent(new Event('mapStopped')); 
            
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
        // LAZY MAP SHIELD: Jangan inisialisasi peta atau muat tile saat pengguna masih di form ketik teks!
        if (state === 'SEARCH_ROUTE') return;

        this.initMainMap();

        let isJumpingFromSearch = false;
        if (window.BAGANTARA_ACTIVE_COORD && window.TEMPORARY_GEOCODE && window.LOCKED_SEARCH_COORD) {
            isJumpingFromSearch = true;
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
            
            setTimeout(() => { if (this.mainMap) this.mainMap.invalidateSize(); }, 100);
            if (finalPickup) this.calculatePrecisionRouteMulti(finalPickup);
        }
    },

    // ZERO-ANIMATION TELEPORT: Menggunakan setView({ animate: false }) agar tidak menyedot puluhan tile lintasan
    flyToCoordinate: function(coordStr) {
        if (coordStr) {
            const [lat, lng] = coordStr.split(',');
            if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                this.mainMap.setView([parseFloat(lat), parseFloat(lng)], 16, { animate: false });
            }
        } else if (window.BAGANTARA_ACTIVE_COORD) {
            this.mainMap.setView([window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng], 16, { animate: false });
        } else if (navigator.geolocation && !this.dropoffCoords) {
            navigator.geolocation.getCurrentPosition((pos) => { 
                this.mainMap.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: false }); 
            });
        }
    },

    getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
            return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
        }
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
            const osrmBase = window.BGN_CONFIG?.settings?.routing_api?.osrm_base_url || "https://router.project-osrm.org/route/v1/driving/";
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
                    setTimeout(() => {
                        if (this.wizardLayer && this.mainMap) {
                            this.mainMap.fitBounds(this.wizardLayer.getBounds(), { padding: [40, 40], animate: false });
                        }
                    }, 350);
                } else {
                    finalDistanceKm = fallbackDistance;
                }
            } catch (error) {
                if (error.name === 'AbortError') return; 
                finalDistanceKm = fallbackDistance;
            }

            finalDistanceKm = parseFloat(finalDistanceKm.toFixed(2));
            window.dispatchEvent(new CustomEvent('priceCalculated', { detail: { distance: finalDistanceKm } }));
        }, 350); 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MapEngine.init();
});