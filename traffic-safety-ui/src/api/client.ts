import axios from 'axios';
import { getBackendUrl } from '../utils/backendConfig';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: getBackendUrl(),
  // Keep request headers SIMPLE to avoid CORS preflight on every poll
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    // Add timestamp to GET requests to prevent caching
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: new Date().getTime()
      };
    }
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and retry logic
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    const { config } = error;
    
    // Only retry on timeout errors and GET requests
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout') && config.method === 'get') {
      config.retry = config.retry || 0;
      
      if (config.retry < 3) {
        config.retry += 1;
        console.log(`Retrying request (${config.retry}/3)...`);
        
        // Add exponential delay
        const delay = config.retry * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return apiClient(config);
      }
    }
    
    console.error('API Response Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

// Test function to verify backend connectivity
export const testBackendConnection = async () => {
  try {
    console.log('🔗 Testing backend connection to port 8002...');
    // Use the dedicated test connection endpoint
    const response = await apiClient.get('/test-connection');
    console.log('✅ Backend connection successful:', response.status);
    return { connected: true, status: response.status, data: response.data };
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    throw error;
  }
};

export default apiClient; 