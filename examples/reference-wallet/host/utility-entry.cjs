"use strict";
// The package installs its egress guards before any other host module is loaded.
const {
  installRailgunExecutionBootstrap,
} = require("@freedom/railgun-kohaku-adapter/host/bootstrap");
const bootstrap = installRailgunExecutionBootstrap();
const { createContextHost } = require("./context.cjs");
const { createArtifactHost } = require("./artifacts.cjs");
const context = createContextHost();
bootstrap.initialize({ context, artifacts: createArtifactHost(context) });
