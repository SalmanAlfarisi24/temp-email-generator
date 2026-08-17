const axios = require('axios');
const config = require('../config');

const ONE_SEC_BASE_URL = config.tempMailBaseUrl || 'https://www.1secmail.com/api/v1/';
const GUERRILLA_BASE_URL = config.guerrillaBaseUrl || 'https://api.guerrillamail.com/ajax.php';
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

function splitEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    const err = new Error('Format email tidak valid');
    err.status = 400;
    throw err;
  }
  const [login, domain] = email.toLowerCase().split('@');
  return { login, domain };
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
  }

  async getDomains() {
    const errors = [];

    try {
      const response = await axios.get(ONE_SEC_BASE_URL, {
        params: { action: 'getDomainList' },
        timeout: 10000,
      });
      if (Array.isArray(response.data) && response.data.length) {
        return response.data;
      }
      errors.push('1secmail: daftar domain kosong');
    } catch (error) {
      errors.push(`1secmail: ${error.message}`);
    }

    // Guerrilla tidak punya daftar domain stabil via endpoint simpel; pakai domain umum sebagai fallback.
    try {
      const account = await this.generateGuerrillaEmail();
      return [account.domain];
    } catch (error) {
      errors.push(`guerrilla: ${error.message}`);
    }

    const err = new Error(`Gagal fetch domain provider temp mail (${errors.join('; ')})`);
    err.status = 502;
    throw err;
  }

  async generateEmail(domain) {
    const errors = [];

    if (domain && GUERRILLA_DOMAINS.has(String(domain).toLowerCase())) {
      return this.generateGuerrillaEmail();
    }

    // 1secmail primary
    try {
      const response = await axios.get(ONE_SEC_BASE_URL, {
        params: {
          action: 'genRandomMailbox',
          count: 1,
        },
        timeout: 10000,
      });
      const email = Array.isArray(response.data) ? response.data[0] : response.data?.email;
      if (email && typeof email === 'string') {
        const parsed = splitEmail(email);
        if (!domain || parsed.domain === domain) {
          return { email, domain: parsed.domain, provider: '1secmail' };
        }
      }
      errors.push('1secmail: gagal membuat mailbox acak');
    } catch (error) {
      errors.push(`1secmail: ${error.message}`);
    }

    // Kalau user memilih domain tertentu, 1secmail genRandomMailbox tidak menjamin domain itu.
    // Fallback manual random pada domain pilihan tetap valid untuk 1secmail selama domain ada di provider.
    if (domain) {
      const login = Math.random().toString(36).substring(2, 12);
      return { email: `${login}@${domain}`, domain, provider: '1secmail' };
    }

    // Guerrilla fallback
    try {
      return await this.generateGuerrillaEmail();
    } catch (error) {
      errors.push(`guerrilla: ${error.message}`);
    }

    const err = new Error(`Gagal generate email (${errors.join('; ')})`);
    err.status = 502;
    throw err;
  }

  async generateGuerrillaEmail() {
    const response = await axios.get(GUERRILLA_BASE_URL, {
      params: { f: 'get_email_address' },
      timeout: 10000,
    });
    const email = response.data?.email_addr;
    if (!email) {
      throw new Error('Guerrilla Mail tidak mengembalikan email_addr');
    }
    this.lastGuerrillaSession = {
      email: email.toLowerCase(),
      sidToken: response.data.sid_token,
    };
    const { domain } = splitEmail(email);
    return { email, domain, provider: 'guerrilla', sidToken: response.data.sid_token };
  }

  async getInbox(email) {
    const { login, domain } = splitEmail(email);
    const errors = [];
    const useGuerrilla =
      GUERRILLA_DOMAINS.has(domain) ||
      this.lastGuerrillaSession?.email === email.toLowerCase();

    if (useGuerrilla) {
      try {
        return await this.getGuerrillaInbox(email);
      } catch (error) {
        errors.push(`guerrilla: ${error.message}`);
      }
    }

    try {
      const listResponse = await axios.get(ONE_SEC_BASE_URL, {
        params: {
          action: 'getMessages',
          login,
          domain,
        },
        timeout: 10000,
      });

      const summaries = Array.isArray(listResponse.data) ? listResponse.data : [];
      return Promise.all(summaries.map(async (message) => {
        try {
          const detailResponse = await axios.get(ONE_SEC_BASE_URL, {
            params: {
              action: 'readMessage',
              login,
              domain,
              id: message.id,
            },
            timeout: 10000,
          });
          return normalizeOneSecMessage({ ...message, ...detailResponse.data });
        } catch (_) {
          return normalizeOneSecMessage(message);
        }
      }));
    } catch (error) {
      errors.push(`1secmail: ${error.message}`);
    }

    const err = new Error(`Gagal fetch inbox (${errors.join('; ') || 'provider tidak tersedia'})`);
    err.status = 502;
    throw err;
  }

  async getGuerrillaInbox(email) {
    if (!this.lastGuerrillaSession?.sidToken || this.lastGuerrillaSession.email !== email.toLowerCase()) {
      throw new Error('Sesi Guerrilla Mail tidak aktif untuk email ini. Generate ulang.');
    }
    const response = await axios.get(GUERRILLA_BASE_URL, {
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