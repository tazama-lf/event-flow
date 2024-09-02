import './apm';
import {
  CreateDatabaseManager,
  type DatabaseManagerInstance,
  LoggerService,
} from '@frmscoe/frms-coe-lib';
import {
  type IStartupService,
  StartupFactory,
} from '@frmscoe/frms-coe-startup-lib';
import cluster from 'cluster';
import os from 'os';
import { config } from './config';
import { handleTransaction } from './logic.service';

const databaseManagerConfig = {
  redisConfig: {
    db: config.redis.db,
    servers: config.redis.servers,
    password: config.redis.password,
    isCluster: config.redis.isCluster,
  },
  configuration: {
    databaseName: config.db.name,
    certPath: config.db.dbCertPath,
    password: config.db.password,
    url: config.db.url,
    user: config.db.user,
    localCacheEnabled: config.db.cacheEnabled,
    localCacheTTL: config.db.cacheTTL,
  },
};

const loggerService: LoggerService = new LoggerService(config.sidecarHost);
let server: IStartupService;
let databaseManager: DatabaseManagerInstance<typeof databaseManagerConfig>;
const logContext = 'startup';

export const initializeDB = async (): Promise<void> => {
  const manager = await CreateDatabaseManager(databaseManagerConfig);
  databaseManager = manager;
  loggerService.log(
    JSON.stringify(databaseManager.isReadyCheck()),
    logContext,
    config.functionName,
  );
};

export const runServer = async (): Promise<void> => {
  server = new StartupFactory();
  if (config.env !== 'test') {
    let isConnected = false;
    for (let retryCount = 0; retryCount < 10; retryCount++) {
      loggerService.log('Connecting to nats server...');
      if (
        !(await server.init(
          handleTransaction,
          loggerService,
          [`sub-rule-${config.ruleName}@${config.ruleVersion}`],
          `pub-rule-${config.ruleName}@${config.ruleVersion}`,
        ))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
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

const numCPUs =
  os.cpus().length > config.maxCPU ? config.maxCPU + 1 : os.cpus().length + 1;

process.on('uncaughtException', (err) => {
  loggerService.error(
    `process on uncaughtException error: ${JSON.stringify(err)}`,
    logContext,
    config.functionName,
  );
});

process.on('unhandledRejection', (err) => {
  loggerService.error(
    `process on unhandledRejection error: ${JSON.stringify(err)}`,
    logContext,
    config.functionName,
  );
});

if (cluster.isPrimary && config.maxCPU !== 1) {
  loggerService.log(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 1; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    loggerService.log(
      `worker ${Number(worker.process.pid)} died, starting another worker`,
    );
    cluster.fork();
  });
} else {
  if (process.env.NODE_ENV !== 'test') {
    (async () => {
      try {
        await initializeDB();
        await runServer();
      } catch (err) {
        loggerService.error(
          'Error while starting service',
          err as Error,
          logContext,
          config.functionName,
        );
        process.exit(1);
      }
    })();
  }
}

export { databaseManager, loggerService, server };
