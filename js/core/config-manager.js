// ==========================================
// FILE: js/core/config-manager.js
// FUNGSI: Penarik Tunggal Seluruh Konfigurasi JSON OTA (Zero Cache)
// ARSITEKTUR: SEQUENTIAL FETCH (Settings -> Dependent Configs)
// ==========================================

window.BGN_CONFIG = {};

window.ConfigManager = {
    isLoaded: false,
    
    init: async function() {
        console.log("[ConfigManager] Memulai sinkronisasi konfigurasi OTA...");
        
        const fetchJson = async (path) => {
            if (!path) return null;
            try {
                // PERBAIKAN LOKAL: Gunakan fetch murni. Server Android Acode menolak modifikasi header.
                const res = await fetch(path);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                console.error(`[ConfigManager] Gagal memuat ${path}:`, err);
                return null;
            }
        };

        // 1. TAHAP SEQUENTIAL: Tarik SSOT Utama (settings.json) Terlebih Dahulu
        const settings = await fetchJson('./data/settings.json') || {};
        const paths = settings.paths || {}; // Membaca kapabilitas OTA Path Dinamis

        // 2. TAHAP PARALEL: Tarik file lain secara dinamis murni berdasarkan settings (ZERO HARDCODE)
        const [
            wording, rulesApp, tariffs, zones, layanan
        ] = await Promise.all([
            fetchJson(paths.wording),
            fetchJson(paths.rules_app),
            fetchJson(paths.tariffs),
            fetchJson(paths.zones),
            fetchJson(paths.layanan)
        ]);

        // Injeksi Ke RAM (SSOT Terpusat pada rules_app)
        window.BGN_CONFIG = {
            settings: settings,
            wording: wording || {},
            rules_app: rulesApp || {},
            tariffs: tariffs || {},
            zones: zones || {},
            layanan: layanan || {}
        };

        this.isLoaded = true;
        // Penembak sinyal saraf global bahwa otak JSON sudah siap
        window.dispatchEvent(new Event('bgn_config_loaded'));
        console.log("[ConfigManager] Sinkronisasi OTA Selesai.");
    },
    
    get: function(keyPath) {
        return keyPath.split('.').reduce((o, i) => (o ? o[i] : undefined), window.BGN_CONFIG);
    }
};

// Auto-trigger tanpa menunda DOM
document.addEventListener('DOMContentLoaded', () => {
    window.ConfigManager.init();
});
