import { CalculateDuration } from '@tazama-lf/frms-coe-lib/lib/helpers/calculatePrcg';
import { decodeConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { RuleRequest, RuleResult } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { ConditionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { databaseManager, loggerService, server } from '.';
import { configuration } from './';

// Constants to avoid magic numbers
const BUFFER_EMPTY_LENGTH = 0;
const CREDITOR_CONDITION_INDEX_LIMIT = 1;
const INITIAL_PROCESSING_TIME = 0;

/**
 * Extracts tenantId from the transaction payload
 * @param transaction - The transaction object
 * @returns The tenantId or a default value if not found
 */
const extractTenantId = (transaction: unknown): string => {
  if (transaction === null || transaction === undefined) {
    return 'default';
  }

  const txn = transaction as Record<string, unknown>;

  // Direct tenant ID properties
  if (typeof txn.TenantId === 'string') {
    return txn.TenantId;
  }
  if (typeof txn.tenantId === 'string') {
    return txn.tenantId;
  }

  // Nested tenant ID properties
  const fiToFi = txn.FIToFIPmtSts as Record<string, unknown> | null | undefined;
  if (fiToFi && typeof fiToFi === 'object') {
    if (typeof fiToFi.TenantId === 'string') {
      return fiToFi.TenantId;
    }
    if (typeof fiToFi.tenantId === 'string') {
      return fiToFi.tenantId;
    }
  }

  return 'default'; // fallback for backwards compatibility
};

/**
 * Calculates the interdiction destination based on configuration and tenantId
 * @param tenantId - The tenant identifier
 * @returns The NATS subject for interdiction messages
 */
const calculateInterdictionDestination = (tenantId: string): string => {
  const destinationMode = configuration.INTERDICTION_DESTINATION?.toLowerCase() ?? 'global';

  if (destinationMode === 'tenant') {
    return `${configuration.INTERDICTION_PRODUCER}-${tenantId}`;
  }

  // Default to global destination
  return configuration.INTERDICTION_PRODUCER;
};

const handleTransaction = async (req: unknown): Promise<void> => {
  const startTime = process.hrtime.bigint();
  const msg = req as RuleRequest;

  const request = {
    transaction: msg.transaction,
    networkMap: msg.networkMap,
    DataCache: msg.DataCache,
    metaData: msg.metaData,
  };

  // Extract tenant ID for multi-tenant isolation
  const tenantId = extractTenantId(request.transaction);

  const debtorConditions: ConditionDetails[] = [];
  const creditorConditions: ConditionDetails[] = [];

  (
    await Promise.all([
      databaseManager._redisClient.getBuffer(`entities/${tenantId}/${request.DataCache.cdtrId}`),
      databaseManager._redisClient.getBuffer(`accounts/${tenantId}/${request.DataCache.cdtrAcctId}`),
      databaseManager._redisClient.getBuffer(`entities/${tenantId}/${request.DataCache.dbtrId}`),
      databaseManager._redisClient.getBuffer(`accounts/${tenantId}/${request.DataCache.dbtrAcctId}`),
    ])
  ).forEach((dec: Buffer | null, idx: number) => {
    if (dec && dec.length > BUFFER_EMPTY_LENGTH) {
      try {
        const decode = decodeConditionsBuffer(dec);
        if (decode) {
          if (idx <= CREDITOR_CONDITION_INDEX_LIMIT) {
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
    prcgTm: INITIAL_PROCESSING_TIME,
  };

  if (conditions.length === BUFFER_EMPTY_LENGTH) return ruleResult;

  if (conditions.some((cond) => cond === 'non-overridable-block' || cond === 'overridable-block')) {
    ruleResult.subRuleRef = 'block';
  }

  if (conditions.some((cond) => cond === 'override') && !conditions.some((cond) => cond === 'non-overridable-block')) {
    ruleResult.subRuleRef = 'override';
  }

  if (!configuration.SUPPRESS_ALERTS && ruleResult.subRuleRef === 'block') {
    const interdictionDestination = calculateInterdictionDestination(tenantId);
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

export { determineOutcome, sanitizeConditions, handleTransaction, extractTenantId, calculateInterdictionDestination };
