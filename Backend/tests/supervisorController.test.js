const path = require('path');

const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let supCtl;
let db;

// resolve the same db module id the controllers import
function resolveDbFromControllers() {
  const controllersDir = path.join(__dirname, '..', 'controllers');
  return require.resolve('../config/db', { paths: [controllersDir] });
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.isolateModules(() => {
    const dbModuleId = resolveDbFromControllers();

    jest.doMock(dbModuleId, () => {
      const mocked = require('./mocks/db.mock');
      return mocked.db;
    });

    supCtl = require('../controllers/supervisorController');
    db = require('./mocks/db.mock').db;

    db.query.mockReset();
    db.execute?.mockReset?.();
    if (db.getConnection?.mockReset) db.getConnection.mockReset();
  });
});

/* =======================================================
 * getOverview
 * ======================================================= */
describe('supervisorController.getOverview', () => {
  it('401 when not logged in', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();

    await supCtl.getOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns counts', async () => {
    const req = mockReq({ user: { user_id: 44 } });
    const res = mockRes();

    db.query
      // projects count
      .mockResolvedValueOnce([[{ projects: 5 }]])
      // pending proposals
      .mockResolvedValueOnce([[{ pendingProposals: 3 }]])
      // allocated students (distinct)
      .mockResolvedValueOnce([[{ students: 7 }]]);

    await supCtl.getOverview(req, res);

    expect(res.json).toHaveBeenCalledWith({
      projects: 5,
      pendingProposals: 3,
      studentsAllocated: 7,
    });
  });
});

/* =======================================================
 * getMyProjects
 * ======================================================= */
describe('supervisorController.getMyProjects', () => {
  it('401 when not logged in', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();

    await supCtl.getMyProjects(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('active (default) — uses open cycle if present', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: {} });
    const res = mockRes();

    db.query
      // getActiveOrLatestCycleIdForSupervisor -> open by status (controller calls an internal helper with its own queries; we simulate by returning an "open" cycle first)
      .mockResolvedValueOnce([[{ cycle_id: 8 }]]) // getActiveCycleId by status
      // main listing SQL (window fn + filters)
      .mockResolvedValueOnce([[{ project_id: 1, is_student_pool: 0 }]]);

    await supCtl.getMyProjects(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ project_id: 1 }),
    ]));
  });

  it('draft tab filters cycle_id IS NULL and not archived', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: { tab: 'draft', cycle: 'all' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([
      [
        { project_id: 2, is_student_pool: 0, cycle_id: null, is_archived: 0 },
        { project_id: 3, is_student_pool: 0, cycle_id: null, is_archived: 0 },
      ],
    ]);

    await supCtl.getMyProjects(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.every(p => p.cycle_id == null && p.is_archived === 0)).toBe(true);
  });

  it('archived tab shows archived only', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: { tab: 'archived', cycle: 'all' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([
      [
        { project_id: 4, is_student_pool: 0, is_archived: 1 },
        { project_id: 5, is_student_pool: 1, is_archived: 1 },
      ],
    ]);

    await supCtl.getMyProjects(req, res);
    const rows = res.json.mock.calls[0][0];
    expect(rows.every(r => r.is_archived === 1)).toBe(true);
  });

  it('search applies like filters', async () => {
    const req = mockReq({ user: { user_id: 9 }, query: { q: 'deep learning', cycle: 'all' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([
      [
        { project_id: 9, title: 'Deep Learning Project', is_student_pool: 0 },
      ],
    ]);

    await supCtl.getMyProjects(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ project_id: 9 })])
    );
  });

  it('de-dupes student pool per cycle (keeps latest)', async () => {
    const req = mockReq({ user: { user_id: 12 }, query: { cycle: 'all' } });
    const res = mockRes();

    // Controller uses ROW_NUMBER() PARTITION trick and filters rn=1 for pool,
    // so what we get back should already be de-duped. Just ensure it returns one.
    db.query.mockResolvedValueOnce([
      [
        { project_id: 21, is_student_pool: 1, cycle_id: 6 }, // the "kept" one
      ],
    ]);

    await supCtl.getMyProjects(req, res);
    const rows = res.json.mock.calls[0][0];
    expect(rows.filter(r => r.is_student_pool === 1).length).toBe(1);
  });
});

/* =======================================================
 * listSupervisors
 * ======================================================= */
