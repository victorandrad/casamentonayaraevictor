// Only the parts of the Sentry SDK we use, so the lazily loaded chunk stays small (no replay, feedback…).
export { captureException, init } from '@sentry/browser';
