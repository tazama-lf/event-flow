// SPDX-License-Identifier: Apache-2.0
import { Apm } from '@frmscoe/frms-coe-lib/lib/services/apm';
import { config } from './config';

const apm = new Apm({
  serviceName: config.apm.serviceName,
  secretToken: config.apm.secretToken,
  serverUrl: config.apm.url,
  usePathAsTransactionName: true,
  active: Boolean(config.apm.active),
  transactionIgnoreUrls: ['/health'],
});

export default apm;
