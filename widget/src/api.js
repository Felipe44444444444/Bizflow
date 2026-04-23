const DEFAULT_BACKEND = 'http://localhost:3000';

export async function sendMessage({ apiKey, backendUrl, message, conversationId, visitorId }) {
  const url = `${backendUrl || DEFAULT_BACKEND}/api/messages/chat`;

  const body = {
    message,
    external_id: visitorId,
  };
  if (conversationId) body.conversation_id = conversationId;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}
