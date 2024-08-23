import {
  EntityCondition,
  RuleResult,
} from '@frmscoe/frms-coe-lib/lib/interfaces';
import { loggerService, server } from '.';
import { configuration } from './config';

const calculateDuration = (startTime: bigint): number => {
  const endTime: bigint = process.hrtime.bigint();
  return Number(endTime - startTime);
};

export const handleTransaction = async (transaction: any): Promise<void> => {
  const cacheID = `${transaction.FIToFIPmtSts.TxInfAndSts}`;
  const startTime = process.hrtime.bigint();

  //Get Entity Conditions

  //Get Account Conditions
  
  let conditions: EntityCondition[] = [
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

  //Filter out expired conditions
  conditions = conditions.filter(cond => new Date(cond.xprtnDtTm!) < new Date());

  //Filter out conditions not fit for transaction type (Won't this always be Pacs002?)
  conditions = conditions.filter(cond => cond.evtTp.includes('pacs.008.01.10'))


  //Determine outcome and calculate duration
  let ruleResult = await determineOutcome(conditions);
  ruleResult.prcgTm = calculateDuration(startTime);

  server.handleResponse(ruleResult);
};

const determineOutcome = async (
  conditions: EntityCondition[]
): Promise<RuleResult> => {
  let ruleResult: RuleResult = {
    id: `${configuration.ruleName}@${configuration.ruleVersion}`,
    cfg: 'none',
    subRuleRef: 'none',
    prcgTm: 0,
  };

  if (conditions.filter((cond) => cond.condTp === 'non-overridable-block')) {
    ruleResult.subRuleRef = 'block';

    if (!configuration.suppressAlerts) {
      server
        .handleResponse({ ...ruleResult }, [configuration.cmsProducer])
        .catch((error) => {
          loggerService.error('Error while sending Typology result to CMS');
        });
    }

    return ruleResult;
  }

  if (conditions.filter((cond) => cond.condTp === 'override-block')) {
    ruleResult.subRuleRef = 'override';
    return ruleResult;
  }

  if (conditions.filter((cond) => cond.condTp === 'overridable-block')) {
    ruleResult.subRuleRef = 'block';
    return ruleResult;
  }

  return ruleResult;
};
