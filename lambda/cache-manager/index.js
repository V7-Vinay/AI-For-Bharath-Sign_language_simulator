/**
 * Cache Manager Lambda Function
 * Manages DynamoDB and CloudFront caching with TTL and eviction policies
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.7, 5.9
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudfrontClient = new CloudFrontClient({});

// Configuration
const CACHE_TABLE = process.env.CACHE_TABLE;
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const MAX_CACHE_SIZE_GB = 5;
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024;

// Cache types
const CacheType = {
  TRANSCRIPTION: 'transcription',
  ANIMATION: 'animation',
  PREFERENCES: 'preferences'
};

/**
 * Lambda handler - runs hourly for cleanup
 */
exports.handler = async (event) => {
  console.log('Cache Manager invoked');

  try {
    // Get cache statistics
    const stats = await getCacheStats();
    console.log('Cache statistics:', stats);

    // Check if cache size exceeds limit
    if (stats.totalSize > MAX_CACHE_SIZE_BYTES) {
      console.log(`Cache size (${stats.totalSize} bytes) exceeds limit (${MAX_CACHE_SIZE_BYTES} bytes)`);
      await evictLRU(CacheType.TRANSCRIPTION, MAX_CACHE_SIZE_BYTES * 0.4);
      await evictLRU(CacheType.ANIMATION, MAX_CACHE_SIZE_BYTES * 0.4);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cache management completed',
        stats
      })
    };

  } catch (error) {
    console.error('Error in cache manager:', error);
    throw error;
  }
};

/**
 * Get cache item
 */
async function get(key, cacheType) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CACHE_TABLE,
      Key: {
        PK: `CACHE#${cacheType}#${key}`,
        SK: 'CACHE'
      }
    }));

    if (result.Item) {
      // Check if TTL has expired
      if (result.Item.ttl && result.Item.ttl < Math.floor(Date.now() / 1000)) {
        console.log('Cache item expired:', key);
        return null;
      }

      // Update last accessed time
      await updateAccessTime(key, cacheType);

      return result.Item.value;
    }

    return null;
  } catch (error) {
    console.error('Error getting cache item:', error);
    return null;
  }
}

/**
 * Set cache item
 */
async function set(key, value, ttlSeconds, cacheType) {
  try {
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    const size = JSON.stringify(value).length;

    await docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Item: {
        PK: `CACHE#${cacheType}#${key}`,
        SK: 'CACHE',
        value,
        ttl,
        size,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0
      }
    }));

    console.log(`Cache item set: ${key} (${size} bytes, TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.error('Error setting cache item:', error);
    throw error;
  }
}

/**
 * Invalidate cache item
 */
async function invalidate(key, cacheType) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: CACHE_TABLE,
      Key: {
        PK: `CACHE#${cacheType}#${key}`,
        SK: 'CACHE'
      }
    }));

    console.log('Cache item invalidated:', key);
  } catch (error) {
    console.error('Error invalidating cache item:', error);
  }
}

/**
 * Evict least recently used items
 */
async function evictLRU(cacheType, targetSizeBytes) {
  console.log(`Evicting LRU items for ${cacheType}, target size: ${targetSizeBytes} bytes`);

  try {
    // Query all items of this cache type
    const items = await queryAllCacheItems(cacheType);

    // Sort by last accessed time (oldest first)
    items.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let currentSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
    let evictedCount = 0;

    // Evict items until we're under the target size
    for (const item of items) {
      if (currentSize <= targetSizeBytes) {
        break;
      }

      await docClient.send(new DeleteCommand({
        TableName: CACHE_TABLE,
        Key: {
          PK: item.PK,
          SK: item.SK
        }
      }));

      currentSize -= (item.size || 0);
      evictedCount++;
    }

    console.log(`Evicted ${evictedCount} items, new size: ${currentSize} bytes`);
  } catch (error) {
    console.error('Error evicting LRU items:', error);
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  try {
    const items = await queryAllCacheItems();

    const stats = {
      totalSize: 0,
      itemCount: 0,
      hitRate: 0,
      evictionCount: 0,
      byType: {}
    };

    for (const item of items) {
      stats.totalSize += (item.size || 0);
      stats.itemCount++;

      const type = item.PK.split('#')[1];
      if (!stats.byType[type]) {
        stats.byType[type] = { count: 0, size: 0 };
      }
      stats.byType[type].count++;
      stats.byType[type].size += (item.size || 0);
    }

    return stats;
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalSize: 0,
      itemCount: 0,
      hitRate: 0,
      evictionCount: 0,
      byType: {}
    };
  }
}

/**
 * Query all cache items
 */
async function queryAllCacheItems(cacheType = null) {
  const items = [];
  let lastEvaluatedKey = null;

  try {
    do {
      const params = {
        TableName: CACHE_TABLE,
        ExclusiveStartKey: lastEvaluatedKey
      };

      if (cacheType) {
        params.FilterExpression = 'begins_with(PK, :prefix)';
        params.ExpressionAttributeValues = {
          ':prefix': `CACHE#${cacheType}#`
        };
      }

      const result = await docClient.send(new QueryCommand(params));
      
      if (result.Items) {
        items.push(...result.Items);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  } catch (error) {
    console.error('Error querying cache items:', error);
    return [];
  }
}

/**
 * Update last accessed time
 */
async function updateAccessTime(key, cacheType) {
  try {
    await docClient.send(new PutCommand({
      TableName: CACHE_TABLE,
      Key: {
        PK: `CACHE#${cacheType}#${key}`,
        SK: 'CACHE'
      },
      UpdateExpression: 'SET lastAccessed = :now, accessCount = accessCount + :inc',
      ExpressionAttributeValues: {
        ':now': Date.now(),
        ':inc': 1
      }
    }));
  } catch (error) {
    console.error('Error updating access time:', error);
  }
}

/**
 * Invalidate CloudFront cache
 */
async function invalidateCloudFront(paths) {
  if (!CLOUDFRONT_DISTRIBUTION_ID) {
    console.warn('CloudFront distribution ID not configured');
    return;
  }

  try {
    await cloudfrontClient.send(new CreateInvalidationCommand({
      DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `cache-manager-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths
        }
      }
    }));

    console.log('CloudFront cache invalidated:', paths);
  } catch (error) {
    console.error('Error invalidating CloudFront cache:', error);
  }
}

// Export functions for use by other Lambda functions
module.exports = {
  handler: exports.handler,
  get,
  set,
  invalidate,
  evictLRU,
  getCacheStats
};
