const serverless = require('serverless-http');
const app = require('./index-dynamodb');

module.exports.handler = serverless(app);