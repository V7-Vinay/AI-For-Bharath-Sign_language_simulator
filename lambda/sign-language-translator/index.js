/**
 * Sign Language Translator Lambda Function
 * Converts text to sign language animation sequences using lightweight models
 * 
 * Requirements: 2.1, 2.2, 2.6, 6.2
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Initialize AWS clients
const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const MODEL_BUCKET = process.env.MODEL_BUCKET;
const CACHE_TABLE = process.env.CACHE_TABLE;
const SUPPORTED_SIGN_LANGUAGES = (process.env.SUPPORTED_SIGN_LANGUAGES || 'ASL,BSL').split(',');
const CACHE_TTL_DAYS = 7;
const MAX_MODEL_SIZE_MB = 100;

// In-memory model cache (persists across warm Lambda invocations)
const modelCache = new Map();

/**
 * Lambda handler for sign language translation requests
 */
exports.handler = async (event) => {
  console.log('Sign Language Translator invoked', { event });

  try {
    // Parse request body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { text, targetLanguage, userId } = body;

    // Validate inputs
    if (!text || !targetLanguage || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: text, targetLanguage, userId',
            retryable: false
          }
        })
      };
    }

    // Validate language support
    if (!SUPPORTED_SIGN_LANGUAGES.includes(targetLanguage)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            code: 'UNSUPPORTED_LANGUAGE',
            message: `Sign language "${targetLanguage}" is not supported. Supported: ${SUPPORTED_SIGN_LANGUAGES.join(', ')}`,
            retryable: false
          }
        })
      };
    }

    // Validate text length
    if (text.length > 1000) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            code: 'TEXT_TOO_LONG',
            message: 'Text exceeds maximum length of 1000 characters',
            retryable: false
          }
        })
      };
    }

    const startTime = Date.now();

    // Check cache first
    const textHash = hashText(text, targetLanguage);
    const cached = await checkCache(textHash);
    
    if (cached) {
      console.log('Cache hit for text hash:', textHash);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          animationSequence: cached,
          cacheHit: true,
          processingTime: Date.now() - startTime,
          estimatedCost: 0
        })
      };
    }

    // Load model (from cache or S3)
    const model = await loadModel(targetLanguage);

    // Generate animation sequence
    const animationSequence = await generateAnimation(text, targetLanguage, model);

    // Store in cache
    await storeCache(textHash, animationSequence);

    const processingTime = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        animationSequence,
        cacheHit: false,
        processingTime,
        estimatedCost: calculateCost(processingTime)
      })
    };

  } catch (error) {
    console.error('Error in sign language translator:', error);
    return handleError(error);
  }
};

/**
 * Hash text for cache lookup
 */
function hashText(text, language) {
  return crypto.createHash('sha256')
    .update(`${text}:${language}`)
    .digest('hex');
}

/**
 * Check cache for animation sequence
 */
async function checkCache(textHash) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CACHE_TABLE,
      Key: {
        PK: `CACHE#animation#${textHash}`,
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
 * Store animation sequence in cache
 */
async function storeCache(textHash, animationSequence) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + (CACHE_TTL_DAYS * 24 * 3600);

    await docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        PK: `CACHE#animation#${textHash}`,
        SK: 'CACHE',
        value: animationSequence,
        ttl,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        size: JSON.stringify(animationSequence).length
      }
    }));

    console.log('Stored animation in cache:', textHash);
  } catch (error) {
    console.error('Error storing cache:', error);
  }
}

/**
 * Load sign language model from S3 or cache
 * Requirements: 2.6 (Model size < 100MB)
 */
