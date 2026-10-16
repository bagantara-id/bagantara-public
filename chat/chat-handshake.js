// ==========================================================================
// FILE: chat/chat-handshake.js (APLIKASI PUBLIK / KLIEN - V8 FINAL)
// FUNGSI: Protokol Handshake REST RTDB Ke-3 (futaqi-ali), Chat P2P (chatting-88040),
//         Inovasi Tombol "🔔 DERINGKAN DRIVER" (Sonar Ping), Fix CORS GAS FCM,
//         Preservasi Uang Tip 100%, Manajemen goOnline/goOffline, & Sanitasi Anti-XSS
// ==========================================================================

import { dbChat, initFirebaseChat, getRadarDatabaseUrl } from './config-chat.js';
import { uploadMediaKeCloudinary } from './cloud-media.js';
import { ref, push, set, onValue, onChildAdded, onChildChanged, remove, update, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let idTiketAktif = null;
let uidPengemudiTarget = null;
let payloadTiketAktif = null;
let pemantauPesan = null;
let pemantauMetadataOrder = null;
let timerPollingRadar = null;
let timerPemutusKoneksi = null;
let perakamAudio = null;
let potonganAudio = [];
let lastSonarPingTimestamp = 0;
let lastChatFcmTimestamp = 0;

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeMediaUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^https:\/\//i.test(trimmed)) return escapeHTML(trimmed);
    return '';
}

