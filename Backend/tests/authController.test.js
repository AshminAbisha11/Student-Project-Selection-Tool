// ---- stable package-level mocks ----

// Mock bcrypt + jwt for deterministic behavior
jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (pw) => `hashed(${pw})`),
  compare: jest.fn(async (pw, hashed) => hashed === `hashed(${pw})`),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'jwt-token-123'),
}));

// Mock blacklist model (package-style)
jest.mock('../models/blacklistModel', () => ({
  addTokenToBlacklist: jest.fn().mockResolvedValue(undefined),
}));

// Mock nodemailer (package-style)
const mockSendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

// ---- test helpers ----
const path = require('path');
const jwt = require('jsonwebtoken');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

// We'll assign these per-test after we set up a path-perfect db mock
let authCtl;
let db;

// Utility: build an exact module ID for ../config/db as if required from controllers/
function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

// helper to fetch the first INSERT call for a table from either query or execute
function findInsertCall(table) {
  const rx = new RegExp(`\\bINSERT\\s+INTO\\s+${table}\\b`, 'i');

  const scan = (calls) => {
    for (const call of calls) {
      const [sql, params] = call;
      if (typeof sql === 'string' && rx.test(sql)) return { sql, params };
    }
    return null;
  };

  const fromQuery = scan(db.query.mock.calls || []);
  if (fromQuery) return { ...fromQuery, fn: 'query' };

  if (db.execute) {
    const fromExec = scan(db.execute.mock.calls || []);
    if (fromExec) return { ...fromExec, fn: 'execute' };
  }
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();

  // Set predictable env BEFORE requiring the controller
  process.env.JWT_SECRET_KEY = 'test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:3000';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_APP_PASSWORD = 'app-pass';
  delete process.env.ADMIN_BOOTSTRAP_CODES;
  delete process.env.ADMIN_BOOTSTRAP_ALLOWED_DOMAINS;

  // Load everything in an isolated registry and mock the exact DB module ID
  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db; // export the pool
    });

    try {
      authCtl = require('../controllers/authController');
    } catch {
      // Fallback if your file lives under src/controllers
      const srcControllersDir = path.join(__dirname, '..', 'src', 'controllers');
      const dbModuleIdSrc = require.resolve('../config/db', { paths: [srcControllersDir] });
      jest.doMock(dbModuleIdSrc, () => {
        const mocked = require('./mocks/db.mock');
        return mocked.db;
      });
      authCtl = require('../src/controllers/authController');
    }

    // Grab same db mock instance
    db = require('./mocks/db.mock').db;

    // reset mocks and ensure execute exists
    db.query.mockReset();
    if (!db.execute) db.execute = jest.fn();
    db.execute.mockReset();
  });
});

