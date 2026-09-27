import { expect, test } from 'vitest';
import { requestFixture } from '../../../tests/settlement/mocks/fixtures';
import { receivableFixture } from '../../../tests/batch/mocks/fixtures';
import { requestItemSchema, requestSchema } from './contracts';
import { receivableProcessingSchema } from '../../batch/services/receivableContracts';
import { simulationInputSchema } from '../../pricing/services/contracts';
import { demoUuid } from '../../../tests/common/testing/demo';

const completedAt = '2026-09-27T12:00:00Z';
const result = {
  uuid: demoUuid(31), settledAt: completedAt, presentValueBrl: '980.00', discountBrl: '20.00', paymentCurrency: 'BRL', paymentValue: '980.00',
} as const;
const terms = { days: 30, termMonths: '1', spread: '0.015' };

test('solicitação aceita estado parcial com contagens coerentes e totais realizados', () => {
  const partial = { ...requestFixture, status: 'PARTIALLY_SETTLED', completedAt,
    counts: { ready: 0, pending: 0, settled: 1, failed: 1 },
    settledTotals: { faceValueBrl: '1000.00', presentValueBrl: '980.00', discountBrl: '20.00', paymentBrl: '980.00', paymentUsd: '0.00' } };
  expect(requestSchema.safeParse(partial).success).toBe(true);
  expect(requestSchema.safeParse({ ...partial, counts: { ...partial.counts, pending: 1 } }).success).toBe(false);
  expect(requestSchema.safeParse({ ...partial, status: 'SETTLED', counts: { ...partial.counts, failed: 1 } }).success).toBe(false);
  expect(requestSchema.safeParse({ ...partial, status: 'PENDING', completedAt: null, counts: { ...partial.counts, pending: 0 } }).success).toBe(false);
});

test('tentativa liquida ou falha um único título e mantém erro separado do sucesso', () => {
  const base = { uuid: demoUuid(32), requestUuid: requestFixture.uuid, receivable: receivableFixture,
    attemptNumber: 1, previousAttemptUuid: null, retryCount: 0, nextRetryAt: null };
  expect(requestItemSchema.safeParse({ ...base, status: 'SETTLED', hasError: false, terms, completedAt,
    failure: null, result }).success).toBe(true);
  expect(requestItemSchema.safeParse({ ...base, status: 'FAILED', hasError: true, terms, completedAt,
    failure: { code: 'FALHA', message: 'Não foi possível processar este título.', stage: 'PROCESSING', occurredAt: completedAt }, result: null }).success).toBe(true);
  expect(requestItemSchema.safeParse({ ...base, status: 'SETTLED', hasError: true, terms, completedAt,
    failure: null, result }).success).toBe(false);
  expect(requestItemSchema.safeParse({ ...base, status: 'FAILED', hasError: true, terms: null, completedAt,
    failure: { code: 'VENCIDO', message: 'O título está vencido.', stage: 'PROCESSING', occurredAt: completedAt }, result: null }).success).toBe(false);
  expect(requestItemSchema.safeParse({ ...base, status: 'SETTLED', hasError: false, terms, completedAt,
    failure: null, result: { ...result, paymentCurrency: 'USD' } }).success).toBe(false);
  expect(requestItemSchema.safeParse({ ...base, status: 'FAILED', hasError: true, retryCount: 3,
    nextRetryAt: completedAt, terms, completedAt, failure: { code: 'FALHA', message: 'Falha.', stage: 'PROCESSING', occurredAt: completedAt }, result: null }).success).toBe(false);
});

test('rejeita recebível com flag de erro divergente e seleção de simulação duplicada', () => {
  const receivable = { ...receivableFixture, processing: { ...receivableFixture.processing, status: 'FAILED', hasError: false,
    activeRequestUuid: requestFixture.uuid, attemptNumber: 1, failure: { code: 'FALHA', message: 'Falha.', stage: 'PROCESSING', occurredAt: completedAt } } };
  expect(receivableProcessingSchema.safeParse(receivable.processing).success).toBe(false);
  expect(simulationInputSchema.safeParse({ batchUuid: requestFixture.batchUuid, receivableUuids: [demoUuid(3)] }).success).toBe(true);
  expect(simulationInputSchema.safeParse({ batchUuid: requestFixture.batchUuid, receivableUuids: [demoUuid(3), demoUuid(3)] }).success).toBe(false);
});
