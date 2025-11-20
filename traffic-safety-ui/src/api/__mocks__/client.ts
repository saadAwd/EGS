// Mock API client for tests
const mockApiClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  defaults: {
    baseURL: 'http://localhost:8000',
  },
};

export default mockApiClient;

