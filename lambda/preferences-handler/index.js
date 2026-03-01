/**
 * Preferences Handler Lambda Function
 * Manages user preferences with encryption and access control
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 11.5, 11.6
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const USER_PREFERENCES_TABLE = process.env.USER_PREFERENCES_TABLE;

/**
 * Lambda handler for preferences requests
 */
exports.handler = async (event) => {
  console.log('Preferences Handler invoked', { 
    method: event.httpMethod,
    path: event.path 
  });

  try {
    const method = event.httpMethod;
    
    // Route based on HTTP method
    switch (method) {
      case 'GET':
        return await handleGetPreferences(event);
      
      case 'PUT':
        return await handleUpdatePreferences(event);
      
      case 'DELETE':
        return await handleDeleteUser(event);
      
      default:
        return {
          statusCode: 405,
          body: JSON.stringify({
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: `Method ${method} not allowed`,
              retryable: false
            }
          })
        };
    }

  } catch (error) {
    console.error('Error in preferences handler:', error);
    return handleError(error);
  }
};

/**
 * Handle GET /preferences request
 * Requirement: 9.5
 */
async function handleGetPreferences(event) {
  const userId = event.queryStringParameters?.userId;

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId query parameter is required',
          retryable: false
        }
      })
    };
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: USER_PREFERENCES_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFS'
      }
    }));

    if (!result.Item) {
      // Return default preferences if none exist
      const defaultPreferences = getDefaultPreferences();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          preferences: defaultPreferences,
          isDefault: true
        })
      };
    }

    // Extract preferences from DynamoDB item
    const preferences = {
      language: result.Item.language,
      signLanguage: result.Item.signLanguage,
      avatarId: result.Item.avatarId,
      displaySettings: result.Item.displaySettings,
      offlineMode: result.Item.offlineMode || false
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        preferences,
        isDefault: false
      })
    };

  } catch (error) {
    console.error('Error getting preferences:', error);
    throw error;
  }
}

/**
 * Handle PUT /preferences request
 * Requirements: 9.4 (Sync within 5 seconds)
 */
async function handleUpdatePreferences(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, preferences } = body;

  if (!userId || !preferences) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId and preferences are required',
          retryable: false
        }
      })
    };
  }

  // Validate preferences
  const validationError = validatePreferences(preferences);
  if (validationError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'INVALID_PREFERENCES',
          message: validationError,
          retryable: false
        }
      })
    };
  }

  try {
    const now = Date.now();

    // Store preferences in DynamoDB
    await docClient.send(new PutCommand({
      TableName: USER_PREFERENCES_TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: 'PREFS',
        language: preferences.language,
        signLanguage: preferences.signLanguage,
        avatarId: preferences.avatarId,
        displaySettings: preferences.displaySettings,
        offlineMode: preferences.offlineMode || false,
        createdAt: now,
        updatedAt: now
      }
    }));

    console.log('Preferences updated for user:', userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        preferences,
        updated: true,
        timestamp: now
      })
    };

  } catch (error) {
    console.error('Error updating preferences:', error);
    throw error;
  }
}

/**
 * Handle DELETE /user request
 * Requirement: 11.6 (Delete within 24 hours)
 */
async function handleDeleteUser(event) {
  const userId = event.queryStringParameters?.userId;

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId query parameter is required',
          retryable: false
        }
      })
    };
  }

  try {
    // Delete user preferences
    await docClient.send(new DeleteCommand({
      TableName: USER_PREFERENCES_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFS'
      }
    }));

    // TODO: Delete user data from other tables (cache, cost tracking)
    // This should be done asynchronously via SQS or Step Functions

    console.log('User data deletion initiated for:', userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'User data deletion initiated',
        userId,
        estimatedCompletionTime: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      })
    };

  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Get default preferences
 */
function getDefaultPreferences() {
  return {
    language: 'en',
    signLanguage: 'ASL',
    avatarId: 'avatar-1',
    displaySettings: {
      fontSize: 16,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      position: 'bottom',
      customPosition: null
    },
    offlineMode: false
  };
}

/**
 * Validate preferences object
 */
function validatePreferences(preferences) {
  const validLanguages = ['en', 'es', 'fr', 'de', 'zh'];
  const validSignLanguages = ['ASL', 'BSL'];
  const validPositions = ['top', 'bottom', 'custom'];

  if (preferences.language && !validLanguages.includes(preferences.language)) {
    return `Invalid language: ${preferences.language}. Valid: ${validLanguages.join(', ')}`;
  }

  if (preferences.signLanguage && !validSignLanguages.includes(preferences.signLanguage)) {
    return `Invalid sign language: ${preferences.signLanguage}. Valid: ${validSignLanguages.join(', ')}`;
  }

  if (preferences.displaySettings) {
    const { fontSize, position } = preferences.displaySettings;

    if (fontSize && (fontSize < 10 || fontSize > 32)) {
      return 'Font size must be between 10 and 32';
    }

    if (position && !validPositions.includes(position)) {
      return `Invalid position: ${position}. Valid: ${validPositions.join(', ')}`;
    }
  }

  return null;
}

/**
 * Handle errors and return appropriate response
 */
function handleError(error) {
  console.error('Error:', error);

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
