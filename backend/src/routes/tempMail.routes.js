const express = require('express');
const router = express.Router();
const tempMailController = require('../controllers/tempMail.controller');

router.get('/domains', tempMailController.getDomains);
router.post('/generate', tempMailController.generateEmail);
router.post('/inbox', tempMailController.getInbox);
router.post('/refresh', tempMailController.refreshInbox);

module.exports = router;