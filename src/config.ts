// SPDX-License-Identifier: Apache-2.0
// config settings, env variables

import type { ManagerConfig } from '@tazama-lf/frms-coe-lib';
import type { AdditionalConfig, ProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';

export const additionalEnvironmentVariables: AdditionalConfig[] = [
  {
    name: 'RULE_NAME',
    type: 'string',
  },
  {
    name: 'RULE_VERSION',
    type: 'string',
  },
  {
    name: 'SUPPRESS_ALERTS',
    type: 'boolean',
  },
  {
    name: 'INTERDICTION_PRODUCER',
    type: 'string',
  },
  {
    name: 'INTERDICTION_DESTINATION',
    type: 'string',
  },
];

export interface ExtendedConfig {
  RULE_NAME: string;
  RULE_VERSION: string;
  SUPPRESS_ALERTS: boolean;
  INTERDICTION_PRODUCER: string;
  INTERDICTION_DESTINATION: 'global' | 'tenant';
}

export type Databases = Required<Pick<ManagerConfig, 'configuration' | 'redisConfig'>>;
export type Configuration = ProcessorConfig & Databases & ExtendedConfig;
