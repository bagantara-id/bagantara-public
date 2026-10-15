// ==========================================
// FILE: chat/config-chat.js
// FUNGSI: Otentikasi Proyek Chatting Eksternal (RTDB) & Endpoint Radar Ke-3 (V8 ZERO HARDCODE)
// ARSITEKTUR: ASYNCHRONOUS INIT MURNI DARI window.BGN_CONFIG.settings
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

export let dbChat = null;

export const getRadarDatabaseUrl = () => {
    return window.BGN_CONFIG?.settings?.firebase_radar?.databaseURL;
};

export const initFirebaseChat = async () => {
    if (dbChat) return dbChat;
    
    return new Promise((resolve) => {
        const setupFirebase = () => {
            const config = window.BGN_CONFIG?.settings?.firebase_chat;
            if (config && config.apiKey && config.databaseURL) {
                const chatApp = initializeApp(config, "komunikasiEksternal");
                dbChat = getDatabase(chatApp);
                resolve(dbChat);
            } else {
                console.error("[ChatConfig] Kredensial Firebase Chat tidak ditemukan di settings.json.");
                resolve(null);
            }
        };

        if (window.ConfigManager && window.ConfigManager.isLoaded) {
            setupFirebase();
        } else {
            window.addEventListener('bgn_config_loaded', setupFirebase, { once: true });
        }
    });
};
