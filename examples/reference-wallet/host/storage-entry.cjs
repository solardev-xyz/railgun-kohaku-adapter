"use strict";
const {
  installRailgunStorageWorkerBootstrap,
} = require("@freedom/railgun-kohaku-adapter/host/owner-worker-bootstrap");
const bootstrap = installRailgunStorageWorkerBootstrap();
const { createContextHost } = require("./context.cjs");
bootstrap.initialize({ context: createContextHost() });
