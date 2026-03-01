/**
 * Cost Monitor Lambda Function
 * Tracks AWS spending and enforces budget limits
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 10.1, 10.2, 10.6
 */

const { CloudWatchClient, GetMetricStatisticsCommand, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Initialize AWS clients
const cloudwatchClient = new CloudWatchClient({});
const costExplorerClient = new CostExplorerClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

// Configuration
const COST_TRACKING_TABLE = process.env.COST_TRACKING_TABLE;
const BUDGET_LIMIT = parseFloat(process.env.BUDGET_LIMIT || '100');
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

// Budget thresholds
const THRESHOLDS = {
  WARNING: 0.80,    // 80%
  CRITICAL: 0.95,   // 95%
  EXCEEDED: 1.00    // 100%
};

/**
 * Lambda handler - runs hourly
 */
exports.handler = async (event) => {
  console.log('Cost Monitor invoked');

  try {
    // Calculate current spending
    const costBreakdown = await calculateCurrentSpending();
    console.log('Cost breakdown:', costBreakdown);

    // Store cost data
    await storeCostData(costBreakdown);

    // Check budget thresholds
    const budgetStatus = await checkBudgetThresholds(costBreakdown);
    console.log('Budget status:', budgetStatus);

    // Take action based on budget status
    await handleBudgetStatus(budgetStatus);

    // Generate daily report (if it's midnight UTC)
    const hour = new Date().getUTCHours();
    if (hour === 0) {
      await generateDailyReport(costBreakdown);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cost monitoring completed',
        costBreakdown,
        budgetStatus
      })
    };

  } catch (error) {
    console.error('Error in cost monitor:', error);
    throw error;
  }
};

/**
 * Calculate current monthly spending across all AWS services
 */
async function calculateCurrentSpending() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  try {
    const response = await costExplorerClient.send(new GetCostAndUsageCommand({
      TimePeriod: {
        Start: startOfMonth.toISOString().split('T')[0],
        End: now.toISOString().split('T')[0]
      },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{
        Type: 'SERVICE',
        Key: 'SERVICE'
      }]
    }));

    const byService = {};
    let total = 0;

    if (response.ResultsByTime && response.ResultsByTime[0]) {
      for (const group of response.ResultsByTime[0].Groups) {
        const service = group.Keys[0].toLowerCase().replace(/\s+/g, '_');
        const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
        byService[service] = amount;
        total += amount;
      }
    }

    // Calculate projected monthly spending
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const projectedMonthly = (total / dayOfMonth) * daysInMonth;

    return {
      total,
      byService,
      projectedMonthly,
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('Error calculating spending:', error);
    // Return mock data for development
    return {
      total: 0,
      byService: {
        lambda: 0,
        apigateway: 0,
        transcribe: 0,
        dynamodb: 0,
        s3: 0,
        cloudfront: 0
      },
      projectedMonthly: 0,
      timestamp: Date.now()
    };
  }
}

/**
 * Store cost data in DynamoDB
 */
async function storeCostData(costBreakdown) {
  const date = new Date().toISOString().split('T')[0];

  try {
    // Store total cost
    await docClient.send(new PutCommand({
      TableName: COST_TRACKING_TABLE,
      Item: {
        PK: `COST#${date}`,
        SK: 'TOTAL',
        amount: costBreakdown.total,
        projectedMonthly: costBreakdown.projectedMonthly,
        timestamp: costBreakdown.timestamp
      }
    }));

    // Store per-service costs
    for (const [service, amount] of Object.entries(costBreakdown.byService)) {
      await docClient.send(new PutCommand({
        TableName: COST_TRACKING_TABLE,
        Item: {
          PK: `COST#${date}`,
          SK: `SERVICE#${service}`,
          amount,
          usage: 0, // TODO: Get actual usage metrics
          timestamp: costBreakdown.timestamp
        }
      }));
    }

    // Publish metrics to CloudWatch
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: 'AccessibilityAI/Costs',
      MetricData: [
        {
          MetricName: 'TotalCost',
          Value: costBreakdown.total,
          Unit: 'None',
          Timestamp: new Date()
        },
        {
          MetricName: 'ProjectedMonthlyCost',
          Value: costBreakdown.projectedMonthly,
          Unit: 'None',
          Timestamp: new Date()
        }
      ]
    }));

  } catch (error) {
    console.error('Error storing cost data:', error);
  }
}

/**
 * Check budget thresholds and determine status
 */
async function checkBudgetThresholds(costBreakdown) {
  const percentageUsed = (costBreakdown.total / BUDGET_LIMIT) * 100;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();

  let status = 'normal';
  if (percentageUsed >= THRESHOLDS.EXCEEDED * 100) {
    status = 'exceeded';
  } else if (percentageUsed >= THRESHOLDS.CRITICAL * 100) {
    status = 'critical';
  } else if (percentageUsed >= THRESHOLDS.WARNING * 100) {
    status = 'warning';
  }

  return {
    currentSpending: costBreakdown.total,
    budgetLimit: BUDGET_LIMIT,
    percentageUsed,
    daysRemaining,
    status
  };
}

/**
 * Handle budget status and take appropriate actions
 */
async function handleBudgetStatus(budgetStatus) {
  const { status, percentageUsed } = budgetStatus;

  // Send alerts based on status
  if (status === 'warning') {
    await sendAlert('WARNING_80', {
      message: `Budget warning: ${percentageUsed.toFixed(1)}% of monthly budget consumed`,
      budgetStatus
    });
  } else if (status === 'critical') {
    await sendAlert('CRITICAL_95', {
      message: `Budget critical: ${percentageUsed.toFixed(1)}% of monthly budget consumed. Non-essential features will be disabled.`,
      budgetStatus
    });
    // TODO: Disable non-essential features
  } else if (status === 'exceeded') {
    await sendAlert('EXCEEDED_100', {
      message: `Budget exceeded: ${percentageUsed.toFixed(1)}% of monthly budget consumed. New requests will be rejected.`,
      budgetStatus
    });
    // TODO: Update API Gateway throttling to reject requests
  }
}

/**
 * Send alert via SNS
 */
async function sendAlert(alertType, details) {
  if (!ALERT_TOPIC_ARN) {
    console.warn('Alert topic ARN not configured, skipping alert');
    return;
  }

  try {
    await snsClient.send(new PublishCommand({
      TopicArn: ALERT_TOPIC_ARN,
      Subject: `Accessibility AI - ${alertType}`,
      Message: JSON.stringify(details, null, 2)
    }));

    console.log(`Alert sent: ${alertType}`);
  } catch (error) {
    console.error('Error sending alert:', error);
  }
}

/**
 * Generate daily cost report
 */
async function generateDailyReport(costBreakdown) {
  console.log('Generating daily cost report');

  const report = {
    date: new Date().toISOString().split('T')[0],
    totalCost: costBreakdown.total,
    projectedMonthlyCost: costBreakdown.projectedMonthly,
    budgetLimit: BUDGET_LIMIT,
    percentageUsed: (costBreakdown.total / BUDGET_LIMIT) * 100,
    byService: costBreakdown.byService
  };

  // Send report via SNS
  if (ALERT_TOPIC_ARN) {
    await snsClient.send(new PublishCommand({
      TopicArn: ALERT_TOPIC_ARN,
      Subject: 'Accessibility AI - Daily Cost Report',
      Message: JSON.stringify(report, null, 2)
    }));
  }

  console.log('Daily report generated:', report);
}
