const axios = require('axios');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'aliases.json');

// Penyimpanan alias lokal (persist ke file JSON sebagai mode simulasi tanpa ForwardEmail.net)
let localAliases = [];

function loadAliases() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      localAliases = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Gagal baca aliases.json:', error.message);
    localAliases = [];
  }
}

function saveAliases() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(localAliases, null, 2));
  } catch (error) {
    console.error('Gagal simpan aliases.json:', error.message);
  }
}

// inisialisasi saat service dimuat
loadAliases();

class AliasService {
  async getDomains() {
    const domain = process.env.CUSTOM_DOMAIN || 'mail.example.com';
    return [domain];
  }

  createAlias(domain, prefix, forwardTo) {
    // ---- validasi input ----
    if (!domain || typeof domain !== 'string') {
      const err = new Error('Domain wajib diisi');
      err.status = 400;
      throw err;
    }
    if (!prefix || typeof prefix !== 'string') {
      const err = new Error('Prefix wajib diisi');
      err.status = 400;
      throw err;
    }
    // prefix hanya boleh huruf/angka/titik/underscore/dash (maks 64)
    if (!/^[a-z0-9._-]{1,64}$/i.test(prefix)) {
      const err = new Error('Prefix hanya boleh huruf, angka, titik, underscore, atau dash (maks 64 karakter)');
      err.status = 400;
      throw err;
    }
    if (!forwardTo || typeof forwardTo !== 'string') {
      const err = new Error('Alamat forward wajib diisi');
      err.status = 400;
      throw err;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forwardTo)) {
      const err = new Error('Format alamat forward tidak valid');
      err.status = 400;
      throw err;
    }

    // duplikat lokal? tolak
    if (localAliases.some(a => a.domain === domain && a.prefix === prefix)) {
      const err = new Error(`Alias ${prefix}@${domain} sudah ada`);
      err.status = 409;
      throw err;
    }

    const alias = `${prefix}@${domain}`;
    const entry = { domain, prefix, forwardTo, alias, source: 'local', createdAt: new Date() };

    // Jika ada API key ForwardEmail, panggil API nyata dulu
    if (config.forwardEmailApiKey) {
      return axios
        .post(
          `https://api.forwardemail.net/v1/domains/${encodeURIComponent(domain)}/aliases`,
          { prefix, forwardTo },
          { headers: { Authorization: `Bearer ${config.forwardEmailApiKey}` } }
        )
        .then(response => {
          // remote sukses -> tandai source remote & simpan juga daftar lokal agar list konsisten
          const remoteEntry = {
            ...entry,
            source: 'remote',
            remoteData: response.data,
          };
          localAliases.push(remoteEntry);
          saveAliases();
          return remoteEntry;
        })
        .catch(error => {
          // remote gagal -> jatuh ke lokal
          console.error('ForwardEmail API gagal, pakai mode lokal:', error.message);
          localAliases.push(entry);
          saveAliases();
          return entry;
        });
    }

    // mode murni lokal
    localAliases.push(entry);
    saveAliases();
    return Promise.resolve(entry);
  }

  async listAliases(domain) {
    let remote = null;
    if (config.forwardEmailApiKey) {
      try {
        const response = await axios.get(
          `https://api.forwardemail.net/v1/domains/${encodeURIComponent(domain)}/aliases`,
          { headers: { Authorization: `Bearer ${config.forwardEmailApiKey}` } }
        );
        remote = response.data;
      } catch (error) {
        remote = null;
      }
    }
    const local = localAliases.filter(a => !domain || a.domain === domain);
    // gabungkan: entry lokal (termasuk yang di-source dari remote) + remote murni yang belum tercatat lokal
    const seen = new Set(local.map(a => `${a.domain}:${a.prefix}`));
    const merged = [...local];
    if (Array.isArray(remote)) {
      for (const r of remote) {
        const rDomain = r.domain || domain;
        const rPrefix = r.name || r.prefix;
        const key = `${rDomain}:${rPrefix}`;
        if (!seen.has(key)) {
          merged.push({
            domain: rDomain,
            prefix: rPrefix,
            forwardTo: r.forward || r.forwardTo || '',
            alias: `${rPrefix}@${rDomain}`,
            source: 'remote',
          });
          seen.add(key);
        }
      }
    }
    return merged;
  }

  async deleteAlias(domain, prefix) {
    const index = localAliases.findIndex(a => a.domain === domain && a.prefix === prefix);
    let deletedLocal = false;
    if (index !== -1) {
      localAliases.splice(index, 1);
      deletedLocal = true;
      saveAliases();
    }

    if (config.forwardEmailApiKey) {
      try {
        await axios.delete(
          `https://api.forwardemail.net/v1/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(prefix)}`,
          { headers: { Authorization: `Bearer ${config.forwardEmailApiKey}` } }
        );
        return { success: true, message: `Alias ${prefix}@${domain} dihapus` };
      } catch (error) {
        // remote tidak ada alias itu tapi lokal sudah terhapus -> tetap sukses
        if (deletedLocal) {
          return { success: true, message: `Alias ${prefix}@${domain} dihapus (lokal)` };
        }
        // tidak ditemukan sama sekali
        const err = new Error(`Alias ${prefix}@${domain} tidak ditemukan`);
        err.status = 404;
        throw err;
      }
    }

    if (deletedLocal) {
      return { success: true, message: `Alias ${prefix}@${domain} dihapus` };
    }
    const err = new Error(`Alias ${prefix}@${domain} tidak ditemukan`);
    err.status = 404;
    throw err;
  }
}

module.exports = new AliasService();