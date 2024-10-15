// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import {
  validateDatabaseConfig,
  validateEnvVar,
  validateLocalCacheConfig,
  validateProcessorConfig,
  validateRedisConfig,
} from '@tazama-lf/frms-coe-lib/lib/helpers/env';
import { Database } from '@tazama-lf/frms-coe-lib/lib/helpers/env/database.config';
import { type ManagerConfig } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import * as dotenv from 'dotenv';
import * as path from 'path';

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
  db: ManagerConfig;
  interdictionProducer: string;
  logstashLevel: string;
  sidecarHost?: string;
  suppressAlerts: boolean;
}

const generalConfig = validateProcessorConfig();
const authEnabled = generalConfig.nodeEnv === 'production';
const configuration = validateDatabaseConfig(
  authEnabled,
  Database.CONFIGURATION,
);
const redisConfig = validateRedisConfig(authEnabled);
const localCacheConfig = validateLocalCacheConfig();

export const config: IConfig = {
  maxCPU: generalConfig.maxCPU,
  ruleName: validateEnvVar<string>('RULE_NAME', 'string'),
  ruleVersion: validateEnvVar<string>('RULE_VERSION', 'string'),
  interdictionProducer: validateEnvVar<string>(
    'INTERDICTION_PRODUCER',
    'string',
  ),
  db: {
    redisConfig,
    configuration,
    localCacheConfig,
  },
  env: generalConfig.nodeEnv,
  functionName: generalConfig.functionName,
  logstashLevel: validateEnvVar('LOGSTASH_LEVEL', 'string', true) || 'info',
  sidecarHost: validateEnvVar<string>('SIDECAR_HOST', 'string', true),
  suppressAlerts:
    validateEnvVar<boolean>('SUPPRESS_ALERTS', 'boolean', true) || false,
};
