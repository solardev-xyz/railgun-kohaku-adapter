import host = require('@freedom/railgun-kohaku-adapter/host/execution');
import bootstrap = require('@freedom/railgun-kohaku-adapter/host/bootstrap');
host.getRailgunExecutionJob('relay-sign'); // expect TS2345
host.getRailgunExecutionJob('/tmp/job.js'); // expect TS2345
bootstrap.installRailgunExecutionBootstrap({ electronNet: {} }); // expect TS2554
host.initializeRailgunExecutionHost({ rawArchiveFs: {} }); // expect TS2353
host.getExecutionHost(); // expect TS2339
