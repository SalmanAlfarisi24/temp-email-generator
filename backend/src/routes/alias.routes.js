const express = require('express');
const router = express.Router();
const aliasController = require('../controllers/alias.controller');

router.get('/domains', aliasController.getDomains);
router.post('/create', aliasController.createAlias);
router.get('/list', aliasController.listAliases);
router.delete('/delete', aliasController.deleteAlias);

module.exports = router;