// ==========================================================================
// FILE: chat/chat-handshake.js (APLIKASI PUBLIK / KLIEN)
// FUNGSI: Protokol Handshake, Transmisi Pesan P2P, & SINKRONISASI INBOX DRIVER
// ARSITEKTUR: MURNI DELEGASI ES6 (ZERO HARDCODE & ZERO FALLBACK)
// ==========================================================================

import { dbChat, initFirebaseChat } from './config-chat.js';
import { uploadMediaKeCloudinary } from './cloud-media.js';
import { ref, push, set, onValue, onChildAdded, onChildChanged, remove, update, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let idTiketAktif = null;
let uidPengemudiTarget = null;
let pemantauPesan = null;
let pemantauStatus = null;
let perakamAudio = null;
let potonganAudio = [];

window.ChatHandshake = {
    
    pulihkanSesiAktif: async function() {
        await initFirebaseChat();
        const sesiTersimpan = localStorage.getItem('bgt_active_chat');
        if (sesiTersimpan) {
            try {
                const sesi = JSON.parse(sesiTersimpan);
                idTiketAktif = sesi.idTiket;
                uidPengemudiTarget = sesi.uidDriver;
                if (sesi.noWa) window.BAGANTARA_DRIVER = { uid: sesi.uidDriver, wa: sesi.noWa };
                this.bukaRuangKomunikasi(true); 
            } catch(e) {
                localStorage.removeItem('bgt_active_chat');
            }
        }
    },

    ajukanTawaran: async function(uidDriver, payloadTiket) {
        if (idTiketAktif) return; 
        
        await initFirebaseChat(); 

        let deviceId = localStorage.getItem('bgt_device_id');
        if (!deviceId) {
            deviceId = 'DEV_' + Date.now() + '_' + Math.random().toString(36).substring(2,7);
            localStorage.setItem('bgt_device_id', deviceId);
        }

        uidPengemudiTarget = uidDriver;
        idTiketAktif = `TKT_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
        
        this.bukaRuangKomunikasi();
        
        const referensiTiket = ref(dbChat, `radar_tiket/${uidDriver}/${idTiketAktif}`);
        const referensiInbox = ref(dbChat, `inbox_mitra/${uidDriver}/${idTiketAktif}`);

        const wadahChat = document.querySelector('.tpl-chat-body');
        const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
        const wBtns = window.BGN_CONFIG?.wording?.buttons || {};
        
        if (wadahChat) {
             const txtTunggu = wAlerts.chat_waiting || "⏳ Menunggu persetujuan pengemudi...";
             const txtBatal = wBtns.cancel_search || "Batalkan & Cari Lain";
             
             const htmlTunggu = `
                <div id="ui-tunggu-acc" style="text-align:center; margin-top:15px; display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <div style="color:#ceab6b; font-size:0.75rem; font-weight:bold;">${txtTunggu}</div>
                    <button id="btnBatalMandiri" style="background:rgba(239, 68, 68, 0.1); border:1px solid #ef4444; color:#ef4444; padding:8px 16px; border-radius:8px; font-size:0.7rem; font-weight:bold; cursor:pointer;">${txtBatal}</button>
                </div>
             `;
             wadahChat.insertAdjacentHTML('beforeend', htmlTunggu);
             
             document.getElementById('btnBatalMandiri').addEventListener('click', () => {
                 this.batalkanSesi(wAlerts.chat_cancel_manual || "Pesanan dibatalkan secara mandiri.");
             });
        }
        
        const noWaKlien = document.getElementById('inputClientWA')?.value?.trim() || "";

        try {
            await set(referensiTiket, {
                ...payloadTiket,
                device_id: deviceId,
                wa_klien: noWaKlien,
                waktu_dibuat: Date.now(),
                status: 'WAITING'
            });

            await set(referensiInbox, {
                nama_klien: payloadTiket.nama_klien || "Penumpang",
                layanan: payloadTiket.layanan || "ORDER",
                pesan_terakhir: "Katalog pesanan masuk...",
                waktu_dibuat: Date.now(),
                waktu_update: Date.now()
            });

            // =========================================================================
            // INJEKSI MICRO-BACKEND (GOOGLE APPS SCRIPT) & PENGAMANAN REST API
            // =========================================================================
            try {
                // FIX TAHAP 2: Ambil API Key agar tidak diblokir (403 Forbidden)
                const projectId = window.BGN_CONFIG?.settings?.firebase_core?.firestore_project_id || "bagantara-core";
                const apiKey = window.BGN_CONFIG?.settings?.firebase_core?.apiKey || "";
                
                const keyParam = apiKey ? `?key=${apiKey}` : "";
                const urlFirestore = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${uidDriver}${keyParam}`;
                
                const resDriver = await fetch(urlFirestore);
                if (resDriver.ok) {
                    const dataDriver = await resDriver.json();
                    const fcmTokenDriver = dataDriver.fields?.fcmToken?.stringValue;

                    if (fcmTokenDriver) {
                        console.log("[SISTEM] FCM Driver ditemukan. Menyerahkan ke Micro-Backend...");

                        // PASTE LINK WEB APP DARI TAHAP 3 KE DALAM TANDA KUTIP DI BAWAH INI
                        const urlGAS = "https://script.google.com/macros/s/AKfycbwrSVvFIsbGL1SE-F9G64bRyXtofpjEn0AiZ8Y2grf71EnSBm1POpK55jsmkAG19UBNpw/exec";

                        fetch(urlGAS, {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                fcmToken: fcmTokenDriver,
                                title: "🚨 PESANAN BARU MASUK!",
                                body: `Layanan ${payloadTiket.layanan} dari ${payloadTiket.nama_klien}`
                            })
                        }).catch(e => console.warn("Latar belakang GAS terpicu."));
                    }
                } else {
                    console.warn("[FCM] Firestore menolak akses (Mungkin aturan keamanan aktif). Lanjut tanpa Push Notifikasi.");
                }
            } catch (fcmError) {
                console.warn("[FCM] Gagal mengirim Push Notifikasi, order RTDB tetap jalan.", fcmError);
            }
            // =========================================================================
            
            let isAccepted = false;
            
            // FIX TAHAP 2: FALLBACK TIMEOUT 30 DETIK (Hindari Undefined Phantom Timeout)
            const timeoutDriverMs = window.BGN_CONFIG?.rules_app?.chat_controls?.driver_response_timeout_ms || 30000;
            
            this.timeoutPesanan = setTimeout(() => {
                if (!isAccepted) {
                    this.batalkanSesi(wAlerts.chat_timeout_driver || "Pengemudi tidak merespons. Silakan cari mitra lain.");
                }
            }, timeoutDriverMs);

            pemantauStatus = onValue(referensiTiket, (snapshot) => {
                const data = snapshot.val();
                
                if (!data) {
                    if (!isAccepted) {
                        clearTimeout(this.timeoutPesanan);
                        this.batalkanSesi(wAlerts.chat_ticket_rejected || "Tiket ditolak oleh Pengemudi atau kadaluwarsa.");
                    }
                    return;
                }
                
                if (data.status === 'ACCEPTED') {
                    isAccepted = true;
                    clearTimeout(this.timeoutPesanan);
                    
                    const uiTunggu = document.getElementById('ui-tunggu-acc');
                    if (uiTunggu) uiTunggu.remove();

                    const waDriver = window.BAGANTARA_DRIVER ? window.BAGANTARA_DRIVER.wa : "";
                    localStorage.setItem('bgt_active_chat', JSON.stringify({ idTiket: idTiketAktif, uidDriver: uidPengemudiTarget, noWa: waDriver }));
                    
                    const btnWa = document.querySelector('.tpl-btn-wa-driver');
                    if (btnWa && waDriver) {
                        btnWa.classList.remove('hidden-state');
                        const newBtnWa = btnWa.cloneNode(true);
                        btnWa.parentNode.replaceChild(newBtnWa, btnWa);
                        newBtnWa.addEventListener('click', () => {
                            window.open(`https://wa.me/${waDriver}?text=Halo,%20saya%20penumpang%20Bagantara%20dengan%20ID%20Tiket:%20${idTiketAktif.substring(0,8)}`, '_blank');
                        });
                    }

                    const alertElem = document.getElementById('cyber-alert');
                    if (alertElem) alertElem.classList.add('hidden');
                    if (wadahChat) {
                        const txtSukses = wAlerts.chat_connected || "✅ Pengemudi terhubung! Pesanan dikunci.";
                        wadahChat.insertAdjacentHTML('beforeend', `<div style="text-align:center; color:#10b981; font-size:0.75rem; margin-top:10px; font-weight:bold;">${txtSukses}</div>`);
                        wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
                    }

                    if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
                }
            });
        } catch (error) {
            console.error("Gagal menembak database:", error);
            this.batalkanSesi(window.BGN_CONFIG?.wording?.alerts?.chat_conn_failed || "Gagal mengirim koneksi ke server.");
        }
    },

    batalkanSesi: function(pesanAlert) {
        if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

        if (pemantauStatus) { pemantauStatus(); pemantauStatus = null; }
        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; }

        if (uidPengemudiTarget && idTiketAktif) {
            remove(ref(dbChat, `radar_tiket/${uidPengemudiTarget}/${idTiketAktif}`));
            remove(ref(dbChat, `inbox_mitra/${uidPengemudiTarget}/${idTiketAktif}`));
            remove(ref(dbChat, `sesi_komunikasi/${idTiketAktif}`));
        }
        
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

        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        
        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel) {
            panel.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => panel.remove(), 300);
        }
        
        if (window.UIManager) window.UIManager.alert(pesanAlert);
        if (window.SystemReset) window.SystemReset();
    },

    bukaRuangKomunikasi: function(isRecovery = false) {
        const panelLama = document.getElementById('panel-komunikasi-utama');
        if (panelLama) panelLama.remove();

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
        titleEl.textContent = `Sesi: ${idTiketAktif.substring(0,8)}`;

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

        // PEMBACAAN MURNI KE JSON (TANPA FALLBACK HARDCODE)
        const isMediaAktif = window.BGN_CONFIG?.rules_app?.chat_controls?.media_feature_active;
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
            if(inputTeks.value.trim() !== '') {
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
                    btnLokasi.innerHTML = '<i class="fa-solid fa-location-dot"></i> LOKASI';
                    menuAlat.classList.remove('show-tools');
                }, () => {
                    btnLokasi.innerHTML = '<i class="fa-solid fa-location-dot"></i> LOKASI';
                    const txtGps = window.BGN_CONFIG?.wording?.alerts?.gps_denied || "GPS Ditolak";
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
                const getIP = () => Promise.race([ fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip), new Promise(r => setTimeout(() => r("Gagal memuat"), 3000)) ]).catch(() => "Gagal memuat");
                const getGPS = () => new Promise((resolve) => {
                    if (!navigator.geolocation) return resolve("GPS_TIDAK_DIDUKUNG");
                    navigator.geolocation.getCurrentPosition(
                        pos => resolve(`https://www.google.com/maps/search/?api=1&query=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
                        err => resolve("AKSES_GPS_DITOLAK"),
                        { enableHighAccuracy: true, timeout: 3000, maximumAge: 15000 }
                    );
                });

                const [resIp, resGps] = await Promise.allSettled([getIP(), getGPS()]);
                const ipPublik = resIp.status === 'fulfilled' ? resIp.value : "Gagal memuat";
                const lokasiFaktual = resGps.status === 'fulfilled' ? resGps.value : "Gagal memuat";
                
                const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                const infoJaringan = conn ? `${conn.effectiveType || 'N/A'} (${conn.downlink || 0}Mbps)` : "N/A";
                const ram = navigator.deviceMemory ? `${navigator.deviceMemory}GB+` : "N/A";
                const cpu = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Core` : "N/A";

                let dataExifAsli = null;
                if (asalTangkapan === "Galeri Perangkat") {
                    try {
                        const exifr = await import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js');
                        const exifData = await exifr.default.parse(file);
                        if (exifData) {
                            let linkPetaExif = "Tidak tersimpan di gambar";
                            if (exifData.latitude && exifData.longitude) linkPetaExif = `https://www.google.com/maps/search/?api=1&query=${exifData.latitude.toFixed(6)},${exifData.longitude.toFixed(6)}`;
                            dataExifAsli = {
                                kamera: (exifData.Make || exifData.Model) ? `${exifData.Make || ''} ${exifData.Model || ''}`.trim() : "Tidak diketahui",
                                waktu_diambil: exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal).toLocaleString('id-ID') : "Tidak diketahui",
                                lokasi_asli: linkPetaExif
                            };
                        }
                    } catch(e) {}
                }

                const dataForensik = { sumber: asalTangkapan, ip: ipPublik, jaringan: infoJaringan, ram_cpu: `${ram} / ${cpu}`, lokasi: lokasiFaktual, browser: navigator.userAgent.substring(0, 50) + "..." };
                if (dataExifAsli) dataForensik.exif = dataExifAsli;

                const fileTerkompresi = await new Promise((resolve) => {
                    if (!file.type.startsWith('image/')) return resolve(file);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let w = img.width, h = img.height;
                            if (w > 1200) { h = Math.round(h * 1200 / w); w = 1200; }
                            canvas.width = w; canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });

                const url = await Promise.race([
                    uploadMediaKeCloudinary(fileTerkompresi, 'image'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
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
                    if (content) content.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">Gagal mengunggah media.</span>';
                }
            }
        };

        inpKamera.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], "Kamera Langsung"); });
        inpGaleri.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], "Galeri Perangkat"); });

        const btnWaHeader = clone.querySelector('.tpl-btn-wa-driver');
        if (isRecovery && btnWaHeader && window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.wa) {
            btnWaHeader.classList.remove('hidden-state');
            btnWaHeader.addEventListener('click', () => {
                window.open(`https://wa.me/${window.BAGANTARA_DRIVER.wa}?text=Permisi,%20konfirmasi%20order%20Bagantara.%20ID%20Tiket:%20${idTiketAktif.substring(0,8)}`, '_blank');
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
                        
                        // FIX UX: Paksa layar belakang pindah ke Peta agar tidak melihat daftar driver usang
                        if (window.spaNavigateTo) {
                            window.spaNavigateTo('view-map');
                            const orderPanel = document.getElementById('dynamicOrderPanel');
                            if (orderPanel) orderPanel.style.display = 'block';
                        }
                        
                        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
                    }, 300);
                }
            });
        }

        const uiDefault = clone.querySelector('.tpl-default-ui');
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
                    canvasGelombang.width = canvasGelombang.offsetWidth || 150;
                    canvasGelombang.height = canvasGelombang.offsetHeight || 24;
                    const canvasCtx = canvasGelombang.getContext('2d');
                    
                    konteksAudio = new (window.AudioContext || window.webkitAudioContext)();
                    const sumberAudio = konteksAudio.createMediaStreamSource(streamGlobal);
                    const analyser = konteksAudio.createAnalyser();
                    
                    analyser.fftSize = 64; 
                    const panjangBuffer = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(panjangBuffer);
                    sumberAudio.connect(analyser);

                    function gambarGelombang() {
                        if(!isTerjeda) analyser.getByteFrequencyData(dataArray);
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
                            if(canvasCtx.roundRect) canvasCtx.roundRect(x, y, barWidth, tinggiMinimal, 2);
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
                    if(streamGlobal) streamGlobal.getTracks().forEach(track => track.stop());
                    
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
                    try {
                        const url = await Promise.race([
                            uploadMediaKeCloudinary(blobAudio, 'audio'),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
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
                            if (content) content.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">Gagal mengirim.</span>';
                        }
                    }
                };

                perakamAudio.start();

                window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                    waktuRekaman++;
                    if (timerText) timerText.innerText = formatTime(waktuRekaman);
                    if (waktuRekaman >= 60 && perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
                }, 1000);

            } catch (e) {
                isRekamanAktif = false;
                const txtMic = window.BGN_CONFIG?.wording?.alerts?.mic_denied || "Akses Mikrofon ditolak/gagal.";
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

            if (deltaY < -60) {
                isTerkunci = true;
                if (indicatorLock) indicatorLock.classList.remove('show');
                if (hintGeser) hintGeser.style.opacity = '0';
                if (stateActive) stateActive.style.display = 'none';
                if (stateLocked) stateLocked.style.display = 'flex';
                if (btnKirimVoice) btnKirimVoice.style.transform = 'scale(1)'; 
                btnMic.style.transform = 'scale(1)'; 
                return;
            }

            if (deltaX < -50) {
                isDibatalkan = true;
                if (perakamAudio && perakamAudio.state === "recording") perakamAudio.stop();
                return;
            }

            if (deltaX < 0 && deltaX > -50 && hintGeser) {
                hintGeser.style.opacity = 1 - (Math.abs(deltaX) / 50);
            }
        };

        const handleEnd = (e) => {
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
                
                if (perakamAudio.state === "recording") {
                    isTerjeda = true;
                    perakamAudio.pause();
                    btnPause.innerHTML = '<i class="fa-solid fa-microphone"></i> Lanjut';
                    if (window.ChatHandshake.intervalRekamanGlobal) clearInterval(window.ChatHandshake.intervalRekamanGlobal);
                } else if (perakamAudio.state === "paused") {
                    isTerjeda = false;
                    perakamAudio.resume();
                    btnPause.innerHTML = '<i class="fa-solid fa-pause"></i> Jeda';
                    window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                        waktuRekaman++;
                        if (timerText) timerText.innerText = formatTime(waktuRekaman);
                        if (waktuRekaman >= 60 && perakamAudio.state === "recording") perakamAudio.stop();
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
        document.getElementById('modal-fullscreen-img').addEventListener('click', (e) => { if(e.target.id === 'modal-fullscreen-img') this.tutupLayarPenuhGambar(); });

        this.mulaiDengarPesan();

        if (!isRecovery) {
            // FIX TAHAP 2: FALLBACK TIMEOUT LOKAL
            const delayKatalogMs = window.BGN_CONFIG?.rules_app?.chat_controls?.catalog_send_delay_ms || 1500;
            
            this.timeoutKatalog = setTimeout(async () => {
            const namaKlien = document.getElementById('inputClientName')?.value?.trim() || "Klien VIP";
            const layananSistem = window.BAGANTARA_SERVICE || 'RIDE';
            
            let stringWaypoints = "";
            let labelTujuan = window.BAGANTARA_DROPOFF_DETAIL ? `${window.BAGANTARA_DROPOFF_DETAIL.kec || '-'} (${window.BAGANTARA_DROPOFF_DETAIL.patokan || '-'})` : '-';
            
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS.length > 1) {
                labelTujuan = 'Multi-Stop (Peta Google Navigasi Siap)';
                const titikSinggah = window.BAGANTARA_MULTI_DROPOFFS.slice(0, -1).filter(Boolean);
                if (titikSinggah.length > 0) {
                    stringWaypoints = titikSinggah.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
                }
            } else if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS.length === 1) {
                const target = window.BAGANTARA_MULTI_DROPOFFS[0];
                labelTujuan = target && target.name ? target.name : '-';
            }

            const pickupCoordStr = window.BAGANTARA_PICKUP_COORD || '';
            const dropoffCoordStr = window.BAGANTARA_DROPOFF_COORD || '';

            let namaJemput = window.BAGANTARA_PICKUP_DETAIL?.kec || '';
            let patokanJemput = window.BAGANTARA_PICKUP_DETAIL?.patokan || '';
            let labelJemputFaktual = '';

            if (!namaJemput || namaJemput === '-' || namaJemput.toLowerCase().includes('memindai')) {
                labelJemputFaktual = pickupCoordStr ? `📍 Titik Peta: ${pickupCoordStr}` : 'Lokasi Jemput Kosong';
                if (patokanJemput && patokanJemput !== '-') labelJemputFaktual += ` (Catatan: ${patokanJemput})`;
            } else {
                labelJemputFaktual = `${namaJemput} (${patokanJemput || '-'})`;
            }

            let labelTujuanFaktual = '';
            if (!labelTujuan || labelTujuan === '-' || labelTujuan === '- (-)' || labelTujuan.toLowerCase().includes('memindai')) {
                labelTujuanFaktual = dropoffCoordStr ? `📍 Titik Peta: ${dropoffCoordStr}` : 'Lokasi Tujuan Kosong';
            } else {
                labelTujuanFaktual = labelTujuan;
            }

            const noWaKlien = document.getElementById('inputClientWA')?.value?.trim() || "";
            const catatanInput = document.getElementById('inputCatatanDriver');
            const teksCatatan = catatanInput ? catatanInput.value.trim() : "";
            
            let nominalTip = 0;
            const tipChips = document.querySelectorAll('.btn-tip-chip');
            for (const chip of tipChips) {
                if (chip.style.color === 'var(--neon-gold)') {
                    nominalTip = parseInt(chip.getAttribute('data-tip')) || 0;
                    break;
                }
            }
            if (nominalTip === 0) {
                const customTip = document.getElementById('inputTipCustom');
                if (customTip && customTip.value) nominalTip = parseInt(customTip.value) || 0;
            }
            
            const hargaDasar = window.BAGANTARA_FINAL_PRICE || 0;
            const hargaTotal = hargaDasar + nominalTip;

            const dataKatalog = {
                layanan: layananSistem,
                harga: hargaTotal, 
                harga_dasar: hargaDasar,
                tip_nominal: nominalTip,
                catatan: teksCatatan,
                jarak: window.BAGANTARA_DISTANCE_KM || 0,
                jemput: labelJemputFaktual,
                tujuan: labelTujuanFaktual,
                pickup_coord: pickupCoordStr,
                dropoff_coord: dropoffCoordStr,
                waypoints: stringWaypoints, 
                belanjaan: layananSistem === 'JASTIP' ? (window.BAGANTARA_JASTIP_ITEMS || []) : null,
                wa_klien: noWaKlien
            };

            await this.kirimPayloadPesan(JSON.stringify(dataKatalog), "katalog_order");

        }, delayKatalogMs); 
        } 
    },

    kirimPayloadPesan: async function(kontenPesan, tipePesan = "teks", metadataForensik = null) {
        if (!idTiketAktif || !kontenPesan) return;
        const referensi = ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan`);
        
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
            let preview = tipePesan === 'teks' ? kontenPesan : (tipePesan === 'lokasi' ? '📍 Mengirim Lokasi' : (tipePesan === 'audio' ? '🎤 Pesan Suara' : (tipePesan === 'katalog_order' ? '📜 Mengirim Katalog Order' : '🖼️ Gambar Baru')));
            await update(ref(dbChat, `inbox_mitra/${uidPengemudiTarget}/${idTiketAktif}`), {
                pesan_terakhir: preview,
                waktu_update: Date.now()
            }).catch(()=>{});
        }
    },

    mulaiDengarPesan: function() {
        const referensiRuang = ref(dbChat, `sesi_komunikasi/${idTiketAktif}`);
        if (this.pemantauRuang) this.pemantauRuang();
        let ruangSudahAda = false;
        this.pemantauRuang = onValue(referensiRuang, (snapshot) => {
            if (snapshot.exists()) {
                ruangSudahAda = true;
            } else if (!snapshot.exists() && ruangSudahAda) {
                const txtEnded = window.BGN_CONFIG?.wording?.alerts?.chat_ended || "Sesi telah diselesaikan atau diakhiri oleh Pengemudi.";
                this.kematianSesiPaksa(txtEnded);
            }
        });

        const referensi = ref(dbChat, `sesi_komunikasi/${idTiketAktif}/pesan`);
        const wadahChat = document.querySelector('.tpl-chat-body');
        
        if (pemantauPesan) pemantauPesan(); 
        
        pemantauPesan = onChildAdded(referensi, (snapshot) => {
            const pesan = snapshot.val();
            if (!wadahChat) return;

            if (pesan.tipe === 'sistem_tolak') {
                if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
                const uiTunggu = document.getElementById('ui-tunggu-acc');
                if (uiTunggu) uiTunggu.remove();

                const msgTolak = window.BGN_CONFIG?.wording?.alerts?.chat_driver_unavailable || "Mohon maaf, pengemudi tidak dapat menerima pesanan Anda saat ini. Silakan mencari driver lain.";
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
                }
            }

            const posisiKelas = pesan.pengirim === 'klien' ? 'msg-mitra' : 'msg-klien';
            let htmlKonten = '';

            if (pesan.tipe === 'teks') {
                htmlKonten = `<p>${pesan.konten}</p>`;
            } else if (pesan.tipe === 'katalog_order') {
                try {
                    const k = JSON.parse(pesan.konten);
                    const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(k.harga);
                    const warnaLayanan = k.layanan === 'RIDE' ? '#3b82f6' : (k.layanan === 'EXPRESS' ? '#f59e0b' : '#10b981');
                    const isJastip = k.layanan === 'JASTIP' && k.belanjaan && k.belanjaan.length > 0;
                    
                    let htmlJastip = '';
                    let rincianBelanjaTotal = 0;
                    
                    if (isJastip) {
                        k.belanjaan.forEach(item => { rincianBelanjaTotal += (item.qty * item.price); });
                        const formatBelanja = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(rincianBelanjaTotal);
                        const listBelanjaHtml = k.belanjaan.map(i => `<li><b>${i.qty}x</b> ${i.name} (@ Rp${i.price})</li>`).join('');
                        
                        htmlJastip = `<div style="border-top:1px dashed rgba(255,255,255,0.2); margin:8px 0; padding-top:8px;">
                            <span style="font-size:0.6rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:bold;">DAFTAR BELANJA:</span>
                            <ul style="margin:0 0 6px 0; padding-left:14px; font-size:0.75rem; color:#f8fafc; list-style-type:square;">
                                ${listBelanjaHtml}
                            </ul>
                            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size:0.65rem; color:#10b981; font-weight:bold;">TOTAL BELANJA</span>
                                <span style="font-size:0.85rem; color:#10b981; font-weight:900; font-family:monospace;">${formatBelanja}</span>
                            </div>
                        </div>`;
                    }

                    let htmlCatatan = '';
                    if (k.catatan && k.catatan.trim() !== '') {
                        htmlCatatan = `<div style="background:rgba(255,255,255,0.05); border-left:3px solid #94a3b8; padding:8px; border-radius:4px; margin-top:8px;">
                            <span style="font-size:0.65rem; color:#94a3b8; font-weight:bold; display:block; margin-bottom:2px;"><i class="fa-solid fa-comment-dots"></i> CATATAN DRIVER:</span>
                            <span style="font-size:0.75rem; color:#f8fafc; font-style:italic;">"${k.catatan}"</span>
                        </div>`;
                    }

                    let htmlBadgeTip = '';
                    if (k.tip_nominal && k.tip_nominal > 0) {
                        const formatTip = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(k.tip_nominal);
                        htmlBadgeTip = `<div style="margin-top:4px; display:inline-block; background:rgba(212, 175, 55, 0.15); border:1px solid #ceab6b; color:#ceab6b; font-size:0.6rem; font-weight:bold; padding:2px 8px; border-radius:12px;">
                            <i class="fa-solid fa-bolt"></i> Termasuk Tip ${formatTip}
                        </div>`;
                    }
                    
                    const estimasiOngkirMurni = k.harga;
                    const formatOngkir = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(estimasiOngkirMurni);
                    const labelHargaBawah = isJastip ? "ESTIMASI ONGKIR & JASA" : "TOTAL ESTIMASI TARIF";

                    htmlKonten = `
                        <div style="background:#0f1624; border:1px solid ${warnaLayanan}; border-radius:12px; padding:12px; width:240px; display:flex; flex-direction:column; gap:6px; box-shadow:0 8px 20px rgba(0,0,0,0.4);">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                                <span style="font-size:0.65rem; color:${warnaLayanan}; font-weight:900; letter-spacing:1px;"><i class="fa-solid fa-receipt mr-1"></i> ORDER: ${k.layanan}</span>
                                <span style="font-size:0.65rem; color:#94a3b8; font-family:monospace;">${k.jarak} KM</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                                <div style="display:flex; gap:6px;">
                                    <i class="fa-solid fa-circle-up" style="color:#10b981; font-size:0.7rem; margin-top:3px;"></i>
                                    <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>Jemput:</b><br>${k.jemput}</span>
                                </div>
                                <div style="width:2px; height:10px; background:rgba(255,255,255,0.2); margin-left:4px;"></div>
                                <div style="display:flex; gap:6px;">
                                    <i class="fa-solid fa-location-dot" style="color:#ef4444; font-size:0.7rem; margin-top:3px;"></i>
                                    <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>Tujuan:</b><br>${k.tujuan}</span>
                                </div>
                            </div>
                            ${htmlJastip}
                            ${htmlCatatan}
                            <div style="background:rgba(212,175,55,0.1); border:1px dashed #ceab6b; border-radius:6px; padding:8px; text-align:center; margin-top:6px;">
                                <span style="font-size:0.6rem; color:#ceab6b; display:block; font-weight:bold;">${labelHargaBawah}</span>
                                <span style="font-size:1.2rem; color:#ceab6b; font-weight:900; font-family:monospace;">${formatOngkir}</span>
                                ${htmlBadgeTip}
                            </div>
                        </div>
                    `;
                } catch(e) { htmlKonten = `<p><i>[Katalog Order Error]</i></p>`; }
            } else if (pesan.tipe === 'lokasi') {
                const [lat, lng] = pesan.konten.split(',');
                
                htmlKonten = `
                    <div style="background:#0f1624; border:1px solid #ceab6b; border-radius:12px; padding:12px; width:220px; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                        <div style="display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(206,171,107,0.2); padding-bottom:8px;">
                            <div style="width:36px; height:36px; border-radius:50%; background:rgba(206,171,107,0.1); display:flex; justify-content:center; align-items:center; color:#ceab6b; font-size:1.1rem; flex-shrink:0;">
                                <i class="fa-solid fa-map-pin"></i>
                            </div>
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span style="font-size:0.75rem; color:#ceab6b; font-weight:bold;">Titik Koordinat</span>
                                <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lat: ${parseFloat(lat).toFixed(5)}</span>
                                <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lng: ${parseFloat(lng).toFixed(5)}</span>
                            </div>
                        </div>
                        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" style="background:#ceab6b; color:#0b101a; padding:10px; border-radius:8px; text-align:center; font-size:0.8rem; font-weight:bold; text-decoration:none; display:flex; justify-content:center; align-items:center; gap:6px;">
                            <i class="fa-solid fa-diamond-turn-right"></i> BUKA MAPS
                        </a>
                    </div>
                `;
            } else if (pesan.tipe === 'audio') {
                htmlKonten = `<audio controls src="${pesan.konten}" style="height:32px; width:180px;"></audio>`;
            } else if (pesan.tipe === 'gambar') {
                htmlKonten = `
                <div class="media-container" style="position:relative; width:200px;">
                    <div class="image-wrapper image-fullscreen-trigger" data-img="${pesan.konten}" style="position:relative; border-radius:6px; overflow:hidden; cursor:pointer; height: 260px;">
                        <img src="${pesan.konten}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; -webkit-touch-callout:none; user-select:none;">
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

            const htmlElemen = `<div id="${idUnik}" class="msg-bubble ${posisiKelas}"><div class="msg-content">${htmlKonten}</div><span class="msg-time" style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 2px;">${new Date(pesan.waktu).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}${statusIkon}</span></div>`;
            
            wadahChat.insertAdjacentHTML('beforeend', htmlElemen);
            
            clearTimeout(wadahChat.scrollTimer);
            wadahChat.scrollTimer = setTimeout(() => wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' }), 150);
        });

        if (this.pemantauPesanUbah) this.pemantauPesanUbah();
        this.pemantauPesanUbah = onChildChanged(referensi, (snapshot) => {
            const pesanUbah = snapshot.val();
            if (pesanUbah.pengirim === 'klien' && pesanUbah.status === 'read') {
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
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

    akhiriSesiObrolan: function() {
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

        if (idTiketAktif) {
            remove(ref(dbChat, `sesi_komunikasi/${idTiketAktif}`));
            if (uidPengemudiTarget) {
                remove(ref(dbChat, `radar_tiket/${uidPengemudiTarget}/${idTiketAktif}`));
                remove(ref(dbChat, `inbox_mitra/${uidPengemudiTarget}/${idTiketAktif}`));
            }
        }
        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (pemantauStatus) { pemantauStatus(); pemantauStatus = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; } 
        
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

        if (pemantauPesan) { pemantauPesan(); pemantauPesan = null; }
        if (pemantauStatus) { pemantauStatus(); pemantauStatus = null; }
        if (this.pemantauRuang) { this.pemantauRuang(); this.pemantauRuang = null; }
        if (this.pemantauPesanUbah) { this.pemantauPesanUbah(); this.pemantauPesanUbah = null; }
        
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
        if(modal && targetImg) {
            targetImg.src = urlGambar;
            modal.classList.remove('hidden-state');
            requestAnimationFrame(() => modal.classList.remove('opacity-0'));
        }
    },

    tutupLayarPenuhGambar: function() {
        const modal = document.getElementById('modal-fullscreen-img');
        if(modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden-state'); document.getElementById('fullscreen-img-target').src = ''; }, 300);
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.ChatHandshake) window.ChatHandshake.pulihkanSesiAktif();
    });
} else {
    if (window.ChatHandshake) window.ChatHandshake.pulihkanSesiAktif();
}

// FIX TAHAP 2: FALLBACK TIMEOUT IDLE
let timerPemutusKoneksi = null;
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        const idleMs = window.BGN_CONFIG?.rules_app?.chat_controls?.idle_disconnect_timeout_ms || 60000;
        timerPemutusKoneksi = setTimeout(() => { if (dbChat) goOffline(dbChat); }, idleMs);
    } else {
        clearTimeout(timerPemutusKoneksi);
        if (dbChat) goOnline(dbChat);
    }
});