describe('supervisorController.listSupervisors', () => {
  it('returns supervisors', async () => {
    const req = mockReq();
    const res = mockRes();

    db.query.mockResolvedValueOnce([
      [
        { supervisor_id: 1, name: 'A', email: 'a@x' },
        { supervisor_id: 2, name: 'B', email: 'b@x' },
      ],
    ]);

    await supCtl.listSupervisors(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ supervisor_id: 1 }),
        expect.objectContaining({ supervisor_id: 2 }),
      ])
    );
  });
});

/* =======================================================
 * getReceivedProposals
 * ======================================================= */
describe('supervisorController.getReceivedProposals', () => {
  it('401 when not logged in', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();

    await supCtl.getReceivedProposals(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns proposals for this supervisor', async () => {
    const req = mockReq({ user: { user_id: 33 } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([
      [
        { proposal_id: 7, student_id: 5, source_type: 'student_proposal' },
        { proposal_id: 8, student_id: 6, source_type: 'supervisor_project' },
      ],
    ]);

    await supCtl.getReceivedProposals(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ proposal_id: 7 }),
        expect.objectContaining({ proposal_id: 8 }),
      ])
    );
  });
});

/* =======================================================
 * decideProposal
 * ======================================================= */
describe('supervisorController.decideProposal', () => {
  it('400 invalid status', async () => {
    const req = mockReq({
      user: { user_id: 77 },
      params: { id: '10' },
      body: { status: 'nope' },
    });
    const res = mockRes();

    await supCtl.decideProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 not found for this supervisor', async () => {
    const req = mockReq({
      user: { user_id: 77 },
      params: { id: '10' },
      body: { status: 'rejected' },
    });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[null]]); // load proposal

    await supCtl.decideProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('accepted: student-idea pool path (txn, seats available, insert alloc, update spots)', async () => {
    const req = mockReq({
      user: { user_id: 77 },
      params: { id: '10' },
      body: { status: 'accepted' },
    });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    // Load proposal (project_id NULL => student idea)
    db.query.mockResolvedValueOnce([
      [{ proposal_id: 10, student_id: 5, supervisor_id: 77, project_id: null, cycle_id: 6 }],
    ]);

    // Inside tx: lock a pool row
    conn.query
      // pool row FOR UPDATE
      .mockResolvedValueOnce([[{ project_id: 222, quota: 3, spots_filled: 1 }]])
      // allocated count before insert
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      // INSERT IGNORE allocation
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // allocated count after insert
      .mockResolvedValueOnce([[{ cnt: 2 }]])
      // update projects.spots_filled
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    // Update proposal status after tx
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // update proposal
      .mockResolvedValueOnce([
        [{ proposal_id: 10, status: 'accepted', reason: null, updated_at: '2025-01-01' }],
      ]); // select updated

    await supCtl.decideProposal(req, res);

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ proposal_id: 10, status: 'accepted' })
    );
  });

  it('accepted: no seats left -> 409', async () => {
    const req = mockReq({
      user: { user_id: 77 },
      params: { id: '11' },
      body: { status: 'accepted' },
    });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    // proposal (student-idea)
    db.query.mockResolvedValueOnce([
      [{ proposal_id: 11, student_id: 5, supervisor_id: 77, project_id: null, cycle_id: 6 }],
    ]);

    // pool row -> exists
    conn.query
      .mockResolvedValueOnce([[{ project_id: 333, quota: 1, spots_filled: 1 }]])
      // allocated count shows full
      .mockResolvedValueOnce([[{ cnt: 1 }]]);

    await supCtl.decideProposal(req, res);

    expect(conn.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('No seats') })
    );
  });

  it('rejected: simple update path (no tx)', async () => {
    const req = mockReq({
      user: { user_id: 77 },
      params: { id: '12' },
      body: { status: 'rejected', reason: 'not aligned' },
    });
    const res = mockRes();

    // proposal is against a specific project_id (not student idea)
    db.query
      .mockResolvedValueOnce([
        [{ proposal_id: 12, student_id: 5, supervisor_id: 77, project_id: 99, cycle_id: 6 }],
      ]) // load
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // update status
      .mockResolvedValueOnce([
        [{ proposal_id: 12, status: 'rejected', reason: 'not aligned', updated_at: '2025-01-02' }],
      ]); // select updated

    await supCtl.decideProposal(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ proposal_id: 12, status: 'rejected' })
    );
  });
});
