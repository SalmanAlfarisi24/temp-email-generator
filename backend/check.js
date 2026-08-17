const assert = require('assert');
const aliasService = require('./src/services/alias.service');

async function expectStatus(fn, status, messagePart) {
  try {
    await fn();
    assert.fail('harusnya throw');
  } catch (error) {
    assert.strictEqual(error.status, status, error.message);
    if (messagePart) {
      assert.ok(error.message.includes(messagePart), error.message);
    }
  }
}

(async () => {
  await expectStatus(() => aliasService.createAlias('', 'ok', 'a@b.com'), 400, 'Domain');
  await expectStatus(() => aliasService.createAlias('mail.test', 'BAD PREFIX', 'a@b.com'), 400, 'Prefix');
  await expectStatus(() => aliasService.createAlias('mail.test', 'ok', 'bukan-email'), 400, 'forward');
  await expectStatus(() => aliasService.deleteAlias('mail.test', 'tidak-ada-' + Date.now()), 404);

  console.log('check ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});