import * as Sentry from '@sentry/node';

// Ensure to call this before importing any other modules!
Sentry.init({
  dsn: "https://7d4d7f24a0522fd0afc4c618fa3dc377@o4508130833793024.ingest.us.sentry.io/4509675031822336",

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // We recommend adjusting this value in production
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#tracesSampleRate
  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  _experiments: { enableLogs: true },

  // Add console logging integration
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
});
