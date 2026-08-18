const axios = require('axios');
const config = require('../config');
const EmailnatorClient = require('./emailnator.client');

const GUERRILLA_DOMAINS = new Set([
  'sharklasers.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'spam4.me',
  'grr.la',
  'pokemail.net',
  'guerrillamail.de',
]);

// Domain 1secmail statis (fallback jika API down)
const ONESECMAIL_FALLBACK = [
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  'esm1.net',
  'wwjmp.com',
  'aoeuhtns.com',
];

function makeStatusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function splitEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw makeStatusError('Format email tidak valid', 400);
  }
  const [login, domain] = email.toLowerCase().split('@');
  if (!login || !domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    throw makeStatusError('Format email tidak valid', 400);
  }
  return { login, domain };
}

function normalizeDomain(domain) {
  let value = String(domain || '').trim().toLowerCase();
  value = value.replace(' (emailnator)', '');
  if (!value) return '';
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    throw makeStatusError('Format domain tidak valid', 400);
  }
  return value;
}

function normalizeOneSecMessage(message) {
  return {
    id: message.id,
    from: message.from || 'Unknown',
    subject: message.subject || '(no subject)',
    date: message.date || '',
    body: message.body || message.textBody || message.htmlBody || '',
    source: '1secmail',
    raw: message,
  };
}

function normalizeGuerrillaMessage(message) {
  return {
    id: message.mail_id,
    from: message.mail_from || 'Unknown',
    subject: message.mail_subject || '(no subject)',
    date: message.mail_date || '',
    body: message.mail_excerpt || message.mail_body || '',
    source: 'guerrilla',
    raw: message,
  };
}

class TempMailService {
  constructor() {
    this.lastGuerrillaSession = null;
    this.emailnator = new EmailnatorClient();
  }

  // ========== GET DOMAINS (Gabungan semua provider) ==========
  async getDomains() {
    const allDomains = [];
    const errors = [];

    // 1. 1secmail (coba API, fallback static)
    try {
      const response = await axios.get('https://api.1secmail.com/v1/?action=getDomainList', { timeout: 8000 });
      if (Array.isArray(response.data) && response.data.length) {
        allDomains.push(...response.data);
      } else {
        // fallback static
        allDomains.push(...ONESECMAIL_FALLBACK);
        errors.push('1secmail: API response kosong, pakai fallback');
      }
    } catch (error) {
      allDomains.push(...ONESECMAIL_FALLBACK);
      errors.push(`1secmail: ${error.message}, pakai fallback`);
    }

    // 2. Guerrilla Mail (static list)
    allDomains.push(...Array.from(GUERRILLA_DOMAINS));

    // 3. Emailnator (selalu gmail.com)
    allDomains.push('gmail.com (Emailnator)');

    // Hilangkan duplikat
    const unique = [...new Set(allDomains)];

    console.log(`✅ Total domain: ${unique.length}. Errors: ${errors.join('; ')}`);
    return unique;
  }

  // ========== GENERATE EMAIL ==========
  async generateEmail(domainInput) {
    const domain = normalizeDomain(domainInput);
    const errors = [];

    // --- Jika user pilih Emailnator ---
    if (domainInput === 'gmail.com (Emailnator)' || domain === 'gmail.com') {
      try {
        const result = await this.emailnator.generateEmail(['plusGmail', 'dotGmail']);
        return { email: result.email, domain: 'gmail.com', provider: 'emailnator' };
      } catch (err) {
        // Lempar error biar user tau, jangan fallback diam-diam
        throw makeStatusError(`Emailnator gagal: ${err.message}`, 502);
      }
    }

    // --- Jika domain termasuk Guerrilla ---
    if (domain && GUERRILLA_DOMAINS.has(domain)) {
      return this.generateGuerrillaEmail(domain);
    }

    // --- Coba 1secmail ---
    let oneSecDomains = [];
    try {
      const response = await axios.get('https://api.1secmail.com/v1/?action=getDomainList', { timeout: 8000 });
      if (Array.isArray(response.data) && response.data.length) {
        oneSecDomains = response.data;
      }
    } catch (_) {}

    if (oneSecDomains.length > 0) {
      let targetDomain = domain;
      if (!targetDomain || !oneSecDomains.includes(targetDomain)) {
        // Jika domain tidak ada di list, ambil yang pertama
        targetDomain = oneSecDomains[0];
      }
      const login = Math.random().toString(36).substring(2, 12);
      return { email: `${login}@${targetDomain}`, domain: targetDomain, provider: '1secmail' };
    }

    // --- Fallback terakhir: Guerrilla dengan domain default ---
    try {
      // Ambil domain Guerrilla pertama sebagai default
      const defaultGuerrillaDomain = Array.from(GUERRILLA_DOMAINS)[0] || 'guerrillamailblock.com';
      return this.generateGuerrillaEmail(defaultGuerrillaDomain);
    } catch (error) {
      errors.push(`guerrilla: ${error.message}`);
    }

    throw makeStatusError(`Semua provider gagal: ${errors.join('; ')}`, 502);
  }

