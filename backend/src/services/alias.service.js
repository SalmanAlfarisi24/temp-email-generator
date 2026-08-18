const axios = require('axios');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, '../../data');

// Pastikan folder data ada
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'aliases.json');

// Penyimpanan alias lokal (persist ke file JSON sebagai mode simulasi tanpa ForwardEmail.net)
let localAliases = [];

function normalizeDomain(domain) {
  return String(domain || '').trim().toLowerCase();
}

function normalizePrefix(prefix) {
  return String(prefix || '').trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function makeStatusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function loadAliases() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      localAliases = Array.isArray(parsed) ? parsed : [];
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
    throw makeStatusError(`Gagal simpan aliases.json: ${error.message}`, 500);
  }
}

function addAlias(entry) {
  localAliases.push(entry);
  try {
    saveAliases();
  } catch (error) {
    localAliases = localAliases.filter(a => !(a.domain === entry.domain && a.prefix === entry.prefix));
    throw error;
  }
}

function removeAlias(domain, prefix) {
  const index = localAliases.findIndex(a => a.domain === domain && a.prefix === prefix);
  if (index === -1) return false;

  const [removed] = localAliases.splice(index, 1);
  try {
    saveAliases();
    return true;
  } catch (error) {
    localAliases.splice(index, 0, removed);
    throw error;
  }
}

// inisialisasi saat service dimuat
loadAliases();

class AliasService {
  async getDomains() {
    const domain = normalizeDomain(process.env.CUSTOM_DOMAIN || 'mail.example.com');
    return [domain];
  }

  async createAlias(domainInput, prefixInput, forwardToInput) {
    const domain = normalizeDomain(domainInput);
    const prefix = normalizePrefix(prefixInput);
    const forwardTo = normalizeEmail(forwardToInput);

    if (!domain) {
      throw makeStatusError('Domain wajib diisi. Contoh: mail.kamu.com', 400);
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      throw makeStatusError('Domain tidak valid. Gunakan format seperti mail.kamu.com (hanya huruf kecil, angka, titik, dan dash)', 400);
    }
    if (!prefix) {
      throw makeStatusError('Prefix wajib diisi', 400);
    }
    if (!/^[a-z0-9._-]{1,64}$/.test(prefix)) {
      throw makeStatusError('Prefix hanya boleh huruf kecil, angka, titik, underscore, atau dash (maks 64 karakter)', 400);
    }
    if (!forwardTo) {
      throw makeStatusError('Alamat forward wajib diisi', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forwardTo)) {
      throw makeStatusError('Format alamat forward tidak valid', 400);
    }
    if (localAliases.some(a => a.domain === domain && a.prefix === prefix)) {
      throw makeStatusError(`Alias ${prefix}@${domain} sudah ada`, 409);
    }

    const alias = `${prefix}@${domain}`;
    const entry = { domain, prefix, forwardTo, alias, source: 'local', createdAt: new Date().toISOString() };

    if (config.forwardEmailApiKey) {
      let response = null;
      try {
        response = await axios.post(
          `https://api.forwardemail.net/v1/domains/${encodeURIComponent(domain)}/aliases`,
          { prefix, forwardTo },
          { headers: { Authorization: `Bearer ${config.forwardEmailApiKey}` } }
        );
      } catch (error) {
        console.error('ForwardEmail API gagal, pakai mode lokal:', error.message);
        addAlias(entry);
        return entry;
      }

      const remoteEntry = {
        ...entry,
        source: 'remote',
        remoteData: response.data,
      };
      addAlias(remoteEntry);
      return remoteEntry;
    }

    addAlias(entry);
    return entry;
  }

  async listAliases(domainInput) {
    const domain = domainInput ? normalizeDomain(domainInput) : '';
    let remote = null;

    if (config.forwardEmailApiKey && domain) {
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
    const seen = new Set(local.map(a => `${a.domain}:${a.prefix}`));
    const merged = [...local];

    if (Array.isArray(remote)) {
      for (const r of remote) {
        const rDomain = normalizeDomain(r.domain || domain);
        const rPrefix = normalizePrefix(r.name || r.prefix);
        if (!rDomain || !rPrefix) continue;

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

  async deleteAlias(domainInput, prefixInput) {
    const domain = normalizeDomain(domainInput);
    const prefix = normalizePrefix(prefixInput);

    if (!domain) {
      throw makeStatusError('Domain wajib diisi', 400);
    }
    if (!prefix) {
      throw makeStatusError('Prefix wajib diisi', 400);
    }

    const deletedLocal = removeAlias(domain, prefix);

    if (config.forwardEmailApiKey) {
      try {
        await axios.delete(
          `https://api.forwardemail.net/v1/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(prefix)}`,
          { headers: { Authorization: `Bearer ${config.forwardEmailApiKey}` } }
        );
        return { success: true, message: `Alias ${prefix}@${domain} dihapus` };
      } catch (error) {
        if (deletedLocal) {
          return { success: true, message: `Alias ${prefix}@${domain} dihapus (lokal)` };
        }
        throw makeStatusError(`Alias ${prefix}@${domain} tidak ditemukan`, 404);
      }
    }

    if (deletedLocal) {
      return { success: true, message: `Alias ${prefix}@${domain} dihapus` };
    }
    throw makeStatusError(`Alias ${prefix}@${domain} tidak ditemukan`, 404);
  }
}

module.exports = new AliasService();