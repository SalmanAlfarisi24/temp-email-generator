class EmailnatorClient {
  constructor() {
    this.baseUrl = 'https://www.emailnator.com';
    this.cookies = [];
    this.xsrfToken = null;
    this.currentEmail = null;
  }

  _extractCookies(response) {
    const setCookie = response.headers.get('set-cookie') || response.headers.raw?.()['set-cookie'];
    if (!setCookie) return;
    
    const cookiesArr = typeof response.headers.getSetCookie === 'function' 
      ? response.headers.getSetCookie() 
      : [setCookie];

    cookiesArr.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length === 2) {
        const existing = this.cookies.find(c => c.name === parts[0]);
        if (existing) {
          existing.value = parts[1];
        } else {
          this.cookies.push({ name: parts[0], value: parts[1] });
        }
      }
    });
  }

  _getCookieString() {
    return this.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  async _getXsrfToken() {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      this._extractCookies(response);
      const html = await response.text();

      const match = html.match(/name="csrf-token" content="([^"]+)"/);
      if (match && match[1]) {
        this.xsrfToken = match[1];
        return this.xsrfToken;
      }

      const scriptMatch = html.match(/window\._csrf\s*=\s*"([^"]+)"/);
      if (scriptMatch && scriptMatch[1]) {
        this.xsrfToken = scriptMatch[1];
        return this.xsrfToken;
      }

      throw new Error('Gagal dapetin XSRF token');
    } catch (error) {
      throw new Error(`Gagal fetch XSRF token: ${error.message}`);
    }
  }

  async generateEmail(options = ['domain', 'plusGmail', 'dotGmail']) {
    await this._getXsrfToken();

    const body = {
      email: '',
      options: options
    };

    try {
      const response = await fetch(`${this.baseUrl}/generate-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': this._getCookieString(),
          'X-XSRF-TOKEN': this.xsrfToken,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(body)
      });

      this._extractCookies(response);
      const data = await response.json();

      if (!data || !data.email) {
        throw new Error('Response tidak valid dari server');
      }

      this.currentEmail = data.email;
      return {
        email: data.email,
        message: 'Email berhasil digenerate ><',
        options: options
      };
    } catch (error) {
      throw new Error(`Gagal generate email: ${error.message}`);
    }
  }

  async getMessageList(email = this.currentEmail) {
    if (!email) {
      throw new Error('Belum ada email yang digenerate. Panggil generateEmail() dulu');
    }

    await this._getXsrfToken();

    const body = { email: email };

    try {
      const response = await fetch(`${this.baseUrl}/message-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': this._getCookieString(),
          'X-XSRF-TOKEN': this.xsrfToken,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(body)
      });

      this._extractCookies(response);
      const data = await response.json();

      if (!data || !data.messageData) {
        return { messages: [], count: 0 };
      }

      let messages = [];
      if (Array.isArray(data.messageData)) {
        messages = data.messageData;
      } else if (data.messageData && data.messageData.messages) {
        messages = data.messageData.messages;
      }

      return {
        messages: messages,
        count: messages.length,
        raw: data
      };
    } catch (error) {
      throw new Error(`Gagal fetch inbox: ${error.message}`);
    }
  }
}

module.exports = EmailnatorClient;
