const db = require('../config/db');
const stringSimilarity = require('string-similarity');

// Utility to format quota display (e.g., "2 slots left")
const formatQuota = (remaining) => {
  return remaining > 0 ? `${remaining} slot${remaining > 1 ? 's' : ''} left` : 'Full';
};

// 1. Get all projects
exports.getAllProjects = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *, (quota - spots_filled) AS quota_remaining 
      FROM projects
    `);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching all projects:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 2. Filter by supervisor
exports.filterBySupervisor = async (req, res) => {
  const { supervisor } = req.params;

  try {
    const [rows] = await db.execute(`
      SELECT *, (quota - spots_filled) AS quota_remaining 
      FROM projects 
      WHERE supervisor_name = ?
    `, [supervisor]);

    if (rows.length === 0) {
      return res.status(404).json({ message: `No projects found for supervisor: ${supervisor}` });
    }

    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by supervisor:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 3. Filter by topic
exports.filterByTopic = async (req, res) => {
  const { topic } = req.params;

  try {
    const [rows] = await db.execute(`
      SELECT *, (quota - spots_filled) AS quota_remaining 
      FROM projects 
      WHERE topic = ?
    `, [topic]);

    if (rows.length === 0) {
      return res.status(404).json({ message: `No projects found for topic: ${topic}` });
    }

    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by topic:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 4. Filter by keyword
exports.filterByKeyword = async (req, res) => {
  const { keyword } = req.query;

  try {
    const [rows] = await db.execute(`
      SELECT *, (quota - spots_filled) AS quota_remaining 
      FROM projects 
      WHERE title LIKE ? OR description LIKE ?
    `, [`%${keyword}%`, `%${keyword}%`]);

    if (rows.length === 0) {
      return res.status(404).json({ message: `No projects found for keyword: ${keyword}` });
    }

    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error filtering by keyword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 5. Multi-filtered project
exports.multiFilteredProjects = async (req, res) => {
  const { supervisor, topic, keyword } = req.query;

  let query = `
    SELECT *, (quota - spots_filled) AS quota_remaining 
    FROM projects
  `;
  let queryParams = [];
  let whereAdded = false;

  if (supervisor) {
    query += whereAdded ? ` AND supervisor_name = ?` : ` WHERE supervisor_name = ?`;
    queryParams.push(supervisor);
    whereAdded = true;
  }

  if (topic) {
    query += whereAdded ? ` AND topic = ?` : ` WHERE topic = ?`;
    queryParams.push(topic);
    whereAdded = true;
  }

  if (keyword) {
    query += whereAdded ? ` AND (title LIKE ? OR description LIKE ?)` : ` WHERE (title LIKE ? OR description LIKE ?)`;
    queryParams.push(`%${keyword}%`, `%${keyword}%`);
  }

  try {
    const [rows] = await db.execute(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No projects found with the selected filters.' });
    }

    res.status(200).json({ projects: rows });
  } catch (error) {
    console.error('Error with multi-filtered project search:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 6. Smart search with suggestions
exports.searchProjects = async (req, res) => {
  const { query = "" } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  const searchWord = `%${query}%`;

  try {
    const [results] = await db.execute(`
      SELECT project_id, title, supervisor_name, topic, description,
             quota, spots_filled, (quota - spots_filled) AS quota_remaining
      FROM projects
      WHERE title LIKE ? OR supervisor_name LIKE ? OR description LIKE ?
    `, [searchWord, searchWord, searchWord]);

    if (results.length > 0) {
      const formattedResults = results.map(project => ({
        ...project,
        quota_status: formatQuota(project.quota_remaining)
      }));

      return res.status(200).json({ projects: formattedResults });
    } else {
      const [allProjects] = await db.execute(`
        SELECT title FROM projects
      `);

      if (Array.isArray(allProjects)) {
        const projectTitles = allProjects.map(p => p.title);
        const matches = stringSimilarity.findBestMatch(query, projectTitles);
        const suggestions = matches.ratings
          .filter(match => match.rating > 0.4)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 3);

        if (suggestions.length > 0) {
          return res.status(200).json({
            message: `No exact matches found for "${query}". Did you mean one of these?`,
            suggestions: suggestions.map(s => s.target)
          });
        } else {
          return res.status(200).json({
            message: `No projects found for "${query}". Please try a different keyword.`
          });
        }
      } else {
        console.error("Error: allProjects is not an array");
        return res.status(500).json({ error: "Failed to fetch projects for suggestions" });
      }
    }
  } catch (err) {
    console.error("Error searching projects:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get full project details by ID (with long description and prerequisites)
exports.getProjectDetails = async (req, res) => {
  const { projectId } = req.params;

  try {
    const [rows] = await db.execute(`
      SELECT 
        p.project_id, p.title, p.supervisor_name, p.topic, p.quota, p.spots_filled,
        d.full_description, d.prerequisites
      FROM projects p
      JOIN project_details d ON p.project_id = d.project_id
      WHERE p.project_id = ?
    `, [projectId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// POST /projects
// Body: { title, description, topic?, keywords?, quota, full_description?, prerequisites? }
exports.createProject = async (req, res) => {
  try {
    // must be logged in as a supervisor
    if (!req.user || req.user.role !== 'supervisor') {
      return res.status(403).json({ message: 'Only supervisors can create projects.' });
    }

    const {
      title,
      description,
      topic = null,
      keywords = null,
      quota,
      full_description = null, // goes into project_details
      prerequisites = null     // goes into project_details
    } = req.body || {};

    // basic validation
    const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

    if (!nonEmpty(title) || !nonEmpty(description)) {
      return res.status(400).json({ message: 'Title and description are required.' });
    }
    const q = Number(quota);
    if (!Number.isInteger(q) || q < 1) {
      return res.status(400).json({ message: 'Quota must be an integer ≥ 1.' });
    }

    const supervisor_id = req.user.user_id;     // from JWT
    const supervisor_name = req.user.name || ''; // you still store name in projects

    // Use a transaction because we touch two tables (projects + project_details)
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // insert project
      const insertProjectSql = `
        INSERT INTO projects
          (title, description, supervisor_name, topic, keywords,
           quota, spots_filled, status, supervisor_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'draft', ?)
      `;
      const [result] = await conn.query(insertProjectSql, [
        title.trim(),
        description.trim(),
        supervisor_name,
        topic ? String(topic).trim() : null,
        keywords ? String(keywords).trim() : null,
        q,
        supervisor_id
      ]);

      const project_id = result.insertId;

      // insert details (keep it even if nulls, or you can conditionally insert)
      const insertDetailsSql = `
        INSERT INTO project_details (project_id, full_description, prerequisites)
        VALUES (?, ?, ?)
      `;
      await conn.query(insertDetailsSql, [
        project_id,
        full_description ? String(full_description).trim() : null,
        prerequisites ? String(prerequisites).trim() : null
      ]);

      await conn.commit();

      // return the created project
      const [rows] = await conn.query(
        `SELECT p.project_id, p.title, p.description, p.topic, p.keywords,
                p.quota, p.spots_filled, p.status, p.created_at, p.updated_at,
                p.supervisor_id, p.supervisor_name
         FROM projects p
         WHERE p.project_id = ?`,
        [project_id]
      );

      return res.status(201).json({ message: 'Project created.', project: rows[0] });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
