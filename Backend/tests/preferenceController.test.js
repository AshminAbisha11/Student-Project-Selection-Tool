/**
 * Tests for controllers/preferenceController.js
 * - Mocks the exact db module id as resolved from controllers/
 * - Covers: auth guards, resolveCycleId, list/status/add/update/reorder/contact/delete/submit
 */

const path = require('path');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let prefCtl;
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

    prefCtl = require('../controllers/preferenceController');
    db = require('./mocks/db.mock').db;

    db.query.mockReset();
    if (db.getConnection?.mockReset) db.getConnection.mockReset();
  });
});

/* ------------------- Guards (Unauthorized) ------------------- */
describe('preferenceController auth guards', () => {
  it('getPreferencesByStudent: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.getPreferencesByStudent(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('getSubmissionStatus: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.getSubmissionStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('addPreference: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('updatePreferenceOrder: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.updatePreferenceOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('updateContactedSupervisor: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.updateContactedSupervisor(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('deletePreference: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.deletePreference(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('submitPreferences: 401 without user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await prefCtl.submitPreferences(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

/* ------------------- getPreferencesByStudent ------------------- */
describe('getPreferencesByStudent', () => {
  it('resolves cycle from query and returns rows', async () => {
    const req = mockReq({ user: { user_id: 5 }, query: { cycle_id: '7' } });
    const res = mockRes();

    // resolveCycleId -> cycleExists
    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // SELECT 1 FROM allocation_cycles WHERE cycle_id=?
      .mockResolvedValueOnce([[ // main query returns preferences with joined project info
        { preference_id: 1, project_id: 10, preference_order: 1, title: 'P1' },
        { preference_id: 2, project_id: 11, preference_order: 2, title: 'P2' },
      ]]);

    await prefCtl.getPreferencesByStudent(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ preference_id: 1 }),
      expect.objectContaining({ preference_id: 2 }),
    ]));
  });
});

/* ------------------- getSubmissionStatus ------------------- */
describe('getSubmissionStatus', () => {
  it('returns submitted=false if no row; cycle via active fallback', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: {} });
    const res = mockRes();

    // resolveCycleId -> getActiveCycleId: byStatus -> empty; byDate -> finds 3
    db.query
      .mockResolvedValueOnce([[]])            // byStatus
      .mockResolvedValueOnce([[{ cycle_id: 3 }]]) // byDate
      .mockResolvedValueOnce([[{ submitted_at: null }]]); // submission status

    await prefCtl.getSubmissionStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({ submitted: false, submitted_at: null, cycle_id: 3 });
  });
});

/* ------------------- addPreference ------------------- */
describe('addPreference', () => {
  it('400 for invalid project_id', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 'x' }, query: { cycle_id: '2' } });
    const res = mockRes();
    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when project not found', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 10 }, query: { cycle_id: '2' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // cycleExists
      .mockResolvedValueOnce([[/* proj not found */]]); // select project

    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('409 when project is not in this cycle', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 10 }, query: { cycle_id: '2' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // cycleExists
      .mockResolvedValueOnce([[{ project_id: 10, cycle_id: 99, approval_status: 'approved', is_archived: 0 }]]);

    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('409 when project is not available', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 10 }, query: { cycle_id: '2' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // cycleExists
      .mockResolvedValueOnce([[{ project_id: 10, cycle_id: 2, approval_status: 'pending', is_archived: 0 }]]);

    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('400 when already has 5 preferences', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 10 }, query: { cycle_id: '2' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // cycleExists
      .mockResolvedValueOnce([[{ project_id: 10, cycle_id: 2, approval_status: 'approved', is_archived: 0 }]])
      .mockResolvedValueOnce([[1,2,3,4,5].map(i => ({ project_id: i }))]); // existing 5

    await prefCtl.addPreference(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('201 inserts new preference with order and default contacted=no', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { project_id: 55 }, query: { cycle_id: '2' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ '1': 1 }]]) // cycleExists
      .mockResolvedValueOnce([[{ project_id: 55, cycle_id: 2, approval_status: 'approved', is_archived: 0 }]])
      .mockResolvedValueOnce([[{ project_id: 10 }, { project_id: 11 }]]) // existing (2 rows)
      .mockResolvedValueOnce([{ insertId: 123 }]); // insert

    await prefCtl.addPreference(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      preference_id: 123,
      project_id: 55,
      preference_order: 3,
      contacted_supervisor: 'No',
      cycle_id: 2,
      is_locked: 0,
    }));
  });
});

