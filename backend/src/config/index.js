const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  tempMailBaseUrl: process.env.TEMP_MAIL_BASE_URL || 'https://www.1secmail.com/api/v1/',
  guerrillaBaseUrl: process.env.GUERRILLA_BASE_URL || 'https://api.guerrillamail.com/ajax.php',
  forwardEmailApiKey: process.env.FORWARD_EMAIL_API_KEY || '',
  defaultDomain: process.env.DEFAULT_DOMAIN || '1secmail.com',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};