import {
  AccountCondition,
  EntityCondition,
} from '@frmscoe/frms-coe-lib/lib/interfaces';
import { databaseManager, loggerService, server } from '.';
import { configuration } from './config';

export const handleTransaction = async (transaction: any): Promise<void> => {
  const cacheID = `${transaction.FIToFIPmtSts.TxInfAndSts}`;

  databaseManager;

  const conditions: EntityCondition[] = [
    {
      evtTp: ['pacs.008.01.10'],
      condTp: 'overridable-block',
      prsptv: 'both',
      incptnDtTm: '2024-08-15T24:00:00.999Z',
      xprtnDtTm: '2024-08-16T24:00:00.999Z',
      condRsn: 'R001',
      ntty: {
        id: '+27733161225',
        schmeNm: {
          prtry: 'MSISDN',
        },
      },
      forceCret: true,
      usr: 'bob',
      creDtTm: '2024-08-15T09:31:30.806Z',
    },
    {
      evtTp: ['pacs.008.01.10'],
      condTp: 'overridable-block',
      prsptv: 'both',
      incptnDtTm: '2024-08-15T24:00:00.999Z',
      xprtnDtTm: '2024-08-16T24:00:00.999Z',
      condRsn: 'R001',
      ntty: {
        id: '+27733161225',
        schmeNm: {
          prtry: 'MSISDN',
        },
      },
      forceCret: true,
      usr: 'bob',
      creDtTm: '2024-08-15T09:32:56.681Z',
    },
  ];

  if (conditions.filter(cond => cond.condTp === "non-overridable-block")){
    
  }

  if (true) {
    server
      .handleResponse({ ...tadpReqBody, metaData }, [configuration.cmsProducer])
      .catch((error) => {
        loggerService.error('Error while sending Typology result to CMS');
      });
  }
};
