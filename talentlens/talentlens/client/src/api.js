/** Small fetch wrapper. Session lives in an httpOnly cookie, so we always send credentials. */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, url, body, { isForm = false } = {}) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'include',
    headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const detail = data?.details?.map?.((d) => d.message).filter(Boolean).join('; ');
    throw new ApiError(res.status, detail ? `${data.error}: ${detail}` : data?.error || `Request failed (${res.status})`, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  upload: (url, formData) => request('POST', url, formData, { isForm: true }),
};
