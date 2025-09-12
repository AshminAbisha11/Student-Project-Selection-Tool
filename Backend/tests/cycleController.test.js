/**
 * Cycle Controller tests (updated)
 * - Path-accurate db mock so the controller never hits a real DB
 * - Mocks dateUtil.toSqlDate for predictable behavior
 */

const path = require('path');

// ---- package-level mocks ----
jest.mock('../utils/dateUtil', () => ({
  toSqlDate: (s) => new Date(s).toISOString().slice(0, 19).replace('T', ' '), // simple ISO->SQL
}));

const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let cycleCtl;
let db;

// Utility: compute the exact module id `../config/db` as resolved from `controllers/`
function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();

    // Mock the exact DB module id used inside the controller
    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db; // export pool-like mock
    });

    // Require controller after DB is mocked
    cycleCtl = require('../controllers/cycleController');

    // Grab the same db mock
    db = require('./mocks/db.mock').db;

    // Reset db mock state
    db.query.mockReset?.();
    db.getConnection?.mockReset?.();
  });
});

/* ---------------- getActive ---------------- */
describe('cycleController.getActive', () => {
  it('returns null when no open cycle', async () => {
    const req = mockReq();
    const res = mockRes();

    db.query.mockResolvedValueOnce([[]]); // SELECT ... WHERE status='open' ...

    await cycleCtl.getActive(req, res);

    expect(res.json).toHaveBeenCalledWith(null);
  });

  it('returns the latest open cycle', async () => {
    const req = mockReq();
    const res = mockRes();

    db.query.mockResolvedValueOnce([[{ cycle_id: 22, status: 'open' }]]);

    await cycleCtl.getActive(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cycle_id: 22, status: 'open' }));
  });
});

/* ---------------- getStatus ---------------- */
describe('cycleController.getStatus', () => {
  it('returns 500 + message when there are no cycles', async () => {
    const req = mockReq();
    const res = mockRes();

    // 1) First query: ORDER BY (open > draft > id) LIMIT 1 -> none
    db.query.mockResolvedValueOnce([[]]);

    await cycleCtl.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Failed to fetch cycle status') })
    );
  });

  it('computes flags for an open cycle (submission still open)', async () => {
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    const req = mockReq();
    const res = mockRes();

    const openCycle = {
      cycle_id: 10,
      status: 'open',
      submission_open_at: new Date(now - hour).toISOString(),
      submission_close_at: new Date(now + hour).toISOString(),
      commit_at: new Date(now + 2 * hour).toISOString(),
      name: 'Cycle X',
    };

    // 1) “most relevant” (returns an open cycle)
    db.query.mockResolvedValueOnce([[openCycle]]);
    // 2) “openRow” (exists)
    db.query.mockResolvedValueOnce([[openCycle]]);

    await cycleCtl.getStatus(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.hasAnyCycle).toBe(true);
    expect(payload.hasActiveCycle).toBe(true);
    expect(payload.cycle).toEqual(expect.objectContaining({ cycle_id: 10, status: 'open' }));
    expect(payload.isSubmissionOpen).toBe(true);
    expect(payload.hasPassedDeadline).toBe(false);
    expect(payload.secondsUntilClose).toBeGreaterThan(0);
    expect(payload.secondsUntilCommit).toBeGreaterThan(0);
    expect(payload.canCommitNow).toBe(false);
  });

  it('computes canCommitNow when not open and after deadline', async () => {
    const now = Date.now();
    const hour = 60 * 60 * 1000;

    const closedCycle = {
      cycle_id: 99,
      status: 'closed',
      submission_open_at: new Date(now - 3 * hour).toISOString(),
      submission_close_at: new Date(now - hour).toISOString(), // past
      commit_at: new Date(now - 10 * 1000).toISOString(), // also past
      name: 'Past',
    };

    const req = mockReq();
    const res = mockRes();

    // 1) most relevant (closed)
    db.query.mockResolvedValueOnce([[closedCycle]]);
    // 2) openRow: none
    db.query.mockResolvedValueOnce([[]]);

    await cycleCtl.getStatus(req, res);

    const p = res.json.mock.calls[0][0];
    expect(p.hasAnyCycle).toBe(true);
    expect(p.hasActiveCycle).toBe(false);
    expect(p.isSubmissionOpen).toBe(false);
    expect(p.hasPassedDeadline).toBe(true);
    expect(p.canCommitNow).toBe(true);
  });
});

