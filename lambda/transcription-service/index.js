/**
 * Transcription Service Lambda Function
 * Orchestrates AWS Transcribe for speech-to-text conversion with caching
 * 
 * Requirements: 1.2, 1.5, 1.7, 5.8, 6.1
 */

const { TranscribeClient, StartStreamTranscriptionCommand, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Initialize AWS clients
const transcribeClient = new TranscribeClient({ region: process.env.TRANSCRIBE_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const CACHE_TABLE = process.env.CACHE_TABLE;
const SUPPORTED_LANGUAGES = (process.env.SUPPORTED_LANGUAGES || 'en,es,fr,de,zh').split(',');
const CACHE_TTL_HOURS = 24;

/**
 * Lambda handler for transcription requests
 */
exports.handler = async (event) => {
  console.log('Transcription Service invoked', { event });

  try {
    // Handle WebSocket connection
    if (event.requestContext && event.requestContext.routeKey === '$connect') {
      return handleConnect(event);
    }

    // Handle WebSocket disconnection
    if (event.requestContext && event.requestContext.routeKey === '$disconnect') {
      return handleDisconnect(event);
    }

    // Handle transcription request
    if (event.requestContext && event.requestContext.routeKey === 'transcribe') {
      return await handleTranscribe(event);
    }

    // Handle batch transcription (REST API)
    if (event.httpMethod === 'POST' && event.path === '/transcribe/batch') {
      return await handleBatchTranscribe(event);
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request type',
          retryable: false
        }
      })
    };

  } catch (error) {
    console.error('Error in transcription service:', error);
    return handleError(error);
  }
};

/**
 * Handle WebSocket connection
 */
function handleConnect(event) {
  console.log('WebSocket connection established', {
    connectionId: event.requestContext.connectionId
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Connected' })
  };
}

/**
 * Handle WebSocket disconnection
 */
function handleDisconnect(event) {
  console.log('WebSocket connection closed', {
    connectionId: event.requestContext.connectionId
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Disconnected' })
  };
}

/**
 * Handle streaming transcription via WebSocket
 */
async function handleTranscribe(event) {
  const body = JSON.parse(event.body);
  const { audioChunk, language, sessionId } = body.data;

  // Validate language
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'UNSUPPORTED_LANGUAGE',
          message: `Language "${language}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
          retryable: false
        }
      })
    };
  }

  // Check cache
  const audioHash = hashAudio(audioChunk);
  const cached = await checkCache(audioHash);
  
  if (cached) {
    console.log('Cache hit for audio hash:', audioHash);
    return {
      statusCode: 200,
      body: JSON.stringify({
        action: 'result',
        data: {
          text: cached.text,
          isFinal: true,
          confidence: cached.confidence,
          cacheHit: true
        }
      })
    };
  }

  // TODO: Implement actual AWS Transcribe streaming
  // For now, return placeholder response
  const result = {
    text: 'Transcription placeholder',
    isFinal: false,
    confidence: 0.95,
    timestamp: Date.now()
  };

  // Store in cache
  await storeCache(audioHash, result);

  return {
    statusCode: 200,
    body: JSON.stringify({
      action: 'result',
      data: {
        ...result,
        cacheHit: false
      }
    })
  };
}

/**
 * Handle batch transcription (50% cost savings)
 */
async function handleBatchTranscribe(event) {
  const body = JSON.parse(event.body);
  const { audioUrl, language, userId } = body;

  // Validate language
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'UNSUPPORTED_LANGUAGE',
          message: `Language "${language}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
          retryable: false
        }
      })
    };
  }

  // TODO: Implement AWS Transcribe batch job
  // For now, return placeholder response
  const jobId = `batch-${Date.now()}`;

  return {
    statusCode: 202,
    body: JSON.stringify({
      jobId,
      status: 'IN_PROGRESS',
      message: 'Batch transcription job started'
    })
  };
}

/**
 * Hash audio data for cache lookup
 */
function hashAudio(audioData) {
  return crypto.createHash('sha256').update(audioData).digest('hex');
}

/**
 * Check cache for transcription result
 */
async function checkCache(audioHash) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CACHE_TABLE,
      Key: {
        PK: `CACHE#transcription#${audioHash}`,
        SK: 'CACHE'
      }
    }));

    if (result.Item && result.Item.ttl > Math.floor(Date.now() / 1000)) {
      return result.Item.value;
    }

    return null;
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

/**
 * Store transcription result in cache
 */
async function storeCache(audioHash, result) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (CACHE_TTL_HOURS * 3600);

    await docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        PK: `CACHE#transcription#${audioHash}`,
        SK: 'CACHE',
        value: result,
        ttl,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        size: JSON.stringify(result).length
      }
    }));

    console.log('Stored transcription in cache:', audioHash);
  } catch (error) {
    console.error('Error storing cache:', error);
  }
}

/**
 * Handle errors and return appropriate response
 */
function handleError(error) {
  console.error('Error:', error);

  // AWS Transcribe unavailable
  if (error.name === 'ServiceUnavailableException') {
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: {
          code: 'TRANSCRIBE_UNAVAILABLE',
          message: 'Speech transcription service is temporarily unavailable',
          retryable: true,
          retryAfter: 60
        },
        requestId: error.requestId,
        timestamp: Date.now()
      })
    };
  }

  // Lambda timeout
  if (error.name === 'TimeoutError') {
    return {
      statusCode: 504,
      headers: {
        'Retry-After': '10'
      },
      body: JSON.stringify({
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true,
          retryAfter: 10
        },
        requestId: error.requestId,
        timestamp: Date.now()
      })
    };
  }

  // Generic error
  return {
    statusCode: 500,
    body: JSON.stringify({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        retryable: true
      },
      requestId: error.requestId,
      timestamp: Date.now()
    })
  };
}
