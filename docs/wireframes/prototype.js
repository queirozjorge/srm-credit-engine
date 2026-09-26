(() => {
  const screens = new Set([
    'dashboard',
    'batches',
    'new-batch',
    'batch-detail',
    'registers',
    'exchange',
    'statement',
    'sign-in',
    'callback',
    'session-expired',
    'forbidden',
    'not-found',
  ]);
  const profileNames = {
    operator: 'Operador',
    manager: 'Gestor',
    both: 'Operador e gestor',
  };
  const weekSamples = {
    days: [20, 21, 22, 23, 24, 25, 26],
    BRL: [10000, 20000, 6000, 0, 8000, 4000, 5000],
    USD: [2000, 0, 0, 1000, 3000, 1000, 5000],
  };
  const distribute = (total, count) => {
    const weights = Array.from({ length: count }, (_, index) => [3, 8, 12, 5, 11, 14, 7][index % 7]);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const values = weights.map((weight) => Math.floor((total * weight) / weightTotal));
    let remainder = total - values.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remainder > 0; index += 1, remainder -= 1) values[index % count] += 1;
    return values;
  };
  const monthSamples = {
    days: Array.from({ length: 26 }, (_, index) => index + 1),
    BRL: [...distribute(267000, 19), ...weekSamples.BRL],
    USD: [...distribute(8000, 19), ...weekSamples.USD],
  };
  const periodData = {
    week: {
      label: 'últimos 7 dias',
      face: 'R$ 125.000,00',
      discount: 'R$ 12.000,00',
      brl: 'R$ 53.000,00',
      usd: 'US$ 12.000,00',
      samples: weekSamples,
    },
    month: {
      label: 'mês atual',
      face: 'R$ 450.000,00',
      discount: 'R$ 30.000,00',
      brl: 'R$ 320.000,00',
      usd: 'US$ 20.000,00',
      samples: monthSamples,
    },
  };
  const screenNames = {
    dashboard: 'Aplicação',
    batches: 'Lotes',
    'new-batch': 'Novo lote',
    'batch-detail': 'Detalhe do lote',
    registers: 'Cedentes',
    exchange: 'Câmbio',
    statement: 'Extrato',
    'sign-in': 'Entrada',
    callback: 'Retorno da autenticação',
    'session-expired': 'Sessão expirada',
    forbidden: 'Acesso negado',
    'not-found': 'Página inexistente',
  };

  const screenElements = [...document.querySelectorAll('[data-screen]')];
  const navElements = [...document.querySelectorAll('[data-nav]')];
  const routePicker = document.querySelector('#demo-route');
  const rolePicker = document.querySelector('#demo-role');
  const dashboardStatePicker = document.querySelector('#demo-dashboard-state');
  const exchangeValidityPicker = document.querySelector('#demo-exchange-state');
  const content = document.querySelector('#page-content');
  const profileLabel = document.querySelector('#profile-label');
  const appFrame = document.querySelector('#app-frame');
  const appLayout = document.querySelector('.app-layout');
  const navToggle = document.querySelector('#menu-toggle');
  const navigationViewport = window.matchMedia('(min-width: 761px)');
  const announcer = document.querySelector('#announcer');
  const loadingPanel = document.querySelector('#loading-panel');
  const dashboard = document.querySelector('.dashboard-screen');
  const periodFilter = document.querySelector('#period-filter');
  const currencyFilter = document.querySelector('#currency-filter');
  const chartBars = document.querySelector('#chart-bars');
  const chartDates = document.querySelector('#chart-dates');
  const registerAdmin = document.querySelector('#registers-admin');
  const registerListView = document.querySelector('#register-list-view');
  const registerDetailView = document.querySelector('#register-detail-view');
  const registerDialog = document.querySelector('#register-dialog');
  const registerRowsElement = document.querySelector('#register-rows');
  const registerSearch = document.querySelector('#register-search');
  const registerForm = document.querySelector('#register-form');
  const registerName = document.querySelector('#register-name');
  const registerDocument = document.querySelector('#register-document');
  const registerFeedback = document.querySelector('#register-feedback');
  const registerPageLabel = document.querySelector('#register-page-label');
  const registerPageSizePicker = document.querySelector('#register-page-size');
  const registerPageInput = document.querySelector('#register-page-input');
  const registerPageForm = document.querySelector('#register-page-form');
  const batchPageSizePicker = document.querySelector('#batch-page-size');
  const batchPageInput = document.querySelector('#batch-page-input');
  const batchPageForm = document.querySelector('#batch-page-form');
  const registerRecords = [
    ['Aurora Demonstração Ltda.', '00.000.000/0000-01'],
    ['Cedente Exemplo Horizonte Ltda.', '00.000.000/0000-02'],
    ['Comercial Modelo Sul S.A.', '00.000.000/0000-03'],
    ['Distribuidora Fictícia Norte Ltda.', '00.000.000/0000-04'],
    ['Empresa Demonstração Alfa Ltda.', '00.000.000/0000-05'],
    ['Fornecedor Exemplo Beta S.A.', '00.000.000/0000-06'],
    ['Indústria Modelo Central Ltda.', '00.000.000/0000-07'],
    ['Logística Demonstração S.A.', '00.000.000/0000-08'],
    ['Mercantil Exemplo Leste Ltda.', '00.000.000/0000-09'],
    ['Serviços Modelo Atlântico S.A.', '00.000.000/0000-10'],
    ['Suprimentos Fictícios Ltda.', '00.000.000/0000-11'],
    ['Varejo Demonstração Oeste S.A.', '00.000.000/0000-12'],
  ].map(([name, document], index) => ({
    uuid: 'demo-' + String(index + 1).padStart(3, '0'),
    name,
    document,
    registeredAt: String(index + 1).padStart(2, '0') + '/09/2026',
  }));
  let registerMode = 'list';
  let registerPage = 1;
  let selectedRegisterId = null;
  let nextRegisterNumber = registerRecords.length + 1;
  const batchRecords = [
    ['LT-182', 'Aurora Demonstração Ltda.', 8, '12500000', '26/09/2026', 'settled', '26/09/2026, 10h24'],
    ['LT-181', 'Comercial Modelo Sul S.A.', 14, '34800000', '26/09/2026', 'ready'],
    ['LT-180', 'Distribuidora Fictícia Norte Ltda.', 5, '8200000', '25/09/2026', 'settled', '25/09/2026, 16h08'],
    ['LT-179', 'Fornecedor Exemplo Beta S.A.', 11, '24750000', '25/09/2026', 'pending'],
    ['LT-178', 'Indústria Modelo Central Ltda.', 3, '5900000', '24/09/2026', 'failed'],
    ['LT-177', 'Logística Demonstração S.A.', 7, '16300000', '24/09/2026', 'settled', '24/09/2026, 12h30'],
    ['LT-176', 'Mercantil Exemplo Leste Ltda.', 9, '19800000', '23/09/2026', 'ready'],
    ['LT-175', 'Serviços Modelo Atlântico S.A.', 4, '7450000', '23/09/2026', 'ready'],
    ['LT-174', 'Suprimentos Fictícios Ltda.', 12, '30200000', '22/09/2026', 'pending'],
    ['LT-173', 'Varejo Demonstração Oeste S.A.', 6, '11100000', '22/09/2026', 'failed'],
    ['LT-172', 'Cedente Exemplo Horizonte Ltda.', 18, '46000000', '21/09/2026', 'ready'],
    ['LT-171', 'Empresa Demonstração Alfa Ltda.', 2, '3750000', '21/09/2026', 'ready'],
    ['LT-170', 'Aurora Demonstração Ltda.', 9, '17600000', '20/09/2026', 'settled', '20/09/2026, 14h10'],
  ].map(([code, cedent, count, faceCents, registeredAt, status, settledAt]) => ({
    code, cedent, count, faceCents, registeredAt, status,
    attemptCount: status === 'ready' ? 0 : 1,
    completedAt: status === 'settled' ? settledAt : status === 'failed' ? '26/09/2026, 10h25' : null,
    lastFailure: status === 'failed' ? 'Falha definitiva demonstrativa. Nenhum recebível foi liquidado.' : null,
  }));
  const batchStatusLabels = {
    ready: 'Pronto para liquidação',
    pending: 'Em andamento',
    settled: 'Liquidado',
    failed: 'Falha definitiva',
  };
  const batchSearch = document.querySelector('#batch-search');
  const batchStatusFilter = document.querySelector('#batch-status-filter');
  const batchRowsElement = document.querySelector('#batch-rows');
  const batchPageLabel = document.querySelector('#batch-page-label');
  const batchWizard = document.querySelector('#batch-wizard');
  const demoSettlementOutcome = document.querySelector('#demo-settlement-outcome');
  const exchangeScale = 1000000000000n;
  let demoNow = Date.UTC(2026, 8, 26, 10, 30);
  let activeExchangeQuote = {
    code: 'COT-026',
    rate: 5000000000000n,
    startedAt: Date.UTC(2026, 8, 26, 9, 0),
    validUntil: Date.UTC(2026, 8, 27, 9, 0),
    source: 'Proposta aprovada · Carlos Nogueira',
  };
  const exchangeQuotes = [
    { code: 'COT-025', rate: 4980000000000n, startedAt: Date.UTC(2026, 8, 25, 9, 0), validUntil: Date.UTC(2026, 8, 26, 9, 0), source: 'Proposta aprovada · demonstração' },
    activeExchangeQuote,
  ];
  const exchangeProposals = [{
    code: 'FX-026',
    requesterId: 'paulo-martins',
    requester: 'Paulo Martins',
    adjustment: 150000000000n,
    baseRate: 5000000000000n,
    proposedRate: 5150000000000n,
    reason: 'Ajuste sugerido após revisão da referência de mercado e da exposição cambial do período.',
    requestedAt: Date.UTC(2026, 8, 26, 10, 12),
    status: 'pending',
    decidedAt: null,
    decidedBy: null,
    decisionReason: '',
  }];
  let nextExchangeProposalNumber = 27;
  let nextExchangeQuoteNumber = 27;
  let exchangeReferenceRate = null;
  let exchangeReferenceUpdatedAt = 0;
  let exchangeReferenceRequest = 0;
  let exchangeDecisionPending = null;
  let exchangeHistoryMode = 'proposals';
  let exchangeReturnBatchId = '';
  const exchangeProposalDialog = document.querySelector('#exchange-proposal-dialog');
  const openExchangeProposalButton = document.querySelector('#open-exchange-proposal');
  const batchImportDialog = document.querySelector('#batch-import-dialog');
  const batchImportHeading = document.querySelector('#batch-import-title');
  let lastRenderedScreen = '';
  const exchangeProposalForm = document.querySelector('#exchange-proposal-form');
  const exchangeAdjustment = document.querySelector('#exchange-adjustment');
  const exchangeProposalReason = document.querySelector('#exchange-proposal-reason');
  const statementFilterForm = document.querySelector('#statement-filter-form');
  const statementStartDate = document.querySelector('#statement-start-date');
  const statementEndDate = document.querySelector('#statement-end-date');
  const statementCedent = document.querySelector('#statement-cedent');
  const statementCurrency = document.querySelector('#statement-currency');
  const statementPageSize = document.querySelector('#statement-page-size');
  const statementPageInput = document.querySelector('#statement-page-input');
  const statementPageForm = document.querySelector('#statement-page-form');
  let statementEntries = null;
  let statementMatches = [];
  let statementPage = 1;
  const batchItemForm = document.querySelector('#batch-item-form');
  const itemCedent = document.querySelector('#item-cedent');
  const itemReference = document.querySelector('#item-reference');
  const itemFaceValue = document.querySelector('#item-face-value');
  const itemDueDate = document.querySelector('#item-due-date');
  const batchItems = [];
  const importedItems = [];
  let batchPage = 1;
  let batchFeedbackText = '';
  let batchWizardStep = 1;
  let batchMethod = 'form';
  let importHasErrors = false;
  let nextBatchNumber = 183;
  let batchActionPending = false;
  let selectedBatchId = 'LT-181';
  let settlementPollTimer = 0;
  let simulationFeedbackText = '';
  const warningDialog = document.querySelector('#warning-dialog');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const workflowDialogStates = new Map();
  let alertTrigger = null;
  let alertClosing = false;
  let alertCloseTimer = 0;

  function activeScreen() {
    const screen = window.location.hash.slice(1);
    return screens.has(screen) ? screen : 'dashboard';
  }

  function setNavigationOpen(open) {
    appLayout.dataset.navOpen = String(open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Ocultar menu de navegação' : 'Mostrar menu de navegação');
  }

  function render() {
    const current = activeScreen();
    const enteringExchange = current === 'exchange' && lastRenderedScreen !== 'exchange';
    const enteringApplication = appFrame.dataset.layout === 'auth' && ['dashboard', 'batches', 'new-batch', 'batch-detail', 'registers', 'exchange', 'statement'].includes(current);
    ensureStatementEntries();
    const applicationScreen = ['dashboard', 'batches', 'new-batch', 'batch-detail', 'registers', 'exchange', 'statement'].includes(current);
    appFrame.dataset.layout = applicationScreen ? 'application' : 'auth';
    appFrame.dataset.screen = current;
    if (enteringExchange) loadExchangeReference();
    lastRenderedScreen = current;
    if (!applicationScreen) setNavigationOpen(false);
    else if (enteringApplication) setNavigationOpen(navigationViewport.matches);
    screenElements.forEach((element) => {
      element.hidden = element.dataset.screen !== current;
    });
    navElements.forEach((element) => {
      if (element.dataset.nav === (current === 'new-batch' || current === 'batch-detail' ? 'batches' : current)) {
        element.setAttribute('aria-current', 'page');
      } else {
        element.removeAttribute('aria-current');
      }
    });
    profileLabel.textContent = profileNames[rolePicker.value] ?? profileNames.operator;
    routePicker.value = current;
    document.title = `${screenNames[current]} · Wireframes · SRM Credit Engine`;
    if (current === 'dashboard') renderDashboard();
    if (current === 'batches') renderBatches();
    if (current === 'new-batch') renderBatchWizard();
    if (current === 'batch-detail') renderBatchDetails();
    else stopSettlementPolling();
    if (current === 'registers') renderRegisters();
    if (current === 'exchange') renderExchange();
    if (current === 'statement') renderStatement();
  }

  function formatDate(day) {
    const date = new Date(Date.UTC(2026, 8, day));
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
  }

  function formatExchangeDate(timestamp) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
    }).format(new Date(timestamp)).replace(':', 'h');
  }

  function formatExchangeValue(value) {
    const whole = (value / exchangeScale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const fraction = (value % exchangeScale).toString().padStart(12, '0').replace(/0+$/, '').padEnd(2, '0');
    return `R$ ${whole},${fraction}`;
  }

  function readExchangeValue(value) {
    const match = /^(\d+)(?:[,.](\d{1,12}))?$/.exec(value.trim());
    if (!match) return null;
    const fraction = (match[2] ?? '').padEnd(12, '0');
    return (BigInt(match[1]) * exchangeScale) + BigInt(fraction || '0');
  }

  function exchangeQuoteIsValid() {
    return exchangeValidityPicker.value !== 'expired' && demoNow < activeExchangeQuote.validUntil;
  }

  function currentExchangeActor() {
    return rolePicker.value === 'manager'
      ? { id: 'carlos-nogueira', name: 'Carlos Nogueira' }
      : { id: 'ana-ribeiro', name: 'Ana Ribeiro' };
  }

  function renderDashboard() {
    const period = periodData[periodFilter.value] ?? periodData.week;
    const sampleState = dashboardStatePicker.value;
    const empty = sampleState === 'empty';
    const stale = sampleState === 'unavailable';
    const currency = currencyFilter.value;
    const exchangeValid = exchangeQuoteIsValid();
    const amounts = period.samples[currency];
    const maximum = Math.max(...amounts);
    const axisStep = maximum > 100000 ? 50000 : maximum > 20000 ? 10000 : maximum > 5000 ? 5000 : 1000;
    const axisMaximum = Math.max(axisStep, Math.ceil(maximum / axisStep) * axisStep);
    const currencyPrefix = currency === 'BRL' ? 'R$' : 'US$';

    dashboard.dataset.state = empty ? 'empty' : stale ? 'stale' : 'ready';
    document.querySelector('#metric-face').textContent = empty ? 'R$ 0,00' : period.face;
    document.querySelector('#metric-discount').textContent = empty ? 'R$ 0,00' : period.discount;
    document.querySelector('#metric-brl').textContent = empty ? 'R$ 0,00' : period.brl;
    document.querySelector('#metric-usd').textContent = empty ? 'US$ 0,00' : period.usd;
    document.querySelector('#dashboard-data-status').textContent = empty
      ? 'Sem liquidações no período'
      : stale
        ? 'Dados anteriores · atualização indisponível'
        : 'Dados fictícios para validação';
    document.querySelector('#chart-subtitle').textContent = `Valores concluídos no ${period.label}.`;
    document.querySelector('#chart-units').textContent = `Valor pago (${currency})`;
    document.querySelector('#chart-max').textContent = `${currencyPrefix} ${Math.round(axisMaximum / 1000)} mil`;
    document.querySelector('#chart-mid').textContent = `${currencyPrefix} ${Math.round(axisMaximum / 2000)} mil`;
    document.querySelector('#chart-zero').textContent = `${currencyPrefix} 0`;
    document.querySelector('#chart-plot').setAttribute('aria-label', empty
      ? `Nenhuma liquidação ${currency} no ${period.label}`
      : `Gráfico diário em ${currency}; total de ${currency === 'BRL' ? period.brl : period.usd} no ${period.label}`);
    document.querySelector('#chart-summary').textContent = empty
      ? `Total no período: ${currency === 'BRL' ? 'R$ 0,00' : 'US$ 0,00'}.`
      : `Total no período: ${currency === 'BRL' ? period.brl : period.usd}.`;

    chartBars.replaceChildren();
    amounts.forEach((amount) => {
      const item = document.createElement('li');
      const bar = document.createElement('span');
      bar.className = 'chart-bar';
      bar.dataset.currency = currency;
      bar.style.setProperty('--bar-height', `${Math.max(0, Math.round((amount / axisMaximum) * 100))}%`);
      item.append(bar);
      chartBars.append(item);
    });
    document.querySelector('#chart-empty').hidden = !empty;
    chartDates.replaceChildren();
    const dayCount = period.samples.days.length;
    const tickCount = dayCount <= 7 ? 4 : 5;
    const tickIndexes = Array.from({ length: tickCount }, (_, index) =>
      Math.round((index * (dayCount - 1)) / (tickCount - 1)));
    [...new Set(tickIndexes)].forEach((index) => {
      const label = document.createElement('span');
      label.textContent = formatDate(period.samples.days[index]);
      label.style.left = `${dayCount === 1 ? 0 : (index / (dayCount - 1)) * 100}%`;
      chartDates.append(label);
    });

    const role = rolePicker.value;
    document.querySelector('#operator-panel').hidden = role === 'manager';
    document.querySelector('#manager-panel').hidden = role === 'operator';
    document.querySelector('#new-batch-action').hidden = role === 'manager';
    document.querySelector('#batch-action-note').hidden = role === 'manager';
    document.querySelector('#dashboard-exchange-rate').textContent = formatExchangeValue(activeExchangeQuote.rate);
    document.querySelector('#dashboard-exchange-start').textContent = formatExchangeDate(activeExchangeQuote.startedAt);
    document.querySelector('#dashboard-exchange-expiry').textContent = formatExchangeDate(activeExchangeQuote.validUntil);
    document.querySelector('#dashboard-exchange-status').textContent = exchangeValid ? 'Válida' : 'Expirada';
    document.querySelector('#dashboard-exchange-status').dataset.state = exchangeValid ? 'valid' : 'expired';
  }

  function formatCents(cents) {
    const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const fraction = (cents % 100n).toString().padStart(2, '0');
    return `R$ ${whole},${fraction}`;
  }

  function readCents(value) {
    const digits = value.replace(/\D/g, '');
    return digits ? BigInt(digits) : 0n;
  }

  const demoReferenceDate = '2026-09-26';
  const precisionScale = 10n ** 50n;

  function shiftIsoDate(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function formatIsoDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
  }

  function formatCurrencyCents(cents, currency) {
    const prefix = currency === 'USD' ? 'US$' : 'R$';
    return `${prefix} ${formatCents(cents).slice(3)}`;
  }

  function roundHalfEven(numerator, denominator) {
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const doubledRemainder = remainder * 2n;
    if (doubledRemainder > denominator || (doubledRemainder === denominator && quotient % 2n === 1n)) return quotient + 1n;
    return quotient;
  }

  function fixedMultiply(left, right) {
    return (left * right) / precisionScale;
  }

  function fixedIntegerPower(base, exponent) {
    let factor = base;
    let remaining = exponent;
    let result = precisionScale;
    while (remaining > 0n) {
      if (remaining % 2n === 1n) result = fixedMultiply(result, factor);
      remaining /= 2n;
      if (remaining > 0n) factor = fixedMultiply(factor, factor);
    }
    return result;
  }

  function fixedNthRoot(value, degree) {
    if (value <= precisionScale) return precisionScale;
    const target = value * (precisionScale ** (degree - 1n));
    const digits = target.toString().length;
    let estimate = 10n ** BigInt(Math.ceil(digits / Number(degree)));
    while (true) {
      const next = (((degree - 1n) * estimate) + target / (estimate ** (degree - 1n))) / degree;
      if (next >= estimate) return estimate;
      estimate = next;
    }
  }

  function mockItemsForBatch(batch) {
    if (batch.items) return batch.items;
    const count = BigInt(batch.count);
    const total = BigInt(batch.faceCents);
    const each = total / count;
    const remainder = total % count;
    return Array.from({ length: batch.count }, (_, index) => ({
      cedent: registerRecords[index % registerRecords.length].name,
      reference: `${batch.code}-${String(index + 1).padStart(3, '0')}`,
      type: index % 4 === 0 ? 'Cheque pré-datado' : 'Duplicata mercantil',
      faceCents: (each + (BigInt(index) < remainder ? 1n : 0n)).toString(),
      dueDate: shiftIsoDate(demoReferenceDate, 30 * (1 + (index % 4))),
      currency: index % 4 === 0 ? 'USD' : 'BRL',
    }));
  }

  function simulateBatch(items, referenceDate = demoReferenceDate, exchangeRate = activeExchangeQuote.rate, settledSnapshot = false) {
    const totals = { face: 0n, discount: 0n, brl: 0n, usd: 0n };
    const factorCache = new Map();
    const quoteExpired = !settledSnapshot && items.some((item) => item.currency === 'USD') && !exchangeQuoteIsValid();
    const details = items.map((item) => {
      const days = Math.floor((Date.parse(`${item.dueDate}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86400000);
      if (!Number.isFinite(days) || days < 0) return { ...item, days, error: 'Vencimento anterior à data da simulação.' };
      if (item.currency === 'USD' && quoteExpired) return { ...item, days, error: 'Cotação USD expirada; solicite um novo ajuste antes de liquidar.' };
      const type = item.type ?? 'Duplicata mercantil';
      const rateNumerator = type.toLocaleLowerCase('pt-BR').startsWith('cheque') ? 1035n : 1025n;
      const cacheKey = `${days}-${rateNumerator}`;
      let factor = factorCache.get(cacheKey);
      if (!factor) {
        const monthlyFactor = (precisionScale * rateNumerator) / 1000n;
        factor = fixedNthRoot(fixedIntegerPower(monthlyFactor, BigInt(days)), 30n);
        factorCache.set(cacheKey, factor);
      }
      const face = BigInt(item.faceCents);
      const presentValue = roundHalfEven(face * precisionScale, factor);
      const discount = face - presentValue;
      const paid = item.currency === 'USD' ? roundHalfEven(presentValue * exchangeScale, exchangeRate) : presentValue;
      totals.face += face;
      totals.discount += discount;
      if (item.currency === 'USD') totals.usd += paid;
      else totals.brl += paid;
      return { ...item, type, days, presentValue, discount, paid };
    });
    return { details, totals, valid: details.every((item) => !item.error), quoteExpired, exchangeRate };
  }

  function parseStatementTimestamp(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4}), (\d{2})h(\d{2})$/.exec(value);
    if (!match) return Date.UTC(2026, 8, 26, 13, 0);
    return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]) + 3, Number(match[5]));
  }

  function createStatementEntries(batch, simulation, settledAt) {
    return simulation.details.filter((item) => !item.error).map((item, index) => ({
      uuid: `${batch.code}-${String(index + 1).padStart(4, '0')}`,
      batchCode: batch.code,
      cedent: item.cedent,
      reference: item.reference,
      currency: item.currency,
      faceCents: BigInt(item.faceCents),
      presentValueCents: item.presentValue,
      paidCents: item.paid,
      settledAt,
    }));
  }

  function buildStatementEntries() {
    const originalExchangeRate = 5000000000000n;
    return batchRecords.filter((batch) => batch.status === 'settled').flatMap((batch) => {
      const items = mockItemsForBatch(batch);
      const snapshot = simulateBatch(items, demoReferenceDate, originalExchangeRate, true);
      return createStatementEntries(batch, snapshot, parseStatementTimestamp(batch.completedAt));
    });
  }

  function ensureStatementEntries() {
    if (!statementEntries) statementEntries = buildStatementEntries();
    return statementEntries;
  }

  function statementDateKey(timestamp) {
    const values = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo',
    }).formatToParts(new Date(timestamp)).reduce((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
    return `${values.year}-${values.month}-${values.day}`;
  }

  function formatStatementTimestamp(timestamp) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', timeZone: 'America/Sao_Paulo',
    }).format(new Date(timestamp)).replace(':', 'h');
  }

  function updatePaginationControls(label, input, currentPage, pageCount) {
    label.textContent = `Página ${currentPage} de ${pageCount}`;
    input.min = '1';
    input.max = String(pageCount);
    input.value = String(currentPage);
  }

  function renderStatementCedents() {
    const selected = statementCedent.value || 'all';
    statementCedent.replaceChildren();
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'Todos os cedentes';
    statementCedent.append(all);
    registerRecords.forEach((record) => {
      const option = document.createElement('option');
      option.value = record.name;
      option.textContent = record.name;
      statementCedent.append(option);
    });
    statementCedent.value = [...statementCedent.options].some((option) => option.value === selected) ? selected : 'all';
  }

  function renderStatement() {
    renderStatementCedents();
    const start = statementStartDate.value;
    const end = statementEndDate.value;
    const cedent = statementCedent.value;
    const currency = statementCurrency.value;
    statementMatches = ensureStatementEntries()
      .filter((entry) => {
        const date = statementDateKey(entry.settledAt);
        return (!start || date >= start) && (!end || date < end)
          && (cedent === 'all' || entry.cedent === cedent)
          && (currency === 'all' || entry.currency === currency);
      })
      .sort((left, right) => right.settledAt - left.settledAt || right.uuid.localeCompare(left.uuid));

    const pageSize = Number(statementPageSize.value);
    const pageCount = Math.max(1, Math.ceil(statementMatches.length / pageSize));
    statementPage = Math.min(statementPage, pageCount);
    const pageEntries = statementMatches.slice((statementPage - 1) * pageSize, statementPage * pageSize);
    const rows = document.querySelector('#statement-rows');
    rows.replaceChildren();
    pageEntries.forEach((entry) => {
      const row = document.createElement('tr');
      const values = [
        formatStatementTimestamp(entry.settledAt),
        entry.batchCode,
        entry.cedent,
        entry.reference,
        entry.currency,
        formatCents(entry.faceCents),
        formatCents(entry.presentValueCents),
        formatCurrencyCents(entry.paidCents, entry.currency),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index >= 5) cell.className = 'numeric-cell';
        row.append(cell);
      });
      const actionCell = document.createElement('td');
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.className = 'button statement-row-action';
      detailButton.dataset.openBatch = entry.batchCode;
      detailButton.textContent = 'Ver lote';
      detailButton.setAttribute('aria-label', `Ver lote ${entry.batchCode} do recebível ${entry.reference}`);
      actionCell.append(detailButton);
      row.append(actionCell);
      rows.append(row);
    });

    const itemWord = statementMatches.length === 1 ? 'item' : 'itens';
    document.querySelector('#statement-result-count').textContent = `${statementMatches.length} ${itemWord} encontrado${statementMatches.length === 1 ? '' : 's'} em liquidações concluídas.`;
    document.querySelector('#statement-table-region').hidden = statementMatches.length === 0;
    document.querySelector('#statement-empty').hidden = statementMatches.length !== 0;
    document.querySelector('#statement-pagination').hidden = statementMatches.length === 0;
    updatePaginationControls(document.querySelector('#statement-page-label'), statementPageInput, statementPage, pageCount);
    document.querySelector('#statement-prev').disabled = statementPage <= 1;
    document.querySelector('#statement-next').disabled = statementPage >= pageCount;
  }

  function submitStatementFilters(event) {
    event.preventDefault();
    statementStartDate.removeAttribute('aria-invalid');
    statementEndDate.removeAttribute('aria-invalid');
    document.querySelector('#statement-start-error').textContent = '';
    document.querySelector('#statement-end-error').textContent = '';
    if (statementStartDate.value && statementEndDate.value && statementEndDate.value <= statementStartDate.value) {
      statementEndDate.setAttribute('aria-invalid', 'true');
      document.querySelector('#statement-end-error').textContent = 'A data final exclusiva deve ser posterior à data inicial.';
      statementEndDate.focus();
      return;
    }
    statementPage = 1;
    renderStatement();
    document.querySelector('#statement-title').focus({ preventScroll: true });
  }

  function clearStatementFilters() {
    statementStartDate.value = '2026-09-20';
    statementEndDate.value = '2026-09-27';
    statementCedent.value = 'all';
    statementCurrency.value = 'all';
    statementPageSize.value = '20';
    statementPage = 1;
    renderStatement();
    document.querySelector('#statement-start-date').focus();
  }

  function renderBatches() {
    const query = batchSearch.value.trim().toLocaleLowerCase('pt-BR');
    const status = batchStatusFilter.value;
    const filtered = batchRecords.filter((record) => {
      const matchesQuery = (record.code + ' ' + record.cedent).toLocaleLowerCase('pt-BR').includes(query);
      return matchesQuery && (status === 'all' || record.status === status);
    });
    const pageSize = Number(batchPageSizePicker.value);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    batchPage = Math.min(batchPage, pageCount);
    const pageRecords = filtered.slice((batchPage - 1) * pageSize, batchPage * pageSize);
    batchRowsElement.replaceChildren();
    pageRecords.forEach((record) => {
      const row = document.createElement('tr');
      const cells = [record.code, record.cedent, String(record.count), formatCents(BigInt(record.faceCents)), record.registeredAt];
      cells.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index === 2 || index === 3) cell.className = 'numeric-cell';
        row.append(cell);
      });
      const stateCell = document.createElement('td');
      const stateTag = document.createElement('span');
      stateTag.className = 'batch-state batch-state--' + record.status;
      stateTag.textContent = batchStatusLabels[record.status];
      stateCell.append(stateTag);
      row.append(stateCell);
      const actionsCell = document.createElement('td');
      const details = document.createElement('button');
      details.type = 'button';
      details.className = 'button batch-detail-button';
      details.dataset.openBatch = record.code;
      details.textContent = 'Detalhes';
      details.setAttribute('aria-label', `Abrir detalhes do lote ${record.code}`);
      actionsCell.append(details);
      row.append(actionsCell);
      batchRowsElement.append(row);
    });

    document.querySelector('#batch-count').textContent = query || status !== 'all'
      ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} de ${batchRecords.length} lotes`
      : `${batchRecords.length} lotes de demonstração`;
    document.querySelector('#batch-table-region').hidden = filtered.length === 0;
    document.querySelector('#batch-empty').hidden = filtered.length !== 0;
    document.querySelector('#batch-pagination').hidden = filtered.length === 0;
    updatePaginationControls(batchPageLabel, batchPageInput, batchPage, pageCount);
    document.querySelector('#batch-prev').disabled = batchPage <= 1;
    document.querySelector('#batch-next').disabled = batchPage >= pageCount;
    document.querySelector('#batch-feedback').textContent = batchFeedbackText;
    const canCreate = rolePicker.value !== 'manager';
    document.querySelector('#new-batch-from-list').hidden = !canCreate;
    document.querySelector('#batches-forbidden').hidden = true;
    document.querySelector('.batches-admin').hidden = false;
  }

  function renderBatchDetails() {
    const batch = batchRecords.find((record) => record.code === selectedBatchId);
    const details = document.querySelector('#batch-detail');
    const missing = document.querySelector('#batch-detail-forbidden');
    details.hidden = !batch;
    missing.hidden = Boolean(batch);
    if (!batch) {
      stopSettlementPolling();
      return;
    }

    const items = mockItemsForBatch(batch);
    const state = batch.status;
    const simulation = (state === 'pending' || state === 'settled') && batch.activeRequest?.snapshot
      ? batch.activeRequest.snapshot
      : simulateBatch(items, batch.acceptedDate ?? demoReferenceDate);
    const canRequest = rolePicker.value !== 'manager' && (state === 'ready' || state === 'failed');
    document.querySelector('#batch-detail-title').textContent = `Lote ${batch.code}`;
    document.querySelector('#batch-detail-subtitle').textContent = state === 'settled'
      ? 'Liquidação concluída sem processamento parcial.'
      : state === 'pending'
        ? 'A solicitação foi aceita; o processamento ocorre em segundo plano.'
        : 'Consulte os títulos e revise os valores antes de solicitar a liquidação.';
    const stateTag = document.querySelector('#detail-batch-state');
    stateTag.className = `batch-state batch-state--${state}`;
    stateTag.textContent = batchStatusLabels[state];
    const cedents = [...new Set(items.map((item) => item.cedent))];
    document.querySelector('#detail-batch-cedents').textContent = cedents.length === 1 ? cedents[0] : `${cedents.length} cedentes`;
    document.querySelector('#detail-batch-count').textContent = batch.count === 1 ? '1 recebível' : `${batch.count} recebíveis`;
    document.querySelector('#detail-batch-face').textContent = formatCents(BigInt(batch.faceCents));
    document.querySelector('#detail-batch-date').textContent = batch.registeredAt;
    const requestButton = document.querySelector('#request-settlement');
    requestButton.hidden = !canRequest;
    requestButton.textContent = state === 'failed' ? 'Solicitar nova tentativa' : 'Solicitar liquidação';
    document.querySelector('#settlement-permission-note').hidden = !(rolePicker.value === 'manager' && (state === 'ready' || state === 'failed'));
    renderSettlementStatus(batch, simulation);
    renderSimulation(batch, simulation);
    document.querySelector('#refresh-simulation').hidden = rolePicker.value === 'manager' || state === 'pending' || state === 'settled';
    if (state === 'pending' && batch.activeRequest) startSettlementPolling(batch);
    else stopSettlementPolling();
  }

  function renderSettlementStatus(batch, simulation) {
    const panel = document.querySelector('#settlement-status-panel');
    const state = batch.status;
    panel.hidden = state === 'ready';
    const title = document.querySelector('#settlement-status-title');
    const description = document.querySelector('#settlement-status-description');
    const meta = document.querySelector('#settlement-status-meta');
    document.querySelector('#settlement-status-eyebrow').textContent = state === 'settled' ? 'CONCLUÍDA' : state === 'failed' ? 'FALHA DEFINITIVA' : 'ACOMPANHAMENTO';
    meta.replaceChildren();
    if (state === 'pending') {
      title.textContent = 'Liquidação em andamento';
      description.textContent = 'A solicitação foi aceita. Esta tela acompanha o lote sem bloquear a navegação.';
      const item = document.createElement('span');
      item.textContent = batch.activeRequest ? `Solicitação ${batch.activeRequest.reference}` : 'Solicitação demonstrativa pendente';
      const note = document.createElement('span');
      note.textContent = 'Atualização de status a cada 5 segundos';
      meta.append(item, note);
      return;
    }
    if (state === 'settled') {
      title.textContent = 'Liquidação concluída';
      description.textContent = 'Todos os recebíveis foram confirmados juntos. Os valores finais usam as condições fixadas no aceite.';
      const completed = document.createElement('span');
      completed.textContent = batch.completedAt ?? '26/09/2026, 10h25';
      const operation = document.createElement('span');
      operation.textContent = simulation.valid ? `${simulation.details.length} recebíveis liquidados` : 'Resultado confirmado';
      meta.append(completed, operation);
      return;
    }
    title.textContent = 'Falha definitiva';
    description.textContent = batch.lastFailure ?? 'A tentativa falhou sem liquidações parciais. Uma nova solicitação exige confirmação e uma nova chave de idempotência.';
    const attempt = document.createElement('span');
    attempt.textContent = `Tentativa ${batch.attemptCount ?? 1}`;
    meta.append(attempt);
  }

  function renderSimulation(batch, simulation) {
    const settled = batch.status === 'settled';
    const pending = batch.status === 'pending';
    document.querySelector('#simulation-title').textContent = settled ? 'Resultado financeiro confirmado' : pending ? 'Condições financeiras aceitas' : 'Simulação indicativa';
    document.querySelector('#simulation-caption').textContent = settled
      ? 'Valores finais da liquidação, calculados com as condições fixadas no aceite.'
      : pending
        ? 'Condições fixadas para esta solicitação; o processamento ainda está em andamento.'
        : 'Condições estimadas; a solicitação aceita fixa os valores finais.';
    document.querySelector('#simulation-assumptions').textContent = `Data-base: ${formatIsoDate(batch.acceptedDate ?? demoReferenceDate)} · taxa mensal base: 1,00% · câmbio: ${formatExchangeValue(simulation.exchangeRate ?? activeExchangeQuote.rate)} por US$ 1,00${simulation.quoteExpired ? ' · cotação expirada' : ', com snapshot de até 24 horas'}.`;
    document.querySelector('#simulation-face-total').textContent = formatCents(simulation.totals.face);
    document.querySelector('#simulation-discount-total').textContent = formatCents(simulation.totals.discount);
    document.querySelector('#simulation-brl-total').textContent = formatCurrencyCents(simulation.totals.brl, 'BRL');
    document.querySelector('#simulation-usd-total').textContent = formatCurrencyCents(simulation.totals.usd, 'USD');
    const rows = document.querySelector('#simulation-rows');
    rows.replaceChildren();
    simulation.details.forEach((item) => {
      const row = document.createElement('tr');
      const values = [
        item.cedent,
        item.reference,
        item.type,
        formatCents(BigInt(item.faceCents)),
        formatIsoDate(item.dueDate),
        item.error ? '—' : String(item.days),
        item.currency,
        item.error ? '—' : formatCents(item.presentValue),
        item.error ? item.error : formatCurrencyCents(item.paid, item.currency),
      ];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if ([3, 5, 7, 8].includes(index)) cell.className = 'numeric-cell';
        if (item.error && index === 8) {
          cell.classList.add('simulation-error');
          row.setAttribute('aria-label', `Recebível inválido: ${item.error}`);
        }
        row.append(cell);
      });
      rows.append(row);
    });
    document.querySelector('#simulation-feedback').textContent = simulation.valid
      ? simulationFeedbackText
      : simulation.quoteExpired
        ? 'A cotação está expirada; recebíveis em USD não podem ser liquidados até a aprovação de uma nova cotação.'
        : 'Há recebíveis com vencimento anterior à data de referência; não é possível solicitar a liquidação.';
    const exchangeAction = document.querySelector('#open-exchange-from-batch');
    exchangeAction.hidden = !simulation.quoteExpired;
    exchangeAction.textContent = rolePicker.value === 'manager' ? 'Ir para Câmbio e analisar proposta' : 'Ir para Câmbio e propor ajuste';
    document.querySelector('#simulation-footnote').textContent = settled
      ? 'Deságio = valor de face − valor presente. Pagamentos USD convertem o valor presente em BRL já arredondado pela cotação fixada no aceite.'
      : 'Prazo em dias corridos ÷ 30; taxa mensal total: duplicata 2,50%, cheque 3,50%. Valores calculados com centavos inteiros e arredondamento HALF_EVEN.';
    document.querySelector('#request-settlement').disabled = !simulation.valid;
    document.querySelector('#refresh-simulation').disabled = !simulation.valid;
  }

  function formatExchangeInput(value) {
    const whole = (value / exchangeScale).toString();
    const fraction = (value % exchangeScale).toString().padStart(12, '0').replace(/0+$/, '').padEnd(2, '0');
    return `${whole},${fraction}`;
  }

  function nextExchangeTimestamp() {
    demoNow += 60000;
    return demoNow;
  }

  function loadExchangeReference() {
    const request = ++exchangeReferenceRequest;
    exchangeReferenceRate = null;
    exchangeReferenceUpdatedAt = 0;
    document.querySelector('#exchange-provider-rate').textContent = 'Consultando provedor…';
    document.querySelector('#exchange-provider-updated').textContent = 'Atualizando referência global.';
    window.setTimeout(() => {
      if (request !== exchangeReferenceRequest) return;
      exchangeReferenceRate = 5180000000000n;
      exchangeReferenceUpdatedAt = nextExchangeTimestamp();
      if (activeScreen() !== 'exchange') return;
      document.querySelector('#exchange-provider-rate').textContent = `${formatExchangeValue(exchangeReferenceRate)} por US$ 1,00`;
      document.querySelector('#exchange-provider-updated').textContent = `Atualizada em ${formatExchangeDate(exchangeReferenceUpdatedAt)}.`;
      document.querySelector('#use-exchange-reference').hidden = exchangeReferenceRate <= activeExchangeQuote.rate || rolePicker.value === 'manager';
    }, 320);
  }

  function renderExchange() {
    const role = rolePicker.value;
    const canPropose = role !== 'manager';
    const actor = currentExchangeActor();
    const quoteValid = exchangeQuoteIsValid();
    const activeStatus = document.querySelector('#exchange-current-status');

    document.querySelector('#exchange-current-rate').textContent = formatExchangeValue(activeExchangeQuote.rate);
    document.querySelector('#exchange-current-start').textContent = formatExchangeDate(activeExchangeQuote.startedAt);
    document.querySelector('#exchange-current-expiry').textContent = formatExchangeDate(activeExchangeQuote.validUntil);
    document.querySelector('#exchange-current-code').textContent = activeExchangeQuote.code;
    activeStatus.textContent = quoteValid ? 'Válida · até 24 horas' : 'Expirada';
    activeStatus.dataset.state = quoteValid ? 'valid' : 'expired';
    document.querySelector('#exchange-validity-note').hidden = quoteValid;
    openExchangeProposalButton.hidden = !canPropose;
    document.querySelector('#exchange-proposer-identity').textContent = `Solicitante: ${actor.name}`;
    document.querySelector('#exchange-provider-rate').textContent = exchangeReferenceRate === null
      ? 'Consultando provedor…'
      : `${formatExchangeValue(exchangeReferenceRate)} por US$ 1,00`;
    document.querySelector('#exchange-provider-updated').textContent = exchangeReferenceUpdatedAt
      ? `Atualizada em ${formatExchangeDate(exchangeReferenceUpdatedAt)}.`
      : 'Atualizando referência global.';
    document.querySelector('#use-exchange-reference').hidden = !exchangeReferenceRate || exchangeReferenceRate <= activeExchangeQuote.rate || !canPropose;
    renderExchangeHistory();
  }

  function updateExchangeProposalPreview() {
    const adjustment = readExchangeValue(exchangeAdjustment.value);
    const output = document.querySelector('#exchange-proposed-rate');
    output.textContent = adjustment === null || adjustment <= 0n
      ? '—'
      : formatExchangeValue(activeExchangeQuote.rate + adjustment);
  }

  function renderExchangeHistory() {
    const proposalRows = document.querySelector('#exchange-proposal-rows');
    proposalRows.replaceChildren();
    [...exchangeProposals].reverse().forEach((proposal) => {
      const row = document.createElement('tr');
      const identityCell = document.createElement('td');
      const identity = document.createElement('div');
      identity.className = 'exchange-table-stack';
      const code = document.createElement('strong');
      code.textContent = proposal.code;
      const requester = document.createElement('span');
      requester.textContent = proposal.requester;
      identity.append(code, requester);
      identityCell.append(identity);
      row.append(identityCell);

      const conditionsCell = document.createElement('td');
      conditionsCell.className = 'numeric-cell';
      const conditions = document.createElement('div');
      conditions.className = 'exchange-table-stack exchange-table-stack--numeric';
      const adjustment = document.createElement('strong');
      adjustment.textContent = `+${formatExchangeValue(proposal.adjustment)}`;
      const proposedRate = document.createElement('span');
      proposedRate.textContent = `Nova: ${formatExchangeValue(proposal.proposedRate)}`;
      conditions.append(adjustment, proposedRate);
      conditionsCell.append(conditions);
      row.append(conditionsCell);

      const reasonCell = document.createElement('td');
      reasonCell.className = 'exchange-reason-cell';
      reasonCell.textContent = proposal.reason;
      reasonCell.title = proposal.reason;
      row.append(reasonCell);

      const requestedCell = document.createElement('td');
      requestedCell.textContent = formatExchangeDate(proposal.requestedAt);
      row.append(requestedCell);

      const traceCell = document.createElement('td');
      const trace = document.createElement('div');
      trace.className = 'exchange-table-stack';
      const status = document.createElement('span');
      status.className = `exchange-state exchange-state--${proposal.status}`;
      status.textContent = proposal.status === 'pending' ? 'Pendente' : proposal.status === 'approved' ? 'Aprovada' : 'Rejeitada';
      const decision = document.createElement('span');
      decision.textContent = proposal.decidedAt
        ? `${proposal.decidedBy} · ${formatExchangeDate(proposal.decidedAt)}`
        : 'Aguardando gestor';
      trace.append(status, decision);
      if (proposal.status === 'rejected' && proposal.decisionReason) {
        const reason = document.createElement('small');
        reason.textContent = `Motivo: ${proposal.decisionReason}`;
        trace.append(reason);
      }
      traceCell.append(trace);
      row.append(traceCell);

      const actionCell = document.createElement('td');
      if (proposal.status === 'pending' && rolePicker.value !== 'operator') {
        if (proposal.requesterId === currentExchangeActor().id) {
          const selfNote = document.createElement('span');
          selfNote.className = 'exchange-inline-note';
          selfNote.textContent = 'Sem autoaprovação';
          selfNote.title = 'Um gestor diferente do solicitante deve decidir esta proposta.';
          actionCell.append(selfNote);
        } else {
          const actions = document.createElement('div');
          actions.className = 'exchange-row-actions';
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'button exchange-row-action';
          approve.dataset.exchangeAction = 'approve';
          approve.dataset.exchangeCode = proposal.code;
          approve.textContent = 'Aprovar';
          approve.setAttribute('aria-label', `Aprovar proposta ${proposal.code}`);
          const stale = proposal.baseRate !== activeExchangeQuote.rate;
          approve.disabled = stale;
          if (stale) approve.title = 'A cotação vigente mudou; envie uma nova proposta antes de aprovar.';
          const reject = document.createElement('button');
          reject.type = 'button';
          reject.className = 'button exchange-row-action';
          reject.dataset.exchangeAction = 'reject';
          reject.dataset.exchangeCode = proposal.code;
          reject.textContent = 'Rejeitar';
          reject.setAttribute('aria-label', `Rejeitar proposta ${proposal.code}`);
          actions.append(approve, reject);
          actionCell.append(actions);
        }
      } else if (proposal.status === 'pending') {
        actionCell.textContent = 'Aguardando gestor';
      } else {
        actionCell.textContent = '—';
      }
      row.append(actionCell);
      proposalRows.append(row);
    });

    const quoteRows = document.querySelector('#exchange-quote-rows');
    quoteRows.replaceChildren();
    [...exchangeQuotes].reverse().forEach((quote) => {
      const row = document.createElement('tr');
      const current = quote.code === activeExchangeQuote.code;
      [quote.code, formatExchangeValue(quote.rate), formatExchangeDate(quote.startedAt), formatExchangeDate(quote.validUntil), `${quote.source}${current ? ' · vigente' : ''}`]
        .forEach((value, index) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          if (index === 1) cell.className = 'numeric-cell';
          row.append(cell);
        });
      quoteRows.append(row);
    });

    document.querySelector('#exchange-proposals-region').hidden = exchangeHistoryMode !== 'proposals';
    document.querySelector('#exchange-quotes-region').hidden = exchangeHistoryMode !== 'quotes';
    document.querySelector('#show-exchange-proposals').setAttribute('aria-pressed', String(exchangeHistoryMode === 'proposals'));
    document.querySelector('#show-exchange-quotes').setAttribute('aria-pressed', String(exchangeHistoryMode === 'quotes'));
  }

  function submitExchangeProposal(event) {
    event.preventDefault();
    const adjustment = readExchangeValue(exchangeAdjustment.value);
    const reason = exchangeProposalReason.value.trim();
    let firstInvalid = null;
    exchangeAdjustment.removeAttribute('aria-invalid');
    exchangeProposalReason.removeAttribute('aria-invalid');
    document.querySelector('#exchange-adjustment-error').textContent = '';
    document.querySelector('#exchange-proposal-reason-error').textContent = '';
    if (adjustment === null || adjustment <= 0n) {
      exchangeAdjustment.setAttribute('aria-invalid', 'true');
      document.querySelector('#exchange-adjustment-error').textContent = 'Informe um ajuste decimal positivo, com até 12 casas decimais.';
      firstInvalid = exchangeAdjustment;
    }
    if (!reason) {
      exchangeProposalReason.setAttribute('aria-invalid', 'true');
      document.querySelector('#exchange-proposal-reason-error').textContent = 'Informe a justificativa da proposta.';
      firstInvalid ??= exchangeProposalReason;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const actor = currentExchangeActor();
    const proposal = {
      code: `FX-${String(nextExchangeProposalNumber).padStart(3, '0')}`,
      requesterId: actor.id,
      requester: actor.name,
      adjustment,
      baseRate: activeExchangeQuote.rate,
      proposedRate: activeExchangeQuote.rate + adjustment,
      reason,
      requestedAt: nextExchangeTimestamp(),
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      decisionReason: '',
    };
    nextExchangeProposalNumber += 1;
    exchangeProposals.unshift(proposal);
    exchangeProposalForm.reset();
    const feedback = document.querySelector('#exchange-proposal-feedback');
    feedback.hidden = false;
    feedback.textContent = `${proposal.code} registrada. A cotação vigente permanece inalterada até a decisão do gestor.`;
    document.querySelector('#exchange-adjustment-error').textContent = '';
    document.querySelector('#exchange-proposal-reason-error').textContent = '';
    document.querySelector('#exchange-proposed-rate').textContent = '—';
    renderExchange();
    closeWorkflowDialog(exchangeProposalDialog, openExchangeProposalButton);
  }

  function openExchangeApproval(proposal, trigger) {
    if (!proposal || proposal.status !== 'pending') return;
    exchangeDecisionPending = proposal.code;
    document.querySelector('#confirm-batch-action').hidden = true;
    document.querySelector('#confirm-exchange-action').hidden = false;
    document.querySelector('#confirm-exchange-rejection').hidden = true;
    document.querySelector('#exchange-rejection-form').hidden = true;
    document.querySelector('#warning-title').textContent = 'Aprovar nova cotação?';
    document.querySelector('#warning-description').textContent = `A cotação global passará a ${formatExchangeValue(proposal.proposedRate)} por US$ 1,00. A aprovação não altera solicitações já aceitas nem inicia liquidações.`;
    document.querySelector('#dismiss-alert').textContent = 'Cancelar';
    document.querySelector('#dismiss-alert').className = 'button';
    openAlert(trigger);
  }

  function openExchangeRejection(proposal, trigger) {
    const actor = currentExchangeActor();
    if (!proposal || proposal.status !== 'pending' || rolePicker.value === 'operator' || proposal.requesterId === actor.id) return;
    exchangeDecisionPending = proposal.code;
    const reasonInput = document.querySelector('#exchange-rejection-reason');
    reasonInput.value = '';
    reasonInput.removeAttribute('aria-invalid');
    document.querySelector('#exchange-rejection-error').textContent = '';
    document.querySelector('#confirm-batch-action').hidden = true;
    document.querySelector('#confirm-exchange-action').hidden = true;
    document.querySelector('#exchange-rejection-form').hidden = false;
    document.querySelector('#confirm-exchange-rejection').hidden = false;
    document.querySelector('#warning-title').textContent = `Rejeitar proposta ${proposal.code}?`;
    document.querySelector('#warning-description').textContent = 'Informe o motivo. A rejeição ficará registrada no histórico e não altera a cotação vigente.';
    document.querySelector('#dismiss-alert').textContent = 'Cancelar';
    document.querySelector('#dismiss-alert').className = 'button';
    openAlert(trigger);
    reasonInput.focus();
  }

  function approveExchangeProposal(proposal) {
    const actor = currentExchangeActor();
    if (rolePicker.value === 'operator' || !proposal || proposal.status !== 'pending' || proposal.requesterId === actor.id) return;
    if (proposal.baseRate !== activeExchangeQuote.rate) {
      return;
    }
    const decidedAt = nextExchangeTimestamp();
    activeExchangeQuote.validUntil = decidedAt;
    const quote = {
      code: `COT-${String(nextExchangeQuoteNumber).padStart(3, '0')}`,
      rate: proposal.proposedRate,
      startedAt: decidedAt,
      validUntil: decidedAt + (24 * 60 * 60 * 1000),
      source: `Proposta ${proposal.code} aprovada · ${actor.name}`,
    };
    nextExchangeQuoteNumber += 1;
    exchangeQuotes.push(quote);
    activeExchangeQuote = quote;
    exchangeValidityPicker.value = 'valid';
    proposal.status = 'approved';
    proposal.decidedAt = decidedAt;
    proposal.decidedBy = actor.name;
    renderExchange();
    if (exchangeReturnBatchId) {
      selectedBatchId = exchangeReturnBatchId;
      exchangeReturnBatchId = '';
      simulationFeedbackText = rolePicker.value === 'manager'
        ? 'Nova cotação aprovada. A simulação foi atualizada; o operador pode revisá-la e solicitar a liquidação.'
        : 'Nova cotação aprovada. Revise a simulação atualizada e solicite a liquidação quando estiver pronto.';
      navigate('batch-detail');
      document.querySelector('#batch-detail-title').focus({ preventScroll: true });
    }
  }

  function rejectExchangeProposal() {
    const proposal = exchangeProposals.find((item) => item.code === exchangeDecisionPending);
    const actor = currentExchangeActor();
    const reasonInput = document.querySelector('#exchange-rejection-reason');
    const error = document.querySelector('#exchange-rejection-error');
    const reason = reasonInput.value.trim();
    reasonInput.removeAttribute('aria-invalid');
    error.textContent = '';
    if (rolePicker.value === 'operator' || !proposal || proposal.status !== 'pending' || proposal.requesterId === actor.id) return;
    if (!reason) {
      reasonInput.setAttribute('aria-invalid', 'true');
      error.textContent = 'Informe o motivo da rejeição.';
      reasonInput.focus();
      return;
    }
    const decidedAt = nextExchangeTimestamp();
    proposal.status = 'rejected';
    proposal.decidedAt = decidedAt;
    proposal.decidedBy = actor.name;
    proposal.decisionReason = reason;
    closeAlert(document.querySelector('#exchange-history-title'));
    renderExchangeHistory();
  }

  function startSettlementPolling(batch) {
    if (settlementPollTimer || !batch.activeRequest) return;
    settlementPollTimer = window.setTimeout(() => {
      settlementPollTimer = 0;
      if (activeScreen() !== 'batch-detail' || batch.code !== selectedBatchId || batch.status !== 'pending') return;
      const outcome = demoSettlementOutcome.value;
      if (outcome === 'settled') {
        batch.status = 'settled';
        batch.completedAt = '26/09/2026, 10h25';
        batch.settlement = batch.activeRequest.snapshot;
        ensureStatementEntries();
        statementEntries.push(...createStatementEntries(batch, batch.settlement, parseStatementTimestamp(batch.completedAt)));
      } else if (outcome === 'failed') {
        batch.status = 'failed';
        batch.completedAt = '26/09/2026, 10h25';
        batch.lastFailure = 'Falha demonstrativa após o processamento. Nenhum recebível foi liquidado.';
        batch.settlement = null;
      }
      renderBatchDetails();
    }, 5000);
  }

  function stopSettlementPolling() {
    if (settlementPollTimer) window.clearTimeout(settlementPollTimer);
    settlementPollTimer = 0;
  }

  function openSettlementConfirmation(batch) {
    const items = mockItemsForBatch(batch);
    const simulation = simulateBatch(items, batch.acceptedDate ?? demoReferenceDate);
    if (!simulation.valid) {
      document.querySelector('#warning-title').textContent = 'Não é possível solicitar a liquidação';
      document.querySelector('#warning-description').textContent = simulation.quoteExpired
        ? 'A cotação de USD está expirada. Solicite um ajuste cambial e aguarde a aprovação de um gestor antes de liquidar este lote.'
        : 'Há recebíveis vencidos em relação à data de referência. Nenhuma liquidação parcial será iniciada.';
      openAlert(document.querySelector('#request-settlement'));
      return;
    }
    document.querySelector('#warning-title').textContent = batch.status === 'failed' ? 'Confirmar nova tentativa?' : 'Confirmar solicitação de liquidação?';
    document.querySelector('#warning-description').textContent = `O lote ${batch.code} será enviado para processamento. As condições financeiras serão fixadas no aceite e não poderão ser alteradas.`;
    document.querySelector('#confirm-batch-action').hidden = false;
    document.querySelector('#dismiss-alert').textContent = 'Cancelar';
    document.querySelector('#dismiss-alert').className = 'button';
    openAlert(document.querySelector('#request-settlement'));
  }

  function submitSettlement(batch) {
    if (batchActionPending || batch.status === 'pending' || batch.status === 'settled') return;
    const requestNumber = (batch.attemptCount ?? 0) + 1;
    const snapshot = simulateBatch(mockItemsForBatch(batch), demoReferenceDate);
    if (!snapshot.valid) return;
    batchActionPending = true;
    document.querySelector('#request-settlement').disabled = true;
    document.querySelector('#loading-message').textContent = 'Enviando solicitação de liquidação…';
    document.querySelector('#hide-loading').disabled = true;
    loadingPanel.hidden = false;
    window.setTimeout(() => {
      batch.attemptCount = requestNumber;
      batch.acceptedDate = demoReferenceDate;
      batch.activeRequest = {
        reference: `SOL-${batch.code}-${String(requestNumber).padStart(2, '0')}`,
        idempotencyKey: `DEMO-${batch.code}-${String(requestNumber).padStart(2, '0')}`,
        snapshot,
      };
      batch.status = 'pending';
      batch.lastFailure = null;
      batch.settlement = null;
      batchActionPending = false;
      document.querySelector('#hide-loading').disabled = false;
      document.querySelector('#loading-message').textContent = 'Carregando a aplicação…';
      loadingPanel.hidden = true;
      simulationFeedbackText = 'Solicitação aceita. A simulação foi fixada para esta tentativa.';
      renderBatchDetails();
      document.querySelector('#batch-detail-title').focus({ preventScroll: true });
    }, 550);
  }

  function initializeBatchWizard() {
    batchWizardStep = 1;
    batchMethod = 'form';
    importHasErrors = false;
    batchItems.splice(0);
    importedItems.splice(0);
    batchItemForm.reset();
    document.querySelector('#create-batch').disabled = false;
    itemCedent.replaceChildren();
    const emptyCedentOption = document.createElement('option');
    emptyCedentOption.value = '';
    emptyCedentOption.textContent = 'Selecione um cedente';
    emptyCedentOption.selected = true;
    emptyCedentOption.defaultSelected = true;
    itemCedent.append(emptyCedentOption);
    registerRecords.forEach((record) => {
      const option = document.createElement('option');
      option.value = record.uuid;
      option.textContent = record.name;
      itemCedent.append(option);
    });
    document.querySelector('input[name="batch-method"][value="form"]').checked = true;
    document.querySelector('#import-feedback').hidden = true;
    document.querySelector('#import-errors').hidden = true;
    document.querySelector('#import-items-region').hidden = true;
    document.querySelector('#manual-items-region').hidden = true;
    document.querySelector('#item-currency').value = 'BRL';
    clearBatchItemErrors();
  }

  function renderBatchWizard() {
    const canCreate = rolePicker.value !== 'manager';
    batchWizard.hidden = !canCreate;
    document.querySelector('#new-batch-forbidden').hidden = canCreate;
    if (!canCreate) return;

    [1, 2, 3].forEach((step) => {
      document.querySelector(`#batch-step-${step}`).hidden = batchWizardStep !== step;
      const marker = document.querySelector(`[data-step-marker="${step}"]`);
      marker.toggleAttribute('aria-current', batchWizardStep === step);
      marker.classList.toggle('is-complete', step < batchWizardStep);
    });
    const manual = batchMethod === 'form';
    document.querySelector('#manual-batch-entry').hidden = batchWizardStep !== 2 || !manual;
    document.querySelector('#import-batch-entry').hidden = batchWizardStep !== 2 || manual;
    document.querySelector('#batch-step-2-title').textContent = manual ? 'Informe os recebíveis' : 'Revise o arquivo de exemplo';
    document.querySelector('#batch-step-2-title').nextElementSibling.textContent = manual
      ? 'Valor de face sempre em reais. A moeda de pagamento pode variar por recebível.'
      : 'A moeda de pagamento é individual. No exemplo CNAB, cada recebível começa em BRL e pode ser alterado.';
    document.querySelector('#file-demo-title').textContent = batchMethod === 'csv' ? 'Exemplo de arquivo CSV' : 'Exemplo de arquivo CNAB 240';
    document.querySelector('#file-demo-description').textContent = batchMethod === 'csv'
      ? 'CSV demonstrativo · limite de 5 MiB · nenhum arquivo real é lido.'
      : 'CNAB 240 demonstrativo · limite de 5 MiB · moeda inicial BRL por recebível.';
    document.querySelector('#open-batch-import').textContent = batchMethod === 'csv' ? 'Abrir importação CSV' : 'Abrir importação CNAB 240';
    const importSummary = document.querySelector('#import-batch-summary');
    importSummary.textContent = !importedItems.length
      ? 'Abra a importação para revisar o arquivo e os recebíveis.'
      : importHasErrors
        ? 'A prévia encontrou inconsistências. Reabra a importação para conferir os erros.'
        : `Prévia válida: ${importedItems.length} recebíveis prontos para revisão.`;
    document.querySelector('#batch-item-count').textContent = `${batchItems.length} de 1.000 recebíveis`;
    document.querySelector('#add-batch-item').disabled = batchItems.length >= 1000;
    document.querySelector('#batch-items-next').disabled = manual ? batchItems.length === 0 : importedItems.length === 0 || importHasErrors;
    renderManualItems();
    renderImportedItems();
    if (batchWizardStep === 3) renderBatchReview();
  }

  function renderManualItems() {
    const region = document.querySelector('#manual-items-region');
    region.hidden = batchItems.length === 0;
    const rows = document.querySelector('#manual-item-rows');
    rows.replaceChildren();
    batchItems.forEach((item, index) => {
      const row = document.createElement('tr');
      [item.cedent, item.reference, item.type, formatIsoDate(item.dueDate), formatCents(BigInt(item.faceCents)), item.currency].forEach((value, cellIndex) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (cellIndex === 4) cell.className = 'numeric-cell';
        row.append(cell);
      });
      const actionCell = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button';
      remove.dataset.removeBatchItem = String(index);
      remove.textContent = 'Remover';
      remove.setAttribute('aria-label', `Remover recebível ${item.reference}`);
      actionCell.append(remove);
      row.append(actionCell);
      rows.append(row);
    });
  }

  function renderImportedItems() {
    const region = document.querySelector('#import-items-region');
    region.hidden = importedItems.length === 0;
    const rows = document.querySelector('#import-item-rows');
    rows.replaceChildren();
    importedItems.forEach((item) => {
      const row = document.createElement('tr');
      [String(item.line), item.cedent, item.reference, formatIsoDate(item.dueDate), formatCents(BigInt(item.faceCents))].forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index === 4) cell.className = 'numeric-cell';
        const error = item.errors?.[index];
        if (error) {
          cell.classList.add('import-cell-error');
          cell.setAttribute('aria-label', `${value}. Erro no campo: ${error}`);
          cell.title = error;
        }
        row.append(cell);
      });
      const currencyCell = document.createElement('td');
      const currency = document.createElement('select');
      currency.setAttribute('aria-label', `Moeda de pagamento do recebível ${item.reference}`);
      [['BRL', 'BRL — Reais'], ['USD', 'USD — Dólares']].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        currency.append(option);
      });
      currency.value = item.currency;
      currency.dataset.importCurrency = item.reference;
      currencyCell.append(currency);
      row.append(currencyCell);
      rows.append(row);
    });
  }

  function renderBatchReview() {
    const rows = batchMethod === 'form' ? batchItems : importedItems;
    const total = rows.reduce((sum, item) => sum + BigInt(item.faceCents), 0n);
    const currencies = [...new Set(rows.map((item) => item.currency))].sort();
    document.querySelector('#review-method').textContent = { form: 'Formulário', csv: 'Arquivo CSV de exemplo', cnab: 'Arquivo CNAB 240 de exemplo' }[batchMethod];
    document.querySelector('#review-count').textContent = rows.length === 1 ? '1 recebível' : `${rows.length} recebíveis`;
    document.querySelector('#review-face-total').textContent = formatCents(total);
    document.querySelector('#review-currencies').textContent = currencies.join(', ');
  }

  function clearBatchItemErrors() {
    [['item-cedent', 'item-cedent-error'], ['item-reference', 'item-reference-error'], ['item-face-value', 'item-face-value-error'], ['item-due-date', 'item-due-date-error']]
      .forEach(([inputId, errorId]) => {
        document.querySelector(`#${inputId}`).removeAttribute('aria-invalid');
        document.querySelector(`#${errorId}`).textContent = '';
      });
  }

  function addManualBatchItem(event) {
    event.preventDefault();
    clearBatchItemErrors();
    if (batchItems.length >= 1000) return;
    const fields = [
      { input: itemCedent, error: document.querySelector('#item-cedent-error'), invalid: !itemCedent.value, message: 'Selecione um cedente.' },
      { input: itemReference, error: document.querySelector('#item-reference-error'), invalid: !itemReference.value.trim(), message: 'Informe a referência externa.' },
      { input: itemFaceValue, error: document.querySelector('#item-face-value-error'), invalid: readCents(itemFaceValue.value) <= 0n, message: 'Informe um valor maior que R$ 0,00.' },
      { input: itemDueDate, error: document.querySelector('#item-due-date-error'), invalid: !itemDueDate.value || itemDueDate.value < demoReferenceDate, message: itemDueDate.value && itemDueDate.value < demoReferenceDate ? 'O vencimento não pode ser anterior à data da solicitação.' : 'Informe a data de vencimento.' },
    ];
    const invalidField = fields.find((field) => field.invalid);
    fields.filter((field) => field.invalid).forEach((field) => {
      field.input.setAttribute('aria-invalid', 'true');
      field.error.textContent = field.message;
    });
    if (invalidField) {
      invalidField.input.focus();
      return;
    }
    batchItems.push({
      cedent: itemCedent.selectedOptions[0].textContent,
      reference: itemReference.value.trim(),
      type: document.querySelector('#item-type').value,
      faceCents: readCents(itemFaceValue.value).toString(),
      dueDate: itemDueDate.value,
      currency: document.querySelector('#item-currency').value,
    });
    batchItemForm.reset();
    itemCedent.value = registerRecords[0]?.uuid ?? '';
    document.querySelector('#item-currency').value = 'BRL';
    clearBatchItemErrors();
    renderBatchWizard();
    itemReference.focus();
  }

  function setImportSample(sample) {
    importHasErrors = sample === 'errors';
    importedItems.splice(0);
    importedItems.push({
      line: 2,
      cedent: sample === 'errors' && batchMethod === 'cnab' ? 'Registro CNAB inválido' : registerRecords[0].name,
      reference: `${batchMethod.toUpperCase()}-DEMO-01`,
      dueDate: '2026-10-10',
      faceCents: sample === 'errors' && batchMethod === 'cnab' ? '0' : '1500000',
      currency: 'BRL',
      type: 'Duplicata mercantil',
      errors: sample === 'errors' && batchMethod === 'cnab' ? { 1: 'Registro com comprimento diferente de 240 caracteres.', 4: 'Campo valor: valor não informado.' } : null,
    }, {
      line: 3,
      cedent: sample === 'errors' ? 'Cedente não cadastrado' : registerRecords[1].name,
      reference: `${batchMethod.toUpperCase()}-DEMO-02`,
      dueDate: '2026-10-15',
      faceCents: '2750000',
      currency: batchMethod === 'cnab' ? 'BRL' : 'USD',
      type: 'Cheque pré-datado',
      errors: sample === 'errors' ? { 1: 'CNPJ ou código do cedente não localizado no cadastro.' } : null,
    });
    if (sample === 'errors' && batchMethod === 'csv') {
      importedItems.push({
        line: 4,
        cedent: registerRecords[1].name,
        reference: 'CSV-DEMO-03',
        dueDate: '2026-10-20',
        faceCents: '0',
        currency: 'BRL',
        type: 'Duplicata mercantil',
        errors: { 4: 'Valor de face inválido; informe um valor decimal positivo.' },
      });
    }
    const feedback = document.querySelector('#import-feedback');
    feedback.hidden = false;
    feedback.textContent = sample === 'valid'
      ? `Prévia demonstrativa pronta: 2 recebíveis válidos. Limite de 1.000 itens e arquivo de até 5 MiB.`
      : 'A prévia encontrou campos que precisam ser corrigidos antes de continuar.';
    const errors = document.querySelector('#import-errors');
    errors.hidden = !importHasErrors;
    errors.replaceChildren();
    if (importHasErrors) {
      const title = document.createElement('strong');
      title.textContent = 'Erros encontrados na prévia';
      const list = document.createElement('ul');
      const messages = batchMethod === 'csv'
        ? ['Linha 3 · CNPJ do cedente: cedente não encontrado no cadastro.', 'Linha 4 · Valor de face: informe um valor decimal válido.']
        : ['Linha 2 · Registro CNAB: comprimento diferente de 240 caracteres.', 'Linha 2 · Valor de face: valor não informado.', 'Linha 3 · Código do cedente: cedente não encontrado no cadastro.'];
      messages.forEach((message) => {
        const item = document.createElement('li');
        item.textContent = message;
        list.append(item);
      });
      errors.append(title, list);
    }
    document.querySelector('#import-items-region').hidden = false;
    renderBatchWizard();
  }

  function navigate(screen, announce = true) {
    const destination = screens.has(screen) ? screen : 'not-found';
    if (activeScreen() === 'exchange' && destination !== 'batch-detail') exchangeReturnBatchId = '';
    if (!navigationViewport.matches) setNavigationOpen(false);
    if (destination === 'new-batch') initializeBatchWizard();
    if (window.location.hash !== `#${destination}`) {
      window.location.hash = destination;
    } else {
      render();
    }
    if (announce) {
      announcer.textContent = screenNames[destination];
      content.focus({ preventScroll: true });
    }
  }

  function createBatch() {
    if (batchActionPending) return;
    const rows = batchMethod === 'form' ? batchItems : importedItems;
    if (rows.length < 1 || rows.length > 1000 || importHasErrors) return;
    const faceCents = rows.reduce((sum, item) => sum + BigInt(item.faceCents), 0n).toString();
    const record = {
      code: `LT-${nextBatchNumber}`,
      cedent: rows[0].cedent,
      count: rows.length,
      faceCents,
      registeredAt: '26/09/2026',
      status: 'ready',
      currencies: [...new Set(rows.map((item) => item.currency))],
      items: rows.map((item) => ({ ...item })),
    };
    nextBatchNumber += 1;
    batchActionPending = true;
    document.querySelector('#create-batch').disabled = true;
    document.querySelector('#loading-message').textContent = 'Cadastrando lote demonstrativo…';
    document.querySelector('#hide-loading').disabled = true;
    loadingPanel.hidden = false;
    window.setTimeout(() => {
      batchRecords.unshift(record);
      batchSearch.value = '';
      batchStatusFilter.value = 'all';
      batchPage = 1;
      batchFeedbackText = `${record.code} cadastrado nesta demonstração. Nenhum dado foi enviado ao backend.`;
      batchActionPending = false;
      document.querySelector('#hide-loading').disabled = false;
      document.querySelector('#loading-message').textContent = 'Carregando a aplicação…';
      loadingPanel.hidden = true;
      navigate('batches');
    }, 550);
  }

  function openAlert(trigger) {
    if (warningDialog.open || alertClosing) return;
    alertTrigger = trigger;
    warningDialog.dataset.state = 'opening';
    warningDialog.showModal();
    requestAnimationFrame(() => {
      if (warningDialog.open && !alertClosing) warningDialog.dataset.state = 'open';
    });
    document.querySelector('#dismiss-alert').focus();
  }

  function isVisibleFocusTarget(target) {
    return Boolean(target?.isConnected && !target.closest('[hidden]'));
  }

  function openWorkflowDialog(dialog, trigger, initialFocus, fallbackFocus) {
    const current = workflowDialogStates.get(dialog);
    if (dialog.open || current?.closing) return;
    const state = { trigger, fallbackFocus, closing: false, timer: 0, returnFocus: null };
    workflowDialogStates.set(dialog, state);
    dialog.dataset.state = 'opening';
    dialog.showModal();
    requestAnimationFrame(() => {
      if (dialog.open && !state.closing) dialog.dataset.state = 'open';
    });
    const focusTarget = isVisibleFocusTarget(initialFocus) ? initialFocus : dialog.querySelector('button, input, textarea, select, [tabindex="-1"]');
    focusTarget?.focus({ preventScroll: true });
  }

  function closeWorkflowDialog(dialog, returnFocus = null) {
    const state = workflowDialogStates.get(dialog);
    if (!dialog.open || !state || state.closing) return;
    state.closing = true;
    state.returnFocus = returnFocus;
    dialog.dataset.state = 'closing';
    const finishClose = () => {
      if (!state.closing) return;
      dialog.close();
      delete dialog.dataset.state;
      window.clearTimeout(state.timer);
      workflowDialogStates.delete(dialog);
      const focusTarget = isVisibleFocusTarget(state.returnFocus)
        ? state.returnFocus
        : isVisibleFocusTarget(state.trigger) ? state.trigger : state.fallbackFocus;
      if (isVisibleFocusTarget(focusTarget)) focusTarget.focus({ preventScroll: true });
    };
    if (prefersReducedMotion.matches) finishClose();
    else state.timer = window.setTimeout(finishClose, 180);
  }

  function closeAlert(returnFocus = null) {
    if (!warningDialog.open || alertClosing) return;
    alertClosing = true;
    warningDialog.dataset.state = 'closing';
    const finishClose = () => {
      if (!alertClosing) return;
      warningDialog.close();
      delete warningDialog.dataset.state;
      alertClosing = false;
      document.querySelector('#confirm-batch-action').hidden = true;
      document.querySelector('#confirm-exchange-action').hidden = true;
      document.querySelector('#confirm-exchange-rejection').hidden = true;
      document.querySelector('#exchange-rejection-form').hidden = true;
      document.querySelector('#exchange-rejection-reason').value = '';
      document.querySelector('#exchange-rejection-reason').removeAttribute('aria-invalid');
      document.querySelector('#exchange-rejection-error').textContent = '';
      exchangeDecisionPending = null;
      document.querySelector('#dismiss-alert').textContent = 'Entendi';
      document.querySelector('#dismiss-alert').className = 'button button--primary';
      window.clearTimeout(alertCloseTimer);
      alertCloseTimer = 0;
      const focusTarget = returnFocus?.isConnected ? returnFocus : alertTrigger;
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
      alertTrigger = null;
    };
    if (prefersReducedMotion.matches) {
      finishClose();
    } else {
      alertCloseTimer = window.setTimeout(finishClose, 180);
    }
  }

  function clearRegisterErrors() {
    [registerName, registerDocument].forEach((input) => input.removeAttribute('aria-invalid'));
    document.querySelector('#register-name-error').textContent = '';
    document.querySelector('#register-document-error').textContent = '';
  }

  function setRegisterMode(mode, registerId = selectedRegisterId, trigger = null) {
    if (mode === 'list' && registerDialog.open) {
      registerMode = 'list';
      selectedRegisterId = registerId;
      registerFeedback.textContent = '';
      renderRegisters();
      closeWorkflowDialog(registerDialog);
      return;
    }

    if (mode === 'edit' || mode === 'detail') {
      const record = registerRecords.find((item) => item.uuid === registerId);
      if (!record) {
        document.querySelector('#warning-title').textContent = 'Cedente não encontrado';
        document.querySelector('#warning-description').textContent = 'O cadastro selecionado não está disponível nesta demonstração.';
        openAlert(document.querySelector('#new-register'));
        return;
      }
    }

    registerMode = mode;
    selectedRegisterId = registerId;
    registerFeedback.textContent = '';
    clearRegisterErrors();
    if (mode === 'create' || mode === 'edit') {
      const record = mode === 'edit' ? registerRecords.find((item) => item.uuid === registerId) : null;
      registerForm.reset();
      registerName.value = record ? record.name : '';
      registerDocument.value = record ? record.document : '';
      renderRegisters();
      openWorkflowDialog(registerDialog, trigger ?? document.querySelector('#new-register'), registerName, document.querySelector('#registers-title'));
      return;
    }
    renderRegisters();
    const heading = mode === 'detail'
      ? document.querySelector('#register-detail-title')
      : mode === 'list'
        ? document.querySelector('#registers-title')
        : document.querySelector('#register-form-title');
    heading.focus({ preventScroll: true });
  }

  function renderRegisters() {
    registerAdmin.hidden = false;
    registerListView.hidden = registerMode === 'detail';
    registerDetailView.hidden = registerMode !== 'detail';
    document.querySelector('#registers-title').tabIndex = -1;
    document.querySelector('#register-form-title').textContent = registerMode === 'edit' ? 'Editar cedente' : 'Novo cedente';
    document.querySelector('#save-register').textContent = registerMode === 'edit' ? 'Salvar alterações' : 'Cadastrar cedente';

    if (registerMode === 'detail' || registerMode === 'edit') {
      const selected = registerRecords.find((item) => item.uuid === selectedRegisterId);
      if (selected) {
        document.querySelector('#detail-register-name').textContent = selected.name;
        document.querySelector('#detail-register-document').textContent = selected.document;
        document.querySelector('#detail-register-date').textContent = selected.registeredAt;
      }
    }
    if (registerMode !== 'list') return;

    const query = registerSearch.value.trim().toLocaleLowerCase('pt-BR');
    const filtered = registerRecords.filter((record) =>
      (record.name + ' ' + record.document).toLocaleLowerCase('pt-BR').includes(query));
    const pageSize = Number(registerPageSizePicker.value);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    registerPage = Math.min(registerPage, pageCount);
    const pageRecords = filtered.slice((registerPage - 1) * pageSize, registerPage * pageSize);
    registerRowsElement.replaceChildren();

    pageRecords.forEach((record) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = record.name;
      const documentCell = document.createElement('td');
      documentCell.className = 'register-document';
      documentCell.textContent = record.document;
      const stateCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = 'register-state';
      status.textContent = 'Ativo';
      stateCell.append(status);

      const actionsCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      [['detail', 'Ver detalhes'], ['edit', 'Editar']].forEach(([action, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.dataset.registerAction = action;
        button.dataset.registerId = record.uuid;
        button.textContent = label;
        button.setAttribute('aria-label', label + ': ' + record.name);
        actions.append(button);
      });
      actionsCell.append(actions);
      row.append(nameCell, documentCell, stateCell, actionsCell);
      registerRowsElement.append(row);
    });

    const countLabel = query
      ? filtered.length + ' resultado' + (filtered.length === 1 ? '' : 's') + ' de ' + registerRecords.length + ' cedentes'
      : registerRecords.length + ' cedentes de demonstração';
    document.querySelector('#register-count').textContent = countLabel;
    document.querySelector('#register-table-region').hidden = filtered.length === 0;
    document.querySelector('#register-empty').hidden = filtered.length !== 0;
    document.querySelector('#register-pagination').hidden = filtered.length === 0;
    updatePaginationControls(registerPageLabel, registerPageInput, registerPage, pageCount);
    document.querySelector('#register-prev').disabled = registerPage <= 1;
    document.querySelector('#register-next').disabled = registerPage >= pageCount;
  }

  function formatCnpj(value) {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    let formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += '.' + digits.slice(2, 5);
    if (digits.length > 5) formatted += '.' + digits.slice(5, 8);
    if (digits.length > 8) formatted += '/' + digits.slice(8, 12);
    if (digits.length > 12) formatted += '-' + digits.slice(12, 14);
    return formatted;
  }

  function positionAfterDigits(formatted, digitCount) {
    if (digitCount === 0) return 0;
    let seen = 0;
    let position = 0;
    for (; position < formatted.length; position += 1) {
      if (/\d/.test(formatted[position])) seen += 1;
      if (seen === digitCount) {
        position += 1;
        while (position < formatted.length && /[^\d]/.test(formatted[position])) position += 1;
        break;
      }
    }
    return position;
  }

  function submitRegister(event) {
    event.preventDefault();
    clearRegisterErrors();
    const name = registerName.value.trim();
    const documentValue = formatCnpj(registerDocument.value);
    const digits = documentValue.replace(/\D/g, '');
    let firstInvalid = null;

    if (!name) {
      registerName.setAttribute('aria-invalid', 'true');
      document.querySelector('#register-name-error').textContent = 'Informe a razão social.';
      firstInvalid = registerName;
    }
    if (digits.length !== 14) {
      registerDocument.setAttribute('aria-invalid', 'true');
      document.querySelector('#register-document-error').textContent = 'Informe um CNPJ com 14 dígitos.';
      firstInvalid ??= registerDocument;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const duplicate = registerRecords.some((record) =>
      record.document === documentValue && record.uuid !== selectedRegisterId);
    if (duplicate) {
      registerDocument.setAttribute('aria-invalid', 'true');
      document.querySelector('#register-document-error').textContent = 'Este CNPJ já está cadastrado.';
      registerDocument.focus();
      return;
    }

    const wasEditing = registerMode === 'edit';
    if (wasEditing) {
      const record = registerRecords.find((item) => item.uuid === selectedRegisterId);
      if (!record) return;
      record.name = name;
      record.document = documentValue;
    } else {
      registerRecords.unshift({
        uuid: 'demo-' + String(nextRegisterNumber).padStart(3, '0'),
        name,
        document: documentValue,
        registeredAt: '26/09/2026',
      });
      nextRegisterNumber += 1;
    }

    registerMode = 'list';
    renderRegisters();
    registerFeedback.textContent = 'Cadastro demonstrativo ' + (wasEditing ? 'atualizado' : 'salvo') + '. Nenhum dado foi enviado.';
    closeWorkflowDialog(registerDialog);
  }

  document.addEventListener('click', (event) => {
    const unavailableLink = event.target.closest('a[aria-disabled="true"]');
    if (unavailableLink) {
      event.preventDefault();
      return;
    }

    const closeDialogButton = event.target.closest('[data-close-dialog]');
    if (closeDialogButton) {
      closeWorkflowDialog(closeDialogButton.closest('dialog'));
      return;
    }

    if (event.target.closest('#menu-toggle')) {
      setNavigationOpen(navToggle.getAttribute('aria-expanded') !== 'true');
      return;
    }

    const mainNavLink = event.target.closest('[data-nav]');
    if (mainNavLink) {
      event.preventDefault();
      navigate(mainNavLink.dataset.nav);
      return;
    }

    if (event.target.closest('#use-exchange-reference')) {
      if (exchangeReferenceRate && exchangeReferenceRate > activeExchangeQuote.rate) {
        exchangeAdjustment.value = formatExchangeInput(exchangeReferenceRate - activeExchangeQuote.rate);
        updateExchangeProposalPreview();
        document.querySelector('#exchange-proposal-feedback').hidden = true;
        openWorkflowDialog(exchangeProposalDialog, event.target.closest('#use-exchange-reference'), exchangeAdjustment);
      }
      return;
    }

    if (event.target.closest('#show-exchange-proposals')) {
      exchangeHistoryMode = 'proposals';
      renderExchangeHistory();
      return;
    }

    if (event.target.closest('#show-exchange-quotes')) {
      exchangeHistoryMode = 'quotes';
      renderExchangeHistory();
      return;
    }

    const exchangeAction = event.target.closest('[data-exchange-action]');
    if (exchangeAction) {
      const proposal = exchangeProposals.find((item) => item.code === exchangeAction.dataset.exchangeCode);
      if (exchangeAction.dataset.exchangeAction === 'approve') openExchangeApproval(proposal, exchangeAction);
      if (exchangeAction.dataset.exchangeAction === 'reject') openExchangeRejection(proposal, exchangeAction);
      return;
    }

    if (event.target.closest('#open-exchange-proposal')) {
      document.querySelector('#exchange-proposal-feedback').hidden = true;
      openWorkflowDialog(exchangeProposalDialog, event.target.closest('#open-exchange-proposal'), exchangeAdjustment);
      return;
    }

    if (event.target.closest('#confirm-exchange-rejection')) {
      rejectExchangeProposal();
      return;
    }

    if (event.target.closest('#confirm-exchange-action')) {
      const proposal = exchangeProposals.find((item) => item.code === exchangeDecisionPending);
      closeAlert(document.querySelector('#exchange-history-title'));
      approveExchangeProposal(proposal);
      return;
    }

    if (event.target.closest('#clear-statement-filters, [data-statement-action="clear"]')) {
      clearStatementFilters();
      return;
    }

    if (event.target.closest('#statement-prev') && statementPage > 1) {
      statementPage -= 1;
      renderStatement();
      document.querySelector('#statement-prev').focus();
      return;
    }

    if (event.target.closest('#statement-next') && statementPage < Math.ceil(statementMatches.length / Number(statementPageSize.value))) {
      statementPage += 1;
      renderStatement();
      document.querySelector('#statement-next').focus();
      return;
    }

    const registerAction = event.target.closest('[data-register-action]');
    if (registerAction) {
      if (registerAction.dataset.registerAction === 'back') {
        setRegisterMode('list', selectedRegisterId, registerAction);
      } else {
        setRegisterMode(registerAction.dataset.registerAction, registerAction.dataset.registerId, registerAction);
      }
      return;
    }

    if (event.target.closest('#new-register')) {
      setRegisterMode('create', null, event.target.closest('#new-register'));
      return;
    }

    if (event.target.closest('#open-batch-import')) {
      openWorkflowDialog(batchImportDialog, event.target.closest('#open-batch-import'), batchImportHeading);
      return;
    }

    if (event.target.closest('#clear-register-search') || event.target.closest('#clear-empty-search')) {
      registerSearch.value = '';
      registerPage = 1;
      renderRegisters();
      registerSearch.focus();
      return;
    }

    if (event.target.closest('#clear-batch-filters') || event.target.closest('#clear-empty-batch-filters')) {
      batchSearch.value = '';
      batchStatusFilter.value = 'all';
      batchPage = 1;
      renderBatches();
      batchSearch.focus();
      return;
    }

    if (event.target.closest('#batch-prev') && batchPage > 1) {
      batchPage -= 1;
      renderBatches();
      document.querySelector('#batch-prev').focus();
      return;
    }

    const batchNext = event.target.closest('#batch-next');
    if (batchNext && !batchNext.disabled) {
      batchPage += 1;
      renderBatches();
      batchNext.focus();
      return;
    }

    if (event.target.closest('#register-prev') && registerPage > 1) {
      registerPage -= 1;
      renderRegisters();
      document.querySelector('#register-prev').focus();
      return;
    }

    const registerNext = event.target.closest('#register-next');
    if (registerNext && !registerNext.disabled) {
      registerPage += 1;
      renderRegisters();
      registerNext.focus();
      return;
    }

    if (event.target.closest('#edit-register')) {
      setRegisterMode('edit', selectedRegisterId, event.target.closest('#edit-register'));
      return;
    }

    const batchAction = event.target.closest('[data-batch-action]');
    if (batchAction) {
      const action = batchAction.dataset.batchAction;
      if (action === 'cancel') {
        navigate('batches');
      } else if (action === 'back-list') {
        navigate('batches');
      } else if (action === 'request') {
        const batch = batchRecords.find((record) => record.code === selectedBatchId);
        if (batch) openSettlementConfirmation(batch);
      } else if (action === 'confirm-request') {
        const batch = batchRecords.find((record) => record.code === selectedBatchId);
        closeAlert();
        if (batch) submitSettlement(batch);
      } else if (action === 'simulate') {
        simulationFeedbackText = 'Simulação demonstrativa atualizada; nenhuma solicitação foi enviada.';
        renderBatchDetails();
        document.querySelector('#refresh-simulation').focus();
      } else if (action === 'back') {
        batchWizardStep = Math.max(1, batchWizardStep - 1);
        renderBatchWizard();
        document.querySelector(`#batch-step-${batchWizardStep}-title`).focus({ preventScroll: true });
      } else if (action === 'next' && batchWizardStep === 1) {
        batchMethod = document.querySelector('input[name="batch-method"]:checked').value;
        batchWizardStep = 2;
        importHasErrors = false;
        importedItems.splice(0);
        document.querySelector('#import-feedback').hidden = true;
        document.querySelector('#import-errors').hidden = true;
        document.querySelector('#import-items-region').hidden = true;
        renderBatchWizard();
        if (batchMethod === 'form') {
          document.querySelector('#batch-step-2-title').focus({ preventScroll: true });
        } else {
          openWorkflowDialog(batchImportDialog, batchAction, batchImportHeading, document.querySelector('#batch-step-2-title'));
        }
      } else if (action === 'next' && batchWizardStep === 2) {
        const eligible = batchMethod === 'form'
          ? batchItems.length > 0
          : importedItems.length > 0 && !importHasErrors;
        if (!eligible) return;
        batchWizardStep = 3;
        renderBatchWizard();
        document.querySelector('#batch-step-3-title').focus({ preventScroll: true });
      } else if (action === 'create') {
        createBatch();
      }
      return;
    }

    const openBatch = event.target.closest('[data-open-batch]');
    if (openBatch) {
      selectedBatchId = openBatch.dataset.openBatch;
      navigate('batch-detail');
      document.querySelector('#batch-detail-title').focus({ preventScroll: true });
      return;
    }

    const fileSample = event.target.closest('[data-file-sample]');
    if (fileSample) {
      setImportSample(fileSample.dataset.fileSample);
      return;
    }

    const removeBatchItem = event.target.closest('[data-remove-batch-item]');
    if (removeBatchItem) {
      batchItems.splice(Number(removeBatchItem.dataset.removeBatchItem), 1);
      renderBatchWizard();
      document.querySelector('#add-batch-item').focus();
      return;
    }

    const action = event.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'exchange' && activeScreen() === 'batch-detail') {
        exchangeReturnBatchId = selectedBatchId;
      }
      navigate(action.dataset.action);
      return;
    }

    if (event.target.closest('#sign-out')) {
      navigate('sign-in');
      return;
    }

    if (event.target.closest('#show-loading')) {
      loadingPanel.hidden = false;
      document.querySelector('#hide-loading').focus();
      return;
    }

    if (event.target.closest('#hide-loading')) {
      loadingPanel.hidden = true;
      document.querySelector('#show-loading').focus();
      return;
    }

    if (event.target.closest('#show-alert')) {
      document.querySelector('#warning-title').textContent = 'Aviso demonstrativo';
      document.querySelector('#warning-description').textContent = 'Este espaço representa um alerta de operação. Nenhuma solicitação real foi enviada.';
      openAlert(event.target.closest('#show-alert'));
      return;
    }

    if (event.target.closest('#dismiss-alert')) {
      closeAlert();
    }
  });

  warningDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAlert();
  });

  [batchImportDialog, registerDialog, exchangeProposalDialog].forEach((dialog) => {
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dialog === registerDialog) {
        registerMode = 'list';
        renderRegisters();
      }
      closeWorkflowDialog(dialog);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true' && !document.querySelector('dialog[open]')) {
      setNavigationOpen(false);
      navToggle.focus();
    }
  });

  routePicker.addEventListener('change', () => navigate(routePicker.value));
  rolePicker.addEventListener('change', render);
  exchangeValidityPicker.addEventListener('change', () => {
    if (activeScreen() === 'exchange') renderExchange();
    if (activeScreen() === 'dashboard') renderDashboard();
    if (activeScreen() === 'batch-detail') renderBatchDetails();
  });
  exchangeProposalForm.addEventListener('submit', submitExchangeProposal);
  exchangeAdjustment.addEventListener('input', () => {
    exchangeAdjustment.removeAttribute('aria-invalid');
    document.querySelector('#exchange-adjustment-error').textContent = '';
    updateExchangeProposalPreview();
  });
  exchangeProposalReason.addEventListener('input', () => {
    exchangeProposalReason.removeAttribute('aria-invalid');
    document.querySelector('#exchange-proposal-reason-error').textContent = '';
  });
  document.querySelector('#exchange-rejection-reason').addEventListener('input', (event) => {
    event.target.removeAttribute('aria-invalid');
    document.querySelector('#exchange-rejection-error').textContent = '';
  });
  statementFilterForm.addEventListener('submit', submitStatementFilters);
  statementPageSize.addEventListener('change', () => {
    statementPage = 1;
    renderStatement();
  });
  statementPageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    statementPage = Number(statementPageInput.value);
    renderStatement();
    statementPageInput.focus({ preventScroll: true });
  });
  batchPageSizePicker.addEventListener('change', () => {
    batchPage = 1;
    renderBatches();
  });
  batchPageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    batchPage = Number(batchPageInput.value);
    renderBatches();
    batchPageInput.focus({ preventScroll: true });
  });
  registerPageSizePicker.addEventListener('change', () => {
    registerPage = 1;
    renderRegisters();
  });
  registerPageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    registerPage = Number(registerPageInput.value);
    renderRegisters();
    registerPageInput.focus({ preventScroll: true });
  });
  [statementStartDate, statementEndDate].forEach((input) => input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    document.querySelector(`#${input.id.replace('-date', '')}-error`).textContent = '';
  }));
  batchSearch.addEventListener('input', () => {
    batchPage = 1;
    renderBatches();
  });
  batchStatusFilter.addEventListener('change', () => {
    batchPage = 1;
    renderBatches();
  });
  batchItemForm.addEventListener('submit', addManualBatchItem);
  batchWizard.addEventListener('change', (event) => {
    const method = event.target.closest('input[name="batch-method"]');
    if (method) {
      batchMethod = method.value;
      importHasErrors = false;
      importedItems.splice(0);
      document.querySelector('#import-feedback').hidden = true;
      document.querySelector('#import-errors').hidden = true;
      document.querySelector('#import-items-region').hidden = true;
      renderBatchWizard();
      return;
    }
    const currency = event.target.closest('[data-import-currency]');
    if (currency) {
      const item = importedItems.find((record) => record.reference === currency.dataset.importCurrency);
      if (item) item.currency = currency.value;
    }
    if (event.target.matches('#item-cedent, #item-due-date')) {
      event.target.removeAttribute('aria-invalid');
      document.querySelector(`#${event.target.id}-error`).textContent = '';
    }
  });
  [itemReference, itemDueDate].forEach((input) => input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    document.querySelector(`#${input.id}-error`).textContent = '';
  }));
  itemCedent.addEventListener('change', () => {
    itemCedent.removeAttribute('aria-invalid');
    document.querySelector('#item-cedent-error').textContent = '';
  });
  itemFaceValue.addEventListener('input', () => {
    const digitCount = itemFaceValue.value.slice(0, itemFaceValue.selectionStart ?? itemFaceValue.value.length).replace(/\D/g, '').length;
    const cents = readCents(itemFaceValue.value);
    const formatted = cents > 0n ? formatCents(cents) : '';
    itemFaceValue.value = formatted;
    const caret = positionAfterDigits(formatted, digitCount);
    itemFaceValue.setSelectionRange(caret, caret);
    itemFaceValue.removeAttribute('aria-invalid');
    document.querySelector('#item-face-value-error').textContent = '';
  });
  registerSearch.addEventListener('input', () => {
    registerPage = 1;
    renderRegisters();
  });
  registerForm.addEventListener('submit', submitRegister);
  registerDocument.addEventListener('input', () => {
    const digitCount = registerDocument.value.slice(0, registerDocument.selectionStart ?? registerDocument.value.length)
      .replace(/\D/g, '').length;
    const formatted = formatCnpj(registerDocument.value);
    registerDocument.value = formatted;
    const caret = positionAfterDigits(formatted, digitCount);
    registerDocument.setSelectionRange(caret, caret);
    registerDocument.removeAttribute('aria-invalid');
    document.querySelector('#register-document-error').textContent = '';
  });
  registerName.addEventListener('input', () => {
    registerName.removeAttribute('aria-invalid');
    document.querySelector('#register-name-error').textContent = '';
  });
  periodFilter.addEventListener('change', renderDashboard);
  currencyFilter.addEventListener('change', renderDashboard);
  dashboardStatePicker.addEventListener('change', () => {
    renderDashboard();
    if (dashboardStatePicker.value === 'unavailable' && activeScreen() === 'dashboard') {
      document.querySelector('#warning-title').textContent = 'Não foi possível atualizar os dados';
      document.querySelector('#warning-description').textContent = 'A consulta falhou. As informações carregadas anteriormente continuam visíveis.';
      openAlert(dashboardStatePicker);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSettlementPolling();
      return;
    }
    const batch = batchRecords.find((record) => record.code === selectedBatchId);
    if (activeScreen() === 'batch-detail' && batch?.status === 'pending') startSettlementPolling(batch);
  });
  navigationViewport.addEventListener('change', (event) => setNavigationOpen(event.matches));
  setNavigationOpen(navigationViewport.matches);
  window.addEventListener('hashchange', render);
  render();
})();