/* ---------------- list ---------------- */
describe('cycleController.list', () => {
  it('lists cycles ordered by submission_open_at desc', async () => {
    const req = mockReq();
    const res = mockRes();

    const rows = [{ cycle_id: 2 }, { cycle_id: 1 }];
    db.query.mockResolvedValueOnce([rows]);

    await cycleCtl.list(req, res);

    expect(res.json).toHaveBeenCalledWith(rows);
  });
});

/* ---------------- create ---------------- */
describe('cycleController.create', () => {
  it('400 when required fields are missing', async () => {
    const req = mockReq({ body: { name: 'C1', submission_open_at: null, submission_close_at: null } });
    const res = mockRes();

    await cycleCtl.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/required/i),
    }));
  });

  it('400 when close <= open', async () => {
    const req = mockReq({
      body: {
        name: 'C1',
        submission_open_at: '2025-01-02 10:00:00',
        submission_close_at: '2025-01-02 09:00:00',
      }
    });
    const res = mockRes();

    await cycleCtl.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Close must be after open' }));
  });

  it('400 when commit < close', async () => {
    const req = mockReq({
      body: {
        name: 'C1',
        submission_open_at: '2025-01-02 09:00:00',
        submission_close_at: '2025-01-02 10:00:00',
        commit_at: '2025-01-02 09:30:00'
      }
    });
    const res = mockRes();

    await cycleCtl.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Commit must be on/after close' }));
  });

  it('201 creates draft and returns inserted row', async () => {
    const req = mockReq({
      body: {
        name: 'C1',
        submission_open_at: '2025-01-02 09:00:00',
        submission_close_at: '2025-01-02 10:00:00',
        commit_at: '2025-01-03 09:00:00',
        status: 'draft'
      }
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([{ insertId: 77 }]) // insert
      .mockResolvedValueOnce([[{ cycle_id: 77, name: 'C1', status: 'draft' }]]); // select

    await cycleCtl.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ cycle_id: 77, name: 'C1', status: 'draft' });
  });

  it("status='open' closes other open cycles then inserts", async () => {
    const req = mockReq({
      body: {
        name: 'C2',
        submission_open_at: '2025-02-02 09:00:00',
        submission_close_at: '2025-02-03 09:00:00',
        status: 'open'
      }
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([{ affectedRows: 2 }]) // close other open
      .mockResolvedValueOnce([{ insertId: 88 }])    // insert
      .mockResolvedValueOnce([[{ cycle_id: 88, name: 'C2', status: 'open' }]]); // select

    await cycleCtl.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ cycle_id: 88, name: 'C2', status: 'open' });
  });
});

/* ---------------- update ---------------- */
describe('cycleController.update', () => {
  it('404 when cycle not found', async () => {
    const req = mockReq({ params: { id: 5 }, body: { name: 'New' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[undefined]]); // select current

    await cycleCtl.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('400 when no fields to update', async () => {
    const req = mockReq({ params: { id: 5 }, body: {} });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[{
      cycle_id: 5,
      submission_open_at: '2025-01-02 09:00:00',
      submission_close_at: '2025-01-03 09:00:00',
      commit_at: null
    }]]);

    await cycleCtl.update(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'No fields to update' }));
  });

  it("status='open' closes others and updates row", async () => {
    const req = mockReq({
      params: { id: 9 },
      body: { name: 'Renamed', status: 'open' }
    });
    const res = mockRes();

    db.query
      // current
      .mockResolvedValueOnce([[{
        cycle_id: 9,
        name: 'Old',
        submission_open_at: '2025-01-02 09:00:00',
        submission_close_at: '2025-01-03 09:00:00',
        commit_at: null
      }]])
      // close others
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // update fields
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // select updated
      .mockResolvedValueOnce([[{ cycle_id: 9, name: 'Renamed', status: 'open' }]]);

    await cycleCtl.update(req, res);

    expect(res.json).toHaveBeenCalledWith({ cycle_id: 9, name: 'Renamed', status: 'open' });
  });
});

