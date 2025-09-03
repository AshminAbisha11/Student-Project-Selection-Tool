// Map app DB import to our mock pool
jest.mock('../config/db', () => require('./mocks/db.mock').db);

const { db, makeConn } = require('./mocks/db.mock');
const { mockRes } = require('./mocks/res.mock');
const mockReq = require('./helpers/mockReq');

const allocCtl = require('../controllers/allocationController'); 

describe('allocationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------- PREVIEW ----------
  describe('preview', () => {
    it('returns proposed allocations for given cycle_id', async () => {
      const req = mockReq({
        body: { cycle_id: 2025 }, // forces resolveCycleId via cycleExists
      });
      const res = mockRes();

      // resolveCycleId -> cycleExists
      db.query
        .mockResolvedValueOnce([[{ 1: 1 }]]) // SELECT 1 FROM allocation_cycles WHERE cycle_id=?

        // loadEligiblePreferences: already allocated students
        .mockResolvedValueOnce([[]]) // SELECT student_id FROM allocations WHERE cycle_id=?

        // loadEligiblePreferences: preferences join (two prefs -> same project/supervisor)
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

        // loadCapacities step (supervisor_meta quotas)
        .mockResolvedValueOnce([[
          { supervisor_id: 9001, quota_total: 2 }
        ]])

        // loadCapacities step (allocations per supervisor this cycle)
        .mockResolvedValueOnce([[
          { supervisor_id: 9001, c: 0 }
        ]]);

      await allocCtl.preview(req, res);

      expect(db.query).toHaveBeenCalledTimes(5);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        allocations: expect.any(Array),
        meta: expect.objectContaining({
          totalCandidates: 2,
          proposedAllocations: 2,
          cycleId: 2025
        })
      }));
    });

    it('returns empty when no eligible preferences', async () => {
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
    it('inserts allocations transactionally and marks cycle committed', async () => {
      const req = mockReq({ body: { cycle_id: 2025 } });
      const res = mockRes();

      // resolveCycleId -> cycleExists
      db.query.mockResolvedValueOnce([[{ 1: 1 }]]);

      // conn for transaction
      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      // loadEligiblePreferences (conn):
      conn.query
        // already allocated students
        .mockResolvedValueOnce([[]])
        // preferences join -> two candidates
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
        // loadCapacities: supervisor_meta
        .mockResolvedValueOnce([[
          { supervisor_id: 9001, quota_total: 2 }
        ]])
        // loadCapacities: allocations per supervisor in this cycle
        .mockResolvedValueOnce([[
          { supervisor_id: 9001, c: 0 }
        ]])
        // loop candidate 1: SELECT dup-check FOR UPDATE
        .mockResolvedValueOnce([[]])
        // loop candidate 1: INSERT allocation
        .mockResolvedValueOnce([{ insertId: 1 }])
        // loop candidate 1: UPDATE project spots_filled
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // loop candidate 2: SELECT dup-check FOR UPDATE
        .mockResolvedValueOnce([[]])
        // loop candidate 2: INSERT allocation
        .mockResolvedValueOnce([{ insertId: 2 }])
        // loop candidate 2: UPDATE project spots_filled
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // mark cycle committed
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await allocCtl.commit(req, res);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Allocations committed',
        inserted: 2,
        cycleId: 2025
      }));
    });
  });

  // ---------- ALLOCATE ----------
  describe('allocate', () => {
    it('allocates a student to a project (cycle provided)', async () => {
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
        // UPDATE project spots_filled
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // INSERT allocation
        .mockResolvedValueOnce([{ insertId: 123 }]);

      await allocCtl.allocate(req, res);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Student allocated successfully',
        cycle_id: 2025
      }));
    });

    it('returns 400 when student already allocated in cycle', async () => {
      const req = mockReq({
        user: { user_id: 9001 },
        body: { project_id: 501, student_id: 100, cycle_id: 2025 }
      });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query
        // dup-check FOR UPDATE -> one found
        .mockResolvedValueOnce([[{ 1: 1 }]]);

      await allocCtl.allocate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringMatching(/already allocated/i)
      }));
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  // ---------- DEALLOCATE ----------
  describe('deallocate', () => {
    it('removes allocation and decrements project spots', async () => {
      const req = mockReq({
        user: { user_id: 9001 },
        params: { allocation_id: '777' }
      });
      const res = mockRes();

      const conn = makeConn();
      db.getConnection.mockResolvedValue(conn);

      conn.query
        // select allocation row
        .mockResolvedValueOnce([[{
          allocation_id: 777, project_id: 501, student_id: 100, supervisor_id: 9001
        }]])
        // delete allocation
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        // update project spots_filled
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await allocCtl.deallocate(req, res);

      expect(conn.beginTransaction).toHaveBeenCalled();
      expect(conn.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Allocation removed' });
    });
  });

  // ---------- LIST / GET ONE ----------
  describe('listForSupervisor', () => {
    it('returns rows for a supervisor (no cycle filter)', async () => {
      const req = mockReq({ user: { user_id: 9001 }, query: {} });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[
        { allocation_id: 1, supervisor_id: 9001, project_id: 501, student_id: 100, status: 'allocated' }
      ]]);

      await allocCtl.listForSupervisor(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.any(Array));
      expect(res.json.mock.calls[0][0][0]).toEqual(expect.objectContaining({
        allocation_id: 1
      }));
    });
  });

  describe('getOne', () => {
    it('returns a single allocation row', async () => {
      const req = mockReq({ user: { user_id: 9001 }, params: { allocation_id: '1' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[
        { allocation_id: 1, supervisor_id: 9001, project_id: 501, student_id: 100 }
      ]]);

      await allocCtl.getOne(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        allocation_id: 1
      }));
    });

    it('404 when not found', async () => {
      const req = mockReq({ user: { user_id: 9001 }, params: { allocation_id: '999' } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]);

      await allocCtl.getOne(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Allocation not found'
      }));
    });
  });

  // ---------- STUDENT ----------
  describe('myAllocationForStudent', () => {
    it('returns latest allocation for student', async () => {
      const req = mockReq({ user: { user_id: 100 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[
        { allocation_id: 1, student_id: 100, project_id: 501, allocation_status: 'allocated' }
      ]]);

      await allocCtl.myAllocationForStudent(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        allocation_id: 1
      }));
    });

    it('returns null when none', async () => {
      const req = mockReq({ user: { user_id: 100 } });
      const res = mockRes();

      db.query.mockResolvedValueOnce([[]]);

      await allocCtl.myAllocationForStudent(req, res);

      expect(res.json).toHaveBeenCalledWith(null);
    });
  });
});