window.ChatHandshake = {
    escapeHTML: escapeHTML,

    aktifkanKoneksiChat: function() {
        clearTimeout(timerPemutusKoneksi);
        if (dbChat) {
            try { goOnline(dbChat); } catch (e) {}
        }
    },

    putuskanKoneksiChat: function() {
        clearTimeout(timerPemutusKoneksi);
        if (dbChat) {
            try { goOffline(dbChat); } catch (e) {}
        }
    },

    _hentikanPollingRadar: function() {
        if (timerPollingRadar) {
            clearInterval(timerPollingRadar);
            timerPollingRadar = null;
        }
    },

    // FIX MUTLAK W3C FETCH SPEC: Gunakan Content-Type 'text/plain;charset=utf-8' pada mode 'no-cors'
    // agar browser TIDAK memblokir pengiriman POST JSON ke Google Apps Script!
    _kirimPushFCMKeGAS: function(uidDriver, payloadExtra = {}) {
        try {
            const urlGAS = window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url;
            if (!uidDriver || !urlGAS) return;

            const fcmTokenDriver = window.BAGANTARA_DRIVER?.fcmToken
                ? window.BAGANTARA_DRIVER.fcmToken
                : (window.BAGANTARA_DRIVER_CACHE?.[uidDriver]?.fcmToken ? window.BAGANTARA_DRIVER_CACHE[uidDriver].fcmToken : "");

            const bodyPayload = {
                fcmToken: fcmTokenDriver,
                idTiket: idTiketAktif || "",
                uidDriver: uidDriver,
                ...payloadExtra
            };

            fetch(urlGAS, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(bodyPayload)
            }).catch(() => {});
        } catch (e) {}
    },

    // INOVASI CERDIK BERLIAN: Tombol "🔔 DERINGKAN DRIVER" (Tactical Sonar Ping dengan Cooldown 15 Detik)
    deringkanDriverSekarang: async function(btnElem = null) {
        if (!idTiketAktif || !uidPengemudiTarget) return;
        const now = Date.now();
        const selisihDetik = Math.ceil((15000 - (now - lastSonarPingTimestamp)) / 1000);
        if (now - lastSonarPingTimestamp < 15000) {
            if (window.UIManager) window.UIManager.alert(`Tunggu ${selisihDetik} detik sebelum menderingkan driver kembali.`);
            return;
        }
        lastSonarPingTimestamp = now;

        if (btnElem) {
            const teksAsli = btnElem.innerHTML;
            btnElem.disabled = true;
            btnElem.style.opacity = '0.6';
            btnElem.innerHTML = `<i class="fa-solid fa-bell fa-shake"></i> MENDERINGKAN...`;
            setTimeout(() => {
                if (btnElem) {
                    btnElem.disabled = false;
                    btnElem.style.opacity = '1';
                    btnElem.innerHTML = teksAsli;
                }
            }, 15000);
        }

        try {
            this.aktifkanKoneksiChat();
            const radarBaseUrl = getRadarDatabaseUrl();
            if (radarBaseUrl) {
                const urlPatch = `${radarBaseUrl}/radar_tiket/${encodeURIComponent(uidPengemudiTarget)}/${encodeURIComponent(idTiketAktif)}.json`;
                fetch(urlPatch, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ping_alert: now })
                }).catch(() => {});
            }

            if (dbChat) {
                await push(ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan`), {
                    pengirim: "klien",
                    tipe: "sistem_ping",
                    konten: "🔔 Penumpang memanggil Anda! Mohon segera merespons pesanan.",
                    waktu: now,
                    status: "sent"
                }).catch(() => {});
            }

            const namaKlien = payloadTiketAktif?.nama_klien || "Penumpang";
            const layanan = payloadTiketAktif?.layanan || "ORDER";
            this._kirimPushFCMKeGAS(uidPengemudiTarget, {
                type: "SONAR_PING",
                layanan: layanan,
                harga: payloadTiketAktif?.harga_tawaran || 0,
                tip: payloadTiketAktif?.tip_nominal || 0,
                title: `🔔 PANGGILAN DARURAT: ${namaKlien}`,
                body: `Penumpang menderingkan radar untuk pesanan ${layanan}. Ketuk untuk membuka kokpit!`
            });
        } catch (e) {}
    },

    _tembakRadarTiketREST: async function(uidDriver, idTiket, dataTiket) {
        const radarBaseUrl = getRadarDatabaseUrl();
        if (!radarBaseUrl || !uidDriver || !idTiket) throw new Error("Konfigurasi firebase_radar belum tersedia");
        const timeoutMs = window.BGN_CONFIG.rules_app.chat_controls.radar_fetch_timeout_ms;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const url = `${radarBaseUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataTiket),
                signal: controller.signal
            });
            clearTimeout(tid);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return true;
        } catch (err) {
            clearTimeout(tid);
            throw err;
        }
    },

    _bacaRadarTiketREST: async function(uidDriver, idTiket) {
        const radarBaseUrl = getRadarDatabaseUrl();
        if (!radarBaseUrl || !uidDriver || !idTiket) return undefined;
        const timeoutMs = window.BGN_CONFIG.rules_app.chat_controls.radar_fetch_timeout_ms;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const url = `${radarBaseUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`;
            const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
            clearTimeout(tid);
            if (!res.ok) return undefined;
            return await res.json();
        } catch (err) {
            clearTimeout(tid);
            return undefined;
        }
    },

    _hapusRadarTiketREST: async function(uidDriver, idTiket) {
        const radarBaseUrl = getRadarDatabaseUrl();
        if (!radarBaseUrl || !uidDriver || !idTiket) return;
        try {
            const url = `${radarBaseUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`;
            await fetch(url, { method: 'DELETE' });
        } catch (e) {}
    },
    
    pulihkanSesiAktif: async function() {
        await initFirebaseChat();
        const sesiTersimpan = localStorage.getItem('bgt_active_chat');
        if (sesiTersimpan) {
            try {
                const sesi = JSON.parse(sesiTersimpan);
                idTiketAktif = sesi.idTiket;
                uidPengemudiTarget = sesi.uidDriver;
                payloadTiketAktif = sesi.payloadTiket ? sesi.payloadTiket : null;
                if (sesi.noWa) window.BAGANTARA_DRIVER = { uid: sesi.uidDriver, wa: sesi.noWa };
                this.aktifkanKoneksiChat();
                this.bukaRuangKomunikasi(true, payloadTiketAktif); 
            } catch(e) {
                localStorage.removeItem('bgt_active_chat');
                this.putuskanKoneksiChat();
            }
        } else {
            this.putuskanKoneksiChat();
        }
    },

    ajukanTawaran: async function(uidDriver, payloadTiket) {
        if (idTiketAktif) return; 
        
        await initFirebaseChat();
        this.aktifkanKoneksiChat();

        let deviceId = localStorage.getItem('bgt_device_id');
        if (!deviceId) {
            deviceId = 'DEV_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            localStorage.setItem('bgt_device_id', deviceId);
        }

        uidPengemudiTarget = uidDriver;
        idTiketAktif = `TKT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        payloadTiketAktif = { ...payloadTiket };
        
        // Teruskan payloadTiketAktif secara langsung agar nominalTip tidak pernah hilang (Rp 0)
        this.bukaRuangKomunikasi(false, payloadTiketAktif);
        
        const referensiInbox = ref(dbChat, `inbox_mitra/${uidDriver}/${idTiketAktif}`);
        const referensiMetadata = ref(dbChat, `sesi_komunikasi/${idTiketAktif}/metadata_order`);

        const wadahChat = document.querySelector('.tpl-chat-body');
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const wChat = window.BGN_CONFIG.wording.chat_system;
        const wTemplates = window.BGN_CONFIG.wording.templates;
        const mapCfg = window.BGN_CONFIG.settings.map_config;
        const chatCtrl = window.BGN_CONFIG.rules_app.chat_controls;
        
        if (wadahChat) {
            const txtTunggu = escapeHTML(wAlerts.chat_waiting);
            const txtBatal = escapeHTML(wBtns.cancel_search);
            
            const htmlTunggu = `
                <div id="ui-tunggu-acc" style="text-align:center; margin-top:15px; display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <div style="color:#ceab6b; font-size:0.75rem; font-weight:bold;">${txtTunggu}</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                        <button id="btnDeringkanDriverWait" type="button" style="background:rgba(245, 158, 11, 0.18); border:1px solid #f59e0b; color:#fbbf24; padding:8px 14px; border-radius:8px; font-size:0.7rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 12px rgba(245,158,11,0.25);">
                            <i class="fa-solid fa-bell"></i> DERINGKAN DRIVER
                        </button>
                        <button id="btnBatalMandiri" type="button" style="background:rgba(239, 68, 68, 0.1); border:1px solid #ef4444; color:#ef4444; padding:8px 16px; border-radius:8px; font-size:0.7rem; font-weight:bold; cursor:pointer;">${txtBatal}</button>
                    </div>
                </div>
            `;
            wadahChat.insertAdjacentHTML('beforeend', htmlTunggu);
            
            const btnDeringWait = document.getElementById('btnDeringkanDriverWait');
            if (btnDeringWait) {
                btnDeringWait.addEventListener('click', (e) => {
                    this.deringkanDriverSekarang(e.currentTarget);
                });
            }

            document.getElementById('btnBatalMandiri').addEventListener('click', () => {
                this.batalkanSesi(wAlerts.chat_cancel_manual);
            });
        }
        
        const waktuDibuat = Date.now();
        const dataRadarTiket = {
            ...payloadTiketAktif,
            device_id: deviceId,
            waktu_dibuat: waktuDibuat,
            status: 'WAITING'
        };

        try {
            // 1. Tembakkan sinyal radar_tiket ke RTDB Ke-3 (futaqi-ali) murni via REST API fetch (0 WebSocket Penumpang)
            await this._tembakRadarTiketREST(uidDriver, idTiketAktif, dataRadarTiket);

            // 2. Tulis metadata_order & inbox_mitra di RTDB Chat (chatting-88040)
            await set(referensiMetadata, {
                status: 'WAITING',
                waktu_dibuat: waktuDibuat,
                uid_driver: uidDriver,
                nama_klien: payloadTiketAktif.nama_klien ? payloadTiketAktif.nama_klien : wChat.default_client_name,
                wa_klien: payloadTiketAktif.wa_klien ? payloadTiketAktif.wa_klien : "",
                layanan: payloadTiketAktif.layanan ? payloadTiketAktif.layanan : wChat.default_order_type,
                harga_tawaran: payloadTiketAktif.harga_tawaran,
                harga_dasar: payloadTiketAktif.harga_dasar,
                tip_nominal: payloadTiketAktif.tip_nominal
            });

            await set(referensiInbox, {
                nama_klien: payloadTiketAktif.nama_klien ? payloadTiketAktif.nama_klien : wChat.default_client_name,
                layanan: payloadTiketAktif.layanan ? payloadTiketAktif.layanan : wChat.default_order_type,
                pesan_terakhir: wChat.inbox_initial_preview,
                waktu_dibuat: waktuDibuat,
                waktu_update: waktuDibuat
            });

            // 3. Pemicu Micro-Backend GAS FCM HTTP v1 (Menggunakan Content-Type: text/plain;charset=utf-8 agar tidak diblokir no-cors!)
            const fcmBody = wChat.fcm_new_order_body_template
                .replace('{layanan}', payloadTiketAktif.layanan)
                .replace('{nama}', payloadTiketAktif.nama_klien)
                .replace('{harga}', (payloadTiketAktif.harga_tawaran).toLocaleString('id-ID'));

            this._kirimPushFCMKeGAS(uidDriver, {
                type: "NEW_ORDER",
                layanan: payloadTiketAktif.layanan,
                harga: payloadTiketAktif.harga_tawaran,
                tip: payloadTiketAktif.tip_nominal,
                title: wChat.fcm_new_order_title,
                body: fcmBody
            });
            
            let isAccepted = false;

            const kunciSesiSaatDiterima = () => {
                if (isAccepted) return;
                isAccepted = true;
                clearTimeout(this.timeoutPesanan);
                this._hentikanPollingRadar();

                // Bersihkan umpan dari RTDB ke-3 (futaqi-ali) karena sesi sudah terhubung
                this._hapusRadarTiketREST(uidPengemudiTarget, idTiketAktif);

                const uiTunggu = document.getElementById('ui-tunggu-acc');
                if (uiTunggu) uiTunggu.remove();

                const waDriver = window.BAGANTARA_DRIVER ? window.BAGANTARA_DRIVER.wa : "";
                localStorage.setItem('bgt_active_chat', JSON.stringify({
                    idTiket: idTiketAktif,
                    uidDriver: uidPengemudiTarget,
                    noWa: waDriver,
                    payloadTiket: payloadTiketAktif
                }));
                
                const btnWa = document.querySelector('.tpl-btn-wa-driver');
                if (btnWa && waDriver) {
                    btnWa.classList.remove('hidden-state');
                    const newBtnWa = btnWa.cloneNode(true);
                    btnWa.parentNode.replaceChild(newBtnWa, btnWa);
                    newBtnWa.addEventListener('click', () => {
                        const msgAcc = `${wTemplates.wa_driver_greeting_acc} ${idTiketAktif.substring(0, 8)}`;
                        window.open(`${mapCfg.whatsapp_base_url}${waDriver}?text=${encodeURIComponent(msgAcc)}`, '_blank');
                    });
                }

                const alertElem = document.getElementById('cyber-alert');
                if (alertElem) alertElem.classList.add('hidden');
                if (wadahChat) {
                    const txtSukses = escapeHTML(wAlerts.chat_connected);
                    wadahChat.insertAdjacentHTML('beforeend', `<div style="text-align:center; color:#10b981; font-size:0.75rem; margin-top:10px; font-weight:bold;">${txtSukses}</div>`);
                    wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
                }

                if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
            };
            
            const timeoutDriverMs = chatCtrl.driver_response_timeout_ms;
            
            this.timeoutPesanan = setTimeout(() => {
                if (!isAccepted) {
                    this.batalkanSesi(wAlerts.chat_timeout_driver);
                }
            }, timeoutDriverMs);

            // A. Pantau perubahan metadata_order di dbChat (chatting-88040) secara real-time (0 Polling)
            if (pemantauMetadataOrder) pemantauMetadataOrder();
            pemantauMetadataOrder = onValue(referensiMetadata, (snapshot) => {
                const meta = snapshot.val();
                if (!meta) return;
                if (meta.status === 'ACCEPTED') {
                    kunciSesiSaatDiterima();
                } else if (meta.status === 'REJECTED') {
                    if (!isAccepted) {
                        clearTimeout(this.timeoutPesanan);
                        this._hentikanPollingRadar();
                        this.batalkanSesi(wAlerts.chat_ticket_rejected);
                    }
                }
            });

            // B. Polling cadangan ultra-hemat ke RTDB Ke-3 (futaqi-ali) (Interval >= 8 detik untuk hemat kuota RTDB >70%)
            const pollIntervalMs = Math.max(parseInt(chatCtrl.radar_poll_interval_ms, 10) || 8000, 8000);
            this._hentikanPollingRadar();
            timerPollingRadar = setInterval(async () => {
                if (isAccepted || !idTiketAktif || !uidPengemudiTarget) {
                    this._hentikanPollingRadar();
                    return;
                }
                const dataRadar = await this._bacaRadarTiketREST(uidPengemudiTarget, idTiketAktif);
                if (dataRadar === undefined) return; // Abaikan error jaringan sesaat

                if (dataRadar === null) {
                    if (!isAccepted) {
                        clearTimeout(this.timeoutPesanan);
                        this._hentikanPollingRadar();
                        this.batalkanSesi(wAlerts.chat_ticket_rejected);
                    }
                    return;
                }

                if (dataRadar.status === 'ACCEPTED') {
                    kunciSesiSaatDiterima();
                } else if (dataRadar.status === 'REJECTED') {
                    clearTimeout(this.timeoutPesanan);
                    this._hentikanPollingRadar();
                    this.batalkanSesi(wAlerts.chat_ticket_rejected);
                }
            }, pollIntervalMs);

        } catch (error) {
            console.error("Gagal menembak database:", error);
            this.batalkanSesi(wAlerts.chat_conn_failed);
        }
    },

    batalkanSesi: async function(pesanAlert) {
        if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

        this._hentikanPollingRadar();
        if (pemantauMetadataOrder) { pemantauMetadataOrder(); pemantauMetadataOrder = null; }
        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; }

        const targetUid = uidPengemudiTarget;
        const targetTiket = idTiketAktif;

        idTiketAktif = null;
        uidPengemudiTarget = null;
        payloadTiketAktif = null;
        localStorage.removeItem('bgt_active_chat');

        if (targetUid && targetTiket) {
            await Promise.allSettled([
                this._hapusRadarTiketREST(targetUid, targetTiket),
                dbChat ? remove(ref(dbChat, `inbox_mitra/${targetUid}/${targetTiket}`)) : Promise.resolve(),
                dbChat ? remove(ref(dbChat, `sesi_komunikasi/${targetTiket}`)) : Promise.resolve()
            ]);
        }
        
        if (this._handleMovePersisten) {
            document.removeEventListener('mousemove', this._handleMovePersisten);
            document.removeEventListener('touchmove', this._handleMovePersisten);
        }
        if (this._handleEndPersisten) {
            document.removeEventListener('mouseup', this._handleEndPersisten);
            document.removeEventListener('touchend', this._handleEndPersisten);
        }

        // WAJIB PUTUS KONEKSI WEBSOCKET SAAT SESI DIBATALKAN
        this.putuskanKoneksiChat();

        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        
        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel) {
            panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => panel.remove(), 300);
        }
        
        if (window.UIManager && pesanAlert) window.UIManager.alert(pesanAlert);
        if (window.SystemReset) window.SystemReset();
    },

    bukaRuangKomunikasi: function(isRecovery = false, orderPayload = null) {
        const panelLama = document.getElementById('panel-komunikasi-utama');
        if (panelLama) panelLama.remove();

        const wChat = window.BGN_CONFIG.wording.chat_system;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wTemplates = window.BGN_CONFIG.wording.templates;
        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const chatCtrl = window.BGN_CONFIG.rules_app.chat_controls;
        const mapCfg = window.BGN_CONFIG.settings.map_config;

        if (!document.getElementById('modal-fullscreen-img')) {
            const htmlTambahan = `
                <div id="modal-fullscreen-img" class="hidden-state opacity-0" style="position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:2000; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:opacity 0.3s;">
                    <div style="position:absolute; top:20px; right:20px; z-index:2010;">
                        <button id="btn-tutup-modal-img" style="background:#ceab6b; color:#0b101a; border:none; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
                    </div>
                    <img id="fullscreen-img-target" src="" style="max-width:95%; max-height:85vh; object-fit:contain; border-radius:8px;">
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', htmlTambahan);
        }

        const template = document.getElementById('tpl-chat-panel');
        const clone = template.content.cloneNode(true);
        
        const titleEl = clone.querySelector('.tpl-chat-title');
        titleEl.textContent = `${wChat.session_title_prefix} ${idTiketAktif.substring(0, 8)}`;

        // INOVASI CERDIK: Tambahkan tombol lonceng "🔔 Deringkan Driver" di header ruang chat (di samping tombol WA)
        const btnWaHeader = clone.querySelector('.tpl-btn-wa-driver');
        if (btnWaHeader && btnWaHeader.parentNode) {
            const btnBellHeader = document.createElement('button');
            btnBellHeader.type = 'button';
            btnBellHeader.id = 'btnDeringkanDriverHeader';
            btnBellHeader.title = 'Deringkan & Getarkan HP Driver';
            btnBellHeader.style.cssText = 'background:rgba(245,158,11,0.18); border:1px solid #f59e0b; color:#fbbf24; padding:6px 10px; border-radius:8px; font-size:0.7rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:5px;';
            btnBellHeader.innerHTML = '<i class="fa-solid fa-bell"></i> <span>DERINGKAN</span>';
            btnBellHeader.addEventListener('click', (e) => {
                this.deringkanDriverSekarang(e.currentTarget);
            });
            btnWaHeader.parentNode.insertBefore(btnBellHeader, btnWaHeader);
        }

        const btnKirim = clone.querySelector('.tpl-btn-send');
        const inputTeks = clone.querySelector('.tpl-chat-teks');
        const btnToggle = clone.querySelector('.tpl-btn-toggle');
        const menuAlat = clone.querySelector('.tpl-menu-ekspansi');
        const btnMic = clone.querySelector('.tpl-tool-audio');
        const btnLokasi = clone.querySelector('.tpl-tool-lokasi');
        const btnKamera = clone.querySelector('.tpl-tool-kamera');
        const btnGaleri = clone.querySelector('.tpl-tool-galeri');
        const inpKamera = clone.querySelector('.tpl-input-kamera');
        const inpGaleri = clone.querySelector('.tpl-input-galeri');
        const wadahChat = clone.querySelector('.tpl-chat-body');

        const isMediaAktif = chatCtrl.media_feature_active;
        if (!isMediaAktif) {
            if (btnToggle) btnToggle.style.display = 'none';
            if (btnMic) btnMic.style.display = 'none';
            if (btnKamera) btnKamera.style.display = 'none';
            if (btnGaleri) btnGaleri.style.display = 'none';
        }

        btnToggle.addEventListener('click', () => {
            menuAlat.classList.toggle('show-tools');
            btnToggle.style.transform = menuAlat.classList.contains('show-tools') ? 'rotate(45deg)' : 'rotate(0deg)';
        });

        inputTeks.addEventListener('input', () => {
            if (inputTeks.value.trim() !== '') {
                btnMic.classList.add('hidden-state');
                btnKirim.classList.remove('hidden-state');
            } else {
                btnMic.classList.remove('hidden-state');
                btnKirim.classList.add('hidden-state');
            }
        });

        btnKirim.addEventListener('click', () => {
            if (inputTeks.value.trim() !== '') {
                this.kirimPayloadPesan(inputTeks.value, "teks");
                inputTeks.value = '';
                btnMic.classList.remove('hidden-state');
                btnKirim.classList.add('hidden-state');
            }
        });

        btnLokasi.addEventListener('click', () => {
            btnLokasi.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const kordinat = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                    this.kirimPayloadPesan(kordinat, "lokasi");
                    btnLokasi.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${wChat.location_btn_label}`;
                    menuAlat.classList.remove('show-tools');
                }, () => {
                    btnLokasi.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${wChat.location_btn_label}`;
                    const txtGps = wAlerts.gps_denied;
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('gps_denied', txtGps);
                    else if (window.UIManager) window.UIManager.alert(txtGps);
                }, { enableHighAccuracy: true });
            }
        });

        btnKamera.addEventListener('click', () => inpKamera.click());
        btnGaleri.addEventListener('click', () => inpGaleri.click());

        const prosesUploadVisual = async (file, asalTangkapan) => {
            menuAlat.classList.remove('show-tools');

            const idLoading = 'load_' + Date.now();
            const templateLoading = document.getElementById('tpl-chat-loading');
            if (templateLoading && wadahChat) {
                const cloneLoad = templateLoading.content.cloneNode(true);
                cloneLoad.querySelector('.msg-bubble').id = idLoading;
                wadahChat.appendChild(cloneLoad);
                wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
            }

            try {
                const dataForensik = {
                    sumber: asalTangkapan,
                    waktu_unggah: Date.now()
                };

                const maxImgWidth = chatCtrl.image_max_width_px;
                const jpegQuality = chatCtrl.image_jpeg_quality;
                const uploadTimeoutMs = chatCtrl.media_upload_timeout_ms;

                const fileTerkompresi = await new Promise((resolve) => {
                    if (!file.type.startsWith('image/')) return resolve(file);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let w = img.width, h = img.height;
                            if (w > maxImgWidth) { h = Math.round(h * maxImgWidth / w); w = maxImgWidth; }
                            canvas.width = w; canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', jpegQuality);
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });

                const url = await Promise.race([
                    uploadMediaKeCloudinary(fileTerkompresi, 'image'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), uploadTimeoutMs))
                ]);

                if (url) {
                    await this.kirimPayloadPesan(url, "gambar", dataForensik);
                    const loadEl = document.getElementById(idLoading);
                    if (loadEl) loadEl.remove();
                } else throw new Error("Gagal URL");

            } catch(e) {
                console.error("[SISTEM MEDIA] Error Upload:", e);
                const loadEl = document.getElementById(idLoading);
                if (loadEl) {
                    loadEl.style.borderColor = "#ef4444"; loadEl.style.color = "#ef4444";
                    const content = loadEl.querySelector('.msg-content');
                    if (content) content.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">${escapeHTML(wChat.upload_failed_msg)}</span>`;
                }
            }
        };

        inpKamera.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], wChat.source_camera); });
        inpGaleri.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], wChat.source_gallery); });

        if (isRecovery && btnWaHeader && window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.wa) {
            btnWaHeader.classList.remove('hidden-state');
            btnWaHeader.addEventListener('click', () => {
                const msgRec = `${wTemplates.wa_driver_recovery} ${idTiketAktif.substring(0, 8)}`;
                window.open(`${mapCfg.whatsapp_base_url}${window.BAGANTARA_DRIVER.wa}?text=${encodeURIComponent(msgRec)}`, '_blank');
            });
        }

        const btnBack = clone.querySelector('.tpl-btn-back');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                const panel = document.getElementById('panel-komunikasi-utama');
                if (panel) {
                    panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
                    setTimeout(() => {
                        panel.style.display = 'none';
                        if (localStorage.getItem('bgt_active_chat')) {
                            this.putuskanKoneksiChat();
                        }
                        
                        if (window.spaNavigateTo) {
                            window.spaNavigateTo('view-mitra-map');
                            const orderPanel = document.getElementById('dynamicOrderPanel');
                            if (orderPanel) orderPanel.style.display = 'none';
                        }
                        
                        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
                    }, 300);
                }
            });
        }

        const uiRecording = clone.querySelector('.tpl-recording-ui');
        const timerText = clone.querySelector('.tpl-record-timer');
        const btnBatalVoice = clone.querySelector('.tpl-btn-cancel-record');
        const btnKirimVoice = clone.querySelector('.tpl-btn-send-record');
        const canvasGelombang = clone.querySelector('.tpl-waveform-canvas');
        const stateActive = clone.querySelector('.tpl-record-state-active');
        const stateLocked = clone.querySelector('.tpl-record-state-locked');
        const hintGeser = clone.querySelector('.tpl-slide-hint');
        const indicatorLock = clone.querySelector('.tpl-lock-indicator');
        const btnPause = clone.querySelector('.tpl-btn-pause-record');

        let waktuRekaman = 0;
        let isDibatalkan = false;
        let isTerkunci = false;
        let isTerjeda = false;
        let konteksAudio = null;
        let idAnimasiCanvas = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let streamGlobal = null;
        let isRekamanAktif = false; 

        function formatTime(sec) {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        const mulaiPerekaman = async () => {
            if (isRekamanAktif) return;
            isRekamanAktif = true;

            try {
                streamGlobal = await navigator.mediaDevices.getUserMedia({ audio: true });
                perakamAudio = new MediaRecorder(streamGlobal);
                potonganAudio = [];
                isDibatalkan = false;
                isTerkunci = false;
                isTerjeda = false;
                waktuRekaman = 0;

                if (uiRecording) uiRecording.classList.add('active');
                if (indicatorLock) indicatorLock.classList.add('show');
                if (btnKirimVoice) btnKirimVoice.style.transform = 'scale(0)';
                if (stateActive) stateActive.style.display = 'flex';
                if (stateLocked) stateLocked.style.display = 'none';
                if (hintGeser) hintGeser.style.opacity = '1';
                if (timerText) timerText.innerText = "0:00"; 

                if (canvasGelombang) {
                    canvasGelombang.width = canvasGelombang.offsetWidth ? canvasGelombang.offsetWidth : 150;
                    canvasGelombang.height = canvasGelombang.offsetHeight ? canvasGelombang.offsetHeight : 24;
                    const canvasCtx = canvasGelombang.getContext('2d');
                    
                    const AudioCtx = window.AudioContext ? window.AudioContext : window.webkitAudioContext;
                    konteksAudio = new AudioCtx();
                    const sumberAudio = konteksAudio.createMediaStreamSource(streamGlobal);
                    const analyser = konteksAudio.createAnalyser();
                    
                    analyser.fftSize = 64; 
                    const panjangBuffer = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(panjangBuffer);
                    sumberAudio.connect(analyser);

                    function gambarGelombang() {
                        if (!isTerjeda) analyser.getByteFrequencyData(dataArray);
                        canvasCtx.clearRect(0, 0, canvasGelombang.width, canvasGelombang.height);
                        const barWidth = 3; const gap = 2;
                        const barCount = Math.floor(canvasGelombang.width / (barWidth + gap));
                        let x = 0;

                        for (let i = 0; i < barCount; i++) {
                            const tinggiBar = (dataArray[i] / 255) * canvasGelombang.height;
                            const tinggiMinimal = Math.max(tinggiBar, 2); 
                            const y = (canvasGelombang.height / 2) - (tinggiMinimal / 2); 
                            
                            canvasCtx.fillStyle = '#10b981'; 
                            canvasCtx.beginPath();
                            if (canvasCtx.roundRect) canvasCtx.roundRect(x, y, barWidth, tinggiMinimal, 2);
                            else canvasCtx.fillRect(x, y, barWidth, tinggiMinimal);
                            canvasCtx.fill();
                            x += barWidth + gap;
                        }
                        idAnimasiCanvas = requestAnimationFrame(gambarGelombang);
                    }
                    gambarGelombang();
                }

                perakamAudio.ondataavailable = e => { if (e.data.size > 0) potonganAudio.push(e.data); };
                
                perakamAudio.onstop = async () => {
                    isRekamanAktif = false;
                    if (streamGlobal) streamGlobal.getTracks().forEach(track => track.stop());
                    
                    if (window.ChatHandshake.intervalRekamanGlobal) clearInterval(window.ChatHandshake.intervalRekamanGlobal);
                    if (idAnimasiCanvas) cancelAnimationFrame(idAnimasiCanvas);
                    if (konteksAudio && konteksAudio.state !== 'closed') konteksAudio.close();
                    
                    if (uiRecording) uiRecording.classList.remove('active');
                    if (indicatorLock) indicatorLock.classList.remove('show');
                    btnMic.style.transform = 'scale(1)';

                    if (isDibatalkan) {
                        return;
                    }

                    const idLoading = 'load_audio_' + Date.now();
                    const templateLoading = document.getElementById('tpl-chat-loading');
                    if (templateLoading && wadahChat) {
                        const cloneLoad = templateLoading.content.cloneNode(true);
                        cloneLoad.querySelector('.msg-bubble').id = idLoading;
                        wadahChat.appendChild(cloneLoad);
                        wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
                    }

                    const blobAudio = new Blob(potonganAudio, { type: 'audio/webm' });
                    const uploadTimeoutMs = chatCtrl.media_upload_timeout_ms;
                    try {
                        const url = await Promise.race([
                            uploadMediaKeCloudinary(blobAudio, 'audio'),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), uploadTimeoutMs))
                        ]);
                        if (url) {
                            await window.ChatHandshake.kirimPayloadPesan(url, "audio");
                            const loadEl = document.getElementById(idLoading);
                            if (loadEl) loadEl.remove();
                        } else throw new Error("Gagal URL");
                    } catch(e) {
                        const loadEl = document.getElementById(idLoading);
                        if (loadEl) {
                            loadEl.style.borderColor = "#ef4444"; loadEl.style.color = "#ef4444";
                            const content = loadEl.querySelector('.msg-content');
                            if (content) content.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">${escapeHTML(wChat.send_failed_msg)}</span>`;
                        }
                    }
                };

                perakamAudio.start();

                const maxVoiceSec = chatCtrl.voice_max_duration_sec;
                window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                    waktuRekaman++;
                    if (timerText) timerText.innerText = formatTime(waktuRekaman);
                    if (waktuRekaman >= maxVoiceSec && perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
                }, 1000);

            } catch (e) {
                isRekamanAktif = false;
                const txtMic = wAlerts.mic_denied;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('mic_denied', txtMic);
                else if (window.UIManager) window.UIManager.alert(txtMic);
            }
        };

        const handleStart = (e) => {
            e.preventDefault(); 
            const sentuh = e.touches ? e.touches[0] : e;
            touchStartX = sentuh.clientX;
            touchStartY = sentuh.clientY;
            btnMic.style.transform = 'scale(1.2)'; 
            mulaiPerekaman();
        };

        const handleMove = (e) => {
            if (!isRekamanAktif || isTerkunci) return;
            const sentuh = e.touches ? e.touches[0] : e;
            const deltaX = sentuh.clientX - touchStartX;
            const deltaY = sentuh.clientY - touchStartY;
            const lockDeltaY = chatCtrl.voice_lock_delta_y_px;
            const cancelDeltaX = chatCtrl.voice_cancel_delta_x_px;

            if (deltaY < lockDeltaY) {
                isTerkunci = true;
                if (indicatorLock) indicatorLock.classList.remove('show');
                if (hintGeser) hintGeser.style.opacity = '0';
                if (stateActive) stateActive.style.display = 'none';
                if (stateLocked) stateLocked.style.display = 'flex';
                if (btnKirimVoice) btnKirimVoice.style.transform = 'scale(1)'; 
                btnMic.style.transform = 'scale(1)'; 
                return;
            }

            if (deltaX < cancelDeltaX) {
                isDibatalkan = true;
                if (perakamAudio && perakamAudio.state === "recording") perakamAudio.stop();
                return;
            }

            if (deltaX < 0 && deltaX > cancelDeltaX && hintGeser) {
                hintGeser.style.opacity = 1 - (Math.abs(deltaX) / Math.abs(cancelDeltaX));
            }
        };

        const handleEnd = () => {
            btnMic.style.transform = 'scale(1)';
            if (!isRekamanAktif) return;
            if (!isTerkunci) {
                if (perakamAudio && perakamAudio.state === "recording") perakamAudio.stop();
            }
        };

        btnMic.addEventListener('mousedown', handleStart);
        btnMic.addEventListener('touchstart', handleStart, { passive: false });
        
        if (window.ChatHandshake._handleMovePersisten) {
            document.removeEventListener('mousemove', window.ChatHandshake._handleMovePersisten);
            document.removeEventListener('touchmove', window.ChatHandshake._handleMovePersisten);
        }
        if (window.ChatHandshake._handleEndPersisten) {
            document.removeEventListener('mouseup', window.ChatHandshake._handleEndPersisten);
            document.removeEventListener('touchend', window.ChatHandshake._handleEndPersisten);
        }

        window.ChatHandshake._handleMovePersisten = handleMove;
        window.ChatHandshake._handleEndPersisten = handleEnd;
        
        document.addEventListener('mousemove', window.ChatHandshake._handleMovePersisten);
        document.addEventListener('touchmove', window.ChatHandshake._handleMovePersisten, { passive: false });
        
        document.addEventListener('mouseup', window.ChatHandshake._handleEndPersisten);
        document.addEventListener('touchend', window.ChatHandshake._handleEndPersisten);

        if (btnBatalVoice) {
            btnBatalVoice.addEventListener('click', (e) => {
                e.preventDefault();
                isDibatalkan = true;
                if (perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
            });
        }

        if (btnKirimVoice) {
            btnKirimVoice.addEventListener('click', (e) => {
                e.preventDefault();
                if (perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
            });
        }
        
        if (btnPause) {
            btnPause.addEventListener('click', (e) => {
                e.preventDefault();
                if (!perakamAudio) return;
                const maxVoiceSec = chatCtrl.voice_max_duration_sec;
                
                if (perakamAudio.state === "recording") {
                    isTerjeda = true;
                    perakamAudio.pause();
                    btnPause.innerHTML = `<i class="fa-solid fa-microphone"></i> ${escapeHTML(wChat.voice_resume_label)}`;
                    if (window.ChatHandshake.intervalRekamanGlobal) clearInterval(window.ChatHandshake.intervalRekamanGlobal);
                } else if (perakamAudio.state === "paused") {
                    isTerjeda = false;
                    perakamAudio.resume();
                    btnPause.innerHTML = `<i class="fa-solid fa-pause"></i> ${escapeHTML(wChat.voice_pause_label)}`;
                    window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                        waktuRekaman++;
                        if (timerText) timerText.innerText = formatTime(waktuRekaman);
                        if (waktuRekaman >= maxVoiceSec && perakamAudio.state === "recording") perakamAudio.stop();
                    }, 1000);
                }
            });
        }

        wadahChat.addEventListener('click', (e) => {
            const triggerImg = e.target.closest('.image-fullscreen-trigger');
            if (triggerImg) this.bukaLayarPenuhGambar(triggerImg.getAttribute('data-img'));
        });

        document.body.appendChild(clone);
        
        document.getElementById('btn-tutup-modal-img').addEventListener('click', () => this.tutupLayarPenuhGambar());
        document.getElementById('modal-fullscreen-img').addEventListener('click', (e) => { if (e.target.id === 'modal-fullscreen-img') this.tutupLayarPenuhGambar(); });

        this.mulaiDengarPesan();

        if (!isRecovery) {
            const delayKatalogMs = chatCtrl.catalog_send_delay_ms;
            const lockedOrder = orderPayload ? orderPayload : (payloadTiketAktif ? payloadTiketAktif : window.BAGANTARA_LAST_ORDER_PAYLOAD);
            
            this.timeoutKatalog = setTimeout(async () => {
                if (!lockedOrder || !idTiketAktif) return;

                const layananSistem = lockedOrder.layanan ? lockedOrder.layanan : wPopup.default_service;
                const multiList = Array.isArray(lockedOrder.multi_dropoffs) ? lockedOrder.multi_dropoffs : [];
                
                let stringWaypoints = "";
                let labelTujuan = lockedOrder.dropoff_alamat
                    ? (lockedOrder.dropoff_patokan && lockedOrder.dropoff_patokan !== wPopup.no_notes
                        ? `${lockedOrder.dropoff_alamat} (${lockedOrder.dropoff_patokan})`
                        : lockedOrder.dropoff_alamat)
                    : wPopup.no_notes;
                
                if (multiList.length > 1) {
                    labelTujuan = wChat.multi_stop_ready_label;
                    const titikSinggah = multiList.slice(0, -1).filter(Boolean);
                    if (titikSinggah.length > 0) {
                        stringWaypoints = titikSinggah.map(p => `${parseFloat(p.lat).toFixed(6)},${parseFloat(p.lng).toFixed(6)}`).join('|');
                    }
                } else if (multiList.length === 1 && multiList[0]?.name) {
                    labelTujuan = multiList[0].name;
                }

                const pickupCoordStr = lockedOrder.pickup_coord ? lockedOrder.pickup_coord : '';
                const dropoffCoordStr = lockedOrder.dropoff_coord ? lockedOrder.dropoff_coord : '';

                const namaJemput = lockedOrder.pickup_alamat ? lockedOrder.pickup_alamat : '';
                const patokanJemput = lockedOrder.pickup_patokan ? lockedOrder.pickup_patokan : wPopup.no_notes;
                let labelJemputFaktual = '';

                if (!namaJemput || namaJemput === wPopup.no_notes || namaJemput.toLowerCase().includes('memindai')) {
                    labelJemputFaktual = pickupCoordStr ? `📍 ${wPins.map_point_prefix}: ${pickupCoordStr}` : wChat.empty_pickup_label;
                    if (patokanJemput && patokanJemput !== wPopup.no_notes) {
                        labelJemputFaktual += ` (${wChat.note_label_prefix} ${patokanJemput})`;
                    }
                } else {
                    labelJemputFaktual = `${namaJemput} (${patokanJemput})`;
                }

                let labelTujuanFaktual = '';
                if (!labelTujuan || labelTujuan === wPopup.no_notes || labelTujuan.toLowerCase().includes('memindai')) {
                    labelTujuanFaktual = dropoffCoordStr ? `📍 ${wPins.map_point_prefix}: ${dropoffCoordStr}` : wChat.empty_dropoff_label;
                } else {
                    labelTujuanFaktual = labelTujuan;
                }

                const hargaDasar = parseInt(lockedOrder.harga_dasar, 10) ? parseInt(lockedOrder.harga_dasar, 10) : 0;
                const nominalTip = parseInt(lockedOrder.tip_nominal, 10) ? parseInt(lockedOrder.tip_nominal, 10) : 0;
                const hargaTotal = parseInt(lockedOrder.harga_tawaran, 10) ? parseInt(lockedOrder.harga_tawaran, 10) : (hargaDasar + nominalTip);

                const dataKatalog = {
                    layanan: layananSistem,
                    harga: hargaTotal, 
                    harga_dasar: hargaDasar,
                    tip_nominal: nominalTip,
                    catatan: lockedOrder.catatan_tambahan ? lockedOrder.catatan_tambahan : "",
                    jarak: lockedOrder.jarak_km ? lockedOrder.jarak_km : 0,
                    jemput: labelJemputFaktual,
                    tujuan: labelTujuanFaktual,
                    pickup_coord: pickupCoordStr,
                    dropoff_coord: dropoffCoordStr,
                    waypoints: stringWaypoints, 
                    toko_jastip: lockedOrder.toko_jastip ? lockedOrder.toko_jastip : null,
                    belanjaan: layananSistem === 'JASTIP' ? (Array.isArray(lockedOrder.belanjaan) ? lockedOrder.belanjaan : []) : null,
                    wa_klien: lockedOrder.wa_klien ? lockedOrder.wa_klien : ""
                };

                await this.kirimPayloadPesan(JSON.stringify(dataKatalog), "katalog_order");
            }, delayKatalogMs); 
        } 
    },

    kirimPayloadPesan: async function(kontenPesan, tipePesan = "teks", metadataForensik = null) {
        if (!idTiketAktif || !kontenPesan) return;
        this.aktifkanKoneksiChat();
        const referensi = ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan`);
        const wChat = window.BGN_CONFIG.wording.chat_system;
        
        const payload = {
            pengirim: "klien", 
            tipe: tipePesan,
            konten: kontenPesan,
            waktu: Date.now(),
            status: "sent"
        };
        
        if (metadataForensik) payload.forensik = metadataForensik;

        await push(referensi, payload);

        if (uidPengemudiTarget) {
            let preview = tipePesan === 'teks'
                ? kontenPesan
                : (tipePesan === 'lokasi'
                    ? wChat.preview_location
                    : (tipePesan === 'audio'
                        ? wChat.preview_audio
                        : (tipePesan === 'katalog_order'
                            ? wChat.preview_catalog
                            : wChat.preview_image)));
            await update(ref(dbChat, `inbox_mitra/${uidPengemudiTarget}/${idTiketAktif}`), {
                pesan_terakhir: preview,
                waktu_update: Date.now()
            }).catch(() => {});

            // Tembakkan FCM Chat Wake-Up ke Driver (dengan throttle 10 detik untuk hemat kuota) jika bukan katalog_order
            const now = Date.now();
            if (tipePesan !== 'katalog_order' && (now - lastChatFcmTimestamp >= 10000)) {
                lastChatFcmTimestamp = now;
                const namaKlien = payloadTiketAktif?.nama_klien || "Penumpang";
                this._kirimPushFCMKeGAS(uidPengemudiTarget, {
                    type: "CHAT_MESSAGE",
                    layanan: payloadTiketAktif?.layanan || "CHAT",
                    title: `💬 Pesan dari ${namaKlien}`,
                    body: String(preview).substring(0, 120)
                });
            }
        }
    },

    mulaiDengarPesan: function() {
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wChat = window.BGN_CONFIG.wording.chat_system;
        const currencyCode = window.BGN_CONFIG.tariffs.currency;
        const gmapsSearchUrl = window.BGN_CONFIG.settings.map_config.google_maps_search_url;

        const referensiRuang = ref(dbChat, `sesi_komunikasi/${idTiketAktif}`);
        if (this.pemantauRuang) this.pemantauRuang();
        let ruangSudahAda = false;
        this.pemantauRuang = onValue(referensiRuang, (snapshot) => {
            if (snapshot.exists()) {
                ruangSudahAda = true;
            } else if (!snapshot.exists() && ruangSudahAda) {
                const txtEnded = wAlerts.chat_ended;
                this.kematianSesiPaksa(txtEnded);
            }
        });

        const referensi = ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan`);
        const wadahChat = document.querySelector('.tpl-chat-body');
        
        if (pemantauPesan) pemantauPesan(); 
        
        pemantauPesan = onChildAdded(referensi, (snapshot) => {
            const pesan = snapshot.val();
            if (!wadahChat || !pesan) return;

            if (pesan.tipe === 'sistem_ping') {
                return;
            }

            if (pesan.tipe === 'sistem_tolak') {
                if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
                this._hentikanPollingRadar();
                const uiTunggu = document.getElementById('ui-tunggu-acc');
                if (uiTunggu) uiTunggu.remove();

                const msgTolak = wAlerts.chat_driver_unavailable;
                this.batalkanSesi(msgTolak);
                return; 
            }

            if (pesan.pengirim === 'mitra') {
                this.mainkanSuara();
                const indikatorKedip = document.getElementById('chat-notif-dot-global');
                if (indikatorKedip) indikatorKedip.classList.remove('hidden-state');
                
                const uiTunggu = document.getElementById('ui-tunggu-acc');
                if (uiTunggu) {
                    uiTunggu.remove(); 
                    if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
                    this._hentikanPollingRadar();
                }
            }

            const posisiKelas = pesan.pengirim === 'klien' ? 'msg-mitra' : 'msg-klien';
            let htmlKonten = '';

            if (pesan.tipe === 'teks') {
                htmlKonten = `<p>${escapeHTML(pesan.konten)}</p>`;
            } else if (pesan.tipe === 'katalog_order') {
                try {
                    const k = JSON.parse(pesan.konten);
                    const warnaLayanan = k.layanan === 'RIDE' ? '#3b82f6' : (k.layanan === 'EXPRESS' ? '#f59e0b' : '#10b981');
                    const isJastip = k.layanan === 'JASTIP' && Array.isArray(k.belanjaan) && k.belanjaan.length > 0;
                    
                    let htmlJastip = '';
                    let rincianBelanjaTotal = 0;
                    
                    if (isJastip) {
                        k.belanjaan.forEach(item => { rincianBelanjaTotal += ((Number(item.qty) ? Number(item.qty) : 0) * (Number(item.price) ? Number(item.price) : 0)); });
                        const formatBelanja = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(rincianBelanjaTotal);
                        const listBelanjaHtml = k.belanjaan.map(i => `<li><b>${escapeHTML(i.qty)}x</b> ${escapeHTML(i.name)} (@ Rp${escapeHTML(i.price)})</li>`).join('');
                        
                        htmlJastip = `<div style="border-top:1px dashed rgba(255,255,255,0.2); margin:8px 0; padding-top:8px;">
                            <span style="font-size:0.6rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:bold;">${escapeHTML(wChat.catalog_shopping_header)}</span>
                            <ul style="margin:0 0 6px 0; padding-left:14px; font-size:0.75rem; color:#f8fafc; list-style-type:square;">
                                ${listBelanjaHtml}
                            </ul>
                            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size:0.65rem; color:#10b981; font-weight:bold;">${escapeHTML(wChat.catalog_shopping_total)}</span>
                                <span style="font-size:0.85rem; color:#10b981; font-weight:900; font-family:monospace;">${escapeHTML(formatBelanja)}</span>
                            </div>
                        </div>`;
                    }

                    let htmlCatatan = '';
                    if (k.catatan && String(k.catatan).trim() !== '') {
                        htmlCatatan = `<div style="background:rgba(255,255,255,0.05); border-left:3px solid #94a3b8; padding:8px; border-radius:4px; margin-top:8px;">
                            <span style="font-size:0.65rem; color:#94a3b8; font-weight:bold; display:block; margin-bottom:2px;"><i class="fa-solid fa-comment-dots"></i> ${escapeHTML(wChat.catalog_driver_note)}</span>
                            <span style="font-size:0.75rem; color:#f8fafc; font-style:italic;">"${escapeHTML(k.catatan)}"</span>
                        </div>`;
                    }

                    let htmlBadgeTip = '';
                    const tipNum = Number(k.tip_nominal);
                    if (!isNaN(tipNum) && tipNum > 0) {
                        const formatTip = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(tipNum);
                        htmlBadgeTip = `<div style="margin-top:4px; display:inline-block; background:rgba(212, 175, 55, 0.15); border:1px solid #ceab6b; color:#ceab6b; font-size:0.6rem; font-weight:bold; padding:2px 8px; border-radius:12px;">
                            <i class="fa-solid fa-bolt"></i> ${escapeHTML(wChat.catalog_tip_prefix)} ${escapeHTML(formatTip)}
                        </div>`;
                    }
                    
                    const estimasiOngkirMurni = Number(k.harga) ? Number(k.harga) : 0;
                    const formatOngkir = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(estimasiOngkirMurni);
                    const labelHargaBawah = isJastip ? wChat.catalog_shipping_label : wChat.catalog_total_tariff_label;

                    htmlKonten = `
                        <div style="background:#0f1624; border:1px solid ${warnaLayanan}; border-radius:12px; padding:12px; width:min(255px, 76vw); display:flex; flex-direction:column; gap:6px; box-shadow:0 8px 20px rgba(0,0,0,0.4);">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                                <span style="font-size:0.65rem; color:${warnaLayanan}; font-weight:900; letter-spacing:1px;"><i class="fa-solid fa-receipt mr-1"></i> ${escapeHTML(wChat.catalog_order_prefix)} ${escapeHTML(k.layanan)}</span>
                                <span style="font-size:0.65rem; color:#94a3b8; font-family:monospace;">${escapeHTML(k.jarak)} KM</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                                <div style="display:flex; gap:6px;">
                                    <i class="fa-solid fa-circle-up" style="color:#10b981; font-size:0.7rem; margin-top:3px;"></i>
                                    <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>${escapeHTML(wChat.catalog_pickup_label)}</b><br>${escapeHTML(k.jemput)}</span>
                                </div>
                                <div style="width:2px; height:10px; background:rgba(255,255,255,0.2); margin-left:4px;"></div>
                                <div style="display:flex; gap:6px;">
                                    <i class="fa-solid fa-location-dot" style="color:#ef4444; font-size:0.7rem; margin-top:3px;"></i>
                                    <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>${escapeHTML(wChat.catalog_dropoff_label)}</b><br>${escapeHTML(k.tujuan)}</span>
                                </div>
                            </div>
                            ${htmlJastip}
                            ${htmlCatatan}
                            <div style="background:rgba(212,175,55,0.1); border:1px dashed #ceab6b; border-radius:6px; padding:8px; text-align:center; margin-top:6px;">
                                <span style="font-size:0.6rem; color:#ceab6b; display:block; font-weight:bold;">${escapeHTML(labelHargaBawah)}</span>
                                <span style="font-size:1.2rem; color:#ceab6b; font-weight:900; font-family:monospace;">${escapeHTML(formatOngkir)}</span>
                                ${htmlBadgeTip}
                            </div>
                        </div>
                    `;
                } catch(e) { htmlKonten = `<p><i>${escapeHTML(wChat.catalog_error_fallback)}</i></p>`; }
            } else if (pesan.tipe === 'lokasi') {
                const parts = String(pesan.konten).split(',');
                const nLat = parseFloat(parts[0]);
                const nLng = parseFloat(parts[1]);
                const safeLat = !isNaN(nLat) ? nLat : 0;
                const safeLng = !isNaN(nLng) ? nLng : 0;
                
                htmlKonten = `
                    <div style="background:#0f1624; border:1px solid #ceab6b; border-radius:12px; padding:12px; width:220px; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                        <div style="display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(206,171,107,0.2); padding-bottom:8px;">
                            <div style="width:36px; height:36px; border-radius:50%; background:rgba(206,171,107,0.1); display:flex; justify-content:center; align-items:center; color:#ceab6b; font-size:1.1rem; flex-shrink:0;">
                                <i class="fa-solid fa-map-pin"></i>
                            </div>
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span style="font-size:0.75rem; color:#ceab6b; font-weight:bold;">${escapeHTML(wChat.location_card_title)}</span>
                                <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lat: ${safeLat.toFixed(5)}</span>
                                <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lng: ${safeLng.toFixed(5)}</span>
                            </div>
                        </div>
                        <a href="${gmapsSearchUrl}${safeLat},${safeLng}" target="_blank" rel="noopener noreferrer" style="background:#ceab6b; color:#0b101a; padding:10px; border-radius:8px; text-align:center; font-size:0.8rem; font-weight:bold; text-decoration:none; display:flex; justify-content:center; align-items:center; gap:6px;">
                            <i class="fa-solid fa-diamond-turn-right"></i> ${escapeHTML(wChat.location_open_maps)}
                        </a>
                    </div>
                `;
            } else if (pesan.tipe === 'audio') {
                const safeAudioUrl = sanitizeMediaUrl(pesan.konten);
                htmlKonten = `<audio controls src="${safeAudioUrl}" style="height:32px; width:180px;"></audio>`;
            } else if (pesan.tipe === 'gambar') {
                const safeImgUrl = sanitizeMediaUrl(pesan.konten);
                htmlKonten = `
                <div class="media-container" style="position:relative; width:200px;">
                    <div class="image-wrapper image-fullscreen-trigger" data-img="${safeImgUrl}" style="position:relative; border-radius:6px; overflow:hidden; cursor:pointer; height: 260px;">
                        <img src="${safeImgUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; -webkit-touch-callout:none; user-select:none;">
                    </div>
                </div>`;
            }

            const idUnik = snapshot.key; 
            
            if (pesan.pengirim === 'mitra' && pesan.status !== 'read') {
                update(ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan/${idUnik}`), { status: 'read' });
            }

            let statusIkon = '';
            if (pesan.pengirim === 'klien') {
                statusIkon = pesan.status === 'read' 
                    ? `<i class="fa-solid fa-check-double" style="color: #3b82f6; font-size: 0.65rem;"></i>` 
                    : `<i class="fa-solid fa-check" style="color: #9ca3af; font-size: 0.65rem;"></i>`;
            }

            const extraCardClass = (pesan.tipe === "katalog_order" || pesan.tipe === "lokasi" || pesan.tipe === "gambar") ? " msg-katalog-card" : "";
            const htmlElemen = `<div id="${escapeHTML(idUnik)}" class="msg-bubble ${posisiKelas}${extraCardClass}"><div class="msg-content">${htmlKonten}</div><span class="msg-time" style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 2px;">${new Date(pesan.waktu).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}${statusIkon}</span></div>`;
            
            wadahChat.insertAdjacentHTML('beforeend', htmlElemen);
            
            clearTimeout(wadahChat.scrollTimer);
            wadahChat.scrollTimer = setTimeout(() => wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' }), 150);
        });

        if (this.pemantauPesanUbah) this.pemantauPesanUbah();
        this.pemantauPesanUbah = onChildChanged(referensi, (snapshot) => {
            const pesanUbah = snapshot.val();
            if (pesanUbah && pesanUbah.pengirim === 'klien' && pesanUbah.status === 'read') {
                const elemenPesan = document.getElementById(snapshot.key);
                if (elemenPesan) {
                    const timeSpan = elemenPesan.querySelector('.msg-time');
                    if (timeSpan) {
                        timeSpan.innerHTML = `${new Date(pesanUbah.waktu).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})} <i class="fa-solid fa-check-double" style="color: #3b82f6; font-size: 0.65rem;"></i>`;
                    }
                }
            }
        });
    },

    mainkanSuara: function() {
        try {
            const AudioCtx = window.AudioContext ? window.AudioContext : window.webkitAudioContext;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
    },

    akhiriSesiObrolan: async function() {
        if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

        this._hentikanPollingRadar();
        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (pemantauMetadataOrder) { pemantauMetadataOrder(); pemantauMetadataOrder = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; } 

        const targetUid = uidPengemudiTarget;
        const targetTiket = idTiketAktif;

        idTiketAktif = null;
        uidPengemudiTarget = null;
        payloadTiketAktif = null;
        localStorage.removeItem('bgt_active_chat');

        if (targetTiket) {
            await Promise.allSettled([
                targetUid ? this._hapusRadarTiketREST(targetUid, targetTiket) : Promise.resolve(),
                (targetUid && dbChat) ? remove(ref(dbChat, `inbox_mitra/${targetUid}/${targetTiket}`)) : Promise.resolve(),
                dbChat ? remove(ref(dbChat, `sesi_komunikasi/${targetTiket}`)) : Promise.resolve()
            ]);
        }
        
        if (this._handleMovePersisten) {
            document.removeEventListener('mousemove', this._handleMovePersisten);
            document.removeEventListener('touchmove', this._handleMovePersisten);
        }
        if (this._handleEndPersisten) {
            document.removeEventListener('mouseup', this._handleEndPersisten);
            document.removeEventListener('touchend', this._handleEndPersisten);
        }

        this.putuskanKoneksiChat();
        
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();

        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel) {
            panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => panel.remove(), 300);
        }
        if (window.SystemReset) window.SystemReset();
    },

    kematianSesiPaksa: function(pesanAlert) {
        if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

        this._hentikanPollingRadar();
        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (pemantauMetadataOrder) { pemantauMetadataOrder(); pemantauMetadataOrder = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; }

        if (uidPengemudiTarget && idTiketAktif) {
            this._hapusRadarTiketREST(uidPengemudiTarget, idTiketAktif);
        }
        
        localStorage.removeItem('bgt_active_chat');
        
        if (this._handleMovePersisten) {
            document.removeEventListener('mousemove', this._handleMovePersisten);
            document.removeEventListener('touchmove', this._handleMovePersisten);
        }
        if (this._handleEndPersisten) {
            document.removeEventListener('mouseup', this._handleEndPersisten);
            document.removeEventListener('touchend', this._handleEndPersisten);
        }
        
        idTiketAktif = null;
        uidPengemudiTarget = null;
        payloadTiketAktif = null;

        this.putuskanKoneksiChat();
        
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();

        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel) {
            panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => panel.remove(), 300);
        }
        
        if (window.UIManager && pesanAlert) window.UIManager.alert(pesanAlert);
        if (window.SystemReset) window.SystemReset();
    },

    bukaLayarPenuhGambar: function(urlGambar) {
        const modal = document.getElementById('modal-fullscreen-img');
        const targetImg = document.getElementById('fullscreen-img-target');
        if (modal && targetImg) {
            targetImg.src = urlGambar;
            modal.classList.remove('hidden-state');
            requestAnimationFrame(() => modal.classList.remove('opacity-0'));
        }
    },

    tutupLayarPenuhGambar: function() {
        const modal = document.getElementById('modal-fullscreen-img');
        if (modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden-state'); document.getElementById('fullscreen-img-target').src = ''; }, 300);
        }
    }
};

const jalankanPemulihanAwalChat = () => {
    if (window.ChatHandshake) window.ChatHandshake.pulihkanSesiAktif();
};

if (window.ConfigManager && window.ConfigManager.isLoaded) {
    jalankanPemulihanAwalChat();
} else {
    window.addEventListener('bgn_config_loaded', jalankanPemulihanAwalChat, { once: true });
}

document.addEventListener("visibilitychange", () => {
    const idleMs = window.BGN_CONFIG?.rules_app?.chat_controls?.idle_disconnect_timeout_ms;
    if (document.visibilityState === 'hidden') {
        if (idleMs) {
            timerPemutusKoneksi = setTimeout(() => {
                if (dbChat) goOffline(dbChat);
            }, idleMs);
        }
    } else {
        clearTimeout(timerPemutusKoneksi);
        const panel = document.getElementById('panel-komunikasi-utama');
        if (dbChat && idTiketAktif && panel && panel.style.display !== 'none') {
            goOnline(dbChat);
        }
    }
});