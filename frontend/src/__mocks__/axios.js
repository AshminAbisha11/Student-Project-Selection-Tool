// CommonJS-style so Jest can load it without ESM transforms
const axiosMock = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  create: jest.fn(function () {
    return axiosMock; // axios.create() returns the same mocked client
  }),
  // If you use interceptors anywhere:
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
};

module.exports = axiosMock;
