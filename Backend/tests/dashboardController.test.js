/**
 * Tests for controllers/dashboardController.js
 * - Mocks the exact db module id as resolved from controllers/
 * - Covers: unauthorized, invalid cycle param, cycle=param, cycle=active (by status),
 *   cycle=active (by date), no active → all cycles, applications table missing,
 *   applications present but no rows, and unexpected DB error → 500.
 */

const path = require('path');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let dashboardCtl;
let db;

// Resolve the same module id `../config/db` that the controller imports
function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();

    // Provide our pool-like mock for that exact module id
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db;
    });

    // Now require the controller so it gets the mocked db
    dashboardCtl = require('../controllers/dashboardController');
    db = require('./mocks/db.mock').db;

    // Reset db mock state just in case
    db.query.mockReset?.();
    db.getConnection?.mockReset?.();
  });
});

describe('dashboardController.getStudentDashboard', () => {
  it('401 when no user on req', async () => {
    const req = mockReq();
    req.user = null;
    const res = mockRes();

    await dashboardCtl.getStudentDashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unauthorized' }));
  });

  it('400 when cycle_id query is invalid', async () => {
    const req = mockReq({ user: { user_id: 5 }, query: { cycle_id: 'abc' } });
    const res = mockRes();

    await dashboardCtl.getStudentDashboard(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid cycle_id' }));
  });

  it('uses explicit cycle_id (param scope) and returns stats', async () => {
    const req = mockReq({ user: { user_id: 7 }, query: { cycle_id: '10' } });
    const res = mockRes();

    // 1) users -> name
    // 2) preferences count (with cycle filter)
    // 3) proposals count (with cycle filter)
    // 4) applications latest (with cycle filter)
    db.query
      .mockResolvedValueOnce([[{ name: 'Student A' }]])   // users row
      .mockResolvedValueOnce([[{ count: 3 }]])            // preferences
      .mockResolvedValueOnce([[{ count: 2 }]])            // proposals
      .mockResolvedValueOnce([[{ status: 'Submitted' }]]); // applications

    await dashboardCtl.getStudentDashboard(req, res);

    expect(db.query).toHaveBeenCalledTimes(4);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Student A',
      stats: {
        preferencesSubmitted: 3,
        proposalsSent: 2,
        applicationStatus: 'Submitted',
      },
      cycle: { cycle_id: 10, scope: 'param' },
    });
  });

  it('when no cycle_id, resolves active by status=open', async () => {
    const req = mockReq({ user: { user_id: 11 }, query: {} });
    const res = mockRes();

    // getActiveCycleId: by status -> found 15
    db.query
      .mockResolvedValueOnce([[{ cycle_id: 15 }]]) // byStatus
      // users
      .mockResolvedValueOnce([[{ name: 'Stu B' }]])
      // preferences (filtered with cycle_id)
      .mockResolvedValueOnce([[{ count: 0 }]])
      // proposals (filtered with cycle_id)
      .mockResolvedValueOnce([[{ count: 1 }]])
      // applications (filtered with cycle_id)
      .mockResolvedValueOnce([[{ status: 'In Review' }]]);

    await dashboardCtl.getStudentDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Stu B',
      stats: {
        preferencesSubmitted: 0,
        proposalsSent: 1,
        applicationStatus: 'In Review',
      },
      cycle: { cycle_id: 15, scope: 'active' },
    });
  });

  it('resolves active by date window when no status=open', async () => {
    const req = mockReq({ user: { user_id: 21 }, query: {} });
    const res = mockRes();

    // getActiveCycleId:
    // - byStatus: []
    // - byDate: found -> 33
    db.query
      .mockResolvedValueOnce([[]])                 // byStatus
      .mockResolvedValueOnce([[{ cycle_id: 33 }]]) // byDate
      .mockResolvedValueOnce([[{ name: 'Stu D' }]]) // users
      .mockResolvedValueOnce([[{ count: 2 }]])     // preferences
      .mockResolvedValueOnce([[{ count: 3 }]])     // proposals
      .mockResolvedValueOnce([[{ status: 'Pending' }]]); // applications

    await dashboardCtl.getStudentDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Stu D',
      stats: {
        preferencesSubmitted: 2,
        proposalsSent: 3,
        applicationStatus: 'Pending',
      },
      cycle: { cycle_id: 33, scope: 'active' },
    });
  });

  it('when no active cycle, uses all cycles (applications table missing → Not Applied)', async () => {
    const req = mockReq({ user: { user_id: 20 }, query: {} });
    const res = mockRes();

    // getActiveCycleId:
    // - byStatus: []
    // - byDate: [] => null -> all cycles
    db.query
      .mockResolvedValueOnce([[]])               // byStatus
      .mockResolvedValueOnce([[]])               // byDate
      .mockResolvedValueOnce([[{ name: 'Stu C' }]]) // users
      .mockResolvedValueOnce([[{ count: 5 }]])   // preferences (no cycle filter)
      .mockResolvedValueOnce([[{ count: 4 }]])   // proposals (no cycle filter)
      // applications: simulate table not existing — controller should ignore gracefully
      .mockRejectedValueOnce(Object.assign(new Error('no such table'), { code: 'ER_NO_SUCH_TABLE' }));

    await dashboardCtl.getStudentDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Stu C',
      stats: {
        preferencesSubmitted: 5,
        proposalsSent: 4,
        applicationStatus: 'Not Applied',
      },
      cycle: { cycle_id: null, scope: 'all' },
    });
  });

  it('applications present but no rows → applicationStatus stays "Not Applied"', async () => {
    const req = mockReq({ user: { user_id: 8 }, query: { cycle_id: '77' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ name: 'Stu E' }]]) // users
      .mockResolvedValueOnce([[{ count: 1 }]])      // preferences
      .mockResolvedValueOnce([[{ count: 0 }]])      // proposals
      .mockResolvedValueOnce([[]]);                 // applications none

    await dashboardCtl.getStudentDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Stu E',
      stats: {
        preferencesSubmitted: 1,
        proposalsSent: 0,
        applicationStatus: 'Not Applied',
      },
      cycle: { cycle_id: 77, scope: 'param' },
    });
  });

  it('500 on unexpected DB error during users lookup', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: {} });
    const res = mockRes();

    // getActiveCycleId by status: none
    // by date: none → will proceed with all cycles, then users error
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(new Error('boom')); // users

    await dashboardCtl.getStudentDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Something went wrong fetching dashboard data.',
    }));
  });
});