async function loadModel(language) {
  // Check in-memory cache first
  if (modelCache.has(language)) {
    console.log('Model loaded from memory cache:', language);
    return modelCache.get(language);
  }

  try {
    const modelKey = `models/${language.toLowerCase()}-lightweight-v1.bin`;
    
    console.log('Loading model from S3:', modelKey);
    
    const command = new GetObjectCommand({
      Bucket: MODEL_BUCKET,
      Key: modelKey
    });

    const response = await s3Client.send(command);
    
    // Check model size (Requirement: 2.6)
    const contentLength = response.ContentLength;
    const sizeInMB = contentLength / (1024 * 1024);
    
    if (sizeInMB > MAX_MODEL_SIZE_MB) {
      throw new Error(`Model size ${sizeInMB.toFixed(2)}MB exceeds maximum ${MAX_MODEL_SIZE_MB}MB`);
    }

    // Read model data
    const modelData = await streamToBuffer(response.Body);
    
    // Parse model (simplified - actual model would be more complex)
    const model = {
      language,
      version: 'v1',
      size: contentLength,
      vocabulary: generateVocabulary(language),
      weights: modelData,
      metadata: {
        trainedOn: new Date('2024-01-01'),
        accuracy: 0.92,
        supportedGestures: 500,
        averageInferenceTime: 50
      }
    };

    // Store in memory cache for subsequent invocations
    modelCache.set(language, model);
    
    console.log(`Model loaded successfully: ${language} (${sizeInMB.toFixed(2)}MB)`);
    
    return model;

  } catch (error) {
    console.error('Error loading model:', error);
    throw new Error(`Failed to load sign language model: ${error.message}`);
  }
}

/**
 * Generate animation sequence from text
 * Requirements: 2.1, 2.2
 */
async function generateAnimation(text, targetLanguage, model) {
  console.log(`Generating animation for: "${text}" in ${targetLanguage}`);

  // Tokenize text into words
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0);

  // Generate animation frames for each word
  const frames = [];
  let currentTime = 0;

  for (const word of words) {
    const wordFrames = generateWordAnimation(word, targetLanguage, model, currentTime);
    frames.push(...wordFrames);
    currentTime += wordFrames.length * (1000 / 30); // 30 FPS
  }

  // Calculate complexity based on word count and unique gestures
  const complexity = words.length < 5 ? 'simple' : 
                    words.length < 15 ? 'moderate' : 'complex';

  return {
    sequenceId: `seq-${Date.now()}`,
    frames,
    duration: currentTime,
    language: targetLanguage,
    sourceText: text,
    metadata: {
      wordCount: words.length,
      complexity,
      generatedAt: new Date().toISOString(),
      cacheKey: hashText(text, targetLanguage)
    }
  };
}

/**
 * Generate animation frames for a single word
 */
function generateWordAnimation(word, language, model, startTime) {
  const frames = [];
  const framesPerWord = 30; // 1 second at 30 FPS
  
  // Check if word is in vocabulary
  const inVocabulary = model.vocabulary.includes(word);
  
  if (!inVocabulary) {
    // Generate fingerspelling for unknown words
    return generateFingerspelling(word, language, startTime);
  }

  // Generate gesture animation for known word
  for (let i = 0; i < framesPerWord; i++) {
    const progress = i / framesPerWord;
    
    frames.push({
      frameNumber: frames.length,
      timestamp: startTime + (i * (1000 / 30)),
      joints: generateJointPositions(word, progress, language),
      facialExpression: generateFacialExpression(word, progress),
      handShape: generateHandShape(word, progress, language)
    });
  }

  return frames;
}

/**
 * Generate fingerspelling animation for unknown words
 */
function generateFingerspelling(word, language, startTime) {
  const frames = [];
  const framesPerLetter = 15; // 0.5 seconds per letter at 30 FPS
  
  for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
    const letter = word[letterIdx];
    
    for (let i = 0; i < framesPerLetter; i++) {
      const progress = i / framesPerLetter;
      
      frames.push({
        frameNumber: frames.length,
        timestamp: startTime + ((letterIdx * framesPerLetter + i) * (1000 / 30)),
        joints: generateFingerspellingJoints(letter, progress, language),
        facialExpression: { eyebrows: 0, eyes: 0, mouth: 0, intensity: 0.3 },
        handShape: { left: 'neutral', right: `letter-${letter}` }
      });
    }
  }

  return frames;
}

/**
 * Generate joint positions for animation frame
 */
