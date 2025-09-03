/**
 * Tests for controllers/dashboardController.js
 * - Mocks the exact db module id as resolved from controllers/
 * - Covers: unauthorized, invalid cycle param, cycle=param, cycle=active (by status),
 *   cycle=active (by date), and missing `applications` table graceful handling.
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
    db.query.mockReset();
    if (db.getConnection?.mockReset) db.getConnection.mockReset();
  });
});

describe('dashboardController.getStudentDashboard', () => {
  it('401 when no user on req', async () => {
    const req = mockReq(); // likely sets {} — force null to be safe:
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
        applicationStatus: 'Submitted'
      },
      cycle: { cycle_id: 10, scope: 'param' }
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
        applicationStatus: 'In Review'
      },
      cycle: { cycle_id: 15, scope: 'active' }
    });
  });

  it('when no status=open, resolves active by date; if still none, uses all cycles', async () => {
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
        applicationStatus: 'Not Applied' // because applications table missing
      },
      cycle: { cycle_id: null, scope: 'all' }
    });
  });
});
