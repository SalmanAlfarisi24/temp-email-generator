const tempMailService = require('../services/tempMail.service');

function sendError(res, error) {
  res.status(error.status || 500).json({ success: false, message: error.message });
}

exports.getDomains = async (req, res) => {
  try {
    const domains = await tempMailService.getDomains();
    res.json({ success: true, data: domains });
  } catch (error) {
    sendError(res, error);
  }
};

exports.generateEmail = async (req, res) => {
  try {
    const { domain } = req.body || {};
    const result = domain
      ? await tempMailService.generateEmail(domain)
      : await tempMailService.generateWithFallback();
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.getInbox = async (req, res) => {
  try {
    const { email } = req.body || {};
    const inbox = await tempMailService.getInbox(email);
    res.json({ success: true, data: inbox });
  } catch (error) {
    sendError(res, error);
  }
};

exports.refreshInbox = async (req, res) => {
  try {
    const { email } = req.body || {};
    const inbox = await tempMailService.refreshInbox(email);
    res.json({ success: true, data: inbox });
  } catch (error) {
    sendError(res, error);
  }
};