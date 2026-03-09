// Core Module
const path = require('path');

// resolve one level up from utils/ to get the project root
// (avoids relying on require.main which is unreliable in serverless environments)
module.exports = path.resolve(__dirname, '..');