function generateJointPositions(word, progress, language) {
  // Simplified joint generation - actual implementation would use model weights
  const basePositions = {
    'shoulder_left': { x: -0.3, y: 0.5, z: 0 },
    'shoulder_right': { x: 0.3, y: 0.5, z: 0 },
    'elbow_left': { x: -0.4, y: 0.2, z: 0.1 },
    'elbow_right': { x: 0.4, y: 0.2, z: 0.1 },
    'wrist_left': { x: -0.3, y: 0, z: 0.2 },
    'wrist_right': { x: 0.3, y: 0, z: 0.2 },
    'head': { x: 0, y: 0.8, z: 0 }
  };

  const joints = [];
  
  for (const [jointId, position] of Object.entries(basePositions)) {
    // Apply animation curve
    const offset = Math.sin(progress * Math.PI) * 0.1;
    
    joints.push({
      jointId,
      position: {
        x: position.x + offset,
        y: position.y,
        z: position.z
      },
      rotation: {
        x: 0,
        y: 0,
        z: 0,
        w: 1
      }
    });
  }

  return joints;
}

/**
 * Generate fingerspelling joint positions
 */
function generateFingerspellingJoints(letter, progress, language) {
  // Simplified - actual implementation would have specific positions per letter
  return generateJointPositions(letter, progress, language);
}

/**
 * Generate facial expression for animation frame
 */
function generateFacialExpression(word, progress) {
  // Simplified facial expression generation
  const intensity = Math.sin(progress * Math.PI) * 0.5;
  
  return {
    eyebrows: intensity * 0.3,
    eyes: intensity * 0.2,
    mouth: intensity * 0.4,
    intensity
  };
}

/**
 * Generate hand shape for animation frame
 */
function generateHandShape(word, progress, language) {
  // Simplified hand shape generation
  const shapes = ['open', 'closed', 'pointing', 'flat', 'curved'];
  const shapeIndex = Math.floor(progress * shapes.length);
  
  return {
    left: shapes[shapeIndex % shapes.length],
    right: shapes[(shapeIndex + 1) % shapes.length]
  };
}

/**
 * Generate vocabulary for a language
 */
function generateVocabulary(language) {
  // Simplified vocabulary - actual implementation would load from model
  const commonWords = [
    'hello', 'goodbye', 'thank', 'you', 'please', 'sorry', 'yes', 'no',
    'help', 'need', 'want', 'have', 'go', 'come', 'see', 'hear',
    'speak', 'understand', 'know', 'think', 'feel', 'like', 'love',
    'good', 'bad', 'happy', 'sad', 'angry', 'afraid', 'tired',
    'eat', 'drink', 'sleep', 'work', 'play', 'learn', 'teach',
    'family', 'friend', 'person', 'child', 'man', 'woman',
    'time', 'day', 'night', 'today', 'tomorrow', 'yesterday',
    'where', 'when', 'what', 'who', 'why', 'how'
  ];
  
  return commonWords;
}

/**
 * Convert stream to buffer
 */
async function streamToBuffer(stream) {
  const chunks = [];
  
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

/**
 * Calculate estimated cost for translation
 */
function calculateCost(processingTimeMs) {
  // Lambda cost calculation (simplified)
  const lambdaCostPerMs = 0.0000000021; // $0.0000000021 per ms for 512MB
  const cost = processingTimeMs * lambdaCostPerMs;
  
  return parseFloat(cost.toFixed(8));
}

/**
 * Handle errors and return appropriate response
 */
function handleError(error) {
  console.error('Error:', error);

  // Model loading failure
  if (error.message.includes('Failed to load')) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: {
          code: 'MODEL_LOAD_FAILED',
          message: 'Failed to load sign language model',
          retryable: true,
          retryAfter: 30
        },
        requestId: error.requestId,
        timestamp: Date.now()
      })
    };
  }

  // Model size exceeded
  if (error.message.includes('exceeds maximum')) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          code: 'MODEL_TOO_LARGE',
          message: error.message,
          retryable: false
        },
        requestId: error.requestId,
        timestamp: Date.now()
      })
    };
  }

  // Generic error with text fallback
  return {
    statusCode: 500,
    body: JSON.stringify({
      error: {
        code: 'ANIMATION_GENERATION_FAILED',
        message: 'Animation generation failed, displaying text instead',
        retryable: false,
        details: { fallbackMode: 'text' }
      },
      requestId: error.requestId,
      timestamp: Date.now()
    })
  };
}
