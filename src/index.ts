import './apm';
import { type DatabaseManagerInstance, LoggerService } from '@tazama-lf/frms-coe-lib';
import { type IStartupService, StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import cluster from 'node:cluster';
import os from 'node:os';
import { handleTransaction } from './logic.service';
import { validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';
import { CreateStorageManager } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import { Database } from '@tazama-lf/frms-coe-lib/lib/config/database.config';
import { Cache } from '@tazama-lf/frms-coe-lib/lib/config/redis.config';
import { additionalEnvironmentVariables, type Configuration } from './config';
import { setTimeout } from 'node:timers/promises';

let configuration = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;

const loggerService: LoggerService = new LoggerService(configuration);
let server: IStartupService;
let databaseManager: DatabaseManagerInstance<Configuration>;
const logContext = 'startup';

export const initializeDB = async (): Promise<void> => {
  const auth = configuration.nodeEnv === 'production';
  const { config, db } = await CreateStorageManager<typeof configuration>([Database.CONFIGURATION, Cache.DISTRIBUTED], auth);
  databaseManager = db;
  configuration = { ...configuration, ...config };
  loggerService.log(JSON.stringify(databaseManager.isReadyCheck()), logContext, configuration.functionName);
};

export const runServer = async (): Promise<void> => {
  server = new StartupFactory();
  if (configuration.nodeEnv !== 'test') {
    let isConnected = false;
    for (let retryCount = 0; retryCount < 10; retryCount++) {
      loggerService.log('Connecting to nats server...');
      if (
        !(await server.init(
          handleTransaction,
          loggerService,
          [`sub-rule-${configuration.RULE_NAME}@${configuration.RULE_VERSION}`],
          `pub-rule-${configuration.RULE_NAME}@${configuration.RULE_VERSION}`,
        ))
      ) {
        await setTimeout(5000);
      } else {
        loggerService.log('Connected to nats');
        isConnected = true;
        break;
      }
    }

    if (!isConnected) {
      throw new Error('Unable to connect to nats after 10 retries');
    }
  }
};

const numCPUs = os.cpus().length > configuration.maxCPU ? configuration.maxCPU + 1 : os.cpus().length + 1;

process.on('uncaughtException', (err) => {
  loggerService.error(`process on uncaughtException error: ${JSON.stringify(err)}`, logContext, configuration.functionName);
});

process.on('unhandledRejection', (err) => {
  loggerService.error(`process on unhandledRejection error: ${JSON.stringify(err)}`, logContext, configuration.functionName);
});

if (cluster.isPrimary && configuration.maxCPU !== 1) {
  loggerService.log(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 1; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    loggerService.log(`worker ${Number(worker.process.pid)} died, starting another worker`);
    cluster.fork();
  });
} else {
  if (process.env.NODE_ENV !== 'test') {
    (async () => {
      try {
        await initializeDB();
        await runServer();
      } catch (err) {
        loggerService.error('Error while starting service', err as Error, logContext, configuration.functionName);
        process.exit(1);
      }
    })();
  }
}

export { databaseManager, loggerService, server, configuration };
