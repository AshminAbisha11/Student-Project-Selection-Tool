const path = require('path');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

let projCtl;
let db;

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

    projCtl = require('../controllers/projectController');
    db = require('./mocks/db.mock').db;

    db.query.mockReset();
    db.execute?.mockReset?.();
    if (db.getConnection?.mockReset) db.getConnection.mockReset();
  });
});

/* =======================================================
 * Public: listForStudents (requires open cycle)
 * ======================================================= */
describe('projectController.listForStudents', () => {
  it('409 when no open cycle', async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    // getOpenCycleId => []
    db.query.mockResolvedValueOnce([[]]);

    await projCtl.listForStudents(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('not open yet'),
      })
    );
  });

  it('returns filtered projects for open cycle', async () => {
    const req = mockReq({
      query: { supervisor: 'ann', topic: 'ml', keyword: 'vision', limit: '50', offset: '0' },
    });
    const res = mockRes();

    // getOpenCycleId
    db.query.mockResolvedValueOnce([[{ cycle_id: 4 }]]);

    db.query.mockResolvedValueOnce([[
      { project_id: 1, title: 'A', quota_remaining: 2 },
      { project_id: 2, title: 'B', quota_remaining: 1 },
    ]]);

    await projCtl.listForStudents(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cycle_id: 4,
        count: 2,
        projects: expect.any(Array),
      })
    );
  });
});

/* =======================================================
 * Public: getAllProjects
 * ======================================================= */
describe('projectController.getAllProjects', () => {
  it('returns all non-archived projects', async () => {
    const req = mockReq();
    const res = mockRes();

    db.query.mockResolvedValueOnce([[
      { project_id: 1 },
      { project_id: 2 },
    ]]);

    await projCtl.getAllProjects(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 })
    );
  });
});

/* =======================================================
 * Public: getProjectDetails
 * ======================================================= */
describe('projectController.getProjectDetails', () => {
  it('400 for invalid id', async () => {
    const req = mockReq({ params: { projectId: 'x' } });
    const res = mockRes();
    await projCtl.getProjectDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when not found', async () => {
    const req = mockReq({ params: { projectId: '10' } });
    const res = mockRes();

    db.execute = jest.fn().mockResolvedValueOnce([[]]);

    await projCtl.getProjectDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('200 with details when found', async () => {
    const req = mockReq({ params: { projectId: '10' } });
    const res = mockRes();

    db.execute = jest.fn().mockResolvedValueOnce([[
      { project_id: 10, title: 'X', full_description: 'desc' }
    ]]);

    await projCtl.getProjectDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 10, title: 'X' })
    );
  });
});

/* =======================================================
 * Public: filters
 * ======================================================= */
