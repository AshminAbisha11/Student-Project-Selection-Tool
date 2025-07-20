const db = require('../config/db');

//get all preference 
exports.getPreferencesByStudent = async (req, res) => {
  const studentId = req.user.user_id;
  console.log("Student ID:", studentId);

  const sql = `
    SELECT p.preference_id, p.preference_order, pr.title, pr.description, pr.supervisor_name
    FROM preferences p
    JOIN projects pr ON p.project_id = pr.project_id
    WHERE p.student_id = ?
    ORDER BY p.preference_order
  `;

  try {
    console.log("Starting DB query...");
    const [results] = await db.query(sql, [studentId]);  
    console.log("Query successful");
    console.log("Results:", results);

    if (results.length === 0) {
      return res.status(200).json({ message: "No preferences found for this student." });
    }

    res.status(200).json(results);
  } catch (err) {
    console.error("Error executing query:", err);
    res.status(500).json({ error: "Database error" });
  }
};


// Add a new preference
exports.addPreference = async (req, res) => {
  const student_id = req.user.user_id;
  const { project_id } = req.body;

  try {
    const [existing] = await db.query(
      `SELECT * FROM preferences WHERE student_id = ? ORDER BY preference_order ASC`,
      [student_id]
    );

    if (existing.length >= 5) {
      return res.status(400).json({ message: "You can only add up to 5 preferences." });
    }

    const alreadyAdded = existing.find(p => p.project_id === project_id);
    if (alreadyAdded) {
      return res.status(400).json({ message: "This project is already in your preferences." });
    }

    const preference_order = existing.length + 1;

    const [result] = await db.query(
      `INSERT INTO preferences (student_id, project_id, preference_order) VALUES (?, ?, ?)`,
      [student_id, project_id, preference_order]
    );

    res.status(201).json({
      message: 'Preference added successfully',
      preference_id: result.insertId,
      preference_order,
    });
  } catch (err) {
    console.error('Error adding preference:', err);
    res.status(500).json({ error: 'Database error' });
  }
};



// Update preference order
exports.updatePreferenceOrder = (req, res) => {
  const { preference_id, preference_order } = req.body;

  const sql = `
    UPDATE preferences
    SET preference_order = ?
    WHERE preference_id = ?
  `;

  db.query(sql, [preference_order, preference_id], (err) => {
    if (err) {
      console.error('Error updating preference order:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Preference order updated successfully' });
  });
};

// Delete a preference
exports.deletePreference = async (req, res) => {
  const preferenceId = req.params.preferenceId;
  const studentId = req.user.user_id;

  console.log("Deleting preference ID:", preferenceId);

  try {
    // Delete the preference
    const [deleteResult] = await db.query(
      `DELETE FROM preferences WHERE preference_id = ?`,
      [preferenceId]
    );

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Preference not found' });
    }

    // Reorder the remaining preferences
    const [remaining] = await db.query(
      `SELECT preference_id FROM preferences WHERE student_id = ? ORDER BY preference_order ASC`,
      [studentId]
    );

    for (let i = 0; i < remaining.length; i++) {
      const prefId = remaining[i].preference_id;
      await db.query(
        `UPDATE preferences SET preference_order = ? WHERE preference_id = ?`,
        [i + 1, prefId]
      );
    }

    console.log("Preference deleted and reordered successfully");
    res.status(200).json({ message: 'Preference deleted and reordered successfully' });

  } catch (err) {
    console.error('Error deleting/reordering preference:', err);
    res.status(500).json({ error: 'Database error' });
  }
};
