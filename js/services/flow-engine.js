// ==========================================
// MESIN ALUR TERPUSAT (RIDE, CAR, EXPRESS) - UNIFIED V2.0
// ARSITEKTUR: SINGLE FILE (DRY), BYPASS PRELOCK SUPPORT
// ==========================================

window.FlowEngine = {
    _searchTimeout: null,

    init: function() {
        console.log(`[FlowEngine] Mesin aktif untuk layanan: ${window.BAGANTARA_SERVICE}`);
        this.showSearchRoute();
    },

    setManualState: function(state) {
        if (state === 'DROPOFF_PIN') this.showDropoffMap();
        if (state === 'PICKUP') this.showPickupMap();
    },

    _bindSearchInput: function(inputId, resultContainerId) {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;
        
        if (inputEl.dataset.searchBound === 'true') return;
        inputEl.dataset.searchBound = 'true';

        const btnClear = inputEl.parentElement.querySelector('.btn-clear-input');

        inputEl.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (btnClear) btnClear.style.display = query.length > 0 ? 'block' : 'none';

            const resultContainer = document.getElementById(resultContainerId);
            if (query.length < 3) {
                if (resultContainer) resultContainer.classList.add('hidden');
                return;
            }

            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(async () => {
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
                    window.UIManager.renderSearchResults(resultContainerId, features, (title, fLat, fLng) => {
                        inputEl.value = title;
                        window.BAGANTARA_ACTIVE_COORD = { lat: fLat, lng: fLng };
                        window.TEMPORARY_GEOCODE = title;
                        
                        window.LOCKED_SEARCH_COORD = { lat: fLat, lng: fLng };
                        window.LOCKED_SEARCH_TEXT = title;

                        if (inputId === 'inputSearchPickup') {
                            this.setManualState('PICKUP');
                        } else {
                            window.BAGANTARA_MAP_TARGET_INDEX = parseInt(inputEl.getAttribute('data-index')) || 1;
                            this.setManualState('DROPOFF_PIN');
                        }
                    });
                }
            }, 600); 
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

        window.bindSafeButton('btnProceedToPickup', () => {
            const inputDrop1 = document.getElementById('inputSearchDropoff1');
            const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};

            if (!window.BAGANTARA_DROPOFF_COORD || !inputDrop1.hasAttribute('readonly')) {
                const msg = wAlerts.require_dropoff || "Harap kunci minimal 1 lokasi tujuan terlebih dahulu.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            if (!window.BAGANTARA_PICKUP_COORD) {
                const msg = wAlerts.require_pickup || "Lokasi penjemputan belum ditentukan.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            this.showPickupMap(); 
        });

        if (window.UIManager && window.UIManager.checkFormReady) window.UIManager.checkFormReady();

        window.bindSafeButton('btnGlobalBack', () => { 
            if (window.SystemReset) window.SystemReset(); 
        });

        const prosesIntersepsiPeta = async (inputId, state) => {
            const input = document.getElementById(inputId);
            const query = input ? input.value.trim() : '';
            
            if (input && !input.hasAttribute('readonly') && query.length >= 3) {
                let lat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : null;
                let lng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : null;
                
                if (window.GeocoderAPI) {
                    try {
                        const features = await window.GeocoderAPI.search(query, lat, lng);
                        if (features && features.length > 0) {
                            const fLat = features[0].geometry.coordinates[1];
                            const fLng = features[0].geometry.coordinates[0];
                            const props = features[0].properties;
                            const title = props.name || props.street || props.city || query;
                            
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
            const targetIdx = window.BAGANTARA_MAP_TARGET_INDEX || 1;
            prosesIntersepsiPeta(`inputSearchDropoff${targetIdx}`, 'DROPOFF_PIN');
        });

        window.bindSafeButton('btnAddStop', () => {
            if (window.UIManager && window.UIManager.addMultiStop) {
                const newInput = window.UIManager.addMultiStop(
                    'routeInputsArea', 'btnAddStop',
                    (inputId) => window.UIManager.unlockSearchField(inputId), 
                    (idx) => { 
                        window.BAGANTARA_MAP_TARGET_INDEX = idx;
                        this.setManualState('DROPOFF_PIN');
                    },
                    (idx) => { 
                        if (window.BAGANTARA_MULTI_DROPOFFS) window.BAGANTARA_MULTI_DROPOFFS[idx - 1] = null;
                        if (window.UIManager.checkFormReady) window.UIManager.checkFormReady();
                    }
                );
                if (newInput) this._bindSearchInput(newInput.id, 'searchRouteResults');
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
        document.getElementById('wizardInstruction').innerText = 'TUJUAN';
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('notesContainer').classList.remove('hidden');
        
        const inputCatatan = document.getElementById('inputInlineNotes');
        if (inputCatatan) {
            const formNote = document.getElementById('inputSearchNotes')?.value || '';
            inputCatatan.value = formNote;
        }

        const btnNotes = document.getElementById('btnToggleNotes');
        if(btnNotes) btnNotes.style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-dropoff';
        const txtDropoff = window.BGN_CONFIG?.wording?.buttons?.dropoff || "KUNCI TUJUAN";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtDropoff}</span>`;

        window.bindSafeButton('btnWizardNext', () => {
            const center = window.BAGANTARA_ACTIVE_COORD;
            const notes = document.getElementById('inputInlineNotes').value || "";
            
            if (center) {
                const targetIdx = window.BAGANTARA_MAP_TARGET_INDEX || 1;
                const coordStr = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
                
                if (targetIdx === 1) {
                    window.BAGANTARA_DROPOFF_COORD = coordStr;
                    window.BAGANTARA_DROPOFF_DETAIL = { kec: window.TEMPORARY_GEOCODE, patokan: notes };
                }
                if (!window.BAGANTARA_MULTI_DROPOFFS) window.BAGANTARA_MULTI_DROPOFFS = [];
                window.BAGANTARA_MULTI_DROPOFFS[targetIdx - 1] = { lat: center.lat, lng: center.lng, name: window.TEMPORARY_GEOCODE, notes: notes };
                
                const input = document.getElementById(`inputSearchDropoff${targetIdx}`);
                if (input) { 
                    input.value = window.TEMPORARY_GEOCODE; 
                    if (window.UIManager && window.UIManager.lockSearchField) window.UIManager.lockSearchField(`inputSearchDropoff${targetIdx}`); 
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
        
        document.getElementById('wizardInstruction').innerText = isExpress ? 'AMBIL BARANG' : 'JEMPUT';
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('notesContainer').classList.remove('hidden');
        
        const inputCatatan = document.getElementById('inputInlineNotes');
        if (inputCatatan) {
            const formNote = document.getElementById('inputNotesPickup')?.value || '';
            inputCatatan.value = formNote;
        }

        const btnNotes = document.getElementById('btnToggleNotes');
        if(btnNotes) btnNotes.style.display = 'block';

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-pickup';
        const txtPickup = isExpress 
            ? (window.BGN_CONFIG?.wording?.buttons?.pickup_express || "KUNCI PENGAMBILAN")
            : (window.BGN_CONFIG?.wording?.buttons?.pickup || "KUNCI JEMPUT");
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtPickup}</span>`;

        window.bindSafeButton('btnWizardNext', () => {
            const notes = document.getElementById('inputInlineNotes').value || "-";
            if (window.BAGANTARA_ACTIVE_COORD) {
                window.BAGANTARA_PICKUP_COORD = `${window.BAGANTARA_ACTIVE_COORD.lat.toFixed(6)},${window.BAGANTARA_ACTIVE_COORD.lng.toFixed(6)}`;
            }
            
            window.BAGANTARA_PICKUP_DETAIL = { kec: window.TEMPORARY_GEOCODE, patokan: notes, patokan_awal: notes };
            
            const input = document.getElementById('inputSearchPickup');
            if (input) {
                input.value = window.TEMPORARY_GEOCODE;
                if (window.UIManager && window.UIManager.lockSearchField) window.UIManager.lockSearchField('inputSearchPickup');
            }
            
            // PERCABANGAN LOGIKA LAYANAN (EXPRESS VS RIDE/CAR)
            if (isExpress) {
                this.showExpressDetails();
            } else {
                this.showFinal();
            }
        });

        window.bindSafeButton('btnBackMap', () => { this.showDropoffMap(); });
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'PICKUP' }));
    },

    showExpressDetails: function() {
        window.spaNavigateTo('view-express-details');
        
        window.bindSafeButton('btnExpressProceed', () => {
            const item = document.getElementById('expressItemName').value.trim();
            const recName = document.getElementById('expressReceiverName').value.trim();
            const recPhone = document.getElementById('expressReceiverPhone').value.trim();
            
            if(!item || !recName) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.require_express_details || "Rincian barang dan Nama Penerima wajib diisi demi keamanan logistik.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }

            const notes = window.BAGANTARA_PICKUP_DETAIL.patokan_awal;
            window.BAGANTARA_PICKUP_DETAIL.patokan = `[EXPRESS] Brg: ${item} | Pnrima: ${recName} (${recPhone}) | Lokasi: ${notes}`;
            
            this.showFinal();
        });

        window.bindSafeButton('btnGlobalBack', () => { this.showPickupMap(); });
    },

    showFinal: function() {
        window.spaNavigateTo('view-map');
        
        // PERBAIKAN LOGIKA UI: CEK APAKAH ADA DRIVER YANG DI-PRELOCK DARI PETA
        const isPrelocked = window.BAGANTARA_PRELOCKED_DRIVER ? true : false;
        const driverName = isPrelocked ? window.BAGANTARA_PRELOCKED_DRIVER.nama.split(" ")[0] : ""; // Ambil nama depan saja
        
        document.getElementById('wizardInstruction').innerText = isPrelocked ? 'KONFIRMASI DRIVER' : 'KONFIRMASI';
        document.getElementById('priceArea').classList.remove('hidden');
        document.getElementById('inlineAddressPanel').style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        
        // UBAH WARNA DAN TEKS TOMBOL JIKA PRELOCK AKTIF
        if (isPrelocked) {
            btnNext.className = 'w-full step-final prelocked-btn'; 
            // Tambahkan inline style agar menonjol jika CSS class prelocked-btn belum ada
            btnNext.style.background = 'linear-gradient(135deg, #10b981, #059669)'; 
            btnNext.style.color = '#fff';
            btnNext.style.border = 'none';
            btnNext.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
            
            btnNext.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">PESAN BERSAMA ${driverName.toUpperCase()}</span>`;
        } else {
            btnNext.className = 'btn-primary w-full step-final';
            const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "CARI PENGEMUDI";
            btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
        }

        window.bindSafeButton('btnWizardNext', () => {
            if (navigator.vibrate) navigator.vibrate(50);
            const txtLoading = window.BGN_CONFIG?.wording?.buttons?.loading || "MEMPROSES...";
            btnNext.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${txtLoading}</span>`;
            
            const eksekusiLanjutan = () => {
                // BYPASS LOGIKA: Jika prelock, langsung panggil form. Jika tidak, masuk radar driver.
                if (isPrelocked && window.AegisEngine) {
                    window.AegisEngine.renderMitraList(window.BAGANTARA_SERVICE, window.BAGANTARA_FINAL_PRICE);
                    // AegisEngine.renderMitraList sudah memiliki logika auto-select form jika PRELOCKED_DRIVER terdeteksi
                } else {
                    window.spaNavigateTo('view-drivers');
                    if (window.AegisEngine) window.AegisEngine.renderMitraList(window.BAGANTARA_SERVICE, window.BAGANTARA_FINAL_PRICE);
                }
            };

            const cekHargaBerkala = (percobaan = 0) => {
                if (window.BAGANTARA_FINAL_PRICE && window.BAGANTARA_FINAL_PRICE > 0) {
                    eksekusiLanjutan();
                } else if (percobaan < 20) {
                    setTimeout(() => cekHargaBerkala(percobaan + 1), 500); 
                } else {
                    // Kembalikan ke state semula jika gagal
                    if (isPrelocked) {
                        btnNext.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">PESAN BERSAMA ${driverName.toUpperCase()}</span>`;
                    } else {
                        const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "CARI PENGEMUDI";
                        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                    
                    const txtTimeout = window.BGN_CONFIG?.wording?.alerts?.calc_timeout || "Kalkulasi tarif memakan waktu terlalu lama. Silakan coba lagi.";
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('calc_timeout', txtTimeout);
                    else window.alert(txtTimeout);
                }
            };
            
            cekHargaBerkala();
        });

        // Saraf Mundur
        window.bindSafeButton('btnBackMap', () => { 
            if (window.BAGANTARA_SERVICE === 'EXPRESS') {
                this.showExpressDetails();
            } else {
                this.showPickupMap(); 
            }
        });

        window.BAGANTARA_FINAL_PRICE = 0;
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'CALCULATE' }));
    }
};