describe('projectController filters', () => {
  it('filterBySupervisor returns list', async () => {
    const req = mockReq({ params: { supervisor: 'Dr Smith' } });
    const res = mockRes();
    db.execute = jest.fn().mockResolvedValueOnce([[{ project_id: 1 }]]);
    await projCtl.filterBySupervisor(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('filterByTopic returns list', async () => {
    const req = mockReq({ params: { topic: 'AI' } });
    const res = mockRes();
    db.execute = jest.fn().mockResolvedValueOnce([[{ project_id: 2 }]]);
    await projCtl.filterByTopic(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('filterByKeyword 400 when missing', async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();
    await projCtl.filterByKeyword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('filterByKeyword returns list', async () => {
    const req = mockReq({ query: { keyword: 'python' } });
    const res = mockRes();
    db.execute = jest.fn().mockResolvedValueOnce([[{ project_id: 3 }]]);
    await projCtl.filterByKeyword(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('multiFilteredProjects returns list', async () => {
    const req = mockReq({ query: { supervisor: 'ann', topic: 'cv', keyword: 'dl' } });
    const res = mockRes();
    db.execute = jest.fn().mockResolvedValueOnce([[{ project_id: 4 }]]);
    await projCtl.multiFilteredProjects(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('searchProjects validates term and returns list', async () => {
    const res = mockRes();

    // no term -> 400
    let req = mockReq({ query: { query: '' } });
    await projCtl.searchProjects(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // with term -> ok
    req = mockReq({ query: { query: 'ml vision' } });
    db.execute = jest.fn().mockResolvedValueOnce([[{ project_id: 5 }]]);
    await projCtl.searchProjects(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/* =======================================================
 * Supervisor area: getMyProjects
 * ======================================================= */
describe('projectController.getMyProjects', () => {
  it('401 when no user', async () => {
    const req = mockReq(); req.user = null;
    const res = mockRes();
    await projCtl.getMyProjects(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns my projects with default filters (archived=0, cycle=open or recent)', async () => {
    const req = mockReq({ user: { user_id: 77 }, query: {} });
    const res = mockRes();

    // resolveSupervisorCycleFilter: open -> none -> recent -> {cycle_id: 9}
    db.query
      .mockResolvedValueOnce([[]])           // open
      .mockResolvedValueOnce([[{ cycle_id: 9 }]])  // recent
      .mockResolvedValueOnce([[ // list
        { project_id: 1, allocated_count: 0 },
        { project_id: 2, allocated_count: 3 },
      ]]);

    await projCtl.getMyProjects(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ cycle_filter: 9 }),
      projects: expect.any(Array),
    }));
  });

  it('accepts cycle=all (no filter)', async () => {
    const req = mockReq({ user: { user_id: 77 }, query: { cycle: 'all' } });
    const res = mockRes();

    // resolveSupervisorCycleFilter => {cycleId:null}
    // so single db.query call to fetch rows
    db.query.mockResolvedValueOnce([[{ project_id: 3 }]]);

    await projCtl.getMyProjects(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ cycle_filter: null, cycle_source: 'all' }),
    }));
  });
});

/* =======================================================
 * Supervisor area: getMyProjectById
 * ======================================================= */
describe('projectController.getMyProjectById', () => {
  it('401 when no user', async () => {
    const req = mockReq({ params: { projectId: '5' } }); req.user = null;
    const res = mockRes();
    await projCtl.getMyProjectById(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 for invalid id', async () => {
    const req = mockReq({ user: { user_id: 10 }, params: { projectId: 'x' } });
    const res = mockRes();
    await projCtl.getMyProjectById(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when not owned', async () => {
    const req = mockReq({ user: { user_id: 10 }, params: { projectId: '5' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[/* own? none */]]);
    await projCtl.getMyProjectById(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('200 with row when owned', async () => {
    const req = mockReq({ user: { user_id: 10 }, params: { projectId: '5' } });
    const res = mockRes();

    db.query
      .mockResolvedValueOnce([[{ project_id: 5 }]]) // own ok
      .mockResolvedValueOnce([[{ project_id: 5, title: 'Mine' }]]); // details

    await projCtl.getMyProjectById(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ project_id: 5 }));
  });
});

/* =======================================================
 * Supervisor area: updateMyProject
 * ======================================================= */
describe('projectController.updateMyProject', () => {
  it('401 when no user', async () => {
    const req = mockReq({ params: { projectId: '7' } }); req.user = null;
    const res = mockRes();
    await projCtl.updateMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400 for invalid id', async () => {
    const req = mockReq({ user: { user_id: 9 }, params: { projectId: 'x' } });
    const res = mockRes();
    await projCtl.updateMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400 for missing title/description or bad quota', async () => {
    const res = mockRes();

    let req = mockReq({
      user: { user_id: 9 }, params: { projectId: '7' }, body: { title: '', description: 'd', quota: 1 },
    });
    await projCtl.updateMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    req = mockReq({
      user: { user_id: 9 }, params: { projectId: '7' }, body: { title: 't', description: 'd', quota: 0 },
    });
    await projCtl.updateMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('404 when not owned; else updates & returns project', async () => {
    const req = mockReq({
      user: { user_id: 9 },
      params: { projectId: '7' },
      body: { title: 'T', description: 'D', quota: 3, topic: 'AI', keywords: 'x' },
    });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // own? missing -> 404 path
        .mockResolvedValueOnce([[/* none */]]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await projCtl.updateMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(conn.rollback).toHaveBeenCalled();

    // success path
    const conn2 = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // own
        .mockResolvedValueOnce([[{ project_id: 7, cycle_id: 4 }]])
        // UPDATE projects
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // UPSERT project_details
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // SELECT updated
        .mockResolvedValueOnce([[{ project_id: 7, title: 'T' }]]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.getConnection.mockResolvedValueOnce(conn2);

    await projCtl.updateMyProject(req, res);
    expect(conn2.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Project updated.' })
    );
  });
});

/* =======================================================
 * Supervisor area: createProject
 * ======================================================= */
describe('projectController.createProject', () => {
  it('403 when not supervisor role', async () => {
    const req = mockReq({ user: { user_id: 2, role: 'student' }, body: {} });
    const res = mockRes();
    await projCtl.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400 for missing fields or bad quota', async () => {
    let req = mockReq({ user: { user_id: 3, role: 'supervisor' }, body: { title: '', description: 'd', quota: 1 } });
    let res = mockRes();
    await projCtl.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    req = mockReq({ user: { user_id: 3, role: 'supervisor' }, body: { title: 't', description: 'd', quota: 0 } });
    res = mockRes();
    await projCtl.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates project; attaches to active cycle if available else draft', async () => {
    const req = mockReq({
      user: { user_id: 3, role: 'supervisor', name: 'Dr X' },
      body: { title: 'T', description: 'D', quota: 2, topic: 'AI', keywords: 'cv' },
    });
    const res = mockRes();

    const conn = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // INSERT project
        .mockResolvedValueOnce([{ insertId: 99 }])
        // UPSERT details
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // SELECT project
        .mockResolvedValueOnce([[{ project_id: 99, cycle_id: null }]]),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    // getActiveCycleId inside createProject -> no active (leave draft)
    db.query
      .mockResolvedValueOnce([[]]) // byStatus
      .mockResolvedValueOnce([[]]); // byDate

    await projCtl.createProject(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('draft'),
      project: expect.objectContaining({ project_id: 99 }),
    }));
  });
});

/* =======================================================
 * Supervisor area: archive/unarchive/delete
 * ======================================================= */
describe('projectController.archive/unarchive/delete', () => {
  it('archiveProject: 404 when not owned; 409 when has allocations; else success', async () => {
    const req = mockReq({ user: { user_id: 7 }, params: { projectId: '55' } });
    const res = mockRes();

    // not owned
    db.query.mockResolvedValueOnce([[/* own? none */]]);
    await projCtl.archiveProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    // has allocations
    db.query
      .mockResolvedValueOnce([[{ project_id: 55 }]]) // own
      .mockResolvedValueOnce([[{ c: 2 }]]);          // alloc count > 0
    await projCtl.archiveProject(req, res);
    expect(res.status).toHaveBeenCalledWith(409);

    // success
    db.query
      .mockResolvedValueOnce([[{ project_id: 55 }]]) // own
      .mockResolvedValueOnce([[{ c: 0 }]])          // alloc 0
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // update archive
    await projCtl.archiveProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project archived' }));
  });

  it('unarchiveProject: 404 if not owned; else success', async () => {
    const req = mockReq({ user: { user_id: 7 }, params: { projectId: '55' } });
    const res = mockRes();

    db.query.mockResolvedValueOnce([[/* own? none */]]);
    await projCtl.unarchiveProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    db.query
      .mockResolvedValueOnce([[{ project_id: 55 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await projCtl.unarchiveProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project restored' }));
  });

  it('deleteMyProject: guards + ownership + allocation check + delete flow', async () => {
    const res = mockRes();

    // 401
    let req = mockReq({ params: { projectId: '5' } }); req.user = null;
    await projCtl.deleteMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(401);

    // 400 invalid id
    req = mockReq({ user: { user_id: 8 }, params: { projectId: 'x' } });
    await projCtl.deleteMyProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // 404 not owned, then 409 has allocations, then success path
    const req2 = mockReq({ user: { user_id: 8 }, params: { projectId: '5' } });

    const conn = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // own? none
        .mockResolvedValueOnce([[/* none */]]),
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    db.getConnection = jest.fn().mockResolvedValue(conn);

    await projCtl.deleteMyProject(req2, res);
    expect(res.status).toHaveBeenCalledWith(404);

    const conn2 = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // own ok
        .mockResolvedValueOnce([[{ project_id: 5 }]])
        // allocations count -> 2 => 409
        .mockResolvedValueOnce([[{ c: 2 }]]),
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    db.getConnection.mockResolvedValueOnce(conn2);

    await projCtl.deleteMyProject(req2, res);
    expect(res.status).toHaveBeenCalledWith(409);

    const conn3 = {
      beginTransaction: jest.fn(),
      query: jest.fn()
        // own ok
        .mockResolvedValueOnce([[{ project_id: 5 }]])
        // allocations count -> 0
        .mockResolvedValueOnce([[{ c: 0 }]])
        // delete prefs
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // delete details
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // delete project
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    db.getConnection.mockResolvedValueOnce(conn3);

    await projCtl.deleteMyProject(req2, res);
    expect(conn3.commit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project deleted' }));
  });
});
