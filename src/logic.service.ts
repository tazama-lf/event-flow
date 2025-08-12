import { CalculateDuration } from '@tazama-lf/frms-coe-lib/lib/helpers/calculatePrcg';
import { decodeConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { RuleRequest, RuleResult, Pacs002 } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { ConditionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';

// Constants for magic numbers
const BUFFER_MIN_LENGTH = 0;
const CREDITOR_INDEX_LIMIT = 1;
const INITIAL_PROCESSING_TIME = 0;

// Dependency interfaces for injection
interface Dependencies {
  databaseManager: {
    _redisClient: {
      getBuffer: (key: string) => Promise<Buffer | null>;
    };
  };
  loggerService: {
    error: (message: string, error?: unknown, id?: string, functionName?: string) => void;
  };
  server: {
    handleResponse: (response: object, subject?: string[]) => Promise<void>;
  };
  configuration: {
    RULE_NAME: string;
    RULE_VERSION: string;
    INTERDICTION_DESTINATION: 'global' | 'tenant';
    INTERDICTION_PRODUCER: string;
    SUPPRESS_ALERTS: boolean;
    functionName: string;
  };
}

/**
 * Extracts tenantId from the transaction payload
 * @param transaction - The transaction object (should be Pacs002 with TenantId, but supports legacy formats)
 * @returns The tenantId or a default value if not found
 */
const extractTenantId = (transaction: unknown): string => {
  if (transaction === null || transaction === undefined) {
    return 'default';
  }

  const txn = transaction as Record<string, unknown>;

  // Primary: Direct TenantId (now required by Pacs002 interface)
  if (typeof txn.TenantId === 'string' && txn.TenantId.trim() !== '') {
    return txn.TenantId;
  }

  // Fallback: Case variation for legacy compatibility
  if (typeof txn.tenantId === 'string' && txn.tenantId.trim() !== '') {
    return txn.tenantId;
  }

  // Nested tenant ID properties (for legacy message formats)
  const fiToFi = txn.FIToFIPmtSts as Record<string, unknown> | null | undefined;
  if (fiToFi && typeof fiToFi === 'object') {
    if (typeof fiToFi.TenantId === 'string' && fiToFi.TenantId.trim() !== '') {
      return fiToFi.TenantId;
    }
    if (typeof fiToFi.tenantId === 'string' && fiToFi.tenantId.trim() !== '') {
      return fiToFi.tenantId;
    }
  }

  return 'default'; // fallback for backward compatibility
};

/**
 * Type-safe tenant extraction for properly formatted Pacs002 transactions
 * @param transaction - Properly typed Pacs002 transaction
 * @returns The tenantId from the transaction
 */
const extractTenantIdFromPacs002 = (transaction: Pacs002): string =>
  transaction.TenantId && transaction.TenantId.trim() !== '' ? transaction.TenantId : 'default';

/**
 * Calculates the interdiction destination based on configuration and tenantId
 * @param tenantId - The tenant identifier
 * @param configuration - The configuration object
 * @returns The NATS subject for interdiction messages
 */
const calculateInterdictionDestination = (tenantId: string, configuration: Dependencies['configuration']): string =>
  configuration.INTERDICTION_DESTINATION === 'tenant'
    ? `${configuration.INTERDICTION_PRODUCER}-${tenantId}`
    : configuration.INTERDICTION_PRODUCER;

const handleTransaction = async (req: unknown, dependencies: Dependencies): Promise<void> => {
  const { databaseManager, loggerService, server, configuration } = dependencies;
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
    if (dec && dec.length > BUFFER_MIN_LENGTH) {
      try {
        const decode = decodeConditionsBuffer(dec);
        if (decode) {
          if (idx <= CREDITOR_INDEX_LIMIT) {
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
  const ruleResult = determineOutcome(validConditions, request, tenantId, dependencies);
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

const determineOutcome = (conditions: string[], request: object, tenantId: string, dependencies: Dependencies): RuleResult => {
  const { configuration, server, loggerService } = dependencies;
  const ruleResult: RuleResult = {
    id: `${configuration.RULE_NAME}@${configuration.RULE_VERSION}`,
    cfg: 'none',
    subRuleRef: 'none',
    prcgTm: INITIAL_PROCESSING_TIME,
  };

  if (conditions.length === BUFFER_MIN_LENGTH) return ruleResult;

  if (conditions.some((cond) => cond === 'non-overridable-block' || cond === 'overridable-block')) {
    ruleResult.subRuleRef = 'block';
  }

  if (conditions.some((cond) => cond === 'override') && !conditions.some((cond) => cond === 'non-overridable-block')) {
    ruleResult.subRuleRef = 'override';
  }

  if (!configuration.SUPPRESS_ALERTS && ruleResult.subRuleRef === 'block') {
    const interdictionDestination = calculateInterdictionDestination(tenantId, configuration);
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

// Factory function to create service with injected dependencies
const createEventFlowService = (
  dependencies: Dependencies,
): {
  handleTransaction: (req: unknown) => Promise<void>;
  determineOutcome: (conditions: string[], request: object, tenantId: string) => RuleResult;
  calculateInterdictionDestination: (tenantId: string) => string;
  sanitizeConditions: typeof sanitizeConditions;
  extractTenantId: typeof extractTenantId;
  extractTenantIdFromPacs002: typeof extractTenantIdFromPacs002;
} => ({
  handleTransaction: async (req: unknown): Promise<void> => {
    await handleTransaction(req, dependencies);
  },
  determineOutcome: (conditions: string[], request: object, tenantId: string): RuleResult =>
    determineOutcome(conditions, request, tenantId, dependencies),
  calculateInterdictionDestination: (tenantId: string): string => calculateInterdictionDestination(tenantId, dependencies.configuration),
  sanitizeConditions,
  extractTenantId,
  extractTenantIdFromPacs002,
});

// Export types and functions
export type { Dependencies };

export {
  // Dependency injection approach
  createEventFlowService,

  // Individual functions (now require dependencies for some)
  handleTransaction,
  determineOutcome,
  sanitizeConditions,
  extractTenantId,
  extractTenantIdFromPacs002,
  calculateInterdictionDestination,
};
