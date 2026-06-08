// Test setup: silencia logger em ambiente de teste
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JOB_CLEANUP_INTERVAL_MS = '60000';
process.env.PROXY_DEFAULT_MODE = 'sync';
