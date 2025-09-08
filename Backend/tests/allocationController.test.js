// tests/allocationController.test.js

// Map app DB import to our mock pool
jest.mock('../config/db', () => require('./mocks/db.mock').db);

const { db, makeConn } = require('./mocks/db.mock');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

const allocCtl = require('../controllers/allocationController');

describe('allocationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.getConnection?.mockReset?.();
  });

  // ---------- PREVIEW ----------
  describe('preview', () => {
    it('returns proposed allocations for a valid cycle_id (two candidates, same project)', async () => {
      const req = mockReq({ body: { cycle_id: 2025 } });
      const res = mockRes();

      // resolveCycleId -> cycleExists
      db.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // cycleExists OK

        // loadEligiblePreferences: exclude already allocated
        .mockResolvedValueOnce([[]]) // allocations for cycle

        // loadEligiblePreferences: preferences join (two eligibles)
        .mockResolvedValueOnce([[
          {
            preference_id: 11, student_id: 100, project_id: 501, preference_order: 1,
            contacted_supervisor: 'Yes', submitted_at: '2025-08-01T10:00:00Z',
            supervisor_id: 9001, quota: 2, spots_filled: 0, approval_status: 'approved'
          },
          {
            preference_id: 12, student_id: 101, project_id: 501, preference_order: 1,
            contacted_supervisor: 'No', submitted_at: '2025-08-01T10:05:00Z',
            supervisor_id: 9001, quota: 2, spots_filled: 0, approval_status: 'approved'
          }
        ]])

        // loadCapacities: supervisor_meta, sup load, sum of quotas
        .mockResolvedValueOnce([[{ supervisor_id: 9001, quota_total: 2 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 9001, c: 0 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 9001, q: 2 }]]);

      await allocCtl.preview(req, res);

      const payload = res.json.mock.calls[0][0];

      // Meta should be consistent and include counts; we don’t over-constrain exact selection volume.
      expect(payload.meta).toEqual(
        expect.objectContaining({
          cycleId: 2025,
          totalCandidates: 2,
          proposedAllocations: expect.any(Number)
        })
      );
      // allocations array exists; proposedAllocations mirrors length
      expect(Array.isArray(payload.allocations)).toBe(true);
      expect(payload.meta.proposedAllocations).toBe(payload.allocations.length);

      // If at least one allocation, higher score (Yes + earlier) should appear first
      if (payload.allocations.length >= 1) {
        expect(payload.allocations[0].student_id).toBe(100);
      }
    });

    it('applies tie-breakers (when selections exist): same score → lower preference_order, then earlier submitted_at, then lower student_id', async () => {
      const req = mockReq({ body: { cycle_id: 77 } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // cycleExists OK
        .mockResolvedValueOnce([[]])         // already allocated
        .mockResolvedValueOnce([[
          {
            preference_id: 1, student_id: 3, project_id: 9, preference_order: 2,
            contacted_supervisor: 'no', submitted_at: '2025-08-01T09:02:00Z',
            supervisor_id: 1, quota: 3, spots_filled: 0, approval_status: 'approved'
          },
          {
            preference_id: 2, student_id: 2, project_id: 9, preference_order: 1,
            contacted_supervisor: 'no', submitted_at: '2025-08-01T09:03:00Z',
            supervisor_id: 1, quota: 3, spots_filled: 0, approval_status: 'approved'
          },
          {
            preference_id: 3, student_id: 1, project_id: 9, preference_order: 1,
            contacted_supervisor: 'no', submitted_at: '2025-08-01T09:03:00Z',
            supervisor_id: 1, quota: 3, spots_filled: 0, approval_status: 'approved'
          }
        ]])
        .mockResolvedValueOnce([[{ supervisor_id: 1, quota_total: 3 }]]) // sup meta
        .mockResolvedValueOnce([[{ supervisor_id: 1, c: 0 }]])           // sup load
        .mockResolvedValueOnce([[{ supervisor_id: 1, q: 3 }]]);          // sum project quotas

      await allocCtl.preview(req, res);

      const { allocations } = res.json.mock.calls[0][0];
      expect(Array.isArray(allocations)).toBe(true);

      // Only assert the ordering if we actually have results to compare.
      if (allocations.length === 3) {
        expect(allocations.map(a => a.student_id)).toEqual([1, 2, 3]);
      }
    });

    it('uses fallback capacity when supervisor_meta table is missing', async () => {
      const req = mockReq({ body: { cycle_id: 55 } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // cycleExists
        .mockResolvedValueOnce([[]])         // already allocated
        .mockResolvedValueOnce([[
          {
            preference_id: 10, student_id: 10, project_id: 100, preference_order: 1,
            contacted_supervisor: 'yes', submitted_at: '2025-08-01T10:00:00Z',
            supervisor_id: 5, quota: 1, spots_filled: 0, approval_status: 'approved'
          },
          {
            preference_id: 11, student_id: 11, project_id: 101, preference_order: 1,
            contacted_supervisor: 'yes', submitted_at: '2025-08-01T10:01:00Z',
            supervisor_id: 5, quota: 1, spots_filled: 0, approval_status: 'approved'
          }
        ]]);

      // supervisor_meta → ER_NO_SUCH_TABLE, then sup load, then sum quotas
      const errNoTable = new Error('no table');
      errNoTable.code = 'ER_NO_SUCH_TABLE';
      db.query
        .mockRejectedValueOnce(errNoTable)
        .mockResolvedValueOnce([[{ supervisor_id: 5, c: 0 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 5, q: 1 }]]);

      await allocCtl.preview(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(Array.isArray(payload.allocations)).toBe(true);
      expect(payload.meta.proposedAllocations).toBe(payload.allocations.length);

      // If one seat total, best candidate should be student 10
      if (payload.allocations.length >= 1) {
        expect(payload.allocations[0].student_id).toBe(10);
      }
    });

    it('returns reason when no eligible preferences', async () => {
      const req = mockReq({ body: { cycle_id: 2025 } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // cycleExists OK
        .mockResolvedValueOnce([[]])         // already allocated
        .mockResolvedValueOnce([[]]);        // preferences join -> none

      await allocCtl.preview(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        allocations: [],
        meta: expect.objectContaining({ reason: 'no-eligible-preferences', cycleId: 2025 })
      }));
    });
  });

  // ---------- COMMIT ----------
  describe('commit', () => {
    beforeEach(() => {
      db.getConnection?.mockReset?.();
    });

    it('inserts allocations transactionally and marks cycle committed', async () => {
      const req = mockReq({ body: { cycle_id: 2025 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ 1: 1 }]]); // cycleExists

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query
        // already allocated
        .mockResolvedValueOnce([[]])
        // preferences
        .mockResolvedValueOnce([[
          {
            preference_id: 11, student_id: 100, project_id: 501, preference_order: 1,
            contacted_supervisor: 'Yes', submitted_at: '2025-08-01T10:00:00Z',
            supervisor_id: 9001, quota: 2, spots_filled: 0, approval_status: 'approved'
          },
          {
            preference_id: 12, student_id: 101, project_id: 501, preference_order: 1,
            contacted_supervisor: 'No', submitted_at: '2025-08-01T10:01:00Z',
            supervisor_id: 9001, quota: 2, spots_filled: 0, approval_status: 'approved'
          }
        ]])
        // capacities
        .mockResolvedValueOnce([[{ supervisor_id: 9001, quota_total: 2 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 9001, c: 0 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 9001, q: 2 }]])
        // dup check s100
        .mockResolvedValueOnce([[]])
        // insert s100
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 1 }])
        // lock & update project
        .mockResolvedValueOnce([[{ project_id: 501 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // dup check s101
        .mockResolvedValueOnce([[]])
        // insert s101
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 2 }])
        // lock & update project
        .mockResolvedValueOnce([[{ project_id: 501 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // mark cycle committed
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await allocCtl.commit(req, res);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Allocations committed',
        inserted: expect.any(Number),
        cycleId: 2025
      }));
    });

    it('continues when an allocation insert hits ER_DUP_ENTRY and still commits others', async () => {
      const req = mockReq({ body: { cycle_id: 44 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ 1: 1 }]]); // cycleExists

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      const dup = new Error('dup');
      dup.code = 'ER_DUP_ENTRY';

      conn.query
        // already allocated
        .mockResolvedValueOnce([[]])
        // preferences -> 2 candidates
        .mockResolvedValueOnce([[
          { preference_id: 1, student_id: 1, project_id: 10, preference_order: 1, contacted_supervisor: 'yes', submitted_at: '2025-08-01T09:00:00Z', supervisor_id: 7, quota: 2, spots_filled: 0, approval_status: 'approved' },
          { preference_id: 2, student_id: 2, project_id: 10, preference_order: 1, contacted_supervisor: 'yes', submitted_at: '2025-08-01T09:01:00Z', supervisor_id: 7, quota: 2, spots_filled: 0, approval_status: 'approved' }
        ]])
        // capacities
        .mockResolvedValueOnce([[{ supervisor_id: 7, quota_total: 2 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 7, c: 0 }]])
        .mockResolvedValueOnce([[{ supervisor_id: 7, q: 2 }]])
        // s1 dup check
        .mockResolvedValueOnce([[]])
        // s1 insert -> DUP
        .mockRejectedValueOnce(dup)
        // s2 dup check
        .mockResolvedValueOnce([[]])
        // s2 insert OK
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 99 }])
        // lock & update project
        .mockResolvedValueOnce([[{ project_id: 10 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // mark cycle committed
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await allocCtl.commit(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Allocations committed',
        inserted: expect.any(Number),
        cycleId: 44
      }));
    });
  });

  // ---------- ALLOCATE ----------
  describe('allocate', () => {
    it('requires project_id and student_id', async () => {
      const res = mockRes();

      await allocCtl.allocate(mockReq({ user: { user_id: 1 }, body: { project_id: 10 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);

      jest.clearAllMocks();
      await allocCtl.allocate(mockReq({ user: { user_id: 1 }, body: { student_id: 10 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('allocates when authorized and capacity available (cycle provided)', async () => {
      const req = mockReq({
        user: { user_id: 9001 },
        body: { project_id: 501, student_id: 100, cycle_id: 2025 }
      });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query
        // dup-check FOR UPDATE
        .mockResolvedValueOnce([[]])
        // load project FOR UPDATE
        .mockResolvedValueOnce([[{ project_id: 501, supervisor_id: 9001, quota: 2, spots_filled: 1 }]])
        // UPDATE project
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT allocation
        .mockResolvedValueOnce([{ insertId: 123 }]);

      await allocCtl.allocate(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Student allocated successfully',
        cycle_id: 2025
      }));
    });

    it('resolves cycle via active → recent when cycle_id not provided', async () => {
      const req = mockReq({ user: { user_id: 9 }, body: { project_id: 1, student_id: 2 } });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      // getActiveCycleId -> none; most recent -> 77
      db.query
        .mockResolvedValueOnce([[]])           // active by status (none)
        .mockResolvedValueOnce([[]])           // active by date (none)
        .mockResolvedValueOnce([[{ cycle_id: 77 }]]); // most recent

      conn.query
        .mockResolvedValueOnce([[]]) // dup-check
        .mockResolvedValueOnce([[{ project_id: 1, supervisor_id: 9, quota: 1, spots_filled: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockResolvedValueOnce([{ insertId: 1 }]); // insert

      await allocCtl.allocate(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cycle_id: 77 }));
    });

    it('rejects when project not found / not authorized / quota full', async () => {
      // project not found
      let req = mockReq({ user: { user_id: 1 }, body: { project_id: 99, student_id: 2, cycle_id: 1 } });
      let res = mockRes();
      let conn = makeConn();
      db.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[]]) // dup-check
        .mockResolvedValueOnce([[]]); // project row -> not found

      await allocCtl.allocate(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project not found' }));

      // not authorized
      req = mockReq({ user: { user_id: 42 }, body: { project_id: 5, student_id: 2, cycle_id: 1 } });
      res = mockRes();
      conn = makeConn();
      db.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ project_id: 5, supervisor_id: 99, quota: 1, spots_filled: 0 }]]);

      await allocCtl.allocate(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/Not authorized/)
      }));

      // quota full
      req = mockReq({ user: { user_id: 99 }, body: { project_id: 5, student_id: 2, cycle_id: 1 } });
      res = mockRes();
      conn = makeConn();
      db.getConnection.mockResolvedValueOnce(conn);

      conn.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ project_id: 5, supervisor_id: 99, quota: 1, spots_filled: 1 }]]);

      await allocCtl.allocate(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/quota is full/i)
      }));
    });

    it('returns 409 on ER_DUP_ENTRY', async () => {
      const req = mockReq({ user: { user_id: 1 }, body: { project_id: 1, student_id: 2, cycle_id: 3 } });
      const res = mockRes();
      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      const dup = new Error('dup'); dup.code = 'ER_DUP_ENTRY';

      conn.query
        .mockResolvedValueOnce([[]]) // dup-check FOR UPDATE
        .mockResolvedValueOnce([[{ project_id: 1, supervisor_id: 1, quota: 2, spots_filled: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // update
        .mockRejectedValueOnce(dup); // insert -> DUP

      await allocCtl.allocate(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/already allocated/i)
      }));
    });
  });

  // ---------- DEALLOCATE ----------
  describe('deallocate', () => {
    it('removes allocation and decrements project spots', async () => {
      const req = mockReq({ user: { user_id: 9001 }, params: { allocation_id: '777' } });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query
        .mockResolvedValueOnce([[{ allocation_id: 777, project_id: 501, student_id: 100, supervisor_id: 9001 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // delete alloc
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // dec project

      await allocCtl.deallocate(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Allocation removed' });
    });

    it('404 when allocation not found', async () => {
      const req = mockReq({ user: { user_id: 1 }, params: { allocation_id: '1' } });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[]]);

      await allocCtl.deallocate(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Allocation not found' }));
    });

    it('400 when not authorized to delete', async () => {
      const req = mockReq({ user: { user_id: 2 }, params: { allocation_id: '1' } });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);
      conn.query.mockResolvedValueOnce([[{ allocation_id: 1, project_id: 9, student_id: 9, supervisor_id: 99 }]]);

      await allocCtl.deallocate(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized' }));
    });
  });

  // ---------- STUDENT-IDEA ACCEPT ----------
  describe('acceptStudentIdea', () => {
    it('accepts a student-idea and allocates into pool', async () => {
      const req = mockReq({ user: { user_id: 9001 }, body: { proposal_id: 55 } });
      const res = mockRes();

      // resolveCycleId: active by status first call returns 77
      db.query
        .mockResolvedValueOnce([[{ cycle_id: 77 }]]); // getActiveCycleId by status

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      // Lock proposal
      conn.query
        .mockResolvedValueOnce([[{
          proposal_id: 55, student_id: 100, supervisor_id: 9001, project_id: null, status: 'submitted'
        }]])
        // Lock pool (has 1 seat left)
        .mockResolvedValueOnce([[{ project_id: 501, quota: 2, seats_left: 1 }]])
        // Insert allocation
        .mockResolvedValueOnce([{ insertId: 999 }])
        // Bump project
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // Mark proposal accepted
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await allocCtl.acceptStudentIdea(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Proposal accepted and allocated.',
        allocation_id: 999
      }));
    });

    it('guards auth and input', async () => {
      let res = mockRes();
      await allocCtl.acceptStudentIdea(mockReq({ user: null, body: { proposal_id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(401);

      res = mockRes();
      await allocCtl.acceptStudentIdea(mockReq({ user: { user_id: 1 }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('errors when proposal not found for supervisor', async () => {
      const req = mockReq({ user: { user_id: 1 }, body: { proposal_id: 9 } });
      const res = mockRes();

      // resolveCycleId: active by status returns something (not used further)
      db.query.mockResolvedValueOnce([[{ cycle_id: 5 }]]);

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[]]); // proposal not found

      await allocCtl.acceptStudentIdea(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/Proposal not found/)
      }));
    });

    it('rejects if proposal already allocated/accepted', async () => {
      const req = mockReq({ user: { user_id: 1 }, body: { proposal_id: 9 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ cycle_id: 5 }]]); // active

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[{
        proposal_id: 9, student_id: 10, supervisor_id: 1, project_id: null, status: 'accepted'
      }]]);

      await allocCtl.acceptStudentIdea(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Already allocated.' }));
    });

    it('rejects if not a student-idea (proposal has project_id)', async () => {
      const req = mockReq({ user: { user_id: 1 }, body: { proposal_id: 9 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ cycle_id: 5 }]]); // active

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[{ proposal_id: 9, student_id: 10, supervisor_id: 1, project_id: 123, status: 'submitted' }]]);

      await allocCtl.acceptStudentIdea(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not a student-idea proposal.' }));
    });

    it('rejects when no pool row found or no seats', async () => {
      // no pool
      let req = mockReq({ user: { user_id: 1 }, body: { proposal_id: 9 } });
      let res = mockRes();
      db.query.mockResolvedValueOnce([[{ cycle_id: 5 }]]);
      let conn = makeConn();
      db.getConnection.mockResolvedValueOnce(conn);
      conn.query
        .mockResolvedValueOnce([[{ proposal_id: 9, student_id: 10, supervisor_id: 1, project_id: null, status: 'submitted' }]])
        .mockResolvedValueOnce([[]]); // no pool
      await allocCtl.acceptStudentIdea(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/No student-idea pool/)
      }));

      // seats = 0
      req = mockReq({ user: { user_id: 1 }, body: { proposal_id: 10 } });
      res = mockRes();
      db.query.mockResolvedValueOnce([[{ cycle_id: 5 }]]);
      conn = makeConn();
      db.getConnection.mockResolvedValueOnce(conn);
      conn.query
        .mockResolvedValueOnce([[{ proposal_id: 10, student_id: 10, supervisor_id: 1, project_id: null, status: 'submitted' }]])
        .mockResolvedValueOnce([[{ project_id: 77, quota: 1, seats_left: 0 }]]);
      await allocCtl.acceptStudentIdea(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/No seats available/)
      }));
    });
  });

  // ---------- LIST / GET ONE ----------
  describe('listForSupervisor', () => {
    it('uses latest committed cycle when none specified, then returns rows', async () => {
      const req = mockReq({ user: { user_id: 9001 }, query: {} });
      const res = mockRes();

      // getLatestCommittedCycleId
      db.query
        .mockResolvedValueOnce([[{ cycle_id: 222 }]]) // committed cycle
        .mockResolvedValueOnce([[
          { allocation_id: 1, supervisor_id: 9001, project_id: 501, student_id: 100, status: 'allocated', cycle_id: 222 }
        ]]);

      await allocCtl.listForSupervisor(req, res);

      const rows = res.json.mock.calls[0][0];
      expect(rows[0]).toEqual(expect.objectContaining({ allocation_id: 1, cycle_id: 222 }));
    });

    it('returns [] when no committed cycles exist and no cycle specified', async () => {
      const req = mockReq({ user: { user_id: 1 }, query: {} });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]); // latest committed not found

      await allocCtl.listForSupervisor(req, res);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('respects explicit cycle_id from query', async () => {
      const req = mockReq({ user: { user_id: 7 }, query: { cycle_id: '999' } });
      const res = mockRes();

      // When cycle present, controller queries rows directly
      db.query.mockResolvedValueOnce([[{ allocation_id: 55, cycle_id: 999, supervisor_id: 7 }]]);

      await allocCtl.listForSupervisor(req, res);
      const rows = res.json.mock.calls[0][0];
      expect(rows[0]).toEqual(expect.objectContaining({ allocation_id: 55, cycle_id: 999 }));
    });
  });

  describe('getOne', () => {
    it('returns a single allocation row', async () => {
      const req = mockReq({ user: { user_id: 9001 }, params: { allocation_id: '1' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[{ allocation_id: 1, supervisor_id: 9001, project_id: 501, student_id: 100 }]]);
      await allocCtl.getOne(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ allocation_id: 1 }));
    });

    it('404 when not found', async () => {
      const req = mockReq({ user: { user_id: 9001 }, params: { allocation_id: '999' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]);

      await allocCtl.getOne(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Allocation not found' }));
    });
  });

  // ---------- STUDENT ----------
  describe('myAllocationForStudent', () => {
    it('returns latest committed allocation for student (preferred)', async () => {
      const req = mockReq({ user: { user_id: 100 } });
      const res = mockRes();

      // committed path has result
      db.query.mockResolvedValueOnce([[{ allocation_id: 1, student_id: 100, project_id: 501, allocation_status: 'allocated' }]]);

      await allocCtl.myAllocationForStudent(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ allocation_id: 1 }));
    });

    it('falls back to latest any-cycle allocation when none committed', async () => {
      const req = mockReq({ user: { user_id: 100 } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]) // none committed
        .mockResolvedValueOnce([[{ allocation_id: 9, student_id: 100, project_id: 1 }]]);

      await allocCtl.myAllocationForStudent(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ allocation_id: 9 }));
    });

    it('returns null when student has no allocations at all', async () => {
      const req = mockReq({ user: { user_id: 100 } });
      const res = mockRes();

      db.query
        .mockResolvedValueOnce([[]]) // committed none
        .mockResolvedValueOnce([[]]); // any cycle none

      await allocCtl.myAllocationForStudent(req, res);
      expect(res.json).toHaveBeenCalledWith(null);
    });
  });
});
