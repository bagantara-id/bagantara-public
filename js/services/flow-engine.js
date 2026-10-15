// ==========================================
// MESIN ALUR TERPUSAT (RIDE, CAR, EXPRESS) - BRUTAL DIAMOND V8 (ZERO FALLBACK)
// ARSITEKTUR: AUTO-LOCK GPS PICKUP, DIRECT SEARCH-TO-LOCK, & RECENT PLACES CHIPS
// ==========================================

window.FlowEngine = {
    _searchTimeout: null,
    _activeFocusedInputId: 'inputSearchDropoff1',

    init: function() {
        console.log(`[FlowEngine] Mesin aktif untuk layanan: ${window.BAGANTARA_SERVICE}`);
        this._activeFocusedInputId = 'inputSearchDropoff1';
        this.showSearchRoute();
    },

    setManualState: function(state) {
        if (state === 'DROPOFF_PIN') this.showDropoffMap();
        if (state === 'PICKUP') this.showPickupMap();
    },

    _lockFieldDirectly: function(inputId, title, fLat, fLng, subtitle = '') {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return;

        window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
        window.TEMPORARY_GEOCODE = title;
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;

        if (window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        const coordStr = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;

        if (inputId === 'inputSearchPickup') {
            const rawNote = document.getElementById('inputNotesPickup')?.value?.trim();
            const notes = rawNote ? rawNote : noNotes;
            window.BAGANTARA_PICKUP_COORD = coordStr;
            window.BAGANTARA_PICKUP_DETAIL = { kec: title, patokan: notes, patokan_awal: notes };
            inputEl.value = title;
            if (window.UIManager && window.UIManager.lockSearchField) {
                window.UIManager.lockSearchField('inputSearchPickup');
            }
        } else {
            const attrIdx = parseInt(inputEl.getAttribute('data-index'), 10);
            const idx = !isNaN(attrIdx) ? attrIdx : 1;
            const rawDropNote = document.getElementById('inputSearchNotes')?.value?.trim();
            const existingStopNote = window.BAGANTARA_MULTI_DROPOFFS?.[idx - 1]?.notes;
            const notes = idx === 1
                ? (rawDropNote ? rawDropNote : '')
                : (existingStopNote ? existingStopNote : '');

            if (idx === 1) {
                window.BAGANTARA_DROPOFF_COORD = coordStr;
                window.BAGANTARA_DROPOFF_DETAIL = { kec: title, patokan: notes };
            }

            if (!window.BAGANTARA_MULTI_DROPOFFS) window.BAGANTARA_MULTI_DROPOFFS = [];
            window.BAGANTARA_MULTI_DROPOFFS[idx - 1] = {
                lat: parseFloat(lat.toFixed(6)),
                lng: parseFloat(lng.toFixed(6)),
                name: title,
                notes: notes
            };

            inputEl.value = title;
            if (window.UIManager && window.UIManager.lockSearchField) {
                window.UIManager.lockSearchField(inputId);
            }
        }

        this._renderRecentPlacesChips();
    },

    _autoLockGpsPickup: function() {
        const pickupInput = document.getElementById('inputSearchPickup');
        if (!pickupInput || window.BAGANTARA_PICKUP_COORD || pickupInput.hasAttribute('readonly')) return;

        const wPins = window.BGN_CONFIG.wording.map_pins;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;

        const applyGpsCoord = (lat, lng) => {
            if (window.BAGANTARA_PICKUP_COORD || pickupInput.hasAttribute('readonly') || pickupInput.value.trim().length > 0) return;
            const labelGps = wPins.gps_current_accurate;
            const rawNote = document.getElementById('inputNotesPickup')?.value?.trim();
            const notes = rawNote ? rawNote : noNotes;
            window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
            window.BAGANTARA_PICKUP_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            window.BAGANTARA_PICKUP_DETAIL = { kec: labelGps, patokan: notes, patokan_awal: notes };
            pickupInput.value = labelGps;
            if (window.UIManager && window.UIManager.lockSearchField) {
                window.UIManager.lockSearchField('inputSearchPickup');
            }
        };

        if (window.BAGANTARA_ACTIVE_COORD && !isNaN(window.BAGANTARA_ACTIVE_COORD.lat)) {
            applyGpsCoord(window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng);
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                applyGpsCoord(pos.coords.latitude, pos.coords.longitude);
            }, () => {}, {
                enableHighAccuracy: false,
                timeout: mapRouting.gps_timeout_ms,
                maximumAge: mapRouting.gps_max_age_ms
            });
        }
    },

    _renderRecentPlacesChips: function() {
        const container = document.getElementById('recentPlacesRouteContainer');
        if (!container || !window.GeocoderAPI || typeof window.GeocoderAPI.getRecentPlaces !== 'function') return;

        const places = window.GeocoderAPI.getRecentPlaces();
        container.innerHTML = '';

        if (!places || places.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        places.forEach(p => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'recent-place-chip';
            const iconCls = p.isVault ? 'fa-solid fa-star text-gold' : 'fa-solid fa-clock-rotate-left text-gold';
            chip.innerHTML = `<i class="${iconCls}"></i> <span>${p.title}</span>`;
            chip.addEventListener('click', () => {
                let targetId = this._activeFocusedInputId ? this._activeFocusedInputId : 'inputSearchDropoff1';
                const targetEl = document.getElementById(targetId);

                if (!targetEl || targetEl.hasAttribute('readonly')) {
                    const drop1 = document.getElementById('inputSearchDropoff1');
                    const drop2 = document.getElementById('inputSearchDropoff2');
                    const drop3 = document.getElementById('inputSearchDropoff3');
                    const pickup = document.getElementById('inputSearchPickup');

                    if (drop1 && !drop1.hasAttribute('readonly')) targetId = 'inputSearchDropoff1';
                    else if (drop2 && !drop2.hasAttribute('readonly')) targetId = 'inputSearchDropoff2';
                    else if (drop3 && !drop3.hasAttribute('readonly')) targetId = 'inputSearchDropoff3';
                    else if (pickup && !pickup.hasAttribute('readonly')) targetId = 'inputSearchPickup';
                    else {
                        if (window.UIManager && window.UIManager.unlockSearchField) {
                            window.UIManager.unlockSearchField('inputSearchDropoff1');
                        }
                        targetId = 'inputSearchDropoff1';
                    }
                }

                const resultContainer = document.getElementById('searchRouteResults');
                if (resultContainer) resultContainer.classList.add('hidden');
                this._lockFieldDirectly(targetId, p.title, p.lat, p.lng, p.subtitle);
            });
            container.appendChild(chip);
        });
    },

    _bindSearchInput: function(inputId, resultContainerId) {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;
        
        if (inputEl.dataset.searchBound === 'true') return;
        inputEl.dataset.searchBound = 'true';

        const btnClear = inputEl.parentElement.querySelector('.btn-clear-input');

        inputEl.addEventListener('focus', () => {
            if (!inputEl.hasAttribute('readonly')) {
                this._activeFocusedInputId = inputId;
            }
        });

        const jalankanPencarian = async (query) => {
            if (window.UIManager && window.UIManager.renderSearchLoading) {
                window.UIManager.renderSearchLoading(resultContainerId);
            }

            let lat = null, lng = null;
            if (window.BAGANTARA_ACTIVE_COORD) {
                lat = window.BAGANTARA_ACTIVE_COORD.lat;
                lng = window.BAGANTARA_ACTIVE_COORD.lng;
            }

            const features = await window.GeocoderAPI.search(query, lat, lng);

            if (window.UIManager && window.UIManager.renderSearchResults) {
                window.UIManager.renderSearchResults(resultContainerId, features, (title, fLat, fLng, subtitle) => {
                    this._lockFieldDirectly(inputId, title, fLat, fLng, subtitle);
                });
            }
        };

        inputEl.addEventListener('input', (e) => {
            if (inputEl.hasAttribute('readonly')) return;
            this._activeFocusedInputId = inputId;
            const query = e.target.value.trim();
            if (btnClear) btnClear.style.display = query.length > 0 ? 'block' : 'none';

            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            const debounceMs = window.BGN_CONFIG.rules_app.map_and_routing.search_debounce_ms;

            const resultContainer = document.getElementById(resultContainerId);
            if (query.length < minLen) {
                clearTimeout(this._searchTimeout);
                if (resultContainer) resultContainer.classList.add('hidden');
                return;
            }

            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => jalankanPencarian(query), debounceMs); 
        });

        inputEl.addEventListener('keydown', (e) => {
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            if (e.key === 'Enter' && !inputEl.hasAttribute('readonly')) {
                e.preventDefault();
                const query = inputEl.value.trim();
                if (query.length >= minLen) {
                    clearTimeout(this._searchTimeout);
                    jalankanPencarian(query);
                }
            }
        });
    },

    showSearchRoute: function() {
        window.spaNavigateTo('view-search-route');
        document.getElementById('btnGlobalBack').style.display = 'block';
        document.getElementById('mainBottomNav').classList.add('hidden');
        
        const sv = document.getElementById('view-search-route');
        if (sv) { sv.classList.remove('compact-mode'); sv.classList.add('expanded-mode'); }

        this._bindSearchInput('inputSearchPickup', 'searchRouteResults');
        this._bindSearchInput('inputSearchDropoff1', 'searchRouteResults');

        this._autoLockGpsPickup();
        this._renderRecentPlacesChips();

        window.bindSafeButton('btnProceedToPickup', () => {
            const inputDrop1 = document.getElementById('inputSearchDropoff1');
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;

            if (!window.BAGANTARA_DROPOFF_COORD || !inputDrop1.hasAttribute('readonly')) {
                const msg = wAlerts.require_dropoff;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('require_dropoff', msg);
                else window.alert(msg);
                return;
            }
            if (!window.BAGANTARA_PICKUP_COORD) {
                const msg = wAlerts.require_pickup;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('require_pickup', msg);
                else window.alert(msg);
                return;
            }

            const rawPickupNote = document.getElementById('inputNotesPickup')?.value?.trim();
            const notePickupVal = rawPickupNote ? rawPickupNote : noNotes;
            if (window.BAGANTARA_PICKUP_DETAIL) {
                window.BAGANTARA_PICKUP_DETAIL.patokan = notePickupVal;
                window.BAGANTARA_PICKUP_DETAIL.patokan_awal = notePickupVal;
            }

            const rawDropNote = document.getElementById('inputSearchNotes')?.value?.trim();
            const noteDropVal = rawDropNote ? rawDropNote : '';
            if (window.BAGANTARA_DROPOFF_DETAIL && noteDropVal) {
                window.BAGANTARA_DROPOFF_DETAIL.patokan = noteDropVal;
            }
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[0] && noteDropVal) {
                window.BAGANTARA_MULTI_DROPOFFS[0].notes = noteDropVal;
            }

            if (window.BAGANTARA_SERVICE === 'EXPRESS') {
                this.showExpressDetails();
            } else {
                this.showFinal();
            }
        });

        if (window.UIManager && window.UIManager.checkFormReady) window.UIManager.checkFormReady();

        window.bindSafeButton('btnGlobalBack', () => { 
            if (window.SystemReset) window.SystemReset(); 
        });

        const prosesIntersepsiPeta = async (inputId, state) => {
            clearTimeout(this._searchTimeout);
            const input = document.getElementById(inputId);
            const query = input ? input.value.trim() : '';
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            const gpsLabel = window.BGN_CONFIG.wording.map_pins.gps_current_accurate;
            
            if (input && !input.hasAttribute('readonly') && query.length >= minLen && query !== gpsLabel) {
                let lat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : null;
                let lng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : null;
                
                if (window.GeocoderAPI) {
                    try {
                        const features = await window.GeocoderAPI.search(query, lat, lng);
                        if (features && features.length > 0) {
                            const fLat = features[0].geometry.coordinates[1];
                            const fLng = features[0].geometry.coordinates[0];
                            const props = features[0].properties ? features[0].properties : {};
                            const title = features[0].text ? features[0].text : (props.name ? props.name : query);
                            
                            window.BAGANTARA_ACTIVE_COORD = { lat: fLat, lng: fLng };
                            window.TEMPORARY_GEOCODE = title;
                            window.LOCKED_SEARCH_COORD = { lat: fLat, lng: fLng };
                            window.LOCKED_SEARCH_TEXT = title;
                        }
                    } catch (err) {
                        console.warn("[Interceptor] Geocoder gagal:", err);
                    }
                }
            }
            this.setManualState(state);
        };

        window.bindSafeButton('btnMapPickup', () => {
            prosesIntersepsiPeta('inputSearchPickup', 'PICKUP');
        });

        window.bindSafeButton('btnSelectViaMap', () => {
            window.BAGANTARA_MAP_TARGET_INDEX = 1;
            prosesIntersepsiPeta('inputSearchDropoff1', 'DROPOFF_PIN');
        });

        window.bindSafeButton('btnOpenGmapsRouteBridge', () => {
            if (!window.UIManager || typeof window.UIManager.openGmapsBridgeModal !== 'function') return;
            let targetId = this._activeFocusedInputId ? this._activeFocusedInputId : 'inputSearchDropoff1';
            const targetEl = document.getElementById(targetId);
            if (!targetEl || targetEl.hasAttribute('readonly')) {
                const drop1 = document.getElementById('inputSearchDropoff1');
                const drop2 = document.getElementById('inputSearchDropoff2');
                const drop3 = document.getElementById('inputSearchDropoff3');
                const pickup = document.getElementById('inputSearchPickup');
                if (drop1 && !drop1.hasAttribute('readonly')) targetId = 'inputSearchDropoff1';
                else if (drop2 && !drop2.hasAttribute('readonly')) targetId = 'inputSearchDropoff2';
                else if (drop3 && !drop3.hasAttribute('readonly')) targetId = 'inputSearchDropoff3';
                else if (pickup && !pickup.hasAttribute('readonly')) targetId = 'inputSearchPickup';
                else {
                    window.UIManager.unlockSearchField('inputSearchDropoff1');
                    targetId = 'inputSearchDropoff1';
                }
            }
            const rawCurrVal = document.getElementById(targetId)?.value?.trim();
            const currVal = rawCurrVal ? rawCurrVal : '';
            const gpsLabel = window.BGN_CONFIG.wording.map_pins.gps_current_accurate;
            const initQ = currVal === gpsLabel ? '' : currVal;
            window.UIManager.openGmapsBridgeModal((title, lat, lng, subtitle) => {
                this._lockFieldDirectly(targetId, title, lat, lng, subtitle);
            }, initQ);
        });

        window.bindSafeButton('btnAddStop', () => {
            if (window.UIManager && window.UIManager.addMultiStop) {
                const newInput = window.UIManager.addMultiStop(
                    'routeInputsArea', 'btnAddStop',
                    (inputId) => window.UIManager.unlockSearchField(inputId), 
                    (idx) => { 
                        window.BAGANTARA_MAP_TARGET_INDEX = idx;
                        prosesIntersepsiPeta(`inputSearchDropoff${idx}`, 'DROPOFF_PIN');
                    },
                    (idx) => { 
                        if (window.BAGANTARA_MULTI_DROPOFFS) window.BAGANTARA_MULTI_DROPOFFS[idx - 1] = null;
                        if (window.UIManager.checkFormReady) window.UIManager.checkFormReady();
                    }
                );
                if (newInput) {
                    this._bindSearchInput(newInput.id, 'searchRouteResults');
                    this._activeFocusedInputId = newInput.id;
                    newInput.focus();
                }
            }
        });

        window.bindSafeButton('btnNotePickup', () => {
            const area = document.getElementById('noteAreaPickup');
            if (area) {
                area.classList.toggle('hidden');
                if (!area.classList.contains('hidden')) document.getElementById('inputNotesPickup').focus();
            }
        });

        window.bindSafeButton('btnNoteDropoff', () => {
            const area = document.getElementById('noteAreaDropoff');
            if (area) {
                area.classList.toggle('hidden');
                if (!area.classList.contains('hidden')) document.getElementById('inputSearchNotes').focus();
            }
        });

        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'SEARCH_ROUTE' }));
    },

    showDropoffMap: function() {
        window.spaNavigateTo('view-map');
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const targetIdx = window.BAGANTARA_MAP_TARGET_INDEX ? window.BAGANTARA_MAP_TARGET_INDEX : 1;
        document.getElementById('wizardInstruction').innerText = targetIdx > 1 ? `${wPins.wizard_dropoff_multi_prefix}${targetIdx}` : wPins.wizard_dropoff;
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('notesContainer').classList.remove('hidden');
        
        const inputCatatan = document.getElementById('inputInlineNotes');
        if (inputCatatan) {
            const existingStopNote = window.BAGANTARA_MULTI_DROPOFFS?.[targetIdx - 1]?.notes;
            const rawSearchNote = document.getElementById('inputSearchNotes')?.value;
            const formNote = targetIdx === 1 ? (rawSearchNote ? rawSearchNote : '') : (existingStopNote ? existingStopNote : '');
            inputCatatan.value = formNote;
        }

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-dropoff';
        const txtDropoff = wBtns.dropoff;
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtDropoff}</span>`;

        window.bindSafeButton('btnWizardNext', async () => {
            const center = window.BAGANTARA_ACTIVE_COORD;
            const rawInlineNote = document.getElementById('inputInlineNotes').value.trim();
            const notes = rawInlineNote ? rawInlineNote : "";
            
            if (center) {
                let resolvedName = window.LOCKED_SEARCH_TEXT ? window.LOCKED_SEARCH_TEXT : window.TEMPORARY_GEOCODE;
                if (!window.LOCKED_SEARCH_TEXT && window.GeocoderAPI) {
                    const currBtn = document.getElementById('btnWizardNext');
                    if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${wBtns.locking_point}</span>`;
                    resolvedName = await window.GeocoderAPI.reverseGeocode(center.lat, center.lng);
                    window.TEMPORARY_GEOCODE = resolvedName;
                }

                const idx = window.BAGANTARA_MAP_TARGET_INDEX ? window.BAGANTARA_MAP_TARGET_INDEX : 1;
                const coordStr = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
                
                if (idx === 1) {
                    window.BAGANTARA_DROPOFF_COORD = coordStr;
                    window.BAGANTARA_DROPOFF_DETAIL = { kec: resolvedName, patokan: notes };
                    const formNoteEl = document.getElementById('inputSearchNotes');
                    if (formNoteEl && notes) formNoteEl.value = notes;
                }

                if (!window.BAGANTARA_MULTI_DROPOFFS) window.BAGANTARA_MULTI_DROPOFFS = [];
                window.BAGANTARA_MULTI_DROPOFFS[idx - 1] = {
                    lat: parseFloat(center.lat.toFixed(6)),
                    lng: parseFloat(center.lng.toFixed(6)),
                    name: resolvedName,
                    notes: notes
                };
                
                const input = document.getElementById(`inputSearchDropoff${idx}`);
                if (input) { 
                    input.value = resolvedName; 
                    if (window.UIManager && window.UIManager.lockSearchField) window.UIManager.lockSearchField(`inputSearchDropoff${idx}`); 
                }
            }
            this.showSearchRoute();
        });

        window.bindSafeButton('btnBackMap', () => { this.showSearchRoute(); });
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'DROPOFF_PIN' }));
    },

    showPickupMap: function() {
        window.spaNavigateTo('view-map');
        const isExpress = window.BAGANTARA_SERVICE === 'EXPRESS';
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        
        document.getElementById('wizardInstruction').innerText = isExpress ? wPins.wizard_pickup_express : wPins.wizard_pickup;
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('notesContainer').classList.remove('hidden');
        
        const inputCatatan = document.getElementById('inputInlineNotes');
        if (inputCatatan) {
            const rawFormNote = document.getElementById('inputNotesPickup')?.value;
            inputCatatan.value = rawFormNote ? rawFormNote : '';
        }

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-pickup';
        const txtPickup = isExpress ? wBtns.pickup_express : wBtns.pickup;
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtPickup}</span>`;

        window.bindSafeButton('btnWizardNext', async () => {
            const rawInlineNote = document.getElementById('inputInlineNotes').value.trim();
            const notes = rawInlineNote ? rawInlineNote : noNotes;
            let resolvedName = window.LOCKED_SEARCH_TEXT ? window.LOCKED_SEARCH_TEXT : window.TEMPORARY_GEOCODE;

            if (window.BAGANTARA_ACTIVE_COORD) {
                const c = window.BAGANTARA_ACTIVE_COORD;
                window.BAGANTARA_PICKUP_COORD = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

                if (!window.LOCKED_SEARCH_TEXT && window.GeocoderAPI) {
                    const currBtn = document.getElementById('btnWizardNext');
                    if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${wBtns.locking_point}</span>`;
                    resolvedName = await window.GeocoderAPI.reverseGeocode(c.lat, c.lng);
                    window.TEMPORARY_GEOCODE = resolvedName;
                }
            }
            
            window.BAGANTARA_PICKUP_DETAIL = { kec: resolvedName, patokan: notes, patokan_awal: notes };
            const formNotePickup = document.getElementById('inputNotesPickup');
            if (formNotePickup && notes !== noNotes) formNotePickup.value = notes;
            
            const input = document.getElementById('inputSearchPickup');
            if (input) {
                input.value = resolvedName;
                if (window.UIManager && window.UIManager.lockSearchField) window.UIManager.lockSearchField('inputSearchPickup');
            }
            
            if (!window.BAGANTARA_DROPOFF_COORD) {
                this.showSearchRoute();
            } else if (isExpress) {
                this.showExpressDetails();
            } else {
                this.showFinal();
            }
        });

        window.bindSafeButton('btnBackMap', () => { this.showSearchRoute(); });
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'PICKUP' }));
    },

    showExpressDetails: function() {
        window.spaNavigateTo('view-express-details');
        
        window.bindSafeButton('btnExpressProceed', () => {
            const item = document.getElementById('expressItemName').value.trim();
            const recName = document.getElementById('expressReceiverName').value.trim();
            const recPhone = document.getElementById('expressReceiverPhone').value.trim();
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
            const tplExpress = window.BGN_CONFIG.wording.templates.express_note_format;
            
            if (!item || !recName) {
                const msg = wAlerts.require_express_details;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('require_express_details', msg);
                else window.alert(msg);
                return;
            }

            const notes = window.BAGANTARA_PICKUP_DETAIL ? window.BAGANTARA_PICKUP_DETAIL.patokan_awal : noNotes;
            const recFull = recPhone ? `${recName} (${recPhone})` : recName;
            if (window.BAGANTARA_PICKUP_DETAIL) {
                window.BAGANTARA_PICKUP_DETAIL.patokan = tplExpress
                    .replace('{item}', item)
                    .replace('{receiver}', recFull)
                    .replace('{notes}', notes);
            }
            
            this.showFinal();
        });

        window.bindSafeButton('btnGlobalBack', () => { this.showSearchRoute(); });
    },

    showFinal: function() {
        window.spaNavigateTo('view-map');
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;
        
        const isPrelocked = window.BAGANTARA_PRELOCKED_DRIVER ? true : false;
        const driverName = isPrelocked ? window.BAGANTARA_PRELOCKED_DRIVER.nama.split(" ")[0] : "";
        
        document.getElementById('wizardInstruction').innerText = isPrelocked ? wPins.wizard_confirm_driver : wPins.wizard_confirm;
        document.getElementById('priceArea').classList.remove('hidden');
        document.getElementById('inlineAddressPanel').style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        
        if (isPrelocked) {
            btnNext.className = 'w-full step-final prelocked-btn'; 
            btnNext.style.background = 'linear-gradient(135deg, #10b981, #059669)'; 
            btnNext.style.color = '#fff';
            btnNext.style.border = 'none';
            btnNext.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
            btnNext.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">${wBtns.prelock_order_prefix} ${driverName.toUpperCase()}</span>`;
        } else {
            btnNext.className = 'btn-primary w-full step-final';
            btnNext.style.background = '';
            btnNext.style.color = '';
            btnNext.style.border = '';
            btnNext.style.boxShadow = '';
            const txtFinal = wBtns.final;
            btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
        }

        window.bindSafeButton('btnWizardNext', () => {
            if (navigator.vibrate) navigator.vibrate(50);
            const txtLoading = wBtns.loading;
            const activeBtn = document.getElementById('btnWizardNext');
            if (activeBtn) activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${txtLoading}</span>`;
            
            const eksekusiLanjutan = () => {
                if (activeBtn) {
                    if (isPrelocked) {
                        activeBtn.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">${wBtns.prelock_order_prefix} ${driverName.toUpperCase()}</span>`;
                    } else {
                        const txtFinal = wBtns.final;
                        activeBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                }
                if (window.AegisEngine) {
                    window.AegisEngine.renderMitraList(window.BAGANTARA_SERVICE, window.BAGANTARA_FINAL_PRICE);
                }
            };

            const maxRetries = mapRouting.price_check_max_retries;
            const retryIntervalMs = mapRouting.price_check_interval_ms;

            const cekHargaBerkala = (percobaan = 0) => {
                if (window.BAGANTARA_FINAL_PRICE && window.BAGANTARA_FINAL_PRICE > 0) {
                    eksekusiLanjutan();
                } else if (percobaan < maxRetries) {
                    setTimeout(() => cekHargaBerkala(percobaan + 1), retryIntervalMs); 
                } else {
                    if (activeBtn) {
                        if (isPrelocked) {
                            activeBtn.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">${wBtns.prelock_order_prefix} ${driverName.toUpperCase()}</span>`;
                        } else {
                            const txtFinal = wBtns.final;
                            activeBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                        }
                    }
                    const txtTimeout = wAlerts.calc_timeout;
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('calc_timeout', txtTimeout);
                    else window.alert(txtTimeout);
                }
            };
            
            cekHargaBerkala();
        });

        window.bindSafeButton('btnBackMap', () => { 
            if (window.BAGANTARA_SERVICE === 'EXPRESS') {
                this.showExpressDetails();
            } else {
                this.showSearchRoute(); 
            }
        });

        window.BAGANTARA_FINAL_PRICE = 0;
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'CALCULATE' }));
    }
};