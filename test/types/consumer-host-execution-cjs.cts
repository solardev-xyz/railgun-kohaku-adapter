import execution = require('@freedom/railgun-kohaku-adapter/host/execution');
import bootstrap = require('@freedom/railgun-kohaku-adapter/host/bootstrap');
import type { RailgunExecutionHost as EsmHost } from '@freedom/railgun-kohaku-adapter/host/execution' with {
  'resolution-mode': 'import',
};
declare const host: execution.RailgunExecutionHost;
const same: EsmHost = host;
const file: string = execution.getRailgunExecutionJob('private-prepare');
const initialized: undefined = execution.initializeRailgunExecutionHost(same);
bootstrap.installRailgunExecutionBootstrap().initialize(host);
void file;
void initialized;
