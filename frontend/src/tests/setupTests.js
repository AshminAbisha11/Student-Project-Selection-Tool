// src/setupTests.js
import '@testing-library/jest-dom';

// ---- Polyfills needed for MSW / interceptors in Node/Jest ----
import { TextEncoder, TextDecoder } from 'util';
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// If you ever stub fetch in components, this helps in Node envs:
// import 'whatwg-fetch';

// ---- MSW test server lifecycle (optional but recommended) ----
import { server } from './tests/__mocks__/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
