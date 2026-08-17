const axios = require('axios');

const EMAILNATOR_BASE_URL = process.env.EMAILNATOR_BASE_URL || 'https://www.emailnator.com';

// Client ringan untuk emailnator.com.
// Endpoint tidak resmi/dokumentasi terbatas; jalankan dengan timeout pendek
// dan anggap gagal siluman — service memanggil ini hanya saat user memilih
// domain "(Emailnator)".
class EmailnatorClient {
  constructor() {
    this.currentEmail = null;
  }

  async generateEmail(options) {
    const response = await axios.post(`${EMAILNATOR_BASE_URL}/generate`, options || [], {
      timeout: 15000,
    });
    const email = response.data?.email;
    if (!email) {
      throw new Error('Emailnator tidak mengembalikan email');
    }
    this.currentEmail = email;
    return { email };
  }

  async getMessageList(email) {
    const response = await axios.get(`${EMAILNATOR_BASE_URL}/message`, {
      params: { email },
      timeout: 15000,
    });
    const data = response.data || {};
    const list = data.messageData || data.message || data.list || [];
    return { messages: Array.isArray(list) ? list : [] };
  }
}

module.exports = EmailnatorClient;