  // ========== GENERATE GUERRILLA DENGAN DOMAIN PILIHAN ==========
  async generateGuerrillaEmail(domain = null) {
    // Jika domain tidak diberikan, ambil default
    let targetDomain = domain;
    if (!targetDomain || !GUERRILLA_DOMAINS.has(targetDomain)) {
      targetDomain = Array.from(GUERRILLA_DOMAINS)[0] || 'guerrillamailblock.com';
    }

    const response = await axios.get('https://api.guerrillamail.com/ajax.php', {
      params: { f: 'get_email_address' },
      timeout: 10000,
    });

    const email = response.data?.email_addr;
    if (!email) {
      throw new Error('Guerrilla Mail tidak mengembalikan email_addr');
    }

    // Set session
    this.lastGuerrillaSession = {
      email: email.toLowerCase(),
      sidToken: response.data.sid_token,
    };

    // Kembalikan email dengan domain yang sudah dipilih
    // Tapi karena Guerrilla selalu generate dengan domain mereka, kita perlu override domain-nya?
    // Sebenarnya Guerrilla akan memberikan email dengan domain tertentu sesuai request.
    // Tapi berdasarkan pengalaman, parameter domain tidak selalu dihargai.
    // Jadi kita lakukan: split email, ganti domain dengan targetDomain, lalu gabung lagi.
    const [login, _] = email.split('@');
    const finalEmail = `${login}@${targetDomain}`;

    // Update session dengan email baru
    this.lastGuerrillaSession.email = finalEmail.toLowerCase();

    return {
      email: finalEmail,
      domain: targetDomain,
      provider: 'guerrilla',
      sidToken: response.data.sid_token,
    };
  }

  // ========== GET INBOX ==========
  async getInbox(email) {
    const { login, domain } = splitEmail(email);
    const errors = [];

    // --- Emailnator ---
    if (domain === 'gmail.com' || (this.emailnator.currentEmail && this.emailnator.currentEmail.toLowerCase() === email.toLowerCase())) {
      try {
        const result = await this.emailnator.getMessageList(email);
        return result.messages.map(msg => ({
          id: msg.messageID || msg.id || Math.random().toString(),
          from: msg.from || 'Unknown',
          subject: msg.subject || '(no subject)',
          date: msg.time || msg.date || '',
          body: msg.content || msg.body || msg.excerpt || '',
          source: 'emailnator',
          raw: msg
        }));
      } catch (err) {
        errors.push(`emailnator: ${err.message}`);
      }
    }

    // --- Guerrilla ---
    const useGuerrilla = GUERRILLA_DOMAINS.has(domain) || this.lastGuerrillaSession?.email === email.toLowerCase();
    if (useGuerrilla) {
      try {
        return await this.getGuerrillaInbox(email);
      } catch (error) {
        errors.push(`guerrilla: ${error.message}`);
      }
    }

    // --- 1secmail ---
    try {
      const listResponse = await axios.get('https://api.1secmail.com/v1/', {
        params: { action: 'getMessages', login, domain },
        timeout: 10000,
      });
      const summaries = Array.isArray(listResponse.data) ? listResponse.data : [];
      const messages = await Promise.all(summaries.map(async (msg) => {
        try {
          const detail = await axios.get('https://api.1secmail.com/v1/', {
            params: { action: 'readMessage', login, domain, id: msg.id },
            timeout: 10000,
          });
          return normalizeOneSecMessage({ ...msg, ...detail.data });
        } catch (_) {
          return normalizeOneSecMessage(msg);
        }
      }));
      return messages;
    } catch (error) {
      errors.push(`1secmail: ${error.message}`);
    }

    throw makeStatusError(`Gagal fetch inbox (${errors.join('; ')})`, 502);
  }

  async getGuerrillaInbox(email) {
    if (!this.lastGuerrillaSession?.sidToken || this.lastGuerrillaSession.email !== email.toLowerCase()) {
      throw new Error('Sesi Guerrilla tidak aktif. Generate ulang.');
    }
    const response = await axios.get('https://api.guerrillamail.com/ajax.php', {
      params: {
        f: 'check_email',
        seq: 0,
        sid_token: this.lastGuerrillaSession.sidToken,
      },
      timeout: 10000,
    });
    const messages = Array.isArray(response.data?.list) ? response.data.list : [];
    return messages.map(normalizeGuerrillaMessage);
  }

  async refreshInbox(email) {
    return this.getInbox(email);
  }

  async generateWithFallback(domainList) {
    const domains = Array.isArray(domainList) ? domainList : await this.getDomains();
    const fallbackDomain = domains.find(d => d.includes('1secmail')) || domains[0];
    return this.generateEmail(fallbackDomain);
  }
}

module.exports = new TempMailService();