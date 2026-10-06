// Minimal Paystack REST client: timeouts, one retry for idempotent reads, stable error codes.
// The secret key is only ever sent in the Authorization header; it never appears in errors or logs.

export class PaystackError extends Error {
  /**
   * @param {'timeout'|'network'|'auth'|'rejected'|'not_found'|'unavailable'|'bad_response'} code
   */
  constructor(code, message, status = 0) {
    super(message || code);
    this.name = 'PaystackError';
    this.code = code;
    this.status = status;
  }
}

function codeForStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status >= 500 || status === 429) return 'unavailable';
  return 'rejected';
}

/**
 * @param {{ secretKey: string, fetch?: typeof fetch, baseUrl?: string, timeoutMs?: number }} opts
 */
export function createPaystack({ secretKey, fetch: fetchImpl = (...a) => fetch(...a), baseUrl = 'https://api.paystack.co', timeoutMs = 8000 }) {
  async function once(method, path, body) {
    const controller = new AbortController();
    // One deadline for the whole exchange, body included (a stalled body must not hang the request).
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    let payload = null;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      try {
        payload = await res.json();
      } catch (err) {
        if (controller.signal.aborted) throw err;
        payload = null; // not JSON; handled below
      }
    } catch {
      throw new PaystackError(controller.signal.aborted ? 'timeout' : 'network', `Paystack ${method} ${path} failed`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const message = typeof payload?.message === 'string' ? payload.message.slice(0, 200) : `HTTP ${res.status}`;
      throw new PaystackError(codeForStatus(res.status), message, res.status);
    }
    if (!payload || payload.status !== true) {
      const message = typeof payload?.message === 'string' ? payload.message.slice(0, 200) : 'Unexpected response';
      throw new PaystackError('bad_response', message, res.status);
    }
    return payload.data;
  }

  async function call(method, path, body, { retry = false } = {}) {
    try {
      return await once(method, path, body);
    } catch (err) {
      const transient = err instanceof PaystackError && ['timeout', 'network', 'unavailable'].includes(err.code);
      if (!retry || !transient) throw err;
      return once(method, path, body);
    }
  }

  const seg = (s) => encodeURIComponent(String(s));

  return {
    /** POST /transaction/initialize. Not retried: a second call would create a second checkout. */
    async initialize({ email, amount, plan, callbackUrl, reference, metadata }) {
      const data = await call('POST', '/transaction/initialize', {
        email,
        amount: String(amount),
        currency: 'ZAR',
        plan,
        callback_url: callbackUrl,
        reference,
        // Subscriptions can only be billed to a card.
        channels: ['card'],
        metadata,
      });
      if (!data || typeof data.authorization_url !== 'string' || !/^https:\/\//.test(data.authorization_url)) {
        throw new PaystackError('bad_response', 'No authorization_url');
      }
      return { authorizationUrl: data.authorization_url, reference: data.reference || reference, accessCode: data.access_code };
    },

    /** GET /transaction/verify/:reference -> transaction data (status, amount, customer, plan, metadata). */
    verify(reference) {
      return call('GET', `/transaction/verify/${seg(reference)}`, null, { retry: true });
    },

    /** GET /plan/:code -> { amount, currency, interval, ... } */
    getPlan(code) {
      return call('GET', `/plan/${seg(code)}`, null, { retry: true });
    },

    /** GET /subscription/:code -> { subscription_code, email_token, status, ... } */
    getSubscription(code) {
      return call('GET', `/subscription/${seg(code)}`, null, { retry: true });
    },

    /** POST /subscription/disable { code, token } — token is the subscription's email_token. */
    disableSubscription(code, token) {
      return call('POST', '/subscription/disable', { code, token });
    },

    /** GET /subscription/:code/manage/link -> hosted page where the sponsor updates their card or cancels. */
    async manageLink(code) {
      const data = await call('GET', `/subscription/${seg(code)}/manage/link`, null, { retry: true });
      if (!data || typeof data.link !== 'string' || !/^https:\/\//.test(data.link)) {
        throw new PaystackError('bad_response', 'No link');
      }
      return data.link;
    },
  };
}
