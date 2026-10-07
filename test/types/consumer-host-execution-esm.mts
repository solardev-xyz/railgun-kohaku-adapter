import {
  initializeRailgunExecutionHost,
  getRailgunExecutionJob,
} from '@freedom/railgun-kohaku-adapter/host/execution';
import { installRailgunExecutionBootstrap } from '@freedom/railgun-kohaku-adapter/host/bootstrap';
import type {
  RailgunExecutionHost,
  RailgunExecutionJob,
} from '@freedom/railgun-kohaku-adapter/host/execution';
declare const host: RailgunExecutionHost;
const job: RailgunExecutionJob = 'private-recover';
const file: string = getRailgunExecutionJob(job);
const result: undefined = initializeRailgunExecutionHost(host);
installRailgunExecutionBootstrap().initialize(host);
void file;
void result;
