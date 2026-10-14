// ==========================================
// MESIN MODULAR: JASTIP (ALUR BELANJA PRESISI)
// ARSITEKTUR: STATE-SAFE & POLITE UX + SEARCH ENGINE
// ==========================================

window.FlowJastip = {
    init: function() {
        console.log("[FlowJastip] Mesin Diaktifkan");
        window.BAGANTARA_JASTIP_STORE = null;
        window.BAGANTARA_JASTIP_ITEMS = [];
        this.showStoreSearch();
        this.setupSearchEngine(); 
    },

    setupSearchEngine: function() {
        const inputStore = document.getElementById('inputJastipStore');
        const btnClear = document.getElementById('btnClearJastipStore');
        let searchTimeout = null;

        if (inputStore && btnClear) {
            inputStore.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                btnClear.style.display = query.length > 0 ? 'block' : 'none';
                
                if (query.length < 3) {
                    document.getElementById('jastipStoreResults').classList.add('hidden');
                    return;
                }
                
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(async () => {
                    let lat = null, lng = null;
                    if (window.BAGANTARA_ACTIVE_COORD) {
                        lat = window.BAGANTARA_ACTIVE_COORD.lat;
                        lng = window.BAGANTARA_ACTIVE_COORD.lng;
                    }
                    
                    const features = await window.GeocoderAPI.search(query, lat, lng);
                    
                    window.UIManager.renderSearchResults('jastipStoreResults', features, (title, fLat, fLng) => {
                        inputStore.value = title;
                        window.BAGANTARA_ACTIVE_COORD = { lat: fLat, lng: fLng };
                        window.TEMPORARY_GEOCODE = title;
                        
                        // FIX: Aktifkan tameng anti-overwrite reverse geocoder di map-engine.js
                        window.LOCKED_SEARCH_COORD = { lat: fLat, lng: fLng };
                        window.LOCKED_SEARCH_TEXT = title;
                        
                        this.showStoreMap();
                    });
                }, 600);
            });

            btnClear.addEventListener('click', () => {
                inputStore.value = '';
                btnClear.style.display = 'none';
                document.getElementById('jastipStoreResults').classList.add('hidden');
                inputStore.focus();
            });
        }
    },

    showStoreSearch: function() {
        window.spaNavigateTo('view-jastip-search');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden');
        
        document.getElementById('btnGlobalBack').style.display = 'none';
        window.bindSafeButton('btnBackJastipSearch', () => { if (window.SystemReset) window.SystemReset(); });
        
        // FIX INTERCEPTOR: Sinkronisasi teks input ke Peta untuk flow JASTIP (Store)
        window.bindSafeButton('btnJastipMap', async () => { 
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
            this.showStoreMap(); 
        });
    },

    showStoreMap: function() {
        window.spaNavigateTo('view-map');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden'); 

        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'JASTIP_STORE' }));
        
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        
        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-store';
        const txtStore = window.BGN_CONFIG?.wording?.buttons?.jastip_store || "KUNCI LOKASI TOKO";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtStore}</span>`;
        
        window.bindSafeButton('btnWizardNext', () => {
            const notes = document.getElementById('inputInlineNotes').value || "-";
            if (!window.BAGANTARA_ACTIVE_COORD) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.scanning_coords || "Sistem memindai koordinat, mohon tunggu sebentar.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            window.BAGANTARA_JASTIP_STORE = {
                lat: window.BAGANTARA_ACTIVE_COORD.lat.toFixed(6),
                lng: window.BAGANTARA_ACTIVE_COORD.lng.toFixed(6),
                address: window.TEMPORARY_GEOCODE,
                notes: notes
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

        if (window.UIJastip) window.UIJastip.init();

        window.bindSafeButton('btnJastipProceed', () => {
            const items = window.UIJastip.extractData();
            if (items.length === 0) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.require_jastip_items || "Harap masukkan minimal 1 barang dengan estimasi harga yang valid.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            window.BAGANTARA_JASTIP_ITEMS = items; 
            this.showDropoffMap();
        });

        window.bindSafeButton('btnGlobalBack', () => { this.showStoreMap(); });
    },

    showDropoffMap: function() {
        window.spaNavigateTo('view-map');
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'DROPOFF_PIN' }));
        
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        document.getElementById('inputInlineNotes').value = ''; 

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-dropoff';
        const txtDropoff = window.BGN_CONFIG?.wording?.buttons?.jastip_dropoff || "KUNCI PENGANTARAN";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtDropoff}</span>`;
        
        window.bindSafeButton('btnWizardNext', () => {
            const notes = document.getElementById('inputInlineNotes').value || "-";
            if (!window.BAGANTARA_ACTIVE_COORD) {
                const msg = window.BGN_CONFIG?.wording?.alerts?.scanning_coords || "Sistem memindai koordinat, mohon tunggu sebentar.";
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', msg);
                else window.alert(msg);
                return;
            }
            
            window.BAGANTARA_DROPOFF_COORD = `${window.BAGANTARA_ACTIVE_COORD.lat.toFixed(6)},${window.BAGANTARA_ACTIVE_COORD.lng.toFixed(6)}`;
            window.BAGANTARA_MULTI_DROPOFFS = [{ 
                lat: window.BAGANTARA_ACTIVE_COORD.lat, 
                lng: window.BAGANTARA_ACTIVE_COORD.lng, 
                name: window.TEMPORARY_GEOCODE,
                notes: notes
            }];
            this.showFinal(); 
        });

        window.bindSafeButton('btnBackMap', () => { this.showItemization(); });
    },

    showFinal: function() {
        if (window.BAGANTARA_JASTIP_STORE) {
            window.BAGANTARA_PICKUP_COORD = `${window.BAGANTARA_JASTIP_STORE.lat},${window.BAGANTARA_JASTIP_STORE.lng}`;
        }

        document.getElementById('wizardInstruction').innerText = window.BAGANTARA_PRELOCKED_DRIVER ? 'KONFIRMASI DRIVER TERPILIH' : 'KONFIRMASI JASTIP';
        document.getElementById('priceArea').classList.remove('hidden');
        document.getElementById('inlineAddressPanel').style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full step-final';
        const txtFinal = window.BGN_CONFIG?.wording?.buttons?.final || "CARI PENGEMUDI";
        btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
        
        window.bindSafeButton('btnWizardNext', () => {
            if (navigator.vibrate) navigator.vibrate(50);
            
            // PENGAMANAN STATE GLOBAL: Tampilkan pemberitahuan Jastip secara asinkron tanpa menahan state eksekusi utama
            const alertJastip = window.BGN_CONFIG?.wording?.alerts?.jastip_warning || "Transaksi dilanjutkan via WhatsApp Pengemudi.";
            if (window.UIManager && window.UIManager.alertConfig) {
                window.UIManager.alertConfig('jastip_warning', alertJastip);
            } else {
                window.alert(alertJastip);
            }
            
            const txtLoading = window.BGN_CONFIG?.wording?.buttons?.loading || "MEMPROSES...";
            btnNext.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${txtLoading}</span>`;
            
            const eksekusiLanjutan = () => {
                window.BAGANTARA_CUSTOM_WA_PAYLOAD = window.FlowJastip.generateWhatsAppPayload();
                window.spaNavigateTo('view-drivers');
                if (window.AegisEngine) window.AegisEngine.renderMitraList('JASTIP', window.BAGANTARA_FINAL_PRICE);
            };

            const cekHargaBerkala = (percobaan = 0) => {
                if (window.BAGANTARA_FINAL_PRICE && window.BAGANTARA_FINAL_PRICE > 0) {
                    eksekusiLanjutan();
                } else if (percobaan < 20) {
                    setTimeout(() => cekHargaBerkala(percobaan + 1), 500);
                } else {
                    btnNext.innerHTML = `<i class="fa-solid fa-crosshairs"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    const txtTimeout = window.BGN_CONFIG?.wording?.alerts?.calc_timeout || "Kalkulasi tarif memakan waktu terlalu lama. Silakan coba lagi.";
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('calc_timeout', txtTimeout);
                    else window.alert(txtTimeout);
                }
            };
            
            cekHargaBerkala();
        });

        // TAHAP C FIX: Menghidupkan Saraf Mundur di Tahap Final menuju Peta Pengantaran
        window.bindSafeButton('btnBackMap', () => { this.showDropoffMap(); });

        // PEMBERSIHAN STATE KURS (Mencegah Harga Stale & Race Condition)
        window.BAGANTARA_FINAL_PRICE = 0;
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'CALCULATE' }));
        
        // FIX TAHAP 4: Mencabut batasan { once: true } dan menggunakan pembersihan listener aman
        window.removeEventListener('priceCalculated', this.overrideJastipPriceDisplay);
        window.addEventListener('priceCalculated', this.overrideJastipPriceDisplay);
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
    },

    generateWhatsAppPayload: function() {
        const store = window.BAGANTARA_JASTIP_STORE;
        const drop = window.BAGANTARA_MULTI_DROPOFFS ? window.BAGANTARA_MULTI_DROPOFFS[0] : null;
        const items = window.BAGANTARA_JASTIP_ITEMS || [];
        const ongkir = window.BAGANTARA_FINAL_PRICE || 0;
        const belanja = window.BAGANTARA_JASTIP_VALUE || 0;
        const total = ongkir + belanja;

        let itemList = "";
        items.forEach((item, index) => {
            itemList += `> ${index+1}. ${item.name} (${item.qty}x) - Rp${(item.price * item.qty).toLocaleString('id-ID')}\n`;
            if (item.notes) itemList += `  *Catatan: ${item.notes}*\n`;
        });

        let mapLink = (store && drop) ? `https://www.google.com/maps/dir/?api=1&origin=${store.lat},${store.lng}&destination=${drop.lat},${drop.lng}&travelmode=driving` : "";

        return `*🚨 ORDER JASTIP MASUK (BAGANTARA)*\n\n` +
            `*🏪 LOKASI TOKO:*\n${store ? store.address : '-'}\n` +
            `${store && store.notes !== '-' && store.notes !== '' ? `(Patokan: ${store.notes})\n` : ''}\n` +
            `*📍 LOKASI PENGANTARAN:*\n${drop ? drop.name : '-'}\n` +
            `${drop && drop.notes !== '-' && drop.notes !== '' ? `(Patokan: ${drop.notes})\n` : ''}\n` +
            `*🛍️ RINCIAN BELANJA:*\n${itemList}\n` +
            `*💰 ESTIMASI BIAYA:*\n` +
            `- Total Belanja: Rp${belanja.toLocaleString('id-ID')}\n` +
            `- Ongkos Kirim: Rp${ongkir.toLocaleString('id-ID')}\n` +
            `*TOTAL DIBAYAR: Rp${total.toLocaleString('id-ID')}*\n\n` +
            `*🗺️ RUTE MAPS LANGSUNG:*\n${mapLink}\n\n` +
            `_Apakah Anda bersedia mengambil order Jastip ini? Balas pesan ini untuk konfirmasi._`;
    }
};

window.addEventListener('jastipUIUpdated', () => {
    if (!window.UIJastip) return;
    const items = window.UIJastip.extractData();
    let totalItems = 0; let grandTotal = 0;
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
