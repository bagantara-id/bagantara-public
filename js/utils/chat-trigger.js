// ==========================================
// FILE: /js/utils/chat-trigger.js
// FUNGSI: Pemicu Penyerahan Bidding ke Modul Chat Handshake (V8 ZERO FALLBACK & TIP PRESERVATION)
// ARSITEKTUR: MURNI DELEGASI ES6 (COMPLETE PAYLOAD MULTI-STOP, JASTIP, & IMMUTABLE TIP SNAPSHOT)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const btnSubmitClient = document.getElementById('btnSubmitClient');
    const btnCancelClient = document.getElementById('btnCancelClient');
    const clientFormOverlay = document.getElementById('client-form-overlay');

    if (btnCancelClient) {
        btnCancelClient.addEventListener('click', () => {
            if (clientFormOverlay) clientFormOverlay.classList.add('hidden');
        });
    }

    // --- SMART TIP ENGINE: LOGIKA INTERAKSI ---
    let nominalTipTerpilih = 0;
    const tipChips = document.querySelectorAll('.btn-tip-chip');
    const inputTipCustom = document.getElementById('inputTipCustom');

    function resetTipChips() {
        tipChips.forEach(chip => {
            chip.style.background = 'var(--card-bg-2)';
            chip.style.borderColor = 'var(--border-cyber)';
            chip.style.color = 'var(--text-main)';
        });
    }

    tipChips.forEach(chip => {
        chip.addEventListener('click', function() {
            if (this.style.color === 'var(--neon-gold)') {
                resetTipChips();
                nominalTipTerpilih = 0;
            } else {
                resetTipChips();
                this.style.background = 'rgba(212, 175, 55, 0.15)';
                this.style.borderColor = 'var(--neon-gold)';
                this.style.color = 'var(--neon-gold)';
                const parsedTip = parseInt(this.getAttribute('data-tip'), 10);
                nominalTipTerpilih = !isNaN(parsedTip) ? parsedTip : 0;
                if (inputTipCustom) inputTipCustom.value = ''; 
            }
        });
    });

    if (inputTipCustom) {
        inputTipCustom.addEventListener('input', function() {
            resetTipChips();
            const parsedCustom = parseInt(this.value, 10);
            nominalTipTerpilih = Math.max(0, !isNaN(parsedCustom) ? parsedCustom : 0);
        });
    }

    if (btnSubmitClient) {
        btnSubmitClient.addEventListener('click', () => {
            const cName = document.getElementById('inputClientName').value.trim();
            const cWA = document.getElementById('inputClientWA').value.trim();
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            const wPopup = window.BGN_CONFIG.wording.mitra_popup;
            const formVal = window.BGN_CONFIG.rules_app.form_validation;
            
            const minName = formVal.min_name_length;
            const minWA = formVal.min_wa_length;

            if (cName.length < minName || cWA.length < minWA) {
                const txtIncomplete = wAlerts.form_incomplete;
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('form_incomplete', txtIncomplete);
                } else {
                    alert(txtIncomplete);
                }
                return;
            }

            if (clientFormOverlay) clientFormOverlay.classList.add('hidden');
            
            const isJastip = window.BAGANTARA_SERVICE === 'JASTIP';
            const parsedJastipVal = parseInt(window.BAGANTARA_JASTIP_VALUE, 10);
            const estimasiBelanjaJastip = isJastip ? (!isNaN(parsedJastipVal) ? parsedJastipVal : 0) : 0;
            
            const catatanInput = document.getElementById('inputCatatanDriver');
            const teksCatatan = catatanInput ? catatanInput.value.trim() : "";
            
            const hargaOngkirAsli = window.BAGANTARA_FINAL_PRICE ? window.BAGANTARA_FINAL_PRICE : 0;
            // KUNCI MUTLAK NILAI TIP SEBELUM UI DIRESET
            const tipTerkunci = nominalTipTerpilih;
            const hargaTawaranAkhir = hargaOngkirAsli + tipTerkunci;

            const multiList = Array.isArray(window.BAGANTARA_MULTI_DROPOFFS) ? window.BAGANTARA_MULTI_DROPOFFS : [];
            const validMultiStops = multiList.filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng)));

            const pickupKec = window.BAGANTARA_PICKUP_DETAIL?.kec ? window.BAGANTARA_PICKUP_DETAIL.kec : '';
            const pickupPatokan = window.BAGANTARA_PICKUP_DETAIL?.patokan ? window.BAGANTARA_PICKUP_DETAIL.patokan : '';
            const dropoffKec = window.BAGANTARA_DROPOFF_DETAIL?.kec
                ? window.BAGANTARA_DROPOFF_DETAIL.kec
                : (validMultiStops[0]?.name ? validMultiStops[0].name : '');
            const dropoffPatokan = window.BAGANTARA_DROPOFF_DETAIL?.patokan ? window.BAGANTARA_DROPOFF_DETAIL.patokan : '';

            const payloadTiket = {
                nama_klien: cName,
                wa_klien: cWA,
                catatan_tambahan: teksCatatan,
                tip_nominal: tipTerkunci,
                layanan: window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : wPopup.default_service,
                jarak_km: window.BAGANTARA_DISTANCE_KM ? window.BAGANTARA_DISTANCE_KM : 0,
                harga_tawaran: hargaTawaranAkhir,
                harga_dasar: hargaOngkirAsli,
                estimasi_belanja: estimasiBelanjaJastip,
                total_bayar_jastip: isJastip ? (hargaTawaranAkhir + estimasiBelanjaJastip) : hargaTawaranAkhir,
                pickup_coord: window.BAGANTARA_PICKUP_COORD ? window.BAGANTARA_PICKUP_COORD : '',
                pickup_alamat: pickupKec,
                pickup_patokan: pickupPatokan,
                dropoff_coord: window.BAGANTARA_DROPOFF_COORD ? window.BAGANTARA_DROPOFF_COORD : '',
                dropoff_alamat: dropoffKec,
                dropoff_patokan: dropoffPatokan,
                multi_dropoffs: validMultiStops.length > 0 ? validMultiStops : null,
                toko_jastip: isJastip ? (window.BAGANTARA_JASTIP_STORE ? window.BAGANTARA_JASTIP_STORE : null) : null,
                belanjaan: isJastip ? (Array.isArray(window.BAGANTARA_JASTIP_ITEMS) ? window.BAGANTARA_JASTIP_ITEMS : []) : null
            };

            // Simpan salinan utuh di memori global agar tidak pernah hilang
            window.BAGANTARA_LAST_ORDER_PAYLOAD = payloadTiket;

            // Reset state UI tip setelah payloadTiket dikunci secara imutabel
            resetTipChips();
            nominalTipTerpilih = 0;
            if (inputTipCustom) inputTipCustom.value = '';

            if (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.uid) {
                if (window.ChatHandshake && typeof window.ChatHandshake.ajukanTawaran === 'function') {
                    window.ChatHandshake.ajukanTawaran(window.BAGANTARA_DRIVER.uid, payloadTiket);
                } else {
                    console.error("Fungsi window.ChatHandshake.ajukanTawaran belum tersedia.");
                }
            } else {
                const txtNoUid = wAlerts.uid_not_found;
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('uid_not_found', txtNoUid);
                } else {
                    alert(txtNoUid);
                }
            }
        });
    }
});