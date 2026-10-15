// ==========================================
// FILE: js/core/config-manager.js
// FUNGSI: Penarik Tunggal Seluruh Konfigurasi JSON OTA (Zero Cache & Zero Fallback)
// ARSITEKTUR: SEQUENTIAL FETCH (Settings -> 6 Dependent Configs termasuk Peak Hours)
// ==========================================

window.BGN_CONFIG = {};

window.ConfigManager = {
    isLoaded: false,
    
    init: async function() {
        console.log("[ConfigManager] Memulai sinkronisasi konfigurasi OTA V8...");
        
        const fetchJson = async (path) => {
            if (!path) return null;
            try {
                const res = await fetch(path);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                console.error(`[ConfigManager] Gagal memuat ${path}:`, err);
                return null;
            }
        };

        // 1. TAHAP SEQUENTIAL: Tarik SSOT Utama (settings.json) Terlebih Dahulu
        const settings = await fetchJson('./data/settings.json');
        if (!settings || !settings.paths) {
            console.error("[ConfigManager] Kritis: settings.json gagal dimuat atau paths tidak tersedia.");
            return;
        }
        const paths = settings.paths;

        // 2. TAHAP PARALEL: Tarik seluruh file JSON dependen murni berdasarkan settings.paths
        const [
            wording,
            rulesApp,
            tariffs,
            zones,
            layanan,
            peakHours
        ] = await Promise.all([
            fetchJson(paths.wording),
            fetchJson(paths.rules_app),
            fetchJson(paths.tariffs),
            fetchJson(paths.zones),
            fetchJson(paths.layanan),
            fetchJson(paths.peak_hours)
        ]);

        // Injeksi Murni Ke RAM (100% Zero Hardcode Fallback)
        window.BGN_CONFIG = {
            settings: settings,
            wording: wording,
            rules_app: rulesApp,
            tariffs: tariffs,
            zones: zones,
            layanan: layanan,
            peak_hours: peakHours
        };

        this.isLoaded = true;
        window.dispatchEvent(new Event('bgn_config_loaded'));
        console.log("[ConfigManager] Sinkronisasi OTA V8 Selesai (Termasuk Peak Hours & Firebase Radar).");
    },
    
    get: function(keyPath) {
        return keyPath.split('.').reduce((o, i) => (o ? o[i] : undefined), window.BGN_CONFIG);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.ConfigManager.init();
});