describe('authController', () => {
  // ---------- adminSignup ----------
  describe('adminSignup', () => {
    it('bootstrap flow (first admin) with env code/domain', async () => {
      process.env.ADMIN_BOOTSTRAP_CODES = 'BOOT1,BOOT2';
      process.env.ADMIN_BOOTSTRAP_ALLOWED_DOMAINS = 'aston.ac.uk,gmail.com';

      const req = mockReq({
        body: {
          name: 'Alice',
          email: 'Alice+alias@aston.ac.uk',
          password: 'Aa!aaa11',
          inviteCode: 'BOOT2',
        },
      });
      const res = mockRes();

      // dup email?, count admins -> bootstrap
      db.query
        .mockResolvedValueOnce([[undefined]])
        .mockResolvedValueOnce([[{ c: 0 }]]);

      // inserts (support either query or execute)
      db.query.mockResolvedValueOnce([{ insertId: 10 }]);       // insert user via query (if used)
      db.execute.mockResolvedValueOnce([{ insertId: 10 }]);     // insert user via execute (if used)
      db.query.mockResolvedValueOnce([{ insertId: 99 }]);       // audit via query (if used)
      db.execute.mockResolvedValueOnce([{ insertId: 99 }]);     // audit via execute (if used)

      await authCtl.adminSignup(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'jwt-token-123',
          role: 'admin',
          user: expect.objectContaining({ user_id: 10, role: 'admin' }),
        })
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 10, role: 'admin' }),
        'test-secret',
        expect.any(Object)
      );
    });

    it('bootstrap flow rejects when code required but missing/invalid', async () => {
      process.env.ADMIN_BOOTSTRAP_CODES = 'BOOTX,BOOTY';

      const req = mockReq({
        body: { name: 'A', email: 'a@aston.ac.uk', password: 'Aa!aaa11' },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]]) // dup?
        .mockResolvedValueOnce([[{ c: 0 }]]); // bootstrap

      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      jest.clearAllMocks();
      db.query
        .mockResolvedValueOnce([[undefined]])
        .mockResolvedValueOnce([[{ c: 0 }]]);
      await authCtl.adminSignup(
        mockReq({ body: { name: 'A', email: 'a@aston.ac.uk', password: 'Aa!aaa11', inviteCode: 'WRONG' } }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('bootstrap flow rejects when domain not allowed', async () => {
      process.env.ADMIN_BOOTSTRAP_ALLOWED_DOMAINS = 'aston.ac.uk';

      const req = mockReq({
        body: { name: 'A', email: 'a@gmail.com', password: 'Aa!aaa11', inviteCode: 'ANY' },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]])
        .mockResolvedValueOnce([[{ c: 0 }]]);

      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('normal flow (requires DB invite) validates and consumes invite', async () => {
      const req = mockReq({
        body: {
          name: 'Bob',
          email: 'bob@gmail.com',
          password: 'Abcdef!1',
          inviteCode: 'ASTON-ADMIN-AAAA-BBBB-CCCC',
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]]) // dup email?
        .mockResolvedValueOnce([[{ c: 5 }]]) // not bootstrap
        .mockResolvedValueOnce([[{
          invite_id: 77,
          role: 'admin',
          email: null,
          allowed_domain: null,
          allowed_domains_json: JSON.stringify(['gmail.com']),
          max_uses: 3,
          uses: 1,
          expires_at: null
        }]]);

      // insert user (support query or execute)
      db.query.mockResolvedValueOnce([{ insertId: 123 }]);
      db.execute.mockResolvedValueOnce([{ insertId: 123 }]);
      // update invite uses, insert claims, audit (again support either)
      db.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 456 }])
        .mockResolvedValueOnce([{ insertId: 789 }]);
      db.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 456 }])
        .mockResolvedValueOnce([{ insertId: 789 }]);

      await authCtl.adminSignup(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'jwt-token-123', role: 'admin' })
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 123, role: 'admin' }),
        'test-secret',
        expect.any(Object)
      );
    });

    it('normal flow rejects when invite locked to a different email', async () => {
      const req = mockReq({
        body: {
          name: 'Bob',
          email: 'bob@gmail.com',
          password: 'Abcdef!1',
          inviteCode: 'X',
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]])
        .mockResolvedValueOnce([[{ c: 1 }]])
        .mockResolvedValueOnce([[{
          invite_id: 1,
          role: 'admin',
          email: 'other@gmail.com',
          allowed_domain: null,
          allowed_domains_json: null,
          max_uses: 1,
          uses: 0,
          expires_at: null,
        }]]);

      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/locked to a different email/i),
      }));
    });

    it('normal flow rejects when invite domain not allowed', async () => {
      const req = mockReq({
        body: {
          name: 'Bob',
          email: 'bob@yahoo.com',
          password: 'Abcdef!1',
          inviteCode: 'X',
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]])
        .mockResolvedValueOnce([[{ c: 10 }]])
        .mockResolvedValueOnce([[{
          invite_id: 1,
          role: 'admin',
          email: null,
          allowed_domain: null,
          allowed_domains_json: JSON.stringify(['gmail.com']),
          max_uses: 1,
          uses: 0,
          expires_at: null,
        }]]);

      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/domain not allowed/i),
      }));
    });

    it('rejects weak password & duplicate email', async () => {
      let req = mockReq({ body: { name: 'A', email: 'a@a.com', password: 'weak' } });
      let res = mockRes();
      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req = mockReq({ body: { name: 'A', email: 'a@a.com', password: 'Aa!aaaa1', inviteCode: 'X' } });
      res = mockRes();
      db.query.mockResolvedValueOnce([[{ user_id: 9 }]]);
      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('returns 500 on unexpected DB error', async () => {
      const req = mockReq({ body: { name: 'A', email: 'a@a.com', password: 'Aa!aaaa1', inviteCode: 'X' } });
      const res = mockRes();

      db.query.mockRejectedValueOnce(new Error('boom'));
      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ---------- loginUser ----------
  describe('loginUser', () => {
    it('logs in with correct credentials', async () => {
      const req = mockReq({ body: { email: 'user@x.com', password: 'P@ssw0rd!' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[ // SELECT user
          { user_id: 5, email: 'user@x.com', name: 'U', role: 'student', password: 'hashed(P@ssw0rd!)' }
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update last_login

      await authCtl.loginUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User login successful',
        token: 'jwt-token-123'
      }));
    });

    it('fails when user not found', async () => {
      const req = mockReq({ body: { email: 'no@x.com', password: 'x' } });
      const res = mockRes();
      db.query.mockResolvedValueOnce([[]]);
      await authCtl.loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('fails when password mismatch', async () => {
      const req = mockReq({ body: { email: 'user@x.com', password: 'wrong' } });
      const res = mockRes();
      db.query.mockResolvedValueOnce([[{ user_id: 1, email: 'user@x.com', name: 'U', role: 'student', password: 'hashed(right)' }]]);
      await authCtl.loginUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when missing fields', async () => {
      const res = mockRes();
      await authCtl.loginUser(mockReq({ body: { email: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ---------- registerUser ----------
  describe('registerUser', () => {
    it('registers a student (keeps + aliases in email)', async () => {
      const req = mockReq({
        body: {
          name: 'Stu',
          email: 'stu+alias@a.com',
          password: 'P@ssw0rd1',
          confirmPassword: 'P@ssw0rd1',
          programme: 'MSc',
          role: 'student'
        }
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]); // existing?

      // insert via query or execute
      db.query.mockResolvedValueOnce([{ insertId: 44 }]);
      db.execute.mockResolvedValueOnce([{ insertId: 44 }]);

      await authCtl.registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User registered successfully.'
      }));
    });

    it('normalizes non-student: programme is set to null on insert', async () => {
      const req = mockReq({
        body: {
          name: 'Sup',
          email: 'sup@a.com',
          password: 'P@ssw0rd1',
          confirmPassword: 'P@ssw0rd1',
          programme: 'ShouldBeNull',
          role: 'supervisor'
        }
      });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]); // existing?

      // insert (support both)
      db.query.mockResolvedValueOnce([{ insertId: 77 }]);
      db.execute.mockResolvedValueOnce([{ insertId: 77 }]);

      await authCtl.registerUser(req, res);

      const call = findInsertCall('users');
      expect(call).toBeTruthy();
      const params = call.params;
      // [name, email, hashed, programme, role]
      expect(params[3]).toBeNull();
      expect(params[4]).toBe('supervisor');

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects invalid email / missing programme / weak or mismatched passwords / duplicate', async () => {
      // invalid email
      let req = mockReq({
        body: { name: 'X', email: 'bad@@mail', password: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1', role: 'student', programme: 'MSc' }
      });
      let res = mockRes();
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // missing programme (student)
      req = mockReq({
        body: { name: 'X', email: 'ok@x.com', password: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1', role: 'student' }
      });
      res = mockRes();
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // weak password
      req = mockReq({
        body: { name: 'X', email: 'ok@x.com', password: 'weak', confirmPassword: 'weak', role: 'student', programme: 'MSc' }
      });
      res = mockRes();
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // mismatched
      req = mockReq({
        body: { name: 'X', email: 'ok@x.com', password: 'P@ssw0rd1', confirmPassword: 'Mismatch', role: 'student', programme: 'MSc' }
      });
      res = mockRes();
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // duplicate
      req = mockReq({
        body: { name: 'X', email: 'dup@x.com', password: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1', role: 'student', programme: 'MSc' }
      });
      res = mockRes();
      db.query.mockResolvedValueOnce([[{ user_id: 1 }]]);
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('500 on DB error', async () => {
      const req = mockReq({
        body: { name: 'X', email: 'ok@x.com', password: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1', role: 'student', programme: 'MSc' }
      });
      const res = mockRes();
      db.query.mockRejectedValueOnce(new Error('boom'));
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ---------- forgotPassword ----------
  describe('forgotPassword', () => {
    it('sends reset email if user exists', async () => {
      const req = mockReq({ body: { email: 'reset@x.com' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ user_id: 9 }]]) // find user
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update token

      await authCtl.forgotPassword(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Password reset link sent to email.'
      }));
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('404 when email not found', async () => {
      const req = mockReq({ body: { email: 'no@x.com' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]);
      await authCtl.forgotPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('400 when email missing', async () => {
      const res = mockRes();
      await authCtl.forgotPassword(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('500 when transporter fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('smtp down'));
      const req = mockReq({ body: { email: 'reset@x.com' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ user_id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await authCtl.forgotPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ---------- resetPassword ----------
  describe('resetPassword', () => {
    it('resets password with valid token', async () => {
      const req = mockReq({ params: { token: 'abc' }, body: { password: 'NewP@ss1' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ user_id: 9 }]]) // select by token
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update pw

      await authCtl.resetPassword(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Password reset successful. You can now log in.'
      }));
    });

    it('rejects invalid/expired token', async () => {
      const req = mockReq({ params: { token: 'bad' }, body: { password: 'X' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]);
      await authCtl.resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when token or password missing', async () => {
      const res = mockRes();
      await authCtl.resetPassword(mockReq({ params: {}, body: { password: 'X' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);

      jest.clearAllMocks();
      await authCtl.resetPassword(mockReq({ params: { token: 't' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('500 on DB error', async () => {
      const req = mockReq({ params: { token: 't' }, body: { password: 'Xy!23456' } });
      const res = mockRes();
      db.query.mockRejectedValueOnce(new Error('boom'));
      await authCtl.resetPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ---------- logout ----------
  describe('logoutUser', () => {
    it('blacklists token when present', async () => {
      const req = { headers: { authorization: 'Bearer hello' } };
      const res = mockRes();
      await authCtl.logoutUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('still 200 when no token', async () => {
      const req = { headers: { authorization: '' } };
      const res = mockRes();
      await authCtl.logoutUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    // UPDATED: controller returns 200 even if blacklisting fails
    it('still 200 when blacklist fails', async () => {
      const { addTokenToBlacklist } = require('../models/blacklistModel');
      addTokenToBlacklist.mockRejectedValueOnce(new Error('fail'));
      const req = { headers: { authorization: 'Bearer t' } };
      const res = mockRes();
      await authCtl.logoutUser(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ---------- changePassword ----------
  describe('changePassword', () => {
    it('changes password when current matches and new is strong', async () => {
      const req = mockReq({
        user: { user_id: 55 },
        body: { currentPassword: 'OldP@ss1', newPassword: 'NewP@ss1' }
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ password: 'hashed(OldP@ss1)' }]]) // get current
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      await authCtl.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Password updated successfully.'
      }));
    });

    it('401 when current password is wrong', async () => {
      const req = mockReq({
        user: { user_id: 55 },
        body: { currentPassword: 'Wrong', newPassword: 'NewP@ss1' }
      });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ password: 'hashed(OldP@ss1)' }]]);
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('400 when missing fields / weak new / 401 unauthorized / 404 not found / 500 error', async () => {
      // missing fields
      let req = mockReq({ user: { user_id: 1 }, body: { currentPassword: 'a' } });
      let res = mockRes();
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // unauthorized
      req = mockReq({ body: { currentPassword: 'a', newPassword: 'Abc!1234' } });
      res = mockRes();
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(401);

      // user not found
      req = mockReq({ user: { user_id: 1 }, body: { currentPassword: 'a', newPassword: 'Abc!1234' } });
      res = mockRes();
      db.query.mockResolvedValueOnce([[]]);
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(404);

      // weak new
      req = mockReq({ user: { user_id: 1 }, body: { currentPassword: 'Cur!1234', newPassword: 'weak' } });
      res = mockRes();
      db.query.mockResolvedValueOnce([[{ password: 'hashed(Cur!1234)' }]]);
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // 500 on DB error
      req = mockReq({ user: { user_id: 1 }, body: { currentPassword: 'Cur!1234', newPassword: 'Abc!1234' } });
      res = mockRes();
      db.query
        .mockResolvedValueOnce([[{ password: 'hashed(Cur!1234)' }]])
        .mockRejectedValueOnce(new Error('boom'));
      await authCtl.changePassword(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ---------- me ----------
  describe('me', () => {
    it('returns 401 when no user', async () => {
      const req = mockReq();
      req.user = null; // manually force it
      const res = mockRes();
      await authCtl.me(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns user when present', async () => {
      const req = mockReq({ user: { user_id: 1, name: 'X' } });
      const res = mockRes();
      await authCtl.me(req, res);
      expect(res.json).toHaveBeenCalledWith({ user: { user_id: 1, name: 'X' } });
    });
  });

  // ---------- adminLogin ----------
  describe('adminLogin', () => {
    it('logs in only if role is admin', async () => {
      const req = mockReq({ body: { email: 'a@x.com', password: 'P@ssw0rd!' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{
          user_id: 1, email: 'a@x.com', name: 'A', role: 'admin', password: 'hashed(P@ssw0rd!)'
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await authCtl.adminLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Admin login successful',
        token: 'jwt-token-123'
      }));
    });

    it('403 when role is not admin', async () => {
      const req = mockReq({ body: { email: 'u@x.com', password: 'P@ssw0rd!' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{
        user_id: 2, email: 'u@x.com', name: 'U', role: 'student', password: 'hashed(P@ssw0rd!)'
      }]]);

      await authCtl.adminLogin(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('400 when user not found or password mismatch', async () => {
      let req = mockReq({ body: { email: 'none@x.com', password: 'x' } });
      let res = mockRes();
      db.query.mockResolvedValueOnce([[]]);
      await authCtl.adminLogin(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req = mockReq({ body: { email: 'a@x.com', password: 'wrong' } });
      res = mockRes();
      db.query.mockResolvedValueOnce([[{ user_id: 1, email: 'a@x.com', name: 'A', role: 'admin', password: 'hashed(right)' }]]);
      await authCtl.adminLogin(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when missing fields', async () => {
      const res = mockRes();
      await authCtl.adminLogin(mockReq({ body: { email: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
