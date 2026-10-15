// ==========================================
// FILE: /js/utils/chat-trigger.js
// FUNGSI: Pemicu Penyerahan Bidding ke Modul Chat Handshake
// ARSITEKTUR: MURNI DELEGASI ES6 (COMPLETE PAYLOAD MULTI-STOP & JASTIP)
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
                nominalTipTerpilih = parseInt(this.getAttribute('data-tip')) || 0;
                if (inputTipCustom) inputTipCustom.value = ''; 
            }
        });
    });

    if (inputTipCustom) {
        inputTipCustom.addEventListener('input', function() {
            resetTipChips();
            nominalTipTerpilih = Math.max(0, parseInt(this.value) || 0);
        });
    }
    // ------------------------------------------

    if (btnSubmitClient) {
        btnSubmitClient.addEventListener('click', () => {
            const cName = document.getElementById('inputClientName').value.trim();
            const cWA = document.getElementById('inputClientWA').value.trim();
            const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
            
            const minName = window.BGN_CONFIG?.rules_app?.form_validation?.min_name_length || 3;
            const minWA = window.BGN_CONFIG?.rules_app?.form_validation?.min_wa_length || 9;

            if (cName.length < minName || cWA.length < minWA) {
                const txtIncomplete = wAlerts.form_incomplete || `Harap lengkapi Nama (min. ${minName} huruf) dan WA (min. ${minWA} angka).`;
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('dynamic', txtIncomplete);
                } else {
                    alert(txtIncomplete);
                }
                return;
            }

            if (clientFormOverlay) clientFormOverlay.classList.add('hidden');
            
            const isJastip = window.BAGANTARA_SERVICE === 'JASTIP';
            // PERBAIKAN BUG KRITIS: Pertahankan nilai belanja Jastip yang sudah dihitung dari keranjang UIJastip
            const estimasiBelanjaJastip = isJastip ? (parseInt(window.BAGANTARA_JASTIP_VALUE) || 0) : 0;
            
            const catatanInput = document.getElementById('inputCatatanDriver');
            const teksCatatan = catatanInput ? catatanInput.value.trim() : "";
            
            const hargaOngkirAsli = window.BAGANTARA_FINAL_PRICE || 0;
            const hargaTawaranAkhir = hargaOngkirAsli + nominalTipTerpilih;

            // Susun daftar multi-stop yang valid (Tujuan 1, 2, 3)
            const validMultiStops = (window.BAGANTARA_MULTI_DROPOFFS || []).filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng)));

            const payloadTiket = {
                nama_klien: cName,
                wa_klien: cWA,
                catatan_tambahan: teksCatatan,
                tip_nominal: nominalTipTerpilih,
                layanan: window.BAGANTARA_SERVICE || 'RIDE',
                jarak_km: window.BAGANTARA_DISTANCE_KM || 0,
                harga_tawaran: hargaTawaranAkhir,
                harga_dasar: hargaOngkirAsli,
                estimasi_belanja: estimasiBelanjaJastip,
                total_bayar_jastip: isJastip ? (hargaTawaranAkhir + estimasiBelanjaJastip) : hargaTawaranAkhir,
                pickup_coord: window.BAGANTARA_PICKUP_COORD || '',
                pickup_alamat: window.BAGANTARA_PICKUP_DETAIL?.kec || '',
                dropoff_coord: window.BAGANTARA_DROPOFF_COORD || '',
                dropoff_alamat: window.BAGANTARA_DROPOFF_DETAIL?.kec || (validMultiStops[0]?.name || ''),
                multi_dropoffs: validMultiStops.length > 0 ? validMultiStops : null,
                toko_jastip: isJastip ? (window.BAGANTARA_JASTIP_STORE || null) : null,
                belanjaan: isJastip ? (window.BAGANTARA_JASTIP_ITEMS || []) : null
            };

            // Reset state tip setelah dibungkus ke payload
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
                const txtNoUid = wAlerts.uid_not_found || "Silakan pilih pengemudi terlebih dahulu (UID tidak ditemukan).";
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('dynamic', txtNoUid);
                } else {
                    alert(txtNoUid);
                }
            }
        });
    }
});