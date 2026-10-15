// ==========================================
// MESIN MODULAR: JASTIP (ALUR BELANJA PRESISI) - BRUTAL DIAMOND V3
// ARSITEKTUR: DIRECT STORE LOCK, RECENT PLACES, & INTEGRATED DROPOFF SEARCH/GPS
// ==========================================

window.FlowJastip = {
    _searchTimeout: null,
    _dropoffSearchTimeout: null,

    init: function() {
        console.log("[FlowJastip] Mesin Diaktifkan");
        window.BAGANTARA_JASTIP_STORE = null;
        window.BAGANTARA_JASTIP_ITEMS = [];
        window.BAGANTARA_JASTIP_VALUE = 0;
        window.BAGANTARA_DROPOFF_COORD = null;
        window.BAGANTARA_DROPOFF_DETAIL = null;
        this.showStoreSearch();
        this.setupSearchEngine(); 
        this.setupDropoffSearchInCart();
    },

    _lockStoreDirectly: function(title, fLat, fLng, subtitle = '') {
        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return;

        if (window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
        window.TEMPORARY_GEOCODE = title;
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;

        window.BAGANTARA_JASTIP_STORE = {
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
            address: title,
            notes: "-"
        };
        window.BAGANTARA_PICKUP_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        window.BAGANTARA_PICKUP_DETAIL = {
            kec: title,
            patokan: `[TOKO JASTIP] ${title}`
        };

        // Langsung masuk ke halaman daftar belanjaan tanpa wajib mampir ke peta toko
        this.showItemization();
    },

    _renderStoreRecentChips: function() {
        const container = document.getElementById('recentPlacesJastipStore');
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
            const iconCls = p.isVault ? 'fa-solid fa-star text-gold' : 'fa-solid fa-store text-gold';
            chip.innerHTML = `<i class="${iconCls}"></i> <span>${p.title}</span>`;
            chip.addEventListener('click', () => {
                const inputStore = document.getElementById('inputJastipStore');
                if (inputStore) inputStore.value = p.title;
                document.getElementById('jastipStoreResults')?.classList.add('hidden');
                this._lockStoreDirectly(p.title, p.lat, p.lng, p.subtitle);
            });
            container.appendChild(chip);
        });
    },

    setupSearchEngine: function() {
        const inputStore = document.getElementById('inputJastipStore');
        const btnClear = document.getElementById('btnClearJastipStore');
        if (!inputStore || !btnClear) return;

        if (inputStore.dataset.searchBound === 'true') return;
        inputStore.dataset.searchBound = 'true';

        const jalankanPencarianToko = async (query) => {
            if (window.UIManager && window.UIManager.renderSearchLoading) {
                window.UIManager.renderSearchLoading('jastipStoreResults');
            }
            let lat = null, lng = null;
            if (window.BAGANTARA_ACTIVE_COORD) {
                lat = window.BAGANTARA_ACTIVE_COORD.lat;
                lng = window.BAGANTARA_ACTIVE_COORD.lng;
            }
            
            const features = await window.GeocoderAPI.search(query, lat, lng);
            
            window.UIManager.renderSearchResults('jastipStoreResults', features, (title, fLat, fLng, subtitle) => {
                inputStore.value = title;
                this._lockStoreDirectly(title, fLat, fLng, subtitle);
            });
        };

        inputStore.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            btnClear.style.display = query.length > 0 ? 'block' : 'none';
            
            if (query.length < 3) {
                clearTimeout(this._searchTimeout);
                document.getElementById('jastipStoreResults').classList.add('hidden');
                return;
            }
            
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => jalankanPencarianToko(query), 900);
        });

        inputStore.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = inputStore.value.trim();
                if (query.length >= 3) {
                    clearTimeout(this._searchTimeout);
                    jalankanPencarianToko(query);
                }
            }
        });

        btnClear.addEventListener('click', () => {
            inputStore.value = '';
            btnClear.style.display = 'none';
            window.LOCKED_SEARCH_COORD = null;
            window.LOCKED_SEARCH_TEXT = null;
            document.getElementById('jastipStoreResults').classList.add('hidden');
            inputStore.focus();
        });
    },

    // PANEL PENGANTARAN TERPADU DI DALAM LAYAR KERANJANG JASTIP (AUTO-GPS ATAU KETIK ALAMAT)
    _autoLockJastipHomeGps: function() {
        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const btnClearDrop = document.getElementById('btnClearJastipDropoff');
        if (!inputDrop || window.BAGANTARA_DROPOFF_COORD || inputDrop.hasAttribute('readonly')) return;

        const lockHomeCoord = (lat, lng) => {
            if (window.BAGANTARA_DROPOFF_COORD || inputDrop.hasAttribute('readonly') || inputDrop.value.trim().length > 0) return;
            const labelHome = "📍 Lokasi GPS Saya Saat Ini";
            const notes = document.getElementById('inputJastipDropoffNotes')?.value?.trim() || '-';
            window.BAGANTARA_DROPOFF_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            window.BAGANTARA_DROPOFF_DETAIL = { kec: labelHome, patokan: notes };
            window.BAGANTARA_MULTI_DROPOFFS = [{
                lat: parseFloat(lat.toFixed(6)),
                lng: parseFloat(lng.toFixed(6)),
                name: labelHome,
                notes: notes
            }];
            inputDrop.value = labelHome;
            inputDrop.setAttribute('readonly', 'true');
            inputDrop.style.fontWeight = 'bold';
            if (btnClearDrop) btnClearDrop.style.display = 'block';
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                lockHomeCoord(pos.coords.latitude, pos.coords.longitude);
            }, () => {});
        }
    },

    setupDropoffSearchInCart: function() {
        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const btnClearDrop = document.getElementById('btnClearJastipDropoff');
        const btnMapDrop = document.getElementById('btnJastipDropoffMap');
        if (!inputDrop) return;

        if (inputDrop.dataset.searchBound === 'true') return;
        inputDrop.dataset.searchBound = 'true';

        const lockDropoffDirectly = (title, fLat, fLng, subtitle = '') => {
            const lat = parseFloat(fLat);
            const lng = parseFloat(fLng);
            if (isNaN(lat) || isNaN(lng)) return;

            if (window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
                window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
            }

            const notes = document.getElementById('inputJastipDropoffNotes')?.value?.trim() || '-';
            window.BAGANTARA_DROPOFF_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            window.BAGANTARA_DROPOFF_DETAIL = { kec: title, patokan: notes };
            window.BAGANTARA_MULTI_DROPOFFS = [{
                lat: parseFloat(lat.toFixed(6)),
                lng: parseFloat(lng.toFixed(6)),
                name: title,
                notes: notes
            }];

            inputDrop.value = title;
            inputDrop.setAttribute('readonly', 'true');
            inputDrop.style.fontWeight = 'bold';
            if (btnClearDrop) btnClearDrop.style.display = 'block';
        };

        const runDropoffSearch = async (query) => {
            if (window.UIManager && window.UIManager.renderSearchLoading) {
                window.UIManager.renderSearchLoading('jastipDropoffResults');
            }
            let lat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : null;
            let lng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : null;

            const features = await window.GeocoderAPI.search(query, lat, lng);
            window.UIManager.renderSearchResults('jastipDropoffResults', features, (title, fLat, fLng, subtitle) => {
                lockDropoffDirectly(title, fLat, fLng, subtitle);
            });
        };

        inputDrop.addEventListener('input', (e) => {
            if (inputDrop.hasAttribute('readonly')) return;
            const query = e.target.value.trim();
            if (btnClearDrop) btnClearDrop.style.display = query.length > 0 ? 'block' : 'none';

            if (query.length < 3) {
                clearTimeout(this._dropoffSearchTimeout);
                document.getElementById('jastipDropoffResults')?.classList.add('hidden');
                return;
            }

            clearTimeout(this._dropoffSearchTimeout);
            this._dropoffSearchTimeout = setTimeout(() => runDropoffSearch(query), 900);
        });

        if (btnClearDrop) {
            btnClearDrop.addEventListener('click', () => {
                inputDrop.removeAttribute('readonly');
                inputDrop.value = '';
                inputDrop.style.fontWeight = '';
                btnClearDrop.style.display = 'none';
                window.BAGANTARA_DROPOFF_COORD = null;
                window.BAGANTARA_DROPOFF_DETAIL = null;
                window.BAGANTARA_MULTI_DROPOFFS = [];
                document.getElementById('jastipDropoffResults')?.classList.add('hidden');
                inputDrop.focus();
            });
        }

        const btnGmapsDrop = document.getElementById('btnOpenGmapsJastipDropoff');
        if (btnGmapsDrop) {
            btnGmapsDrop.addEventListener('click', () => {
                if (window.UIManager && typeof window.UIManager.openGmapsBridgeModal === 'function') {
                    window.UIManager.openGmapsBridgeModal((title, lat, lng, subtitle) => {
                        lockDropoffDirectly(title, lat, lng, subtitle);
                    }, '');
                }
            });
        }

        if (btnMapDrop) {
            btnMapDrop.addEventListener('click', () => {
                const items = window.UIJastip ? window.UIJastip.extractData() : [];
                if (items.length > 0) window.BAGANTARA_JASTIP_ITEMS = items;
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                this.showDropoffMap();
            });
        }
    },

    showStoreSearch: function() {
        window.spaNavigateTo('view-jastip-search');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden');
        
        document.getElementById('btnGlobalBack').style.display = 'none';
        this._renderStoreRecentChips();

        window.bindSafeButton('btnBackJastipSearch', () => { if (window.SystemReset) window.SystemReset(); });
        window.bindSafeButton('btnOpenGmapsJastipStore', () => {
            if (window.UIManager && typeof window.UIManager.openGmapsBridgeModal === 'function') {
                const initQ = document.getElementById('inputJastipStore')?.value?.trim() || '';
                window.UIManager.openGmapsBridgeModal((title, lat, lng, subtitle) => {
                    const inputStore = document.getElementById('inputJastipStore');
                    if (inputStore) inputStore.value = title;
                    this._lockStoreDirectly(title, lat, lng, subtitle);
                }, initQ);
            }
        });
        
        window.bindSafeButton('btnJastipMap', async () => { 
            clearTimeout(this._searchTimeout);
            const input = document.getElementById('inputJastipStore');
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
                            const props = features[0].properties || {};
                            const title = features[0].text || props.name || props.street || props.city || query;
                            
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
            this.showStoreMap(); 
        });
    },

    showStoreMap: function() {
        window.spaNavigateTo('view-map');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden'); 

        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'JASTIP_STORE' }));
        
        document.getElementById('wizardInstruction').innerText = 'LOKASI TOKO';
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        
        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-store';
        const txtStore = window.BGN_CONFIG?.wording?.buttons?.jastip_store || "KUNCI LOKASI TOKO";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtStore}</span>`;
        
        window.bindSafeButton('btnWizardNext', async () => {
            const notes = document.getElementById('inputInlineNotes').value.trim() || "-";
            if (!window.BAGANTARA_ACTIVE_COORD) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.scanning_coords || "Sistem memindai koordinat, mohon tunggu sebentar.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }

            const c = window.BAGANTARA_ACTIVE_COORD;
            let resolvedStoreName = window.LOCKED_SEARCH_TEXT || document.getElementById('inputJastipStore')?.value?.trim() || window.TEMPORARY_GEOCODE;

            if (!window.LOCKED_SEARCH_TEXT && (!resolvedStoreName || resolvedStoreName.startsWith('Titik Peta')) && window.GeocoderAPI) {
                const currBtn = document.getElementById('btnWizardNext');
                if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">MENGUNCI TOKO...</span>`;
                resolvedStoreName = await window.GeocoderAPI.reverseGeocode(c.lat, c.lng);
                window.TEMPORARY_GEOCODE = resolvedStoreName;
            }

            window.BAGANTARA_JASTIP_STORE = {
                lat: c.lat.toFixed(6),
                lng: c.lng.toFixed(6),
                address: resolvedStoreName,
                notes: notes
            };
            window.BAGANTARA_PICKUP_COORD = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
            window.BAGANTARA_PICKUP_DETAIL = {
                kec: resolvedStoreName,
                patokan: `[TOKO JASTIP] ${resolvedStoreName} (${notes})`
            };

            this.showItemization(); 
        });

        window.bindSafeButton('btnBackMap', () => { this.showStoreSearch(); });
    },

    showItemization: function() {
        window.spaNavigateTo('view-jastip-items');
        document.getElementById('btnGlobalBack').style.display = 'block';
        
        const storeTitle = document.getElementById('jastipStoreNameTitle');
        if (storeTitle && window.BAGANTARA_JASTIP_STORE) storeTitle.innerText = window.BAGANTARA_JASTIP_STORE.address;

        if (window.UIJastip && (!window.BAGANTARA_JASTIP_ITEMS || window.BAGANTARA_JASTIP_ITEMS.length === 0)) {
            window.UIJastip.init();
        }

        // Auto-lock pengantaran ke titik GPS rumah pengguna (hemat 100% buka peta pengantaran!)
        this._autoLockJastipHomeGps();

        window.bindSafeButton('btnJastipProceed', () => {
            const items = window.UIJastip.extractData();
            if (items.length === 0) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.require_jastip_items || "Harap masukkan minimal 1 barang dengan estimasi harga yang valid.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            window.BAGANTARA_JASTIP_ITEMS = items; 

            const dropNotes = document.getElementById('inputJastipDropoffNotes')?.value?.trim() || '-';
            if (window.BAGANTARA_DROPOFF_DETAIL) window.BAGANTARA_DROPOFF_DETAIL.patokan = dropNotes;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[0]) {
                window.BAGANTARA_MULTI_DROPOFFS[0].notes = dropNotes;
            }

            // Jika alamat pengantaran sudah terkunci (Auto-GPS / Ketik Alamat), langsung hitung rute final tanpa mampir peta buta!
            if (window.BAGANTARA_DROPOFF_COORD) {
                this.showFinal();
            } else {
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                this.showDropoffMap();
            }
        });

        window.bindSafeButton('btnGlobalBack', () => { this.showStoreSearch(); });
        window.bindSafeButton('btnBackJastipItems', () => { this.showStoreSearch(); });
    },

    showDropoffMap: function() {
        window.spaNavigateTo('view-map');
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'DROPOFF_PIN' }));
        
        document.getElementById('wizardInstruction').innerText = 'LOKASI PENGANTARAN';
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('inputInlineNotes').value = document.getElementById('inputJastipDropoffNotes')?.value || ''; 

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-dropoff';
        const txtDropoff = window.BGN_CONFIG?.wording?.buttons?.jastip_dropoff || "KUNCI PENGANTARAN";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtDropoff}</span>`;
        
        window.bindSafeButton('btnWizardNext', async () => {
            const notes = document.getElementById('inputInlineNotes').value.trim() || "-";
            if (!window.BAGANTARA_ACTIVE_COORD) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.scanning_coords || "Sistem memindai koordinat, mohon tunggu sebentar.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            
            const c = window.BAGANTARA_ACTIVE_COORD;
            let resolvedDropName = window.TEMPORARY_GEOCODE;
            if ((!resolvedDropName || resolvedDropName.startsWith('Titik Peta')) && window.GeocoderAPI) {
                const currBtn = document.getElementById('btnWizardNext');
                if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">MENGUNCI TUJUAN...</span>`;
                resolvedDropName = await window.GeocoderAPI.reverseGeocode(c.lat, c.lng);
                window.TEMPORARY_GEOCODE = resolvedDropName;
            }

            window.BAGANTARA_DROPOFF_COORD = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
            window.BAGANTARA_DROPOFF_DETAIL = { kec: resolvedDropName, patokan: notes };
            window.BAGANTARA_MULTI_DROPOFFS = [{ 
                lat: parseFloat(c.lat.toFixed(6)), 
                lng: parseFloat(c.lng.toFixed(6)), 
                name: resolvedDropName,
                notes: notes
            }];

            const inputDrop = document.getElementById('inputJastipDropoffSearch');
            const btnClearDrop = document.getElementById('btnClearJastipDropoff');
            if (inputDrop) {
                inputDrop.value = resolvedDropName;
                inputDrop.setAttribute('readonly', 'true');
                inputDrop.style.fontWeight = 'bold';
                if (btnClearDrop) btnClearDrop.style.display = 'block';
            }

            this.showFinal(); 
        });

        window.bindSafeButton('btnBackMap', () => { this.showItemization(); });
    },

    showFinal: function() {
        window.spaNavigateTo('view-map');
        if (window.BAGANTARA_JASTIP_STORE) {
            window.BAGANTARA_PICKUP_COORD = `${window.BAGANTARA_JASTIP_STORE.lat},${window.BAGANTARA_JASTIP_STORE.lng}`;
        }

        const isPrelocked = window.BAGANTARA_PRELOCKED_DRIVER ? true : false;
        const driverName = isPrelocked ? window.BAGANTARA_PRELOCKED_DRIVER.nama.split(" ")[0] : "";

        document.getElementById('wizardInstruction').innerText = isPrelocked ? 'KONFIRMASI DRIVER TERPILIH' : 'KONFIRMASI JASTIP';
        document.getElementById('priceArea').classList.remove('hidden');
        document.getElementById('inlineAddressPanel').style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        if (isPrelocked) {
            btnNext.className = 'w-full step-final prelocked-btn';
            btnNext.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btnNext.style.color = '#fff';
            btnNext.style.border = 'none';
            btnNext.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">JASTIP BERSAMA ${driverName.toUpperCase()}</span>`;
        } else {
            btnNext.className = 'btn-primary w-full step-final';
            btnNext.style.background = '';
            btnNext.style.color = '';
            btnNext.style.border = '';
            const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "CARI PENGEMUDI";
            btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
        }
        
        window.bindSafeButton('btnWizardNext', () => {
            if (navigator.vibrate) navigator.vibrate(50);
            
            const txtLoading = window.BGN_CONFIG?.wording?.buttons?.loading || "MEMPROSES...";
            const activeBtn = document.getElementById('btnWizardNext');
            if (activeBtn) activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${txtLoading}</span>`;
            
            const eksekusiLanjutan = () => {
                if (activeBtn) {
                    if (isPrelocked) {
                        activeBtn.innerHTML = `<i class="fa-solid fa-handshake"></i> <span style="margin-left:8px; font-weight:800;">JASTIP BERSAMA ${driverName.toUpperCase()}</span>`;
                    } else {
                        const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "LANJUTKAN JASTIP";
                        activeBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                }
                if (window.AegisEngine) {
                    window.AegisEngine.renderMitraList('JASTIP', window.BAGANTARA_FINAL_PRICE);
                }
            };

            const cekHargaBerkala = (percobaan = 0) => {
                if (window.BAGANTARA_FINAL_PRICE && window.BAGANTARA_FINAL_PRICE > 0) {
                    eksekusiLanjutan();
                } else if (percobaan < 20) {
                    setTimeout(() => cekHargaBerkala(percobaan + 1), 500);
                } else {
                    if (activeBtn) {
                        const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "CARI PENGEMUDI";
                        activeBtn.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                    const txtTimeout = window.BGN_CONFIG?.wording?.alerts?.calc_timeout || "Kalkulasi tarif memakan waktu terlalu lama. Silakan coba lagi.";
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('calc_timeout', txtTimeout);
                    else window.alert(txtTimeout);
                }
            };
            
            cekHargaBerkala();
        });

        window.bindSafeButton('btnBackMap', () => { this.showItemization(); });

        window.BAGANTARA_FINAL_PRICE = 0;
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'CALCULATE' }));
    },

    overrideJastipPriceDisplay: function() {
        const priceValueEl = document.getElementById('priceValue');
        if (priceValueEl) {
            const ongkir = window.BAGANTARA_FINAL_PRICE || 0;
            const belanja = window.BAGANTARA_JASTIP_VALUE || 0;
            const totalSemua = ongkir + belanja;
            
            const formatHarga = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalSemua);
            priceValueEl.innerHTML = `${formatHarga} <br><span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal; margin-top: 4px; display: inline-block;">(Belanja: Rp${belanja.toLocaleString('id-ID')} + Ongkir: Rp${ongkir.toLocaleString('id-ID')})</span>`;
        }
    }
};

window.addEventListener('jastipUIUpdated', () => {
    if (!window.UIJastip) return;
    const items = window.UIJastip.extractData();
    let totalItems = 0;
    let grandTotal = 0;
    items.forEach(i => { totalItems += i.qty; grandTotal += i.subtotal; });
    window.BAGANTARA_JASTIP_VALUE = grandTotal;
    
    const stickyCheckout = document.getElementById('stickyJastipCheckout');
    const elItemCount = document.getElementById('jastipItemCount');
    const elGrandTotal = document.getElementById('jastipGrandTotal');

    if (stickyCheckout && elItemCount && elGrandTotal) {
        if (totalItems > 0 && grandTotal > 0) {
            stickyCheckout.style.display = 'flex';
            elItemCount.innerText = `${totalItems} Item Belanjaan`;
            elGrandTotal.innerText = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(grandTotal);
        } else {
            stickyCheckout.style.display = 'none';
        }
    }
});