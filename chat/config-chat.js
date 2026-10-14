// ==========================================
// FILE: chat/config-chat.js
// FUNGSI: Otentikasi Proyek Chatting Eksternal (RTDB) (OTA READY)
// ARSITEKTUR: ASYNCHRONOUS INIT (BEBAS SYNTAX ERROR TOP-LEVEL AWAIT)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Menggunakan let agar nilainya bisa diikat (live binding) ke handshake
export let dbChat = null;

export const initFirebaseChat = async () => {
    if (dbChat) return dbChat; // Cegah inisialisasi ganda
    
    return new Promise((resolve) => {
        const setupFirebase = () => {
            const config = window.BGN_CONFIG?.settings?.firebase_chat;
            if (config && config.apiKey) {
                const chatApp = initializeApp(config, "komunikasiEksternal");
                dbChat = getDatabase(chatApp);
                resolve(dbChat);
            } else {
                console.error("[ChatConfig] Kredensial Firebase Chat tidak ditemukan di RAM.");
                resolve(null);
            }
        };

        // Otomatis menunggu ConfigManager (Utama) selesai bekerja
        if (window.ConfigManager && window.ConfigManager.isLoaded) {
            setupFirebase();
        } else {
            window.addEventListener('bgn_config_loaded', setupFirebase, { once: true });
        }
    });
};
