// ==========================================
// MESIN GEOCODER TUNGGAL (MAPTILER / PHOTON API)
// ARSITEKTUR: PURE OTA TEMPLATE (ZERO HARDCODE)
// ==========================================

window.GeocoderAPI = {
    _reverseCache: null, 
    
    _getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    },

    search: async function(query, lat = null, lng = null) {
        if (!query || query.trim().length < 3) return [];
        
        try {
            // ZERO HARDCODE: Murni membaca template OTA. Jika tidak ada di JSON, kode akan melempar Error.
            const urlTemplate = window.BGN_CONFIG.settings.geocoder_api.search_url_template;
            
            // Menyisipkan teks pencarian ke dalam template
            let url = urlTemplate.replace('{query}', encodeURIComponent(query));
            
            const res = await fetch(url);
            if (!res.ok) throw new Error("Gagal merespons API");
            
            const data = await res.json();
            return data.features || [];
        } catch (err) {
            console.error("[GeocoderAPI] Koneksi Pemetaan Gagal:", err);
            return [];
        }
    },

    reverseGeocode: async function(lat, lng) {
        // MEMOIZATION ANTI-BLOKIR: Gunakan cache jika pergeseran < 10 meter (0.01 KM)
        if (this._reverseCache) {
            const distance = this._getHaversineDistance(lat, lng, this._reverseCache.lat, this._reverseCache.lng);
            if (distance <= 0.01) return this._reverseCache.address;
        }

        try {
            // ZERO HARDCODE: Mengambil template OTA Reverse
            const urlTemplate = window.BGN_CONFIG.settings.geocoder_api.reverse_url_template;
            
            // Menyisipkan koordinat ke dalam template
            let url = urlTemplate.replace('{lat}', lat).replace('{lng}', lng);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error("API Reverse Error");
            const data = await res.json();
            
            let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            if (data.features && data.features.length > 0) {
                const p = data.features[0].properties;
                // PENYESUAIAN KAMUS: Menambahkan dukungan untuk 'place_name' dan 'text' milik MapTiler
                address = p.place_name || p.text || p.name || p.street || p.city || address;
            }
            
            this._reverseCache = { lat: lat, lng: lng, address: address };
            return address;
        } catch (e) {
            return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
    }
};
