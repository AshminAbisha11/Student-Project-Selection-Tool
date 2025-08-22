// Backend/controllers/adminController.js (invites section)

const db = require('../config/db');
const crypto = require('crypto');

// ---- helpers ----
function makeInviteCode(prefix = 'ASTON', role = 'ADMIN') {
  const raw = crypto.randomBytes(8).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.slice(0, 12).match(/.{1,4}/g).join('-'); // AAAA-BBBB-CCCC
  return `${prefix}-${role}-${body}`;
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function normalizeDomains({ allowed_domains, allowed_domain }) {
  // Accept either a single string (legacy) or an array; default to Aston + Gmail
  let domains = [];
  if (Array.isArray(allowed_domains) && allowed_domains.length) {
    domains = allowed_domains;
  } else if (allowed_domain) {
    domains = [allowed_domain];
  } else {
    domains = ['aston.ac.uk', 'gmail.com'];
  }
  // clean + dedupe
  domains = domains
    .map(d => (d || '').toString().toLowerCase().trim().replace(/^@/, ''))
    .filter(Boolean);
  domains = [...new Set(domains)];
  return domains;
}
function safeParseJSON(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

// ============ CREATE ============
exports.createInvite = async (req, res) => {
  const actorId = req.user.user_id;

  // payload: { role, email, allowed_domains?, allowed_domain?(legacy), max_uses, expires_at }
  let {
    role = 'admin',
    email = null,
    allowed_domains,         // array of domains (preferred)
    allowed_domain,          // legacy single domain support
    max_uses = 1,
    expires_at = null
  } = req.body || {};

  role = String(role).toLowerCase(); // 'admin' | 'supervisor'
  if (!['admin', 'supervisor'].includes(role)) {
    return res.status(400).json({ message: 'role must be admin or supervisor' });
  }

  const domains = normalizeDomains({ allowed_domains, allowed_domain });

  // generate a unique human-friendly code
  let code, codeHash, exists = true, tries = 0;
  while (exists) {
    if (tries++ > 5) return res.status(500).json({ message: 'could not generate code' });
    code = makeInviteCode('ASTON', role.toUpperCase());
    codeHash = sha256(code);
    const [[row]] = await db.query(
      `SELECT invite_id FROM admin_invites WHERE code_hash = ?`,
      [codeHash]
    );
    exists = !!row;
  }

  const [r] = await db.query(
    `INSERT INTO admin_invites
       (code_hash, email, allowed_domain, allowed_domains_json, role, max_uses, expires_at, created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [codeHash, email, null, JSON.stringify(domains), role, max_uses, expires_at, actorId]
  );

  // audit
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
     VALUES (?,?,?,?,?)`,
    [actorId, 'INVITE_CREATE', 'invite', String(r.insertId),
     JSON.stringify({ role, email, allowed_domains: domains, max_uses, expires_at })]
  );

  // Return the plain code ONCE
  res.status(201).json({
    invite_id: r.insertId,
    code,
    role,
    email,
    allowed_domains: domains,
    max_uses,
    expires_at
  });
};

// ============ LIST (no plain code) ============
exports.listInvites = async (req, res) => {
  const [rows] = await db.query(
    `SELECT invite_id, email, allowed_domain, allowed_domains_json, role, max_uses, uses,
            expires_at, used_up_at, created_at
     FROM admin_invites
     ORDER BY created_at DESC`
  );

  // expose a unified allowed_domains array in the response
  const data = rows.map(r => {
    const list = safeParseJSON(r.allowed_domains_json) || (r.allowed_domain ? [r.allowed_domain] : []);
    return {
      invite_id: r.invite_id,
      email: r.email,
      role: r.role,
      max_uses: r.max_uses,
      uses: r.uses,
      expires_at: r.expires_at,
      used_up_at: r.used_up_at,
      created_at: r.created_at,
      allowed_domains: list
    };
  });

  res.json(data);
};

// ============ REVOKE ============
exports.revokeInvite = async (req, res) => {
  const { invite_id } = req.params;
  const actorId = req.user.user_id;

  const [r] = await db.query(
    `UPDATE admin_invites
     SET uses = max_uses, used_up_at = NOW()
     WHERE invite_id = ?`,
    [invite_id]
  );

  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
     VALUES (?,?,?,?)`,
    [actorId, 'INVITE_REVOKE', 'invite', String(invite_id)]
  );

  res.json({ ok: true, affected: r.affectedRows });
};
