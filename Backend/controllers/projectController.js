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

