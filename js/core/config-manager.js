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

        // 3. SINKRONISASI PUSAT WILAYAH DINAMIS:
        // Pastikan default_center mengikuti zona yang sedang aktif (is_open: true) di zones.json
        if (zones && Array.isArray(zones.active_zones) && settings.map_config) {
            const openZone = zones.active_zones.find(
                z => z && z.is_open === true && z.center && !isNaN(parseFloat(z.center.lat)) && !isNaN(parseFloat(z.center.lng))
            );
            if (openZone) {
                settings.map_config.default_center = {
                    lat: parseFloat(openZone.center.lat),
                    lng: parseFloat(openZone.center.lng)
                };
            }
        }

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
        console.log("[ConfigManager] Sinkronisasi OTA V8 Selesai (Termasuk Peak Hours & Pusat Zona Dinamis).");
    },
    
    get: function(keyPath) {
        return keyPath.split('.').reduce((o, i) => (o ? o[i] : undefined), window.BGN_CONFIG);
    },

    getActiveZoneCenter: function() {
        const zones = window.BGN_CONFIG?.zones?.active_zones;
        if (Array.isArray(zones)) {
            if (window.BAGANTARA_ACTIVE_ZONE_ID) {
                const matched = zones.find(z => z && z.zone_id === window.BAGANTARA_ACTIVE_ZONE_ID && z.center);
                if (matched && !isNaN(parseFloat(matched.center.lat)) && !isNaN(parseFloat(matched.center.lng))) {
                    return {
                        lat: parseFloat(matched.center.lat),
                        lng: parseFloat(matched.center.lng),
                        zone_id: matched.zone_id
                    };
                }
            }
            const firstOpen = zones.find(z => z && z.is_open === true && z.center && !isNaN(parseFloat(z.center.lat)) && !isNaN(parseFloat(z.center.lng)));
            if (firstOpen) {
                return {
                    lat: parseFloat(firstOpen.center.lat),
                    lng: parseFloat(firstOpen.center.lng),
                    zone_id: firstOpen.zone_id
                };
            }
        }
        const defCenter = window.BGN_CONFIG?.settings?.map_config?.default_center;
        return defCenter ? { lat: parseFloat(defCenter.lat), lng: parseFloat(defCenter.lng), zone_id: null } : { lat: -7.768049, lng: 112.196514, zone_id: null };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.ConfigManager.init();
});
