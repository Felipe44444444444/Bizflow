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

  // For Instagram via Facebook Page (page_id present): use graph.facebook.com with page token.
  // For Instagram via Instagram Business Login (no page_id): use graph.instagram.com with IG user token.
  // For Facebook Messenger: standard graph.facebook.com/me/messages with page token.
  let endpoint;
  if (channel.type === 'instagram') {
    const igId = channel.config?.ig_account_id || channel.config?.ig_user_id;
    if (!igId) throw new Error('Missing ig_account_id in Instagram channel config');
    const isPageBased = !!channel.config?.page_id;
    if (isPageBased) {
      // Connected via Facebook Page — page token works on graph.facebook.com
      endpoint = `https://graph.facebook.com/v19.0/${igId}/messages`;
      console.log(`[sendMetaMessenger] Instagram page-based → ${endpoint}`);
    } else {
      // Connected via Instagram Business Login — requires IG user token
      endpoint = `https://graph.instagram.com/v21.0/${igId}/messages`;
      console.log(`[sendMetaMessenger] Instagram IG-login-based → ${endpoint}`);
    }
  } else {
    endpoint = 'https://graph.facebook.com/v19.0/me/messages';
  }

  console.log(`[sendMetaMessenger] type=${channel.type} endpoint=${endpoint} recipient=${recipientId} token=${token.slice(0,12)}...`);

  // Split messages longer than 2000 chars to avoid API rejection
  const chunks = splitText(text, 2000);
  let last;
  for (const chunk of chunks) {
    const res = await fetch(endpoint, {
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

    const responseText = await res.text();
    if (!res.ok) {
      console.error(`[sendMetaMessenger] HTTP ${res.status} error:`, responseText);
      let parsed = {};
      try { parsed = JSON.parse(responseText); } catch {}
      throw new Error(`Meta Messenger API error ${res.status}: ${JSON.stringify(parsed?.error || parsed)}`);
    }
    try { last = JSON.parse(responseText); } catch { last = {}; }
  }
  console.log(`[sendMetaMessenger] sent OK to ${recipientId}:`, JSON.stringify(last));
  return last;
}

async function sendTypingIndicator(channel, recipientId) {
  const token = channel.config?.access_token;
  if (!token) return;

  // Instagram Business Login uses a different endpoint — typing indicators
  // are not supported on graph.instagram.com, so skip silently for IG.
  if (channel.type === 'instagram') return;

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
