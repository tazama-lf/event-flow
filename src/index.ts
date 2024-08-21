import { DatabaseManagerInstance, LoggerService } from '@frmscoe/frms-coe-lib';
import { IStartupService, StartupFactory } from '@frmscoe/frms-coe-startup-lib';
import { configuration } from './config';
import { handleTransaction } from './logic.service';

const databaseManagerConfig = {
  redisConfig: {
    db: configuration.redis.db,
    servers: configuration.redis.servers,
    password: configuration.redis.password,
    isCluster: configuration.redis.isCluster,
  },
  configuration: {
    databaseName: configuration.db.name,
    certPath: configuration.db.dbCertPath,
    password: configuration.db.password,
    url: configuration.db.url,
    user: configuration.db.user,
    localCacheEnabled: configuration.db.cacheEnabled,
    localCacheTTL: configuration.db.cacheTTL,
  },
};

const loggerService: LoggerService = new LoggerService(
  configuration.sidecarHost
);
let server: IStartupService;
let databaseManager: DatabaseManagerInstance<typeof databaseManagerConfig>;

export const runServer = async (): Promise<void> => {
  server = new StartupFactory();
  if (configuration.env !== 'test') {
    let isConnected = false;
    for (let retryCount = 0; retryCount < 10; retryCount++) {
      loggerService.log('Connecting to nats server...');
      if (!(await server.init(handleTransaction))) {
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

export { databaseManager, loggerService,  server};