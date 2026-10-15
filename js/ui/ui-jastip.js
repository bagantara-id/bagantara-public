// ==========================================
// MESIN PERENDER UI JASTIP (PURE DOM CLONE)
// ==========================================

window.UIJastip = {
    itemCounter: 0,
    
    init: function() {
        const container = document.getElementById('jastipItemsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        this.itemCounter = 0;
        
        this.addItem();
        
        const btnAdd = document.getElementById('btnAddJastipItem');
        if (btnAdd) {
            const newBtnAdd = btnAdd.cloneNode(true);
            btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
            newBtnAdd.addEventListener('click', () => this.addItem());
        }
    },
    
    addItem: function() {
        this.itemCounter++;
        const id = this.itemCounter;
        const container = document.getElementById('jastipItemsContainer');
        const template = document.getElementById('tpl-jastip-item');
        
        if (!template || !container) return;
        
        // Kloning Node Murni (Bebas HTML Injection)
        const clone = template.content.cloneNode(true);
        
        const card = clone.querySelector('.jastip-item-card');
        card.id = `jastip-card-${id}`;
        
        const inputName = clone.querySelector('.jastip-val-name');
        const inputPrice = clone.querySelector('.jastip-val-price');
        const btnRemove = clone.querySelector('.btn-remove-item');
        const btnMin = clone.querySelector('.tpl-btn-min');
        const btnPlus = clone.querySelector('.tpl-btn-plus');
        const qtySpan = clone.querySelector('.jastip-qty-value');
        
        qtySpan.id = `jastip-qty-${id}`;
        
        // Pemasangan Saraf Event secara Spasial
        inputName.addEventListener('input', () => this.triggerUpdate());
        inputPrice.addEventListener('input', () => this.triggerUpdate());
        btnRemove.addEventListener('click', () => this.removeItem(id));
        btnMin.addEventListener('click', () => this.updateQty(id, -1));
        btnPlus.addEventListener('click', () => this.updateQty(id, 1));
        
        container.appendChild(clone);
        this.triggerUpdate();
    },
    
    removeItem: function(id) {
        const card = document.getElementById(`jastip-card-${id}`);
        if (card) {
            card.remove();
            this.triggerUpdate();
        }
    },
    
    updateQty: function(id, change) {
        const qtySpan = document.getElementById(`jastip-qty-${id}`);
        if (!qtySpan) return;
        
        let currentQty = parseInt(qtySpan.getAttribute('data-val')) || 1;
        currentQty += change;
        if (currentQty < 1) currentQty = 1;
        
        qtySpan.setAttribute('data-val', currentQty);
        qtySpan.textContent = currentQty;
        
        this.triggerUpdate();
    },
    
    triggerUpdate: function() {
        window.dispatchEvent(new Event('jastipUIUpdated'));
    },
    
    extractData: function() {
        const container = document.getElementById('jastipItemsContainer');
        if (!container) return [];
        
        const cards = container.querySelectorAll('.jastip-item-card');
        let items = [];
        
        cards.forEach(card => {
            const name = card.querySelector('.jastip-val-name').value.trim();
            const price = parseInt(card.querySelector('.jastip-val-price').value) || 0;
            const qty = parseInt(card.querySelector('.jastip-qty-value').getAttribute('data-val')) || 1;
            
            // FIX TAHAP 4: Menggunakan operator && agar nama dan harga wajib diisi
            if (name !== '' && price > 0) {
                items.push({ name: name, price: price, qty: qty, subtotal: price * qty });
            }
        });
        
        return items;
    }
};