/**
 * Health Check Lambda Function
 * Provides health status for the API
 * 
 * Requirement: 13.3 (Response time < 200ms)
 */

exports.handler = async (event) => {
  const startTime = Date.now();

  try {
    // Basic health check - just return healthy status
    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: [
        {
          service: 'api-gateway',
          status: 'up',
          latency: Date.now() - startTime
        },
        {
          service: 'lambda',
          status: 'up',
          latency: Date.now() - startTime
        }
      ],
      budgetStatus: {
        status: 'normal',
        message: 'Budget monitoring active'
      },
      version: '1.0.0'
    };

    const responseTime = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Response-Time': `${responseTime}ms`
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Health check error:', error);

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      })
    };
  }
};
