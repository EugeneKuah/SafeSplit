const { pool } = require('../config/db');

// Curated subset of ISO 4217 codes exposed in the UI/API. All of these are
// covered by the rate provider (api.frankfurter.dev, ECB-sourced data) —
// this list exists to keep the dropdown small and to give isSupportedCurrency()
// something concrete to validate against, not because the provider is
// limited to these.
const SUPPORTED_CURRENCIES = [
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' }
];

const SUPPORTED_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

// No API key required — see RATE_PROVIDER_URL in .env.example if this ever
// needs to point at a self-hosted instance or a different provider.
const RATE_PROVIDER_BASE = process.env.RATE_PROVIDER_URL || 'https://api.frankfurter.dev/v2';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, matches exchange_rates.expires_at

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isSupportedCurrency(code) {
  return typeof code === 'string' && SUPPORTED_CODES.includes(code.toUpperCase());
}

async function fetchLiveRate(from, to) {
  let response;
  try {
    response = await fetch(`${RATE_PROVIDER_BASE}/rate/${from}/${to}`);
  } catch (err) {
    const wrapped = new Error('Exchange rate provider is unreachable');
    wrapped.status = 502;
    throw wrapped;
  }

  if (!response.ok) {
    const err = new Error('Exchange rate provider could not price this currency pair');
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  if (typeof data.rate !== 'number' || !Number.isFinite(data.rate)) {
    const err = new Error('Exchange rate provider returned an unexpected response');
    err.status = 502;
    throw err;
  }
  return data.rate;
}

// Backs ICurrencyService.GetRate() — checks the persisted exchange_rates
// cache first (RateCache in the class diagram is this same idea, just
// expressed as a table rather than an in-memory store, per the note in
// schema.sql) and only calls out to the live provider on a cache miss,
// upserting the result so every other request for this pair within the
// TTL is a DB read, not a network call.
async function getRate(from, to) {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  if (fromCode === toCode) return 1;

  const cached = await pool.query(
    'SELECT rate FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND expires_at > NOW()',
    [fromCode, toCode]
  );
  if (cached.rowCount === 1) return Number(cached.rows[0].rate);

  const rate = await fetchLiveRate(fromCode, toCode);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

  await pool.query(
    `INSERT INTO exchange_rates (from_currency, to_currency, rate, fetched_at, expires_at)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (from_currency, to_currency)
     DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [fromCode, toCode, rate, expiresAt]
  );

  return rate;
}

// Backs ICurrencyService.Convert() — used both for the live preview the
// frontend asks for while someone is filling in the Add Expense form, and
// internally by expenseService when it computes converted_amount server-side.
async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  return round2(amount * rate);
}

module.exports = {
  SUPPORTED_CURRENCIES,
  SUPPORTED_CODES,
  isSupportedCurrency,
  getRate,
  convert,
  round2
};
