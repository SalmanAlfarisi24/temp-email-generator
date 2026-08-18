// TempMail Module
const tempMail = {
    currentEmail: null,
    currentDomain: null,
    inbox: [],
    domainList: [],
    pollId: null,

    init() {
        this.loadDomains();
        this.setupEventListeners();
        this.setupSocketListeners();
    },

    loadDomains() {
        fetch('/api/temp-mail/domains')
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.data)) {
                    this.domainList = data.data;
                    this.populateDomainSelector();
                }
            })
            .catch(() => {
                // Backend tetap dapat generate alamat tanpa domain pilihan.
                this.domainList = [];
                this.populateDomainSelector();
            });
    },

    populateDomainSelector() {
        const select = document.getElementById('domainSelect');
        select.innerHTML = '';
        // Tambahkan opsi default "Pilih domain..."
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Pilih domain --';
        defaultOpt.disabled = true;
        defaultOpt.selected = true;
        select.appendChild(defaultOpt);

        this.domainList.forEach(domain => {
            const opt = document.createElement('option');
            opt.value = domain;
            // Tampilkan label yang lebih bersih
            let label = domain;
            if (domain.includes('(Emailnator)')) label = '📧 ' + domain;
            else if (domain.includes('sharklasers')) label = '🦈 ' + domain;
            else if (domain.includes('guerrilla')) label = '🎯 ' + domain;
            else label = '📬 ' + domain;
            opt.textContent = label;
            select.appendChild(opt);
        });

        // Jika ada domain yang tersimpan sebelumnya, set value
        if (this.currentDomain && this.domainList.includes(this.currentDomain)) {
            select.value = this.currentDomain;
        } else if (this.domainList.length) {
            this.currentDomain = this.domainList[0];
            select.value = this.currentDomain;
        }
    },

    setupEventListeners() {
        const btn = document.getElementById('generateBtn');
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            this.generateNewEmail();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshInbox();
        });

        document.getElementById('copyBtn').addEventListener('click', () => {
            const email = document.getElementById('currentEmail').textContent;
            if (email && email !== '-') {
                navigator.clipboard.writeText(email).then(() => {
                    const btn = document.getElementById('copyBtn');
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => btn.textContent = 'Copy', 2000);
                });
            }
        });

        document.getElementById('domainSelect').addEventListener('change', (e) => {
            this.currentDomain = e.target.value;
            this.generateNewEmail(this.currentDomain);
        });
    },

    setupSocketListeners() {
        // sudah di app.js, tapi kita tambahkan handler global
        window.updateInboxUI = (data) => {
            if (Array.isArray(data)) {
                this.inbox = data;
                this.renderInbox(data);
            } else if (data && data.mail) {
                // jika response dari temp-mail berupa objek dengan mail
                const messages = data.mail || [];
                this.inbox = messages;
                this.renderInbox(messages);
            } else {
                this.inbox = [];
                this.renderInbox([]);
            }
        };

        window.addNewEmail = (message) => {
            if (message) {
                this.inbox.unshift(message);
                this.renderInbox(this.inbox);
                document.getElementById('messageCount').textContent = this.inbox.length;
            }
        };
    },

    generateNewEmail(domain) {
        const btn = document.getElementById('generateBtn');
        btn.disabled = true;
        btn.textContent = 'Generating...';
        const selectedDomain = domain || this.currentDomain || this.domainList[0];
        fetch('/api/temp-mail/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: selectedDomain })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.currentEmail = data.data.email;
                document.getElementById('currentEmail').textContent = this.currentEmail;
                document.getElementById('messageCount').textContent = '0';
                if (window.socket && window.socket.connected) {
                    window.socket.emit('subscribe-email', this.currentEmail);
                }
                this.startPolling();
                this.refreshInbox();
                return;
            }
            alert('Gagal generate email: ' + (data.message || 'unknown error'));
        })
        .catch(err => {
            console.error('Generate error:', err);
            alert('❌ Gagal generate email: ' + err.message + '\n\nCoba pilih domain lain atau refresh halaman.');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Generate Baru';
        });
    },

    startPolling() {
        if (this.pollId) {
            clearInterval(this.pollId);
        }
        this.pollId = setInterval(() => {
            if (document.getElementById('tab-temp').classList.contains('active')) {
                this.refreshInbox();
            }
        }, 30000);
    },

    refreshInbox() {
        if (!this.currentEmail) {
            this.generateNewEmail();
            return;
        }
        fetch('/api/temp-mail/inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.currentEmail })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const messages = Array.isArray(data.data) ? data.data : (data.data.mail || []);
                this.inbox = messages;
                this.renderInbox(messages);
                document.getElementById('messageCount').textContent = messages.length;
            } else {
                this.renderInbox([]);
                document.getElementById('messageCount').textContent = '0';
            }
        })
        .catch(() => {
            this.renderInbox([]);
            document.getElementById('messageCount').textContent = '0';
        });
    },

    renderInbox(messages) {
        const container = document.getElementById('inboxList');
        container.textContent = '';

        if (!messages || messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'Belum ada pesan. Tunggu atau refresh manual ><';
            container.appendChild(empty);
            return;
        }

        messages.forEach(msg => {
            const from = String(msg.from || msg.sender || 'Unknown');
            const subject = String(msg.subject || '(no subject)');
            const body = String(msg.body || msg.text || '');
            const time = String(msg.date || msg.timestamp || '');
            const preview = body.length > 100 ? body.substring(0, 100) + '...' : body;

            const item = document.createElement('div');
            item.className = 'inbox-item';

            const fromEl = document.createElement('span');
            fromEl.className = 'from';
            fromEl.textContent = from;

            const subjectEl = document.createElement('span');
            subjectEl.className = 'subject';
            subjectEl.textContent = subject;

            const timeEl = document.createElement('span');
            timeEl.className = 'time';
            timeEl.textContent = time;

            const previewEl = document.createElement('div');
            previewEl.className = 'body-preview';
            previewEl.textContent = preview;

            item.appendChild(fromEl);
            item.appendChild(subjectEl);
            item.appendChild(timeEl);
            item.appendChild(previewEl);
            container.appendChild(item);
        });
    }
};

// init saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
    tempMail.init();
});