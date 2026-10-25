// Errors whose message is safe and useful to show to the API client (validation problems etc.).
// Every other error is logged on the server and replaced by a generic message, so upstream
// failures (axios, filesystem, provider payloads) never leak internals to the network.
class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
    this.expose = true;
  }
}

const GENERIC_DETAILS = 'The request failed. See the backend log for details.';

const safeDetails = (error, { log = console.error } = {}) => {
  if (error?.expose === true) {
    return error.message;
  }
  log('[api] request failed:', error?.message || error);
  return GENERIC_DETAILS;
};

module.exports = {
  GENERIC_DETAILS,
  PublicError,
  safeDetails,
};
