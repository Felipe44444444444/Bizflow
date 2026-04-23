const { supabaseAdmin } = require('../config/supabase');
const { hashApiKey } = require('../utils/apiKey');

async function apiKeyMiddleware(req, res, next) {
  const key =
    req.headers['x-api-key'] ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!key || !key.startsWith('cc_')) {
    return res.status(401).json({ error: 'Valid API key required' });
  }

  const keyHash = hashApiKey(key);

  const { data: apiKey, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, organization_id, agent_id, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!apiKey.is_active) {
    return res.status(401).json({ error: 'API key is revoked' });
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key has expired' });
  }

  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)
    .then(() => {});

  req.organizationId = apiKey.organization_id;
  req.agentId = apiKey.agent_id;
  next();
}

module.exports = { apiKeyMiddleware };
