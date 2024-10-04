// SPDX-License-Identifier: Apache-2.0
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import { validateAPMConfig } from '@tazama-lf/frms-coe-lib/lib/helpers/env';

const config = validateAPMConfig();

const apm = new Apm({
  serviceName: config.apmServiceName,
  secretToken: config.apmSecretToken,
  serverUrl: config.apmUrl,
  usePathAsTransactionName: true,
  active: config.apmActive,
  transactionIgnoreUrls: ['/health'],
});

export default apm;
