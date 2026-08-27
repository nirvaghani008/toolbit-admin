import DodoPayments from 'dodopayments';

export function isDodoTestMode(): boolean {
  const mode = process.env.NEXT_PUBLIC_DODO_MODE;
  const explicitlyTest = mode === 'test_mode' || mode === 'test';

  if (mode === 'live_mode' || mode === 'live') return false;
  if (explicitlyTest) return true;
  return process.env.NODE_ENV !== 'production';
}

export function getDodoApiKey(): string {
  const isTest = isDodoTestMode();
  const apiKey = isTest
    ? (process.env.DODO_PAYMENTS_TEST_API_KEY || process.env.DODO_PAYMENTS_API_KEY)
    : (process.env.DODO_PAYMENTS_LIVE_API_KEY || process.env.DODO_PAYMENTS_API_KEY);

  if (!apiKey) {
    throw new Error(
      isTest
        ? 'DODO_PAYMENTS_TEST_API_KEY (or DODO_PAYMENTS_API_KEY) is not configured in environment.'
        : 'DODO_PAYMENTS_LIVE_API_KEY (or DODO_PAYMENTS_API_KEY) is not configured in environment.'
    );
  }
  return apiKey;
}

export function getDodoClient() {
  const isTest = isDodoTestMode();
  const apiKey = getDodoApiKey();

  return new DodoPayments({
    bearerToken: apiKey,
    environment: isTest ? 'test_mode' : 'live_mode',
  });
}
