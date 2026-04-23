const crypto = require('crypto');

function generateApiKey() {
  const random = crypto.randomBytes(32).toString('hex');
  return `cc_${random}`;
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function getKeyPrefix(key) {
  return key.substring(0, 10) + '...';
}

module.exports = { generateApiKey, hashApiKey, getKeyPrefix };
