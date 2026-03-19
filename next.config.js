// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: false,          // we register manually in the hook
  skipWaiting: true,
  // Tell next-pwa not to overwrite our custom sw.js
  swSrc: 'public/sw.js',   // use ours as the source
});

module.exports = withPWA({ turbopack: {} });
