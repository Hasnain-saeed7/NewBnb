// Core Module
const path = require('path');

// Use __dirname of this file (utils/) and go one level up to project root.
// Avoids require.main which is unreliable in serverless environments.
module.exports = path.resolve(__dirname, '..');