// SPDX-License-Identifier: Apache-2.0
process.env.MAX_CPU = '1';
process.env.NODE_ENV = 'test';
process.env.STARTUP_TYPE = 'nats';
process.env.RULE_NAME = 'EFRuP';
process.env.RULE_VERSION = '1.0.0';
process.env.INTERDICTION_PRODUCER = 'interdiction-service';
process.env.FUNCTION_NAME = 'interdiction-service';
process.env.PRODUCER_STREAM = 'interdiction-service';
process.env.CONSUMER_STREAM = 'interdiction-service';
process.env.STREAM_SUBJECT = 'interdiction-service';
process.env.APM_URL = 'http://url.example.com';
process.env.APM_ACTIVE = 'false';
process.env.APM_SERVICE_NAME = 'event-flow';
process.env.SERVER_URL = 'http://url.example.com';
process.env.FUNCTION_NAME = 'event-flow-rule-processor';
process.env.RULE_NAME = 'EFRuP';
process.env.RULE_VERSION = '1.0.0';

process.env.REDIS_DATABASE = '0';
process.env.REDIS_AUTH = 'exampleAuth';
process.env.REDIS_SERVERS = '[{"host":"127.0.0.1", "port":6379}]';
process.env.REDIS_IS_CLUSTER = 'false';
process.env.DISTRIBUTED_CACHETTL = '300';
process.env.DISTRIBUTED_CACHE_ENABLED = 'true';

process.env.CONFIGURATION_DATABASE = 'configuration';
process.env.CONFIGURATION_DATABASE_HOST = 'testhost';
process.env.CONFIGURATION_DATABASE_PORT = '5432';
process.env.CONFIGURATION_DATABASE_USER = 'root';
process.env.CONFIGURATION_DATABASE_PASSWORD = '';
process.env.CONFIGURATION_DATABASE_CERT_PATH = '/usr/local/share/ca-certificates/ca-certificates.crt';

process.env.SUPPRESS_ALERTS = 'true';
process.env.APM_ACTIVE = 'false';
process.env.APM_SERVICE_NAME = 'typology-processor';
process.env.APM_URL = 'http://apm:8200';
process.env.APM_SECRET_TOKEN = '';

process.env.LOGSTASH_LEVEL = 'info';
process.env.SERVER_URL = '0.0.0.0:4222';
process.env.STARTUP_TYPE = 'nats';
process.env.INTERDICTION_PRODUCER = 'interdiction-service';
process.env.INTERDICTION_DESTINATION = 'global';
process.env.SIDECAR_HOST = '';

process.env.LOCAL_CACHETTL = '300';
process.env.LOCAL_CACHE_ENABLED = 'true';
