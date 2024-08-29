// SPDX-License-Identifier: Apache-2.0
import {
  databaseManager,
  initializeDB,
  runServer,
  server,
  loggerService,
} from '../../src';
import { config } from '../../src/config';
import { createConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import * as calc from '@tazama-lf/frms-coe-lib/lib/helpers/calculatePrcg';
import { handleTransaction } from '../../src/logic.service';

jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/calculatePrcg');

const DATE = {
  NOW: new Date().toISOString(),
  VALID: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(),
  EXPIRED: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(),
};

const getMockRequest = () => {
  return {
    transaction: {
      TxTp: 'pacs.002.001.12',
      FIToFIPmtSts: {
        GrpHdr: {
          MsgId: '7717fa54e38d46e397addad281481065',
          CreDtTm: '2024-01-02T02:21:00.000Z',
        },
        TxInfAndSts: {
          OrgnlInstrId: '5ab4fc7355de4ef8a75b78b00a681ed2',
          OrgnlEndToEndId: '55625744af194b50b2055ba9d2502e74',
          TxSts: 'ACCC',
          ChrgsInf: [
            {
              Amt: { Amt: 10, Ccy: 'USD' },
              Agt: { FinInstnId: { ClrSysMmbId: { MmbId: 'dfsp001' } } },
            },
            {
              Amt: { Amt: 20, Ccy: 'USD' },
              Agt: { FinInstnId: { ClrSysMmbId: { MmbId: 'dfsp001' } } },
            },
            {
              Amt: { Amt: 20, Ccy: 'USD' },
              Agt: { FinInstnId: { ClrSysMmbId: { MmbId: 'dfsp002' } } },
            },
          ],
          AccptncDtTm: '2024-01-02T02:22:00.000Z',
          InstgAgt: { FinInstnId: { ClrSysMmbId: { MmbId: 'dfsp001' } } },
          InstdAgt: { FinInstnId: { ClrSysMmbId: { MmbId: 'dfsp002' } } },
        },
      },
    },
    networkMap: {
      active: true,
      cfg: '1.0.0',
      messages: [
        {
          id: '004@1.0.0',
          cfg: '1.0.0',
          txTp: 'pacs.002.001.12',
          typologies: [
            {
              id: 'typology-processor@1.0.0',
              cfg: '001@1.0.0',
              rules: [
                { id: 'EFRuP@1.0.0', cfg: 'none' },
                { id: '001@1.0.0', cfg: '1.0.0' },
              ],
            },
          ],
        },
      ],
    },
    DataCache: {
      dbtrId: '1c7d62da33d347c693ad5231f9faecfb',
      cdtrId: '17ea3b1b006440ce863d46a81f5129c0',
      cdtrAcctId: '04b003069709403a9a365fe0173cf914',
      dbtrAcctId: '8354f4d7af5547e2ade0f16c77af9a7c',
      amt: { amt: 555.55, ccy: 'USD' },
      creDtTm: '2024-01-02T02:21:00.000Z',
    },
    metaData: { prcgTmDP: 0, prcgTmED: 0 },
  };
};

const getMockEntityCondition = () => {
  return {
    ntty: { id: '+27733161225', schmeNm: { prtry: 'MSISDN' } },
    conditions: [
      {
        condId: '57bccf4497b64cd99e92d0a7f3352d41',
        condTp: 'overridable-block',
        incptnDtTm: DATE.NOW,
        xprtnDtTm: DATE.EXPIRED,
        condRsn: 'R001',
        usr: 'bob',
        creDtTm: '2024-01-01T23:00:00.999Z',
        prsptvs: [
          {
            prsptv: 'governed_as_debtor_by',
            evtTp: ['pacs.0080.01.10', 'pacs.002.001.12'],
            incptnDtTm: DATE.NOW,
            xprtnDtTm: DATE.EXPIRED,
          },
          {
            prsptv: 'governed_as_creditor_by',
            evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
            incptnDtTm: DATE.NOW,
            xprtnDtTm: DATE.EXPIRED,
          },
        ],
      },
      {
        condId: '57bccf4497b64cd99e92d0a7f3352d52',
        condTp: 'override',
        incptnDtTm: DATE.NOW,
        xprtnDtTm: DATE.EXPIRED,
        condRsn: 'R002',
        usr: 'jones',
        creDtTm: '2024-01-02T23:00:00.999Z',
        prsptvs: [
          {
            prsptv: 'governed_as_debtor_by',
            evtTp: ['pacs.002.001.12'],
            incptnDtTm: DATE.NOW,
            xprtnDtTm: DATE.EXPIRED,
          },
        ],
      },
    ],
  };
};

const getMockAccountCondition = () => {
  return {
    acct: {
      id: '1010101010',
      schmeNm: { prtry: 'Mxx' },
      agt: { finInstnId: { clrSysMmbId: { mmbId: 'dfsp001' } } },
    },
    conditions: [
      {
        condId: '26819',
        condTp: 'non-overridable-block',
        incptnDtTm: DATE.NOW,
        xprtnDtTm: DATE.EXPIRED,
        condRsn: 'R001',
        usr: 'bob',
        creDtTm: '2024-08-23T11:46:53.091Z',
        prsptvs: [
          {
            prsptv: 'governed_as_creditor_by',
            evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
            incptnDtTm: DATE.NOW,
            xprtnDtTm: DATE.EXPIRED,
          },
          {
            prsptv: 'governed_as_debtor_by',
            evtTp: ['pacs.008.001.10', 'pacs.002.001.12'],
            incptnDtTm: DATE.NOW,
            xprtnDtTm: DATE.EXPIRED,
          },
        ],
      },
    ],
  };
};

beforeAll(async () => {
  await initializeDB();
  await runServer();
});

describe('Event Flow', () => {
  let responseSpy: jest.SpyInstance;
  let getBufferSpy: jest.SpyInstance;

  beforeEach(() => {
    config.suppressAlerts = true;

    responseSpy = jest
      .spyOn(server, 'handleResponse')
      .mockImplementation((resp: any, _subject: string[] | undefined): any => {
        return new Promise((resolve, _reject) => {
          resolve(resp);
        });
      });

    jest.spyOn(calc, 'CalculateDuration').mockReturnValue(0);
  });

  describe('handleTransaction logic', () => {
    it("non-overridable-block - outcome: block'", async () => {
      /*
        3 Unexpired conditions
        Interdiction alerting ENABLED
        non-overridable-block priority precedence
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();
      const accountConditions = getMockAccountCondition();

      entityConditions.conditions[0].condTp = 'overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.VALID;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.VALID;

      accountConditions.conditions[0].condTp = 'non-overridable-block';
      accountConditions.conditions[0].xprtnDtTm = DATE.VALID;

      config.suppressAlerts = false;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        })
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(accountConditions) as Buffer);
          });
        })
        .mockImplementation(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(Buffer.from(''));
          });
        });

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'block',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(2); // + 1 alert
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });

    it("overridable-block - outcome: block'", async () => {
      /*
        1 Unexpired conditions
        Interdiction alerting ENABLED
        Only overridable-block
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();
      const accountConditions = getMockAccountCondition();

      entityConditions.conditions[0].condTp = 'overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.VALID;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.EXPIRED;

      accountConditions.conditions[0].condTp = 'non-overridable-block';
      accountConditions.conditions[0].xprtnDtTm = DATE.EXPIRED;

      config.suppressAlerts = false;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        })
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(accountConditions) as Buffer);
          });
        })
        .mockImplementation(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(Buffer.from(''));
          });
        });

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'block',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(2); // + alert for block
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });

    it("override - outcome: override'", async () => {
      /*
        1 Unexpired conditions
        Only override
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();
      const accountConditions = getMockAccountCondition();

      entityConditions.conditions[0].condTp = 'overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.EXPIRED;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.VALID;

      accountConditions.conditions[0].condTp = 'non-overridable-block';
      accountConditions.conditions[0].xprtnDtTm = DATE.EXPIRED;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        })
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(accountConditions) as Buffer);
          });
        })
        .mockImplementation(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(Buffer.from(''));
          });
        });

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'override',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });

    it("none - outcome: none'", async () => {
      /*
        0 Unexpired conditions
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();
      const accountConditions = getMockAccountCondition();

      entityConditions.conditions[0].condTp = 'overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.EXPIRED;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.EXPIRED;

      accountConditions.conditions[0].condTp = 'non-overridable-block';
      accountConditions.conditions[0].xprtnDtTm = DATE.EXPIRED;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        })
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(accountConditions) as Buffer);
          });
        })
        .mockImplementation(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(Buffer.from(''));
          });
        });

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'none',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });
  });

  describe('Errors', () => {
    it("undecodable condition'", async () => {
      /*
        entityConditions will be undecodable and thus skipped
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();

      entityConditions.conditions[0].condTp = 'overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.VALID;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.VALID;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            const corruptedBuffer = createConditionsBuffer(
              entityConditions,
            ) as Buffer;
            corruptedBuffer[0] = Math.floor(Math.random() * 256);
            resolve(corruptedBuffer);
          });
        });

      const logSpy = jest.spyOn(loggerService, 'error');

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'none',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('Could not decode a condition');
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });

    it("bad CMS'", async () => {
      /*
        Interdiction alerting ENABLED
        handleResponse will try to interdict to a bad CMS
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();

      entityConditions.conditions[0].condTp = 'non-overridable-block';
      entityConditions.conditions[0].xprtnDtTm = DATE.VALID;

      entityConditions.conditions[1].condTp = 'non-overridable-block';
      entityConditions.conditions[1].xprtnDtTm = DATE.VALID;

      config.suppressAlerts = false;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        });

      const logSpy = jest.spyOn(loggerService, 'error');

      responseSpy = jest
        .spyOn(server, 'handleResponse')
        .mockRejectedValueOnce('BAD')
        .mockImplementation(
          (resp: any, _subject: string[] | undefined): any => {
            return new Promise((resolve, _reject) => {
              resolve(resp);
            });
          },
        );

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'block',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        'Error while sending Typology result to CMS',
        'BAD',
        `${config.ruleName}@${config.ruleVersion}`,
        config.functionName,
      );
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });

    it("bad final response'", async () => {
      /*
        handleResponse will try and fail to send the last response
      */
      const req = getMockRequest();

      const entityConditions = getMockEntityCondition();

      entityConditions.conditions[0].condTp = 'override';
      entityConditions.conditions[0].xprtnDtTm = DATE.VALID;

      entityConditions.conditions[1].condTp = 'override';
      entityConditions.conditions[1].xprtnDtTm = DATE.VALID;

      getBufferSpy = jest
        .spyOn(databaseManager._redisClient, 'getBuffer')
        .mockImplementationOnce(async (key: string | Buffer) => {
          return new Promise((resolve, _reject) => {
            resolve(createConditionsBuffer(entityConditions) as Buffer);
          });
        });

      const logSpy = jest.spyOn(loggerService, 'error');

      responseSpy = jest
        .spyOn(server, 'handleResponse')
        .mockRejectedValueOnce('BAD');

      const ruleRes = {
        cfg: 'none',
        id: 'EFRuP@1.0.0',
        prcgTm: 0,
        subRuleRef: 'override',
      };

      await handleTransaction(req);
      expect(responseSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        'Failed to send to Typology Processor.',
        'BAD',
        `${config.ruleName}@${config.ruleVersion}`,
        config.functionName,
      );
      expect(responseSpy).toHaveBeenCalledWith({ ...req, ruleResult: ruleRes });
    });
  });
});
