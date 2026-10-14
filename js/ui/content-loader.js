// ==========================================
// MESIN KONTEN INDEPENDEN (HEADLESS UI)
// ==========================================

window.ContentLoader = {
    init: async function() {
        try {
            const manifestUrl = window.BGN_CONFIG?.settings?.paths?.content_manifest;
            if (!manifestUrl) throw new Error("Path manifest tidak ditemukan di settings.json");
            
            // PERBAIKAN LOKAL: Hapus parameter query ?v= yang ditolak server Android
            const res = await fetch(manifestUrl);
            if (!res.ok) throw new Error("Manifest tidak ditemukan");
            const data = await res.json();
            
            this.loadBanners(data.banners || []);
            this.loadAboutPages(data.about_pages || []);
        } catch (err) {
            console.warn("[ContentLoader] Gagal memuat konten dinamis:", err);
        }
    },

    loadBanners: function(banners) {
        const container = document.getElementById('dynamic-banner-container');
        if (!container || banners.length === 0) {
            if(container) container.style.display = 'none';
            return;
        }
        container.style.display = 'flex';
        banners.forEach(b => {
            const card = document.createElement('div');
            card.style.cssText = "flex: 0 0 85%; height: 130px; border-radius: 16px; overflow: hidden; position: relative; scroll-snap-align: center; border: 1px solid var(--border-cyber); box-shadow: 0 6px 15px rgba(0,0,0,0.3); cursor: pointer; background: var(--card-bg-2);";
            
            if (b.type === 'image') {
                card.innerHTML = `<img src="${b.src}" alt="${b.id}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.remove();">`;
            }
            if (b.url) card.addEventListener('click', () => window.open(b.url, '_blank'));
            container.appendChild(card);
        });
    },

    loadAboutPages: function(pages) {
        const container = document.getElementById('dynamic-about-list');
        if (!container || pages.length === 0) return;
        
        pages.forEach(p => {
            const item = document.createElement('div');
            item.className = "glass-panel";
            item.style.cssText = "border-radius: 12px; overflow: hidden; transition: all 0.3s; margin-bottom: 0;";
            
            const header = document.createElement('div');
            header.style.cssText = "padding: 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; font-weight: 700; color: var(--text-main); font-size: 0.95rem;";
            header.innerHTML = `<div style="display: flex; align-items: center; gap: 12px;"><i class="${p.icon} text-gold" style="font-size: 1.2rem; width: 24px; text-align: center;"></i> ${p.title}</div> <i class="fa-solid fa-chevron-down text-muted" style="transition: transform 0.3s;"></i>`;
            
            const contentBox = document.createElement('div');
            contentBox.style.cssText = "padding: 0 16px; max-height: 0; overflow: hidden; transition: max-height 0.4s ease, padding 0.4s ease; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;";
            
            let isLoaded = false;
            header.addEventListener('click', async () => {
                const icon = header.querySelector('.fa-chevron-down');
                if (contentBox.style.maxHeight === '0px' || !contentBox.style.maxHeight) {
                    if (!isLoaded && p.file) {
                        contentBox.innerHTML = '<div style="text-align:center; padding:15px;"><i class="fa-solid fa-circle-notch fa-spin text-gold"></i></div>';
                        contentBox.style.maxHeight = '100px';
                        contentBox.style.padding = '0 16px 16px 16px';
                        try {
                            const res = await fetch(`${p.file}?v=${new Date().getTime()}`);
                            if (!res.ok) throw new Error("File 404");
                            contentBox.innerHTML = await res.text();
                            isLoaded = true;
                        } catch(e) {
                            contentBox.innerHTML = '<div style="color:#ef4444; padding-bottom:10px;">Konten sedang dalam perbaikan.</div>';
                        }
                    }
                    contentBox.style.maxHeight = contentBox.scrollHeight + 100 + 'px';
                    contentBox.style.padding = '0 16px 16px 16px';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    contentBox.style.maxHeight = '0';
                    contentBox.style.padding = '0 16px';
                    icon.style.transform = 'rotate(0deg)';
                }
            });
            item.appendChild(header);
            item.appendChild(contentBox);
            container.appendChild(item);
        });
    }
};

// SARAF PENUNGGU: Tahan eksekusi sampai JSON Utama selesai disedot
document.addEventListener('DOMContentLoaded', () => {
    if (window.ConfigManager && window.ConfigManager.isLoaded) {
        window.ContentLoader.init();
    } else {
        window.addEventListener('bgn_config_loaded', () => {
            window.ContentLoader.init();
        });
    }
});