/* ---------------- openNow ---------------- */
describe('cycleController.openNow', () => {
  it('opens cycle and seeds (assert success message + transaction)', async () => {
    const req = mockReq({ params: { id: 42 } });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // 1) close others
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // 2) open this one
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // 3) prev cycle query -> found
        .mockResolvedValueOnce([[{ cycle_id: 41 }]])
        // 3a) copy projects from prev
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        // 3b) copy details from prev
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        // 4a) copy from drafts
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        // 4b) copy details from drafts
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    db.getConnection = jest.fn().mockResolvedValue(conn);

    await cycleCtl.openNow(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Cycle opened successfully'),
    }));
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

/* ---------------- closeNow ---------------- */
describe('cycleController.closeNow', () => {
  it('closes cycle', async () => {
    const req = mockReq({ params: { id: 3 } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await cycleCtl.closeNow(req, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Cycle closed' });
  });
});

/* ---------------- commitNow ---------------- */
describe('cycleController.commitNow', () => {
  it('marks cycle as committed, closes others, stamps times', async () => {
    const req = mockReq({ params: { id: 5 } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // demote previous committed
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // set this committed

    await cycleCtl.commitNow(req, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Cycle marked as committed' });
  });
});

/* ---------------- archive ---------------- */
describe('cycleController.archive', () => {
  it('404 when no rows updated', async () => {
    const req = mockReq({ params: { id: 9 } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await cycleCtl.archive(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cycle not found' }));
  });

  it('archives cycle (sets to closed)', async () => {
    const req = mockReq({ params: { id: 9 } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await cycleCtl.archive(req, res);

    expect(res.json).toHaveBeenCalledWith({ message: 'Cycle archived (set to closed)' });
  });
});

/* ---------------- remove ---------------- */
describe('cycleController.remove', () => {
  it('404 when cycle not found', async () => {
    const req = mockReq({ params: { id: 10 } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[undefined]]); // select cycle

    await cycleCtl.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('400 when data exists and no force', async () => {
    const req = mockReq({ params: { id: 11 }, query: {} });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 11 }]]) // select row
      .mockResolvedValueOnce([[{ c: 4 }]])         // alloc count
      .mockResolvedValueOnce([[{ c: 2 }]]);        // projects count

    await cycleCtl.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Cannot delete cycle with existing data'),
    }));
  });

  it('deletes with force=1 (allocs and projects exist)', async () => {
    const req = mockReq({ params: { id: '12' }, query: { force: '1' } });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // delete allocations
        .mockResolvedValueOnce([{ affectedRows: 4 }])
        // delete projects
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        // delete cycle
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 12 }]]) // select row
      .mockResolvedValueOnce([[{ c: 4 }]])         // alloc count
      .mockResolvedValueOnce([[{ c: 2 }]]);        // projects count

    await cycleCtl.remove(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Cycle deleted',
      cycle_id: '12',
      forced: true,
    }));
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('deletes clean cycle (no allocs/projects)', async () => {
    const req = mockReq({ params: { id: '13' }, query: {} });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // delete cycle only
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 13 }]]) // select row
      .mockResolvedValueOnce([[{ c: 0 }]])         // alloc count
      .mockResolvedValueOnce([[{ c: 0 }]]);        // projects count

    await cycleCtl.remove(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Cycle deleted',
      cycle_id: '13',
      forced: false,
    }));
  });
});
