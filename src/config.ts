// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as dotenv from 'dotenv';
import * as path from 'path';

import { type RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface IConfig {
  maxCPU: number;
  env: string;
  functionName: string;
  ruleName: string;
  ruleVersion: string;
  db: {
    name: string;
    password: string;
    url: string;
    user: string;
    dbCertPath: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
  };
  interdictionProducer: string;
  logger: {
    logstashHost: string;
    logstashPort: number;
    logstashLevel: string;
  };
  redis: RedisConfig;
  sidecarHost: string;
  suppressAlerts: boolean;
}

export const config: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  ruleName: process.env.RULE_NAME!,
  ruleVersion: process.env.RULE_VERSION!,
  interdictionProducer: process.env.INTERDICTION_PRODUCER!,
  db: {
    name: process.env.DATABASE_NAME!,
    password: process.env.DATABASE_PASSWORD!,
    url: process.env.DATABASE_URL!,
    user: process.env.DATABASE_USER!,
    dbCertPath: process.env.DATABASE_CERT_PATH!,
    cacheEnabled: process.env.CACHE_ENABLED === 'true',
    cacheTTL: parseInt(process.env.CACHE_TTL!, 10),
  },
  env: process.env.NODE_ENV!,
  functionName: process.env.FUNCTION_NAME! || 'EFRuP',
  logger: {
    logstashHost: process.env.LOGSTASH_HOST!,
    logstashPort: parseInt(process.env.LOGSTASH_PORT ?? '0', 10),
    logstashLevel: process.env.LOGSTASH_LEVEL! || 'info',
  },
  redis: {
    db: parseInt(process.env.REDIS_DB!, 10) || 0,
    servers: JSON.parse(
      process.env.REDIS_SERVERS! || '[{"hostname": "127.0.0.1", "port":6379}]',
    ),
    password: process.env.REDIS_AUTH!,
    isCluster: process.env.REDIS_IS_CLUSTER === 'true',
  },
  sidecarHost: process.env.SIDECAR_HOST!,
  suppressAlerts: process.env.SUPPRESS_ALERTS === 'true',
};
