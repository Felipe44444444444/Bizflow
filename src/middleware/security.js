const crypto = require('crypto');

// ── Input sanitization ────────────────────────────────────────────────────────

function sanitizeText(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/<[^>]*>/g, '').slice(0, 4000);
}

function sanitizeBody(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map(v => sanitizeBody(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string'
      ? sanitizeText(v)
      : (typeof v === 'object' && v !== null ? sanitizeBody(v, depth + 1) : v);
  }
  return out;
}

function sanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeBody(req.body);
  next();
}

// ── Audit log ─────────────────────────────────────────────────────────────────

async function logSecurityEvent(orgId, action, resource, ip, success, metadata = {}) {
  try {
    const { supabaseAdmin } = require('../config/supabase');
    await supabaseAdmin.from('security_audit_log').insert({
      organization_id: orgId || null,
      action,
      resource: resource || null,
      ip_address: ip || null,
      success: success !== false,
      metadata,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Never let audit log break the request
    console.error('[SecurityAudit]', e.message);
  }
}

// ── Client IP ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

// ── UUID validation ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_RE.test(v); }

// ── Validate path params are UUIDs ─────────────────────────────────────────────

function requireUuidParam(...paramNames) {
  return (req, res, next) => {
    for (const p of paramNames) {
      if (req.params[p] && !isValidUUID(req.params[p])) {
        return res.status(400).json({ error: `Invalid ${p}` });
      }
    }
    next();
  };
}

module.exports = { sanitizeMiddleware, logSecurityEvent, getClientIp, isValidUUID, requireUuidParam };
