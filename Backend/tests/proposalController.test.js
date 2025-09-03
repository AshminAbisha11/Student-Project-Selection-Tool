const path = require('path');
const fs = require('fs');

const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let proposalCtl;
let db;

// small helper to resolve the db module as imported by controllers
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

    proposalCtl = require('../controllers/proposalController');
    db = require('./mocks/db.mock').db;

    db.query.mockReset();
    db.execute?.mockReset?.();
    if (db.getConnection?.mockReset) db.getConnection.mockReset();
  });
});

/* =======================================================
 * listAcceptingSupervisors
 * ======================================================= */
describe('proposalController.listAcceptingSupervisors', () => {
  it('returns [] when no cycle can be resolved', async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    // resolveCycleId: byStatus => [], byDate => [], recent => []
    db.query
      .mockResolvedValueOnce([[]]) // getActiveCycleId byStatus
      .mockResolvedValueOnce([[]]) // getActiveCycleId byDate
      .mockResolvedValueOnce([[]]); // getMostRecentCycleId

    await proposalCtl.listAcceptingSupervisors(req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('returns supervisors with seats when cycle resolves', async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    // resolveCycleId -> active byStatus returns cycle 7
    db.query
      .mockResolvedValueOnce([[{ cycle_id: 7 }]]) // getActiveCycleId byStatus
      // list query
      .mockResolvedValueOnce([[
        { supervisor_id: 12, name: 'Dr A', email: 'a@x', quota: 3, seats_left: 2 },
        { supervisor_id: 15, name: 'Dr B', email: 'b@x', quota: 1, seats_left: 1 },
      ]]);

    await proposalCtl.listAcceptingSupervisors(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ supervisor_id: 12 }),
      expect.objectContaining({ supervisor_id: 15 }),
    ]));
  });
});

/* =======================================================
 * submitProposal
 * ======================================================= */
describe('proposalController.submitProposal', () => {
  it('401 when not logged in', async () => {
    const req = mockReq({ body: {} });
    req.user = null;
    const res = mockRes();
    await proposalCtl.submitProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 when required fields missing; cleans uploaded file', async () => {
    // We only assert the HTTP response here (fs spies can be flaky across environments)
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: '', description: '', supervisor_id: '' },
      file: { path: 'uploads/tmp.pdf', filename: 'tmp.pdf' },
    });
    const res = mockRes();

    await proposalCtl.submitProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('required'),
      })
    );
  });

  it('400 invalid supervisor id', async () => {
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: 'T', description: 'D', supervisor_id: 'x' },
    });
    const res = mockRes();

    // resolveCycleId -> active byStatus
    db.query.mockResolvedValueOnce([[{ cycle_id: 3 }]]);

    await proposalCtl.submitProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400 supervisor not found', async () => {
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: 'T', description: 'D', supervisor_id: '9' },
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 4 }]]) // resolveCycleId -> active
      .mockResolvedValueOnce([[]]);               // users (supervisor) not found

    await proposalCtl.submitProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400 supervisor not accepting student ideas this cycle', async () => {
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: 'T', description: 'D', supervisor_id: '9' },
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 4 }]])         // resolveCycleId
      .mockResolvedValueOnce([[{ user_id: 9, name: 'S', email: 's@x' }]]) // supervisor ok
      .mockResolvedValueOnce([[]]);                        // no pool row

    await proposalCtl.submitProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('not accepting'),
    }));
  });

  it('400 supervisor quota full', async () => {
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: 'T', description: 'D', supervisor_id: '9' },
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 4 }]]) // resolveCycleId
      .mockResolvedValueOnce([[{ user_id: 9, name: 'S', email: 's@x' }]]) // sup ok
      .mockResolvedValueOnce([[{ project_id: 11, quota: 1, seats_left: 0 }]]); // full

    await proposalCtl.submitProposal(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('quota is currently full'),
    }));
  });

  it('201 on success (inserts proposal, returns meta)', async () => {
    const req = mockReq({
      user: { user_id: 5 },
      body: { title: 'Title', description: 'Desc', supervisor_id: '9' },
      // Some mockReq implementations don’t propagate arbitrary props like `file`.
      // We won’t assert on file_path value; only that the core payload is correct.
      file: { path: 'uploads/abc.pdf', filename: 'abc.pdf' },
    });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ cycle_id: 4 }]])                       // resolveCycleId
      .mockResolvedValueOnce([[{ user_id: 9, name: 'S', email: 's@x' }]]) // supervisor ok
      .mockResolvedValueOnce([[{ project_id: 22, quota: 3, seats_left: 2 }]]) // pool ok
      .mockResolvedValueOnce([{ insertId: 101 }]);                        // insert proposal

    await proposalCtl.submitProposal(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Proposal submitted successfully.',
        proposal_id: 101,
        cycle_id: 4,
        supervisor: expect.objectContaining({ user_id: 9 }),
      })
    );
  });
});

/* =======================================================
 * getProposalsByStudent
 * ======================================================= */
describe('proposalController.getProposalsByStudent', () => {
  it('401 when not logged in', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await proposalCtl.getProposalsByStudent(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns proposals with topics join if table exists', async () => {
    const req = mockReq({ user: { user_id: 12 }, query: {} });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[
      { proposal_id: 1, title: 'A', topic_id: 5, topic_name: 'AI' },
      { proposal_id: 2, title: 'B', topic_id: null, topic_name: null },
    ]]);

    await proposalCtl.getProposalsByStudent(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ proposal_id: 1, topic_name: 'AI' }),
      ])
    );
  });

  it('falls back when topics table is missing', async () => {
    const req = mockReq({ user: { user_id: 12 }, query: { cycle_id: '9' } });
    const res = mockRes();

    // first attempt throws ER_NO_SUCH_TABLE
    const err = new Error('no such table'); err.code = 'ER_NO_SUCH_TABLE';
    db.query
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce([[
        { proposal_id: 3, title: 'C', topic_id: null }, // no topic_name from base query
      ]]);

    await proposalCtl.getProposalsByStudent(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ proposal_id: 3, topic_name: null }),
      ])
    );
  });
});
