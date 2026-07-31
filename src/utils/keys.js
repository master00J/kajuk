const crypto = require('crypto');

function generateLicenceKey(prefix = 'GEN') {
  const segment = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${segment()}-${segment()}-${segment()}`;
}

module.exports = { generateLicenceKey };
