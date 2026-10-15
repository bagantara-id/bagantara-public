// ==========================================
// MANAJER UI PUSAT (V7 COMPACT ACCORDION DRIVER CATALOG & GMAPS BRIDGE)
// ARSITEKTUR: COMPACT EXPANDABLE CARDS, REAL-TIME DRIVER GMAPS PILL, & CLEAN TERMINOLOGY
// ==========================================

window.UIManager = {
    updatePrelockedBannerUI: function(service) {
        const pd = window.BAGANTARA_PRELOCKED_DRIVER;
        const banners = [
            document.getElementById('prelockedBannerRoute'),
            document.getElementById('prelockedBannerJastip')
        ];

        banners.forEach(banner => {
            if (!banner) return;
            if (!pd) {
                banner.style.display = 'none';
                return;
            }

            const fmtTarif = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(pd.tarifMin || 10000);

            const img = banner.querySelector('.prelock-avatar');
            if (img) img.src = pd.fotoProfile || './assets/icon-192.png';

            const nameEl = banner.querySelector('.prelock-name');
            if (nameEl) nameEl.textContent = pd.nama;

            const metaEl = banner.querySelector('.prelock-meta');
            if (metaEl) metaEl.textContent = `${pd.kendaraan} • ${pd.plat}`;

            const srvEl = banner.querySelector('.prelock-srv');
            if (srvEl) srvEl.textContent = service || window.BAGANTARA_SERVICE || 'ORDER';

            const tarifEl = banner.querySelector('.prelock-tarif');
            if (tarifEl) tarifEl.textContent = `Min. ${fmtTarif}`;

            banner.style.display = 'flex';
        });
    },

    renderSearchLoading: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div style="padding: 25px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: var(--void-black); border-radius: 12px;">
                <i class="fa-solid fa-circle-notch fa-spin text-gold" style="font-size: 1.8rem;"></i>
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; font-family: 'Space Grotesk', monospace; letter-spacing: 1px;">MENCARI LOKASI...</span>
            </div>
        `;
        container.classList.remove('hidden');
    },

    renderSearchResults: function(containerId, features, onSelectCallback) {
        const container = document.getElementById(containerId);
        const template = document.getElementById('tpl-search-result');
        if (!container || !template) return;

        container.innerHTML = '';

        if (!features || features.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-center';
            emptyDiv.style.cssText = 'padding: 18px 15px; background: var(--void-black); border-radius: 12px;';
            emptyDiv.innerHTML = `
                <i class="fa-solid fa-map-location-dot mb-2 text-xl" style="color: #ef4444;"></i>
                <div class="text-xs text-muted mb-3" style="line-height: 1.5;">Lokasi spesifik (warung/gang/kos) belum terdaftar di peta standar.</div>
                <button type="button" class="btn-gmaps-bridge-inline" style="width: 100%; background: rgba(212, 175, 55, 0.14); border: 1px solid var(--neon-gold); color: var(--neon-gold); padding: 10px 12px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.72rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fa-solid fa-location-crosshairs"></i> CARI & IMPOR DARI GOOGLE MAPS
                </button>
            `;
            const btnInline = emptyDiv.querySelector('.btn-gmaps-bridge-inline');
            if (btnInline) {
                btnInline.addEventListener('click', () => {
                    container.classList.add('hidden');
                    this.openGmapsBridgeModal(onSelectCallback);
                });
            }
            container.appendChild(emptyDiv);
            container.classList.remove('hidden');
            return;
        }

        features.forEach(item => {
            if (!item.geometry || !Array.isArray(item.geometry.coordinates)) return;
            const props = item.properties || {};
            const lat = item.geometry.coordinates[1];
            const lon = item.geometry.coordinates[0];
            
            const title = item.text || props.name || props.text || props.street || props.city || "Lokasi Terdeteksi";
            const rawSubtitle = item.place_name || props.place_name || [props.street, props.city, props.state, props.country].filter(Boolean).join(', ') || "Indonesia";
            const subtitle = rawSubtitle.length > 55 ? rawSubtitle.substring(0, 55) + '...' : rawSubtitle;

            const clone = template.content.cloneNode(true);
            const wrapper = clone.querySelector('.search-result-item');
            
            clone.querySelector('.tpl-title').textContent = title;
            clone.querySelector('.tpl-subtitle').textContent = subtitle;
            
            wrapper.addEventListener('click', () => {
                container.classList.add('hidden');
                if (typeof onSelectCallback === 'function') onSelectCallback(title, lat, lon, subtitle);
            });
            
            container.appendChild(clone);
        });

        const footerBtn = document.createElement('div');
        footerBtn.style.cssText = 'padding: 10px 12px; background: rgba(212, 175, 55, 0.08); border-top: 1px solid rgba(212, 175, 55, 0.25); font-size: 0.72rem; font-weight: 700; color: var(--neon-gold); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;';
        footerBtn.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> Belum sesuai? Impor dari Google Maps`;
        footerBtn.addEventListener('click', () => {
            container.classList.add('hidden');
            this.openGmapsBridgeModal(onSelectCallback);
        });
        container.appendChild(footerBtn);

        container.classList.remove('hidden');
    },

    _gmapsModalCallback: null,
    _gmapsExtractedData: null,
    _gmapsModalBound: false,

    openGmapsBridgeModal: function(onConfirmCallback, initialQuery = '') {
        const modal = document.getElementById('gmaps-bridge-overlay');
        if (!modal) return;

        this._gmapsModalCallback = onConfirmCallback;
        this._gmapsExtractedData = null;

        const inputRaw = document.getElementById('inputGmapsRaw');
        const inputLabel = document.getElementById('inputGmapsCustomLabel');
        const previewBox = document.getElementById('gmapsExtractPreview');
        const btnConfirm = document.getElementById('btnConfirmGmapsLock');

        if (inputRaw) inputRaw.value = '';
        if (inputLabel) inputLabel.value = initialQuery || '';
        if (previewBox) {
            previewBox.style.display = 'none';
            previewBox.innerHTML = '';
        }
        if (btnConfirm) btnConfirm.disabled = true;

        if (!this._gmapsModalBound) {
            this._gmapsModalBound = true;

            const btnOpenApp = document.getElementById('btnLaunchGoogleMapsApp');
            if (btnOpenApp) {
                btnOpenApp.addEventListener('click', () => {
                    const c = window.BAGANTARA_ACTIVE_COORD || { lat: -7.768049, lng: 112.196514 };
                    const q = document.getElementById('inputGmapsCustomLabel')?.value?.trim() || '';
                    const gmapsUrl = q.length >= 2
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
                        : `https://www.google.com/maps/@${c.lat},${c.lng},16z`;
                    window.open(gmapsUrl, '_blank');
                });
            }

            const prosesEkstraksi = async (rawStr) => {
                if (!rawStr || !window.GeocoderAPI) return;
                if (previewBox) {
                    previewBox.style.display = 'block';
                    previewBox.style.borderColor = 'var(--border-cyber)';
                    previewBox.innerHTML = `<div class="text-xs text-muted"><i class="fa-solid fa-spinner fa-spin text-gold"></i> Mengekstrak koordinat lokasi...</div>`;
                }

                const customLbl = inputLabel?.value?.trim() || '';
                const combinedInput = (rawStr.includes('goo.gl') && customLbl.length >= 3 && !rawStr.includes(customLbl))
                    ? `${customLbl} ${rawStr}`
                    : rawStr;

                const res = await window.GeocoderAPI.extractFromGoogleMapsInput(combinedInput);
                if (res && res.ok) {
                    this._gmapsExtractedData = res;
                    if (inputLabel && (!inputLabel.value.trim() || inputLabel.value.trim().length < 2)) {
                        if (res.name && !res.name.startsWith('Titik')) {
                            inputLabel.value = res.name;
                        }
                    }
                    if (previewBox) {
                        previewBox.style.display = 'block';
                        previewBox.style.borderColor = 'var(--neon-green)';
                        previewBox.innerHTML = `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                <span style="font-size: 0.72rem; font-weight: 800; color: var(--neon-green);"><i class="fa-solid fa-circle-check"></i> TITIK LOKASI DITEMUKAN</span>
                                <span class="font-tech" style="font-size: 0.6rem; color: var(--neon-gold); background: rgba(212,175,55,0.12); padding: 2px 6px; border-radius: 6px;">AKURAT</span>
                            </div>
                            <div class="text-main font-bold" style="font-size: 0.8rem; margin-top: 4px;">${res.name}</div>
                            <div class="font-tech text-muted" style="font-size: 0.68rem; margin-top: 2px;">📍 ${res.lat.toFixed(6)}, ${res.lng.toFixed(6)}</div>
                        `;
                    }
                    if (btnConfirm) btnConfirm.disabled = false;
                } else {
                    this._gmapsExtractedData = null;
                    if (previewBox) {
                        previewBox.style.display = 'block';
                        previewBox.style.borderColor = '#ef4444';
                        previewBox.innerHTML = `<div style="font-size: 0.72rem; color: #ef4444; line-height: 1.4;"><i class="fa-solid fa-circle-exclamation"></i> ${res?.error || 'Gagal mengekstrak titik.'}</div>`;
                    }
                    if (btnConfirm) btnConfirm.disabled = true;
                }
            };

            const btnPaste = document.getElementById('btnPasteGmapsClipboard');
            if (btnPaste) {
                btnPaste.addEventListener('click', async () => {
                    try {
                        if (navigator.clipboard && navigator.clipboard.readText) {
                            const clipText = await navigator.clipboard.readText();
                            if (clipText && clipText.trim().length > 0) {
                                if (inputRaw) inputRaw.value = clipText.trim();
                                await prosesEkstraksi(clipText.trim());
                                return;
                            }
                        }
                    } catch (e) {}
                    if (inputRaw) {
                        inputRaw.focus();
                        if (inputRaw.value.trim().length >= 3) {
                            await prosesEkstraksi(inputRaw.value.trim());
                        }
                    }
                });
            }

            if (inputRaw) {
                inputRaw.addEventListener('input', () => {
                    const val = inputRaw.value.trim();
                    if (val.length >= 4) {
                        prosesEkstraksi(val);
                    }
                });
            }

            if (btnConfirm) {
                btnConfirm.addEventListener('click', () => {
                    if (!this._gmapsExtractedData) return;
                    const customName = inputLabel?.value?.trim() || this._gmapsExtractedData.name || `Lokasi GMaps (${this._gmapsExtractedData.lat.toFixed(4)})`;
                    const lat = this._gmapsExtractedData.lat;
                    const lng = this._gmapsExtractedData.lng;

                    if (window.GeocoderAPI && typeof window.GeocoderAPI.saveToVault === 'function') {
                        window.GeocoderAPI.saveToVault(customName, lat, lng, `GMaps (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                    }

                    modal.classList.add('hidden');

                    if (typeof this._gmapsModalCallback === 'function') {
                        this._gmapsModalCallback(customName, lat, lng, 'Tersimpan di Memori HP');
                    }
                });
            }

            const btnCancel = document.getElementById('btnCancelGmapsBridge');
            if (btnCancel) {
                btnCancel.addEventListener('click', () => {
                    modal.classList.add('hidden');
                });
            }
        }

        modal.classList.remove('hidden');
    },

    stopCount: 1,
    addMultiStop: function(routeInputsAreaId, btnAddStopId, unlockCallback, mapTriggerCallback, removeCallback) {
        const container = document.getElementById(routeInputsAreaId);
        const template = document.getElementById('tpl-multi-stop');
        const btnAdd = document.getElementById(btnAddStopId);
        if (!container || !template) return null;

        let targetSlot = null;
        if (!document.getElementById('rowDropoff2')) targetSlot = 2;
        else if (!document.getElementById('rowDropoff3')) targetSlot = 3;
        else return null;

        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.route-row-inline');
        row.id = `rowDropoff${targetSlot}`;

        const input = clone.querySelector('.tpl-input');
        input.id = `inputSearchDropoff${targetSlot}`;
        input.setAttribute('data-index', targetSlot);
        input.placeholder = `Cari tujuan ke-${targetSlot}...`;
        
        const btnClear = clone.querySelector('.tpl-btn-clear');
        btnClear.addEventListener('click', (e) => {
            e.preventDefault();
            if (unlockCallback) unlockCallback(input.id);
        });

        const btnMap = clone.querySelector('.tpl-btn-map');
        btnMap.addEventListener('click', () => {
            if (mapTriggerCallback) mapTriggerCallback(targetSlot);
        });

        const btnRemove = clone.querySelector('.tpl-btn-remove');
        btnRemove.addEventListener('click', () => {
            row.remove();
            this.stopCount = container.querySelectorAll('.multi-target').length;
            if (btnAdd && this.stopCount < 3) btnAdd.style.display = 'block';
            if (removeCallback) removeCallback(targetSlot);
        });

        container.appendChild(clone);

        this.stopCount = container.querySelectorAll('.multi-target').length;
        if (this.stopCount >= 3 && btnAdd) btnAdd.style.display = 'none';
        
        return document.getElementById(`inputSearchDropoff${targetSlot}`); 
    },

    checkFormReady: function() {
        const btn = document.getElementById('stickyContinueArea');
        const drop1 = document.getElementById('inputSearchDropoff1');
        const pickup = document.getElementById('inputSearchPickup');

        if (btn && drop1 && pickup) {
            if (drop1.hasAttribute('readonly') && pickup.hasAttribute('readonly')) {
                btn.classList.remove('hidden');
            } else {
                btn.classList.add('hidden');
            }
        }
    },

    lockSearchField: function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.setAttribute('readonly', 'true');
        input.style.color = 'var(--text-main)';
        input.style.fontWeight = 'bold';
        
        const rowEl = input.closest('.route-row-inline');
        const iconContainer = rowEl ? rowEl.querySelector('.icon-point i') : null;
        if (iconContainer) {
            if (!input.dataset.origIcon) input.dataset.origIcon = iconContainer.className;
            if (inputId === 'inputSearchPickup') {
                iconContainer.className = 'fa-solid fa-arrow-up';
                iconContainer.style.color = 'var(--neon-green)';
            } else {
                iconContainer.className = 'fa-solid fa-arrow-down';
                iconContainer.style.color = '#ef4444';
            }
        }
        
        const clearBtn = input.nextElementSibling;
        if (clearBtn && clearBtn.classList.contains('btn-clear-input')) clearBtn.style.display = 'block';
        this.checkFormReady();
    },

    unlockSearchField: function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.removeAttribute('readonly');
        input.value = '';
        input.style.color = '';
        input.style.fontWeight = '';
        
        const rowEl = input.closest('.route-row-inline');
        const iconContainer = rowEl ? rowEl.querySelector('.icon-point i') : null;
        if (iconContainer && input.dataset.origIcon) iconContainer.className = input.dataset.origIcon;
        
        const clearBtn = input.nextElementSibling;
        if (clearBtn) clearBtn.style.display = 'none';
        
        window.LOCKED_SEARCH_COORD = null;
        window.LOCKED_SEARCH_TEXT = null;

        if (inputId === 'inputSearchPickup') {
            window.BAGANTARA_PICKUP_DETAIL = null;
            window.BAGANTARA_PICKUP_COORD = null;
        } else if (inputId === 'inputSearchDropoff1') {
            window.BAGANTARA_DROPOFF_DETAIL = null;
            window.BAGANTARA_DROPOFF_COORD = null;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[0]) {
                window.BAGANTARA_MULTI_DROPOFFS[0] = null;
            }
        } else {
            const idx = (parseInt(input.getAttribute('data-index')) || 2) - 1;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[idx]) {
                window.BAGANTARA_MULTI_DROPOFFS[idx] = null;
            }
        }
        
        window.BAGANTARA_FINAL_PRICE = 0;
        window.BAGANTARA_DISTANCE_KM = 0;
        const priceValueEl = document.getElementById('priceValue');
        if (priceValueEl) {
            priceValueEl.innerHTML = 'Rp 0';
        }
        
        this.checkFormReady();
        input.focus();
    },

    // ==========================================
    // 5. MESIN BERANDA KATALOG DRIVER AKTIF (COMPACT ACCORDION V7)
    // ==========================================
    _catalogInitialized: false,
    _catalogLastRefreshTime: 0,
    _catalogCooldownTimer: null,
    _catalogActiveFilter: 'ALL',
    _catalogCurrentLimit: 10,
    _catalogLastLat: -7.768049,
    _catalogLastLng: 112.196514,

    initMitraCatalog: function() {
        const defaultLimit = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.max_drivers_rendered) || 10;

        if (!this._catalogInitialized) {
            this._catalogInitialized = true;
            this._catalogCurrentLimit = defaultLimit;

            const filterChips = document.querySelectorAll('#radarFilterContainer .radar-chip');
            filterChips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this._catalogActiveFilter = e.currentTarget.getAttribute('data-filter') || 'ALL';
                    this._catalogCurrentLimit = defaultLimit;
                    window.BAGANTARA_RADAR_FILTER = this._catalogActiveFilter;
                    this.loadMitraCatalog(false, true);
                });
            });

            const btnRefresh = document.getElementById('btnRefreshMitraMap');
            if (btnRefresh) {
                btnRefresh.addEventListener('click', () => {
                    const cooldownSec = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.cooldown_refresh_sec) || 15;
                    const now = Date.now();
                    const elapsedSec = Math.floor((now - this._catalogLastRefreshTime) / 1000);

                    if (elapsedSec < cooldownSec) {
                        const sisa = cooldownSec - elapsedSec;
                        const timerUI = document.getElementById('mitraCountdownText');
                        if (timerUI) {
                            timerUI.innerText = `Tunggu ${sisa}d`;
                            timerUI.style.color = '#f59e0b';
                        }
                        return;
                    }

                    const icon = btnRefresh.querySelector('i');
                    if (icon) {
                        icon.dataset.rot = (parseInt(icon.dataset.rot) || 0) - 360;
                        icon.style.transform = `rotate(${icon.dataset.rot}deg)`;
                    }
                    this._catalogCurrentLimit = defaultLimit;
                    this.loadMitraCatalog(true, false);
                });
            }
        }

        this.loadMitraCatalog(false, false);
    },

    _startCatalogCooldownUI: function() {
        const cooldownSec = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.cooldown_refresh_sec) || 15;
        let rem = cooldownSec;
        const timerUI = document.getElementById('mitraCountdownText');
        if (this._catalogCooldownTimer) clearInterval(this._catalogCooldownTimer);

        if (timerUI) {
            timerUI.innerText = `${rem}d`;
            timerUI.style.color = '#94a3b8';
        }

        this._catalogCooldownTimer = setInterval(() => {
            rem--;
            if (timerUI) {
                if (rem > 0) {
                    timerUI.innerText = `${rem}d`;
                    timerUI.style.color = '#94a3b8';
                } else {
                    timerUI.innerText = 'SIAP';
                    timerUI.style.color = '#10b981';
                    clearInterval(this._catalogCooldownTimer);
                }
            }
        }, 1000);
    },

    loadMitraCatalog: async function(forceRefresh = false, useRamOnly = false) {
        const statusText = document.getElementById('mitraMapStatusText');
        const container = document.getElementById('mitraCatalogContainer');
        const wRadar = window.BGN_CONFIG?.wording?.radar || {};

        if (!container || !window.AegisEngine) return;

        if (window.BAGANTARA_ZONE_LOCKED === true) {
            const lockedMsg = window.BGN_CONFIG?.zones?.default_locked_message || {};
            const title = lockedMsg.title || "WILAYAH BELUM TERSEDIA";
            const body = lockedMsg.body || "Jadilah Driver Pelopor Pertama di Kota Anda!";
            const wa = lockedMsg.wa_rekrutmen || "";
            if (statusText) statusText.innerText = "Di Luar Wilayah";
            container.innerHTML = `
                <div class="glass-panel text-center" style="padding: 28px 20px; border-radius: 18px; border: 1px solid rgba(212, 175, 55, 0.4);">
                    <i class="fa-solid fa-map-location-dot text-gold text-3xl mb-3"></i>
                    <h4 class="font-tech text-main mb-2" style="font-size: 0.95rem; font-weight: 900;">${title}</h4>
                    <p class="text-muted text-xs mb-4" style="line-height: 1.6;">${body}</p>
                    <button type="button" id="btnZoneRecruitWA" class="btn-primary w-full" style="font-size: 0.75rem;">
                        <i class="fa-brands fa-whatsapp" style="font-size: 1.1rem;"></i> DAFTAR DRIVER PELOPOR
                    </button>
                </div>
            `;
            document.getElementById('btnZoneRecruitWA')?.addEventListener('click', () => {
                window.open(`https://wa.me/${wa}?text=${encodeURIComponent(body)}`, '_blank');
            });
            return;
        }

        const appRules = window.BGN_CONFIG?.rules_app;
        if (appRules && appRules.radar_mitra && appRules.radar_mitra.is_active === false) {
            if (statusText) statusText.innerText = wRadar.disabled || "Layanan Nonaktif";
            container.innerHTML = `
                <div class="glass-panel text-center text-muted" style="padding: 28px 18px; border-radius: 16px;">
                    <i class="fa-solid fa-ban text-gold text-2xl mb-3"></i><br>
                    <b class="text-main">${wRadar.disabled || "Katalog Driver Sedang Nonaktif"}</b>
                </div>
            `;
            return;
        }

        if (statusText) statusText.innerText = wRadar.loading || "Memuat driver...";
        if (!useRamOnly) {
            container.innerHTML = `
                <div class="glass-panel text-center" style="padding: 32px 20px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                    <i class="fa-solid fa-circle-notch fa-spin text-gold" style="font-size: 1.7rem;"></i>
                    <span class="font-tech text-xs text-muted" style="letter-spacing: 0.8px;">MENCARI DRIVER AKTIF TERDEKAT...</span>
                </div>
            `;
        }

        const executeHydrationAt = async (lat, lng) => {
            this._catalogLastLat = lat;
            this._catalogLastLng = lng;

            if (!useRamOnly) {
                this._catalogLastRefreshTime = Date.now();
                this._startCatalogCooldownUI();
            }

            const addrEl = document.getElementById('radarUserAddress');
            if (addrEl) {
                const zoneName = window.BAGANTARA_ACTIVE_ZONE_ID ? `${window.BAGANTARA_ACTIVE_ZONE_ID} • ` : '';
                addrEl.textContent = `${zoneName}${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }

            const result = await window.AegisEngine.scanKatalogMitra(
                lat,
                lng,
                this._catalogActiveFilter,
                forceRefresh,
                this._catalogCurrentLimit,
                useRamOnly
            );

            this.renderMitraCatalogCards(result.drivers, result.hasMore, result.totalTersedia);
        };

        if (useRamOnly) {
            const lat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : this._catalogLastLat;
            const lng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : this._catalogLastLng;
            await executeHydrationAt(lat, lng);
            return;
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    window.BAGANTARA_ACTIVE_COORD = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    executeHydrationAt(pos.coords.latitude, pos.coords.longitude);
                },
                () => {
                    if (window.BAGANTARA_ACTIVE_COORD) {
                        executeHydrationAt(window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng);
                    } else {
                        if (statusText) statusText.innerText = wRadar.gps_denied || "GPS Belum Aktif";
                        container.innerHTML = `
                            <div class="glass-panel text-center text-muted" style="padding: 25px; border-radius: 16px;">
                                <i class="fa-solid fa-location-crosshairs text-gold text-2xl mb-3"></i><br>
                                <b class="text-main">${wRadar.gps_denied || "Izin Lokasi GPS Diperlukan"}</b><br><br>
                                Aktifkan GPS pada perangkat Anda untuk melihat daftar driver yang sedang aktif di sekitar Anda.
                            </div>
                        `;
                    }
                },
                { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
            );
        } else if (window.BAGANTARA_ACTIVE_COORD) {
            await executeHydrationAt(window.BAGANTARA_ACTIVE_COORD.lat, window.BAGANTARA_ACTIVE_COORD.lng);
        }
    },

    renderMitraCatalogCards: function(drivers, hasMore = false, totalTersedia = 0) {
        const container = document.getElementById('mitraCatalogContainer');
        const statusText = document.getElementById('mitraMapStatusText');
        const tplCard = document.getElementById('tpl-mitra-catalog-card');
        if (!container || !tplCard) return;

        container.innerHTML = '';

        if (statusText) {
            statusText.innerText = `${drivers.length} Driver Aktif`;
        }

        if (!drivers || drivers.length === 0) {
            const tplEmpty = document.getElementById('tpl-empty-drivers');
            if (tplEmpty) {
                container.appendChild(tplEmpty.content.cloneNode(true));
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        const now = Date.now();

        drivers.forEach((d, idx) => {
            const clone = tplCard.content.cloneNode(true);
            const cardEl = clone.querySelector('.mitra-catalog-card');

            // Urutan ke-1 (Indeks 0) adalah Driver Terdekat -> Beri highlight & lencana TERDEKAT
            if (idx === 0 && cardEl) {
                cardEl.classList.add('is-nearest', 'expanded');
                const badgeNearest = clone.querySelector('.tpl-badge-terdekat');
                if (badgeNearest) badgeNearest.style.display = 'inline-flex';
            }

            // Klik baris ringkas untuk tarik-bawah (Expand / Collapse Drawer)
            const summaryRow = clone.querySelector('.driver-card-summary');
            if (summaryRow && cardEl) {
                summaryRow.addEventListener('click', () => {
                    cardEl.classList.toggle('expanded');
                });
            }

            const imgEl = clone.querySelector('.tpl-foto');
            if (imgEl) imgEl.src = d.fotoProfile || './assets/icon-192.png';

            const selisihMenit = d.timestamp ? Math.max(0, Math.floor((now - d.timestamp) / 60000)) : 0;
            const avatarRing = clone.querySelector('.tpl-avatar-ring');
            if (avatarRing) {
                if (selisihMenit >= 2) avatarRing.classList.add('warm-signal');
                else avatarRing.classList.add('fresh-signal');
            }

            const namaEl = clone.querySelector('.tpl-nama');
            if (namaEl) namaEl.textContent = d.nama;

            const badgeArmadaEl = clone.querySelector('.tpl-armada-badge');
            if (badgeArmadaEl) {
                const isMobil = d.armada === 'MOBIL';
                badgeArmadaEl.innerHTML = isMobil
                    ? '<i class="fa-solid fa-car-side"></i> MOBIL'
                    : '<i class="fa-solid fa-motorcycle"></i> MOTOR';
            }

            const jarakEl = clone.querySelector('.tpl-jarak');
            if (jarakEl) jarakEl.textContent = `~${d.jarak.toFixed(1)} KM`;

            const fmtTarif = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(d.tarifMin || 10000);

            const tarifSummaryEl = clone.querySelector('.tpl-tarif-ringkas');
            if (tarifSummaryEl) tarifSummaryEl.textContent = `Min. ${fmtTarif}`;

            const tarifEl = clone.querySelector('.tpl-tarif');
            if (tarifEl) tarifEl.textContent = fmtTarif;

            // Kapsul Kecil "Lihat Lokasi Driver Saat Ini" (Buka Google Maps Langsung)
            const locPill = clone.querySelector('.tpl-driver-loc-pill');
            if (locPill) {
                if (!isNaN(parseFloat(d.lat)) && !isNaN(parseFloat(d.lng))) {
                    locPill.href = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
                    locPill.addEventListener('click', (e) => {
                        e.stopPropagation(); // Jangan memicu buka/tutup kartu saat klik kapsul lokasi
                    });
                } else {
                    locPill.style.display = 'none';
                }
            }

            const kendEl = clone.querySelector('.tpl-kendaraan');
            if (kendEl) kendEl.textContent = d.kendaraan;

            const platEl = clone.querySelector('.tpl-plat-badge');
            if (platEl) platEl.textContent = d.plat;

            const radiusEl = clone.querySelector('.tpl-radius');
            if (radiusEl) radiusEl.textContent = `Maks. ${d.radius} KM`;

            const waktuEl = clone.querySelector('.tpl-waktu-aktif');
            if (waktuEl) {
                waktuEl.textContent = selisihMenit < 1 ? 'Baru saja aktif' : `Aktif ${selisihMenit}m lalu`;
            }

            const agendaWrap = clone.querySelector('.tpl-agenda-wrap');
            const agendaText = clone.querySelector('.tpl-info-agenda');
            if (agendaWrap && agendaText) {
                if (d.info && d.info.trim() !== '' && d.info !== '-') {
                    agendaText.textContent = `"${d.info}"`;
                    agendaWrap.style.display = 'flex';
                } else {
                    agendaWrap.style.display = 'none';
                }
            }

            const containerServices = clone.querySelector('.tpl-dynamic-services');
            if (containerServices) {
                containerServices.innerHTML = '';
                const listLayanan = (d.armada === 'MOBIL') ? ['CAR'] : (Array.isArray(d.layanan) ? d.layanan : []);

                listLayanan.forEach(srvItem => {
                    const srv = srvItem.toUpperCase();
                    const btnSrv = document.createElement('button');
                    btnSrv.type = 'button';
                    btnSrv.className = 'btn-mitra-srv';

                    let iconClass = 'fa-solid fa-crosshairs';
                    if (srv === 'RIDE') iconClass = 'fa-solid fa-motorcycle';
                    else if (srv === 'CAR') iconClass = 'fa-solid fa-car-side';
                    else if (srv === 'EXPRESS') iconClass = 'fa-solid fa-cube';
                    else if (srv === 'JASTIP') iconClass = 'fa-solid fa-bag-shopping';

                    btnSrv.innerHTML = `<i class="${iconClass}"></i> <span>PESAN ${srv}</span>`;

                    btnSrv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (navigator.vibrate) navigator.vibrate(25);

                        const prelockedData = {
                            uid: d.uid,
                            nama: d.nama,
                            wa: d.wa,
                            plat: d.plat,
                            kendaraan: d.kendaraan,
                            fcmToken: d.fcmToken || '',
                            fotoProfile: d.fotoProfile || './assets/icon-192.png',
                            tarifMin: d.tarifMin,
                            info: d.info || '-',
                            armada: d.armada,
                            layanan: listLayanan,
                            jarak: d.jarak
                        };

                        const savedCoord = window.BAGANTARA_ACTIVE_COORD || { lat: this._catalogLastLat, lng: this._catalogLastLng };
                        const savedZone = window.BAGANTARA_ACTIVE_ZONE_ID;

                        if (window.SystemReset) window.SystemReset();

                        window.BAGANTARA_ACTIVE_COORD = savedCoord;
                        if (savedZone) window.BAGANTARA_ACTIVE_ZONE_ID = savedZone;
                        window.BAGANTARA_PRELOCKED_DRIVER = prelockedData;

                        if (window.ServiceRouter) window.ServiceRouter.route(srv);
                    });

                    containerServices.appendChild(btnSrv);
                });
            }

            fragment.appendChild(clone);
        });

        if (hasMore) {
            const btnMore = document.createElement('button');
            btnMore.type = 'button';
            btnMore.className = 'btn-primary w-full mt-2';
            btnMore.style.fontSize = '0.75rem';
            btnMore.innerHTML = `<i class="fa-solid fa-angles-down"></i> TAMPILKAN DRIVER LAINNYA (${ drivers.length } / ${ totalTersedia })`;
            btnMore.addEventListener('click', () => {
                const step = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.max_drivers_rendered) || 10;
                this._catalogCurrentLimit += step;
                this.loadMitraCatalog(false, true);
            });
            fragment.appendChild(btnMore);
        }

        container.appendChild(fragment);
    },

    initGlobalControls: function() {
        window.alert = function(message) {
            const alertBox = document.getElementById('cyber-alert');
            const alertMsg = document.getElementById('cyber-alert-msg');
            if (alertBox && alertMsg) {
                alertMsg.innerHTML = message; 
                alertBox.classList.remove('hidden');
            }
        };

        window.UIManager.alertConfig = function(alertKey, defaultMsg) {
            const txt = window.BGN_CONFIG?.wording?.alerts?.[alertKey] || defaultMsg;
            window.alert(txt);
        };

        const closeAlertBtn = document.getElementById('btn-close-alert');
        if (closeAlertBtn) closeAlertBtn.addEventListener('click', () => document.getElementById('cyber-alert').classList.add('hidden'));

        const inputInlineNotes = document.getElementById('inputInlineNotes');
        if (inputInlineNotes) {
            inputInlineNotes.addEventListener('focus', () => {
                setTimeout(() => inputInlineNotes.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
            });
            inputInlineNotes.addEventListener('blur', () => window.scrollTo(0, 0));
        }

        const inputSearchDropoff1 = document.getElementById('inputSearchDropoff1');
        const viewSearchRoute = document.getElementById('view-search-route');
        if (inputSearchDropoff1 && viewSearchRoute) {
            inputSearchDropoff1.addEventListener('focus', () => {
                if (viewSearchRoute.classList.contains('compact-mode')) {
                    viewSearchRoute.classList.remove('compact-mode');
                    viewSearchRoute.classList.add('expanded-mode');
                }
            });
        }

        window.addEventListener('initMitraCatalogEvent', () => {
            this.initMitraCatalog();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.UIManager.initGlobalControls();
    
    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const inputTarget = this.previousElementSibling;
            if (inputTarget) window.UIManager.unlockSearchField(inputTarget.id);
        });
    });
});