#!/usr/bin/env node

const { 
  DynamoDBClient, 
  CreateTableCommand, 
  DescribeTableCommand, 
  ListTablesCommand 
} = require('@aws-sdk/client-dynamodb');

require('dotenv').config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? {
    endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
    credentials: {
      accessKeyId: 'fakeMyKeyId',
      secretAccessKey: 'fakeSecretAccessKey'
    }
  } : {})
});

const tables = [
  {
    TableName: process.env.DYNAMODB_USERS_TABLE || 'llm-proxy-users',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: process.env.DYNAMODB_SESSIONS_TABLE || 'llm-proxy-sessions',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: process.env.DYNAMODB_USAGE_TABLE || 'llm-proxy-usage',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' }
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

async function createTables() {
  console.log('🚀 Creating DynamoDB tables for LLM Proxy Service...');
  
  try {
    // List existing tables
    const listResponse = await client.send(new ListTablesCommand({}));
    console.log('Existing tables:', listResponse.TableNames);
    
    for (const tableConfig of tables) {
      const tableName = tableConfig.TableName;
      
      try {
        // Check if table already exists
        await client.send(new DescribeTableCommand({ TableName: tableName }));
        console.log(`✅ Table ${tableName} already exists`);
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          // Table doesn't exist, create it
          console.log(`📝 Creating table ${tableName}...`);
          
          await client.send(new CreateTableCommand(tableConfig));
          console.log(`✅ Table ${tableName} created successfully`);
        } else {
          console.error(`❌ Error checking table ${tableName}:`, error.message);
        }
      }
    }
    
    console.log('\n🎉 DynamoDB tables setup complete!');
    console.log('\nTable Schema Summary:');
    console.log('====================');
    console.log('📊 Users Table:');
    console.log('   PK: USER#{email}');
    console.log('   SK: PROFILE');
    console.log('   GSI1: USER#{userId} -> PROFILE');
    console.log('');
    console.log('🔒 Sessions Table:');
    console.log('   PK: SESSION#{sessionId}');
    console.log('   SK: DATA');
    console.log('');
    console.log('📈 Usage Table:');
    console.log('   PK: USER#{userId}');
    console.log('   SK: USAGE#{timestamp}#{usageId}');
    console.log('   GSI1: USAGE#{date} -> USER#{userId}');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  createTables();
}

module.exports = { createTables };