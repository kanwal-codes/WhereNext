// Client bootstrap. Sentry's browser SDK is wired by `withSentryConfig` only when
// SENTRY_DSN is set at build time; with no DSN this file stays empty and the
// default client bundle is unchanged.
export {};
