// Alias Module
const aliasModule = {
    aliases: [],

    init() {
        this.setupForm();
        this.loadAliases();
    },

    setupForm() {
        const form = document.getElementById('aliasForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAlias();
        });
    },

    createAlias() {
        const domain = document.getElementById('aliasDomain').value.trim();
        const prefix = document.getElementById('aliasPrefix').value.trim();
        const forwardTo = document.getElementById('aliasForward').value.trim();

        if (!domain || !prefix || !forwardTo) {
            alert('Semua field harus diisi sayang ><');
            return;
        }

        fetch('/api/alias/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, prefix, forwardTo })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.loadAliases();
                document.getElementById('aliasDomain').value = '';
                document.getElementById('aliasPrefix').value = '';
                document.getElementById('aliasForward').value = '';
                alert('Alias berhasil dibuat!');
            } else {
                alert('Gagal membuat alias: ' + data.message);
            }
        })
        .catch(err => {
            alert('Error: ' + err.message);
        });
    },

    loadAliases() {
        const domain = document.getElementById('aliasDomain').value.trim() || '';
        const url = domain ? `/api/alias/list?domain=${encodeURIComponent(domain)}` : '/api/alias/list';
        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    this.aliases = data.data || [];
                    this.renderAliases(this.aliases);
                } else {
                    this.renderAliases([]);
                }
            })
            .catch(() => {
                this.renderAliases([]);
            });
    },

    renderAliases(aliases) {
        const container = document.getElementById('aliasList');
        container.textContent = '';

        if (!aliases || aliases.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'Belum ada alias dibuat.';
            container.appendChild(empty);
            return;
        }

        aliases.forEach(a => {
            const alias = a.alias || `${a.prefix}@${a.domain}`;
            const forward = a.forwardTo || '-';

            const item = document.createElement('div');
            item.className = 'alias-item';

            const aliasEl = document.createElement('span');
            aliasEl.className = 'alias';
            aliasEl.textContent = alias;

            const forwardEl = document.createElement('span');
            forwardEl.className = 'forward';
            forwardEl.textContent = `→ ${forward}`;

            const button = document.createElement('button');
            button.className = 'delete-alias';
            button.textContent = '✕';
            button.addEventListener('click', () => {
                const domain = a.domain;
                const prefix = a.prefix;
                if (confirm(`Hapus alias ${prefix}@${domain}?`)) {
                    this.deleteAlias(domain, prefix);
                }
            });

            item.appendChild(aliasEl);
            item.appendChild(forwardEl);
            item.appendChild(button);
            container.appendChild(item);
        });
    },

    deleteAlias(domain, prefix) {
        fetch('/api/alias/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, prefix })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.loadAliases();
            } else {
                alert('Gagal hapus alias: ' + data.message);
            }
        })
        .catch(err => {
            alert('Error: ' + err.message);
        });
    }
};

// init saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
    aliasModule.init();
});