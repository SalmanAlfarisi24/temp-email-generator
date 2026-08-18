const axios = require('axios');

class EmailnatorClient {
  constructor() {
    this.baseUrl = 'https://www.emailnator.com';
    this.cookies = [];
    this.xsrfToken = null;
    this.currentEmail = null;
  }

  _extractCookies(response) {
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) return;
    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
    cookieArray.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length === 2) {
        const existing = this.cookies.find(c => c.name === parts[0]);
        if (existing) existing.value = parts[1];
        else this.cookies.push({ name: parts[0], value: parts[1] });
      }
    });
  }

  _getCookieString() {
    return this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  async _getXsrfToken() {
    try {
      const response = await axios.get(this.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      });
      this._extractCookies(response);
      const html = response.data;
      let match = html.match(/<meta name="csrf-token" content="([^"]+)"/);
      if (match && match[1]) {
        this.xsrfToken = match[1];
        return this.xsrfToken;
      }
      match = html.match(/window\._csrf\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        this.xsrfToken = match[1];
        return this.xsrfToken;
      }
      throw new Error('CSRF token tidak ditemukan');
    } catch (error) {
      throw new Error(`Gagal ambil XSRF token: ${error.message}`);
    }
  }

  async generateEmail(options = ['plusGmail', 'dotGmail']) {
    await this._getXsrfToken();
    try {
      const response = await axios.post(
        `${this.baseUrl}/generate-email`,
        { email: '', options },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': this._getCookieString(),
            'X-XSRF-TOKEN': this.xsrfToken,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.emailnator.com/',
            'Origin': 'https://www.emailnator.com',
          },
          timeout: 15000,
        }
      );
      this._extractCookies(response);
      const data = response.data;
      if (!data || !data.email) throw new Error('Response tidak valid');
      this.currentEmail = data.email;
      return { email: data.email, options };
    } catch (error) {
      throw new Error(`Emailnator gagal: ${error.message}`);
    }
  }

  async getMessageList(email = this.currentEmail) {
    if (!email) throw new Error('Belum ada email');
    await this._getXsrfToken();
    try {
      const response = await axios.post(
        `${this.baseUrl}/message-list`,
        { email },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': this._getCookieString(),
            'X-XSRF-TOKEN': this.xsrfToken,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.emailnator.com/',
            'Origin': 'https://www.emailnator.com',
          },
          timeout: 15000,
        }
      );
      this._extractCookies(response);
      const data = response.data;
      let messages = [];
      if (Array.isArray(data.messageData)) messages = data.messageData;
      else if (data.messageData && data.messageData.messages) messages = data.messageData.messages;
      return { messages, count: messages.length };
    } catch (error) {
      throw new Error(`Emailnator inbox gagal: ${error.message}`);
    }
  }
}

module.exports = EmailnatorClient;