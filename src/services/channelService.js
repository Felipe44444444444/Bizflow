require('dotenv').config();

async function sendMessage(channel, recipientId, text, options = {}) {
  switch (channel.type) {
    case 'whatsapp':
      return sendWhatsApp(channel, recipientId, text);
    case 'instagram':
    case 'facebook':
      return sendMetaMessenger(channel, recipientId, text);
    case 'slack':
      return sendSlack(channel, recipientId, text, options);
    case 'web_widget':
    case 'landing_page':
    case 'api':
      return { sent: false, reason: 'push_not_supported' };
    default:
      throw new Error(`Unsupported channel type: ${channel.type}`);
  }
}

async function sendWhatsApp(channel, recipientPhone, text) {
  const token = channel.config?.access_token || process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = channel.config?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }

  return res.json();
}

async function sendMetaMessenger(channel, recipientId, text) {
  const token = channel.config?.access_token;
  if (!token) throw new Error('Missing Meta access token in channel config');

  // Split messages longer than 2000 chars to avoid API rejection
  const chunks = splitText(text, 2000);
  let last;
  for (const chunk of chunks) {
    const res = await fetch('https://graph.facebook.com/v19.0/me/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: chunk },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Meta Messenger API error: ${JSON.stringify(err)}`);
    }
    last = await res.json();
  }
  return last;
}

async function sendTypingIndicator(channel, recipientId) {
  const token = channel.config?.access_token;
  if (!token) return;

  await fetch('https://graph.facebook.com/v19.0/me/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: 'typing_on',
    }),
  });
}

function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    // Try to break on whitespace
    if (end < text.length) {
      const ws = text.lastIndexOf(' ', end);
      if (ws > start) end = ws;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function sendSlack(channel, channelId, text, options = {}) {
  const token = channel.config?.bot_token;
  if (!token) throw new Error('Missing Slack bot token in channel config');

  const body = { channel: channelId, text };
  if (options.thread_ts) body.thread_ts = options.thread_ts;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

  return data;
}

module.exports = { sendMessage, sendTypingIndicator };
