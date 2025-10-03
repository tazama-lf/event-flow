import { CalculateDuration } from '@tazama-lf/frms-coe-lib/lib/helpers/calculatePrcg';
import { decodeConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { RuleRequest, RuleResult } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { ConditionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { databaseManager, loggerService, server } from '.';
import { configuration } from './';

const handleTransaction = async (req: unknown): Promise<void> => {
  const startTime = process.hrtime.bigint();
  const msg = req as RuleRequest;

  const request = {
    transaction: msg.transaction,
    networkMap: msg.networkMap,
    DataCache: msg.DataCache,
    metaData: msg.metaData,
  };

  const tenantId = request.transaction.TenantId;
  const debtorConditions: ConditionDetails[] = [];
  const creditorConditions: ConditionDetails[] = [];

  (
    await Promise.all([
      databaseManager._redisClient.getBuffer(`entities/${request.DataCache.cdtrId}`),
      databaseManager._redisClient.getBuffer(`accounts/${request.DataCache.cdtrAcctId}`),
      databaseManager._redisClient.getBuffer(`entities/${request.DataCache.dbtrId}`),
      databaseManager._redisClient.getBuffer(`accounts/${request.DataCache.dbtrAcctId}`),
    ])
  ).forEach((dec: Buffer | null, idx: number) => {
    if (dec && dec.length > 0) {
      try {
        const decode = decodeConditionsBuffer(dec);
        if (decode) {
          if (idx <= 1) {
            creditorConditions.push(...decode.conditions);
          } else {
            debtorConditions.push(...decode.conditions);
          }
        }
      } catch (err) {
        loggerService.error('Could not decode a condition');
      }
    }
  });

  const transactionDate = new Date(request.transaction.FIToFIPmtSts.GrpHdr.CreDtTm);

  const validConditions = sanitizeConditions(creditorConditions, debtorConditions, transactionDate, request.transaction.TxTp);

  // Determine outcome and calculate duration
  const ruleResult = determineOutcome(validConditions, request, tenantId);
  ruleResult.prcgTm = CalculateDuration(startTime);

  try {
    await server.handleResponse({ ...request, ruleResult });
  } catch (error) {
    const failMessage = 'Failed to send to Typology Processor.';
    loggerService.error(failMessage, error, `${configuration.RULE_NAME}@${configuration.RULE_VERSION}`, configuration.functionName);
  }
};

const sanitizeConditions = (
  creditorConditions: ConditionDetails[],
  debtorConditions: ConditionDetails[],
  transactionDate: Date,
  TxTp: string,
): string[] => {
  const debtorPerspectiveList: string[] = ['governed_as_debtor_by', 'governed_as_debtor_account_by'];
  const creditorPerspectiveList: string[] = ['governed_as_creditor_by', 'governed_as_creditor_account_by'];

  const eventTypes = new Set([TxTp, 'all']);

  const sanitizedCreditorConditions = creditorConditions
    .filter((cond) => {
      // Time window relevant
      const expireDate = cond.xprtnDtTm ? new Date(cond.xprtnDtTm) : null;
      const createdDate = new Date(cond.incptnDtTm);

      const isAfterCreation = transactionDate >= createdDate;
      const isNotExpired = expireDate === null || transactionDate <= expireDate;

      return isAfterCreation && isNotExpired;
    })
    .flatMap((cond) =>
      // Perspective matches creditor
      // Event matches request TxTp
      cond.prsptvs.flatMap((p) => {
        if (creditorPerspectiveList.includes(p.prsptv) && p.evtTp.some((ev) => eventTypes.has(ev))) {
          return cond.condTp;
        }
        return [];
      }),
    );

  const sanitizedDebtorConditions = debtorConditions
    .filter((cond) => {
      // Time window relevant
      const expireDate = cond.xprtnDtTm ? new Date(cond.xprtnDtTm) : null;
      const createdDate = new Date(cond.incptnDtTm);

      const isAfterCreation = transactionDate >= createdDate;
      const isNotExpired = expireDate === null || transactionDate <= expireDate;

      return isAfterCreation && isNotExpired;
    })
    .flatMap((cond) =>
      // Perspective matches debtor
      // Event matches request TxTp
      cond.prsptvs.flatMap((p) => {
        if (debtorPerspectiveList.includes(p.prsptv) && p.evtTp.some((ev) => eventTypes.has(ev))) {
          return cond.condTp;
        }
        return [];
      }),
    );

  return [...sanitizedCreditorConditions, ...sanitizedDebtorConditions];
};

const determineOutcome = (conditions: string[], request: object, tenantId: string): RuleResult => {
  const ruleResult: RuleResult = {
    id: `${configuration.RULE_NAME}@${configuration.RULE_VERSION}`,
    cfg: 'none',
    subRuleRef: 'none',
    prcgTm: 0,
    tenantId,
  };

  if (conditions.length === 0) return ruleResult;

  if (conditions.some((cond) => cond === 'non-overridable-block' || cond === 'overridable-block')) {
    ruleResult.subRuleRef = 'block';
  }

  if (conditions.some((cond) => cond === 'override') && !conditions.some((cond) => cond === 'non-overridable-block')) {
    ruleResult.subRuleRef = 'override';
  }

  if (!configuration.SUPPRESS_ALERTS && ruleResult.subRuleRef === 'block') {
    const interdictionDestination =
      configuration.INTERDICTION_DESTINATION === 'tenant'
        ? `${configuration.INTERDICTION_PRODUCER}-${tenantId}`
        : configuration.INTERDICTION_PRODUCER;

    server.handleResponse({ ...request, ruleResult }, [interdictionDestination]).catch((error: unknown) => {
      loggerService.error(
        `Error while sending Event Flow Rule Processor result to ${interdictionDestination}`,
        error as Error,
        ruleResult.id,
        configuration.functionName,
      );
    });
  }

  return ruleResult;
};

export { determineOutcome, sanitizeConditions, handleTransaction };
