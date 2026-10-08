'use strict';
// Repository-only fixed worker entry. No host facade or main binding loads.
const bootstrap = require('../../host-owner-worker-bootstrap.cjs').installRailgunStorageWorkerBootstrap();
const context = require('../../test/fixtures/owner-privacy-context.js');
bootstrap.initialize({ context: {
  getPrivacyContext: context.getPrivacyContext,
  createPrivacyScope: context.createPrivacyScope,
} });
