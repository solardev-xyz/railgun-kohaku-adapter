'use strict';
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// The example now has its own package scope. Checkout unit tests resolve this
// repository's package through its real exports, from the repository scope.
// Installed application/native checks use Node/Electron resolution, not this hook.
module.exports = (request, options) => options.defaultResolver(request, {
  ...options,
  ...((request === '@freedom/railgun-kohaku-adapter' || request.startsWith('@freedom/railgun-kohaku-adapter/'))
    ? { basedir: root }
    : {}),
});
