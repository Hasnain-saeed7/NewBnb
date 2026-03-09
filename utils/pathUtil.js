// Core Module
const path = require('path');

// When imported as a serverless function (Vercel), require.main is null.
// Fall back to __dirname (utils/) and go up one level to reach the project root.
module.exports = require.main
  ? path.dirname(require.main.filename)
  : path.join(__dirname, '..');