// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as dotenv from 'dotenv';
import * as path from 'path';

import { type RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import {
  validateProcessorConfig,
  validateRedisConfig,
  validateEnvVar,
  validateDatabaseConfig,
} from '@tazama-lf/frms-coe-lib/lib/helpers/env';
import { Database } from '@tazama-lf/frms-coe-lib/lib/helpers/env/database.config';
import { type DBConfig } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';

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
  db: DBConfig;
  interdictionProducer: string;
  logstashLevel: string;
  redis: RedisConfig;
  sidecarHost?: string;
  suppressAlerts: boolean;
}

const generalConfig = validateProcessorConfig();
const authEnabled = generalConfig.nodeEnv === 'production';
const db = validateDatabaseConfig(authEnabled, Database.CONFIGURATION);
const redis = validateRedisConfig(authEnabled);

export const config: IConfig = {
  maxCPU: generalConfig.maxCPU,
  ruleName: validateEnvVar<string>('RULE_NAME', 'string'),
  ruleVersion: validateEnvVar<string>('RULE_VERSION', 'string'),
  interdictionProducer: validateEnvVar<string>(
    'INTERDICTION_PRODUCER',
    'string',
  ),
  db,
  env: generalConfig.nodeEnv,
  functionName: generalConfig.functionName,
  logstashLevel: validateEnvVar('LOGSTASH_LEVEL', 'string', true) || 'info',
  redis,
  sidecarHost: validateEnvVar<string>('SIDECAR_HOST', 'string', true),
  suppressAlerts:
    validateEnvVar<boolean>('SUPPRESS_ALERTS', 'boolean', true) || false,
};
