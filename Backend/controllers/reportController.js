// controllers/reportController.js
const db = require("../config/db");

/* CSV helpers */
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function rowsToCsv(rows) {
  if (!rows?.length) return "";
  const headers = Object.keys(rows[0]);
  const head = headers.map(csvEscape).join(",");
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(",")).join("\n");
  return [head, body].join("\n");
}

/* GET /reports/allocations.csv?cycle_id=123 */
exports.allocationsCsv = async (req, res) => {
  const cycleId = req.query.cycle_id;
  if (!cycleId) return res.status(400).json({ message: "cycle_id is required" });

  // NOTE: no a.created_at; names come from users.name
  const [rows] = await db.query(
    `
    SELECT
      a.cycle_id,
      s.user_id                       AS student_id,
      s.name                          AS student_name,
      s.email                         AS student_email,
      p.project_id,
      p.title                         AS project_title,
      p.supervisor_id,
      COALESCE(sup.name, '(no supervisor)') AS supervisor_name,
      sup.email                       AS supervisor_email
    FROM allocations a
    JOIN users s        ON s.user_id = a.student_id
    JOIN projects p     ON p.project_id = a.project_id
    LEFT JOIN users sup ON sup.user_id = p.supervisor_id
    WHERE a.cycle_id = ?
    ORDER BY supervisor_name, student_name
    `,
    [cycleId]
  );

  const csv = rowsToCsv(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="allocations_cycle_${cycleId}.csv"`
  );
  res.status(200).send(csv);
};

/* GET /reports/supervisor-load.csv?cycle_id=123 */
exports.supervisorLoadCsv = async (req, res) => {
  const cycleId = req.query.cycle_id;
  if (!cycleId) return res.status(400).json({ message: "cycle_id is required" });

  const [rows] = await db.query(
    `
    SELECT 
      p.supervisor_id,
      COALESCE(u.name, '(no supervisor)') AS supervisor_name,
      COUNT(*) AS allocated_students
    FROM allocations a
    JOIN projects p ON p.project_id = a.project_id
    LEFT JOIN users u ON u.user_id = p.supervisor_id
    WHERE a.cycle_id = ?
    GROUP BY p.supervisor_id, supervisor_name
    ORDER BY allocated_students DESC, supervisor_name
    `,
    [cycleId]
  );

  const csv = rowsToCsv(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="supervisor_load_cycle_${cycleId}.csv"`
  );
  res.status(200).send(csv);
};

/* GET /reports/summary.json?cycle_id=123 */
exports.summaryJson = async (req, res) => {
  const cycleId = req.query.cycle_id;
  if (!cycleId) return res.status(400).json({ message: "cycle_id is required" });

  const [[{ cnt: allocations }]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM allocations WHERE cycle_id=?`,
    [cycleId]
  );
  const [[{ cnt: studentsAllocated }]] = await db.query(
    `SELECT COUNT(DISTINCT student_id) AS cnt FROM allocations WHERE cycle_id=?`,
    [cycleId]
  );
  const [[{ cnt: projectsUsed }]] = await db.query(
    `SELECT COUNT(DISTINCT project_id) AS cnt FROM allocations WHERE cycle_id=?`,
    [cycleId]
  );

  res.json({
    cycle_id: Number(cycleId),
    allocations,
    studentsAllocated,
    projectsUsed,
  });
};
