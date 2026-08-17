const aliasService = require('../services/alias.service');

function sendError(res, error) {
  res.status(error.status || 500).json({ success: false, message: error.message });
}

exports.getDomains = async (req, res) => {
  try {
    const domains = await aliasService.getDomains();
    res.json({ success: true, data: domains });
  } catch (error) {
    sendError(res, error);
  }
};

exports.createAlias = async (req, res) => {
  try {
    const { domain, prefix, forwardTo } = req.body || {};
    const result = await aliasService.createAlias(domain, prefix, forwardTo);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};

exports.listAliases = async (req, res) => {
  const { domain } = req.query;
  try {
    const aliases = await aliasService.listAliases(domain);
    res.json({ success: true, data: aliases });
  } catch (error) {
    sendError(res, error);
  }
};

exports.deleteAlias = async (req, res) => {
  try {
    const { domain, prefix } = req.body || {};
    const result = await aliasService.deleteAlias(domain, prefix);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
};