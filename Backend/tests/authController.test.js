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
  // __dirname is .../backend/tests
  const controllersDir = path.join(__dirname, '..', 'controllers');
  // Resolve the same module ID that "../controllers/authController.js" will resolve for '../config/db'
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  // Set predictable env BEFORE requiring the controller
  process.env.JWT_SECRET_KEY = 'test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:3000';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_APP_PASSWORD = 'app-pass';

  // Load everything in an isolated registry and mock the exact DB module ID
  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();
    // Provide our pool-like mock for *that exact* module id
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db; // export the pool
    });

    // Now that the db module id is mocked, require the controller
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

    // Grab the same db mock instance we exported above for assertions
    // (require after doMock so it returns the mocked pool, not a real one)
    db = require('./mocks/db.mock').db;
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
          email: 'Alice@aston.ac.uk',
          password: 'Aa!aaa11',
          inviteCode: 'BOOT2',
        },
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[undefined]]) // dup email?
        .mockResolvedValueOnce([[{ c: 0 }]]) // count admins -> bootstrap
        .mockResolvedValueOnce([{ insertId: 10 }]) // insert user
        .mockResolvedValueOnce([{ insertId: 99 }]); // audit

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
        }]]) // invite row
        .mockResolvedValueOnce([{ insertId: 123 }]) // insert user
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update invite uses
        .mockResolvedValueOnce([{ insertId: 456 }]) // claims insert
        .mockResolvedValueOnce([{ insertId: 789 }]); // audit

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

    it('rejects weak password', async () => {
      const req = mockReq({ body: { name: 'A', email: 'a@a.com', password: 'weak' } });
      const res = mockRes();
      await authCtl.adminSignup(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ---------- loginUser ----------
  describe('loginUser', () => {
    it('logs in with correct credentials', async () => {
      const req = mockReq({ body: { email: 'user@x.com', password: 'P@ssw0rd!' } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[
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
  });

  // ---------- registerUser ----------
  describe('registerUser', () => {
    it('registers a student', async () => {
      const req = mockReq({
        body: {
          name: 'Stu',
          email: 'stu@a.com',
          password: 'P@ssw0rd1',
          confirmPassword: 'P@ssw0rd1',
          programme: 'MSc',
          role: 'student'
        }
      });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]) // existing?
        .mockResolvedValueOnce([{ insertId: 44 }]); // insert

      await authCtl.registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User registered successfully.'
      }));
    });

    it('rejects duplicate email', async () => {
      const req = mockReq({
        body: {
          name: 'Stu',
          email: 'dup@a.com',
          password: 'P@ssw0rd1',
          confirmPassword: 'P@ssw0rd1',
          programme: 'MSc',
          role: 'student'
        }
      });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ user_id: 1 }]]);
      await authCtl.registerUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
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
  });

  // ---------- logout ----------
  describe('logoutUser', () => {
    it('blacklists token when present', async () => {
      const req = { headers: { authorization: 'Bearer hello' } };
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
  });

  // ---------- me ----------
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
  });

