const axios = require('axios');
const config = require('../config');
const EmailnatorClient = require('./emailnator.client');

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

    let domains = [];
    if (errors.length === 0) {
        domains = response?.data || [];
    }
    
    // Inject Emailnator as the primary option
    domains.unshift('gmail.com (Emailnator)');

    if (domains.length > 1) {
      return domains;
    }

    // Guerrilla fallback domain statis;
    if (errors.length) {
      return ['gmail.com (Emailnator)', ...Array.from(GUERRILLA_DOMAINS)];
    }

    const err = new Error(`Gagal fetch domain provider temp mail (${errors.join('; ')})`);
    err.status = 502;
    throw err;
  }

  async generateEmail(domainInput) {
    const domain = normalizeDomain(domainInput);
    const errors = [];

    if (domainInput === 'gmail.com (Emailnator)' || domain === 'gmail.com') {
      try {
        const result = await this.emailnator.generateEmail(['plusGmail', 'dotGmail']);
        return { email: result.email, domain: 'gmail.com', provider: 'emailnator' };
      } catch (err) {
        errors.push(`emailnator: ${err.message}`);
      }
    }

    if (domain && GUERRILLA_DOMAINS.has(domain)) {
      return this.generateGuerrillaEmail();
    }

    // 1secmail: ambil daftar domain, generate login lokal.
    let oneSecDomains = [];
    try {
      const response = await axios.get(ONE_SEC_BASE_URL, {
        params: { action: 'getDomainList' },
        timeout: 10000,
      });
      if (Array.isArray(response.data) && response.data.length) {
        oneSecDomains = response.data;
      }
    } catch (error) {
      errors.push(`1secmail: ${error.message}`);
    }

    if (oneSecDomains.length) {
      let targetDomain = domain;
      if (!targetDomain || !oneSecDomains.includes(targetDomain)) {
        targetDomain = oneSecDomains[0];
      }
      const login = Math.random().toString(36).substring(2, 12);
      return {
        email: `${login}@${targetDomain}`,
        domain: targetDomain,
        provider: '1secmail',
      };
    }

    if (domain) {
      throw makeStatusError(`Domain ${domain} tidak didukung provider temp mail`, 400);
    }

    // Guerrilla fallback ketika tidak ada domain spesifik.
    try {
      return await this.generateGuerrillaEmail();
    } catch (error) {
      errors.push(`guerrilla: ${error.message}`);
    }

    throw makeStatusError(`Gagal generate email (${errors.join('; ')})`, 502);
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