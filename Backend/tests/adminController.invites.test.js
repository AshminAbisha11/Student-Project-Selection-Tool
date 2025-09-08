// tests/adminController.invites.test.js

// Map the app's DB import to our mock
jest.mock('../config/db', () => require('./mocks/db.mock').db);

const { db } = require('./mocks/db.mock');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

const adminController = require('../controllers/adminController');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

describe('adminController (invites)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    it('creates an invite, audits it, returns the plain code once, and stores hash matching the code', async () => {
      // Make randomBytes deterministic so the code is stable and testable
      jest
        .spyOn(crypto, 'randomBytes')
        .mockReturnValue(Buffer.from('abcdefghijklmno!')); // 16 bytes, includes a '!' to prove filtering

      const req = mockReq({
        user: { user_id: 99 },
        body: {
          role: 'admin',
          email: 'alice@aston.ac.uk',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
          max_uses: 3,
          expires_at: '2030-01-01 00:00:00',
        },
      });
      const res = mockRes();

      // 1) SELECT code_hash (collision check) -> none
      // 2) INSERT admin_invites
      // 3) INSERT audit_logs
      db.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 123 }])
        .mockResolvedValueOnce([{ insertId: 456 }]);

      await adminController.createInvite(req, res);

      expect(db.query).toHaveBeenCalledTimes(3);

      // INSERT admin_invites call
      const insertCall = db.query.mock.calls[1];
      expect(insertCall[0]).toMatch(/INSERT INTO admin_invites/i);
      const insertParams = insertCall[1];

      // params: [codeHash, email, null, JSON.stringify(domains), role, max_uses, expires_at, actorId]
      const storedHash = insertParams[0];
      expect(insertParams[1]).toBe('alice@aston.ac.uk');
      expect(insertParams[2]).toBe(null);
      expect(insertParams[3]).toBe(JSON.stringify(['aston.ac.uk', 'gmail.com']));
      expect(insertParams[4]).toBe('admin');
      expect(insertParams[5]).toBe(3);
      expect(insertParams[6]).toBe('2030-01-01 00:00:00');
      expect(insertParams[7]).toBe(99);

      // Response assertions
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];

      // Code format: ASTON-ADMIN-AAAA-BBBB-CCCC (A–Z0–9 only)
      expect(payload.code).toMatch(
        /^ASTON-ADMIN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
      );

      // Stored codeHash must match sha256 of the returned code
      expect(storedHash).toBe(sha256(payload.code));

      // Rest of payload
      expect(payload).toEqual(
        expect.objectContaining({
          invite_id: 123,
          role: 'admin',
          email: 'alice@aston.ac.uk',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
          max_uses: 3,
          expires_at: '2030-01-01 00:00:00',
        })
      );

      // Audit log call should include meta with normalized domains
      const auditCall = db.query.mock.calls[2];
      expect(auditCall[0]).toMatch(/INSERT INTO audit_logs/i);
      const auditParams = auditCall[1];
      expect(auditParams[0]).toBe(99);
      expect(auditParams[1]).toBe('INVITE_CREATE');
      expect(auditParams[2]).toBe('invite');
      expect(auditParams[3]).toBe(String(123));
      const auditMeta = JSON.parse(auditParams[4]);
      expect(auditMeta).toEqual(
        expect.objectContaining({
          role: 'admin',
          email: 'alice@aston.ac.uk',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
          max_uses: 3,
          expires_at: '2030-01-01 00:00:00',
        })
      );
    });

    it('retries code generation on collision, then succeeds (defaults domains if none provided)', async () => {
      jest
        .spyOn(crypto, 'randomBytes')
        .mockReturnValue(Buffer.from('xxxxxxxxxxxxxxxx'));

      const req = mockReq({
        user: { user_id: 7 },
        body: { role: 'supervisor', email: 'bob@gmail.com', max_uses: 1 },
      });
      const res = mockRes();

      // First SELECT -> collision; Second SELECT -> no collision; then INSERT invite; INSERT audit
      db.query
        .mockResolvedValueOnce([[{ invite_id: 1 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 777 }])
        .mockResolvedValueOnce([{ insertId: 888 }]);

      await adminController.createInvite(req, res);

      expect(db.query).toHaveBeenCalledTimes(4);
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toEqual(
        expect.objectContaining({
          invite_id: 777,
          role: 'supervisor',
          email: 'bob@gmail.com',
          max_uses: 1,
          allowed_domains: ['aston.ac.uk', 'gmail.com'], // default when none provided
        })
      );

      // Code format: ASTON-SUPERVISOR-AAAA-BBBB-CCCC
      expect(payload.code).toMatch(
        /^ASTON-SUPERVISOR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
      );
    });

    it('validates role and returns 400 for invalid role', async () => {
      const req = mockReq({
        user: { user_id: 1 },
        body: { role: 'student', email: 'x@y.com' }, // invalid role
      });
      const res = mockRes();

      await adminController.createInvite(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/role/i),
        })
      );
    });

    it('stops after too many collisions and returns 500', async () => {
      jest
        .spyOn(crypto, 'randomBytes')
        .mockReturnValue(Buffer.from('yyyyyyyyyyyyyyyy'));

      const req = mockReq({
        user: { user_id: 1 },
        body: { role: 'admin' },
      });
      const res = mockRes();

      // Always "exists"
      db.query.mockResolvedValue([[{ invite_id: 9 }]]);

      await adminController.createInvite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/could not generate code/i),
        })
      );
    });

    it('normalizes messy allowed_domains input (case, @prefix, whitespace, dedupe, empties)', async () => {
      jest
        .spyOn(crypto, 'randomBytes')
        .mockReturnValue(Buffer.from('zzzzzzzzzzzzzzzz'));

      const req = mockReq({
        user: { user_id: 12 },
        body: {
          role: 'admin',
          email: null,
          allowed_domains: [
            '  Aston.ac.uk ',
            '@GMAIL.com',
            '',
            'gmail.com', // duplicate in different form
          ],
          max_uses: 2,
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]) // no collision
        .mockResolvedValueOnce([{ insertId: 333 }]) // insert invite
        .mockResolvedValueOnce([{ insertId: 444 }]); // audit

      await adminController.createInvite(req, res);

      // Check the JSON saved to DB is normalized + deduped
      const insertParams = db.query.mock.calls[1][1];
      expect(insertParams[3]).toBe(JSON.stringify(['aston.ac.uk', 'gmail.com']));

      // Response mirrors normalized domains
      const payload = res.json.mock.calls[0][0];
      expect(payload.allowed_domains).toEqual(['aston.ac.uk', 'gmail.com']);
    });

    it('supports legacy single allowed_domain when allowed_domains not provided', async () => {
      jest
        .spyOn(crypto, 'randomBytes')
        .mockReturnValue(Buffer.from('aaaaaaaaaaaaaaaa'));

      const req = mockReq({
        user: { user_id: 21 },
        body: {
          role: 'supervisor',
          email: null,
          allowed_domain: 'Legacy.COM',
          max_uses: 1,
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]) // no collision
        .mockResolvedValueOnce([{ insertId: 989 }]) // insert invite
        .mockResolvedValueOnce([{ insertId: 990 }]); // audit

      await adminController.createInvite(req, res);

      // DB should store normalized list as JSON (legacy column itself is set null in controller)
      const insertParams = db.query.mock.calls[1][1];
      expect(insertParams[2]).toBe(null);
      expect(insertParams[3]).toBe(JSON.stringify(['legacy.com']));

      const payload = res.json.mock.calls[0][0];
      expect(payload.allowed_domains).toEqual(['legacy.com']);
      expect(payload.role).toBe('supervisor');
    });
  });

  describe('listInvites', () => {
    it('returns list with unified allowed_domains array', async () => {
      const req = mockReq();
      const res = mockRes();

      db.query.mockResolvedValueOnce([
        [
          {
            invite_id: 1,
            email: 'a@aston.ac.uk',
            allowed_domain: null,
            allowed_domains_json: JSON.stringify(['aston.ac.uk', 'gmail.com']),
            role: 'admin',
            max_uses: 3,
            uses: 1,
            expires_at: '2030-01-01 00:00:00',
            used_up_at: null,
            created_at: '2025-01-01 12:00:00',
          },
          {
            invite_id: 2,
            email: null,
            allowed_domain: 'legacy.com',
            allowed_domains_json: null,
            role: 'supervisor',
            max_uses: 1,
            uses: 0,
            expires_at: null,
            used_up_at: null,
            created_at: '2025-01-02 12:00:00',
          },
        ],
      ]);

      await adminController.listInvites(req, res);

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          invite_id: 1,
          email: 'a@aston.ac.uk',
          role: 'admin',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
        }),
        expect.objectContaining({
          invite_id: 2,
          role: 'supervisor',
          allowed_domains: ['legacy.com'],
        }),
      ]);
    });
  });

  describe('revokeInvite', () => {
    it('marks invite as used up and audits the action', async () => {
      const req = mockReq({
        user: { user_id: 55 },
        params: { invite_id: '123' },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE admin_invites
        .mockResolvedValueOnce([{ insertId: 999 }]); // INSERT audit_logs

      await adminController.revokeInvite(req, res);

      // UPDATE call
      const updateArgs = db.query.mock.calls[0];
      expect(updateArgs[0]).toMatch(/UPDATE admin_invites/i);
      expect(updateArgs[1]).toEqual(['123']);

      // AUDIT call
      const auditArgs = db.query.mock.calls[1];
      expect(auditArgs[0]).toMatch(/INSERT INTO audit_logs/i);
      expect(auditArgs[1]).toEqual([55, 'INVITE_REVOKE', 'invite', '123']);

      // Response
      expect(res.json).toHaveBeenCalledWith({ ok: true, affected: 1 });
    });
  });
});
