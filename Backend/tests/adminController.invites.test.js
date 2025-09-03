// Map the app's DB import to our mock
jest.mock('../config/db', () => require('./mocks/db.mock').db);

const { db } = require('./mocks/db.mock');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

const adminController = require('../controllers/adminController');
const crypto = require('crypto');

describe('adminController (invites)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    it('creates an invite, audits it, and returns the plain code once', async () => {
      // Make randomBytes deterministic so the code is stable
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('abcdefghijklmno!')); // arbitrary

      const req = mockReq({
        user: { user_id: 99 },
        body: {
          role: 'admin',
          email: 'alice@aston.ac.uk',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
          max_uses: 3,
          expires_at: '2030-01-01 00:00:00'
        }
      });
      const res = mockRes();

      // 1st SELECT: no collision (no row found)
      db.query
        .mockResolvedValueOnce([[]]) // SELECT code_hash (no existing)
        // INSERT into admin_invites
        .mockResolvedValueOnce([{ insertId: 123 }])
        // INSERT audit log
        .mockResolvedValueOnce([{ insertId: 456 }]);

      await adminController.createInvite(req, res);

      // Called: SELECT (collision check) + INSERT invite + INSERT audit
      expect(db.query).toHaveBeenCalledTimes(3);

      // Assert INSERT invite used our normalized domains JSON
      const insertArgs = db.query.mock.calls[1]; // [sql, params]
      expect(insertArgs[0]).toMatch(/INSERT INTO admin_invites/i);
      const params = insertArgs[1];
      // params: [codeHash, email, null, JSON.stringify(domains), role, max_uses, expires_at, actorId]
      expect(params[1]).toBe('alice@aston.ac.uk');
      expect(params[2]).toBe(null);
      expect(params[3]).toBe(JSON.stringify(['aston.ac.uk', 'gmail.com']));
      expect(params[4]).toBe('admin');
      expect(params[5]).toBe(3);
      expect(params[6]).toBe('2030-01-01 00:00:00');
      expect(params[7]).toBe(99);

      // Response
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toEqual(
        expect.objectContaining({
          invite_id: 123,
          code: expect.any(String),
          role: 'admin',
          email: 'alice@aston.ac.uk',
          allowed_domains: ['aston.ac.uk', 'gmail.com'],
          max_uses: 3,
          expires_at: '2030-01-01 00:00:00'
        })
      );
    });

    it('retries code generation on collision, then succeeds', async () => {
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('xxxxxxxxxxxxxxxx')); // stable

      const req = mockReq({
        user: { user_id: 7 },
        body: { role: 'supervisor', email: 'bob@gmail.com', max_uses: 1 }
      });
      const res = mockRes();

      // First SELECT finds an existing row (collision), second SELECT finds none
      db.query
        .mockResolvedValueOnce([ [ { invite_id: 1 } ] ]) // collision
        .mockResolvedValueOnce([ [] ])                   // no collision
        .mockResolvedValueOnce([ { insertId: 777 } ])    // insert invite
        .mockResolvedValueOnce([ { insertId: 888 } ]);   // audit

      await adminController.createInvite(req, res);

      expect(db.query).toHaveBeenCalledTimes(4);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invite_id: 777,
        role: 'supervisor',
        email: 'bob@gmail.com',
        max_uses: 1,
        allowed_domains: ['aston.ac.uk', 'gmail.com'] // defaults when none provided
      }));
    });

    it('validates role and returns 400 for invalid role', async () => {
      const req = mockReq({
        user: { user_id: 1 },
        body: { role: 'student', email: 'x@y.com' } // invalid
      });
      const res = mockRes();

      await adminController.createInvite(req, res);

      expect(db.query).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/role/i)
      }));
    });

    it('stops after too many collisions and returns 500', async () => {
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('yyyyyyyyyyyyyyyy'));

      const req = mockReq({
        user: { user_id: 1 },
        body: { role: 'admin' }
      });
      const res = mockRes();

      // Always "exists" for >5 tries
      db.query.mockResolvedValue([ [ { invite_id: 9 } ] ]);

      await adminController.createInvite(req, res);

      // It will bail before insert, so likely <= 7 calls (depends on exactly when it returns).
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/could not generate code/i)
      }));
    });
  });

  describe('listInvites', () => {
    it('returns list with unified allowed_domains array', async () => {
      const req = mockReq();
      const res = mockRes();

      db.query.mockResolvedValueOnce([[
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
          created_at: '2025-01-01 12:00:00'
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
          created_at: '2025-01-02 12:00:00'
        }
      ]]);

      await adminController.listInvites(req, res);

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          invite_id: 1,
          email: 'a@aston.ac.uk',
          role: 'admin',
          allowed_domains: ['aston.ac.uk', 'gmail.com']
        }),
        expect.objectContaining({
          invite_id: 2,
          role: 'supervisor',
          allowed_domains: ['legacy.com']
        })
      ]);
    });
  });

  describe('revokeInvite', () => {
    it('marks invite as used up and audits the action', async () => {
      const req = mockReq({
        user: { user_id: 55 },
        params: { invite_id: '123' }
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE admin_invites
        .mockResolvedValueOnce([{ insertId: 999 }]);  // INSERT audit_logs

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
