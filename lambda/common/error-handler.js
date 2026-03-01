/**
 * Common error handler for Lambda functions
 * Provides consistent error responses with retry logic
 */

class AppError extends Error {
  constructor(message, statusCode, retryable = false) {
    super(message);
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RetryableError extends AppError {
  constructor(message, statusCode = 503) {
    super(message, statusCode, true);
  }
}

class NonRetryableError extends AppError {
  constructor(message, statusCode = 400) {
    super(message, statusCode, false);
  }
}

/**
 * Exponential backoff retry logic
 */
async function retryWithExponentialBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (error.retryable === false) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000; // Add jitter
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay + jitter}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError;
}

/**
 * Circuit breaker pattern
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new RetryableError('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

/**
 * Format error response
 */
function formatErrorResponse(error) {
  const statusCode = error.statusCode || 500;
  const retryable = error.retryable || false;
  
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error: {
        code: error.name || 'InternalError',
        message: error.message || 'An unexpected error occurred',
        retryable
      }
    })
  };
  
  // Add retry-after header for retryable errors
  if (retryable) {
    response.headers['Retry-After'] = '5';
  }
  
  return response;
}

/**
 * Lambda error handler wrapper
 */
function withErrorHandler(handler) {
  return async (event, context) => {
    try {
      return await handler(event, context);
    } catch (error) {
      console.error('Error:', error);
      return formatErrorResponse(error);
    }
  };
}

module.exports = {
  AppError,
  RetryableError,
  NonRetryableError,
  retryWithExponentialBackoff,
  CircuitBreaker,
  formatErrorResponse,
  withErrorHandler
};