/* ------------------- updatePreferenceOrder ------------------- */
describe('updatePreferenceOrder', () => {
  it('400 for invalid ids', async () => {
    const req = mockReq({ user: { user_id: 9 }, body: { preference_id: 'x', preference_order: 'y' } });
    const res = mockRes();
    await prefCtl.updatePreferenceOrder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('reorders inside a transaction and commits', async () => {
    const req = mockReq({ user: { user_id: 9 }, body: { preference_id: 20, preference_order: 1 } });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // select row+cycle
        .mockResolvedValueOnce([[{ cycle_id: 3 }]])
        // select all in cycle
        .mockResolvedValueOnce([[{ preference_id: 20 }, { preference_id: 21 }]])
        // bump +100
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        // set order pref 20 -> 1
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // set order pref 21 -> 2
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await prefCtl.updatePreferenceOrder(req, res);

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Preference order updated successfully'
    }));
  });
});

/* ------------------- updateContactedSupervisor ------------------- */
describe('updateContactedSupervisor', () => {
  it('400 for invalid contacted_supervisor value', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { preference_id: 1, contacted_supervisor: 'maybe' } });
    const res = mockRes();
    await prefCtl.updateContactedSupervisor(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when preference not found', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { preference_id: 9, contacted_supervisor: 'Yes' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    await prefCtl.updateContactedSupervisor(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates contacted_supervisor', async () => {
    const req = mockReq({ user: { user_id: 1 }, body: { preference_id: 9, contacted_supervisor: 'No' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await prefCtl.updateContactedSupervisor(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Contacted supervisor flag updated successfully'
    }));
  });
});

/* ------------------- deletePreference ------------------- */
describe('deletePreference', () => {
  it('400 for invalid preferenceId', async () => {
    const req = mockReq({ user: { user_id: 1 }, params: { preferenceId: 'x' } });
    const res = mockRes();
    await prefCtl.deletePreference(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when row not found', async () => {
    const req = mockReq({ user: { user_id: 1 }, params: { preferenceId: '5' } });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // select cycle
        .mockResolvedValueOnce([[/* none */]])
      ,
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await prefCtl.deletePreference(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('deletes and repacks orders then commits', async () => {
    const req = mockReq({ user: { user_id: 1 }, params: { preferenceId: '5' } });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // select cycle
        .mockResolvedValueOnce([[{ cycle_id: 3 }]])
        // delete row
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // repackOrders: select remaining (empty is fine)
        .mockResolvedValueOnce([[]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await prefCtl.deletePreference(req, res);

    expect(conn.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Preference deleted and reordered successfully'
    }));
  });
});

/* ------------------- submitPreferences ------------------- */
describe('submitPreferences', () => {
  it('400 when preferences empty or invalid', async () => {
    const req = mockReq({ user: { user_id: 7 }, body: { preferences: [] }, query: { cycle_id: '4' } });
    const res = mockRes();

    // resolveCycleId -> cycleExists
    db.query.mockResolvedValueOnce([[{ '1': 1 }]]);
    await prefCtl.submitPreferences(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('saves snapshot idempotently, preserves contacted flags, inserts up to 5', async () => {
    const req = mockReq({
      user: { user_id: 7 },
      query: { cycle_id: '4' },
      body: { preferences: [100, 101, 101, 102, 103, 104, 105, 106] } // duplicates + >5
    });
    const res = mockRes();

    // resolveCycleId -> cycleExists
    db.query.mockResolvedValueOnce([[{ '1': 1 }]]);

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        // 1) upsert submission
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // 2) select existing preferences (with contacted)
        .mockResolvedValueOnce([[{ project_id: 101, contacted_supervisor: 'Yes' }]])
        // 3) delete old
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        // 4) bulk insert
        .mockResolvedValueOnce([{ affectedRows: 5 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await prefCtl.submitPreferences(req, res);

    // deduped & capped to 5 -> [100,101,102,103,104]
    expect(conn.query).toHaveBeenCalledTimes(4);
    expect(res.json).toHaveBeenCalledWith({ ok: true, cycle_id: 4, saved: 5 });
    expect(conn.commit).toHaveBeenCalled();
  });

  it('handles FK error (invalid project) with 400', async () => {
    const req = mockReq({
      user: { user_id: 7 },
      query: { cycle_id: '4' },
      body: { preferences: [999] }
    });
    const res = mockRes();

    // resolveCycleId -> cycleExists
    db.query.mockResolvedValueOnce([[{ '1': 1 }]]);

    const fkErr = Object.assign(new Error('fk'), { code: 'ER_NO_REFERENCED_ROW_2', sqlMessage: 'FK fail' });
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])   // upsert
        .mockResolvedValueOnce([[/* existing flags */]])// select existing
        .mockResolvedValueOnce([{ affectedRows: 0 }])   // delete old
        .mockRejectedValueOnce(fkErr),                  // bulk insert -> FK error
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn()
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await prefCtl.submitPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Invalid project_id or FK mismatch'
    }));
    expect(conn.rollback).toHaveBeenCalled();
  });
});
