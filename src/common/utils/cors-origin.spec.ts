import { createCorsOriginChecker } from './cors-origin';

describe('CORS origin checker', () => {
  it('allows loopback hosts on changing development ports', () => {
    const isAllowed = createCorsOriginChecker(
      'http://localhost:5173',
      'development',
    );

    expect(isAllowed('http://localhost:5174')).toBe(true);
    expect(isAllowed('http://127.0.0.1:5174')).toBe(true);
    expect(isAllowed('http://[::1]:5174')).toBe(true);
  });

  it('uses only the configured allowlist in production', () => {
    const isAllowed = createCorsOriginChecker(
      'https://theread.example,https://admin.theread.example',
      'production',
    );

    expect(isAllowed('https://theread.example')).toBe(true);
    expect(isAllowed('https://admin.theread.example')).toBe(true);
    expect(isAllowed('http://127.0.0.1:5174')).toBe(false);
    expect(isAllowed('https://evil.example')).toBe(false);
  });

  it('allows requests without an Origin header', () => {
    const isAllowed = createCorsOriginChecker(undefined, 'production');
    expect(isAllowed(undefined)).toBe(true);
  });
});
