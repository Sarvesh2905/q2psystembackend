const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// counts
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM dept_users WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM dept_users WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// all dept users
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, dept_user_id AS deptuserid, Username, Email, status
       FROM dept_users ORDER BY Username ASC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate check
router.get("/check", authMiddleware, async (req, res) => {
  const { name, email } = req.query;
  try {
    if (name) {
      const [rows] = await pool.query(
        `SELECT Username FROM dept_users
         WHERE LOWER(REPLACE(TRIM(Username), ' ', '')) = ?`,
        [name.toLowerCase().replace(/\s/g, "")],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "name",
          message: "This Name already exists. Please enter a different one.",
        });
    }
    if (email) {
      const [rows] = await pool.query(
        `SELECT Email FROM dept_users WHERE LOWER(TRIM(Email)) = ?`,
        [email.toLowerCase().trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "email",
          message: "This Email already exists. Please enter a different one.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// add
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Username, Email } = req.body;
  if (!Username || !Username.trim())
    return res.status(400).json({ message: "Name is required." });
  if (!Email || !Email.trim())
    return res.status(400).json({ message: "Email is required." });

  Username = Username.trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    const [nameCheck] = await pool.query(
      `SELECT Username FROM dept_users
       WHERE LOWER(REPLACE(TRIM(Username), ' ', '')) = ?`,
      [Username.toLowerCase().replace(/\s/g, "")],
    );
    if (nameCheck.length > 0)
      return res.status(409).json({
        message: "This Name already exists. Please enter a different one.",
      });

    const [emailCheck] = await pool.query(
      `SELECT Email FROM dept_users WHERE LOWER(TRIM(Email)) = ?`,
      [Email.trim().toLowerCase()],
    );
    if (emailCheck.length > 0)
      return res.status(409).json({
        message: "This Email already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO dept_users (Username, Email, status) VALUES (?, ?, 'Active')`,
      [Username, Email.trim().toLowerCase()],
    );
    res.json({
      success: true,
      message: "Application Engineer added successfully!",
    });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Entry already exists." });
    res.status(500).json({ message: "Server error" });
  }
});

// edit (Email only, Username locked)
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Email } = req.body;
  if (!Email || !Email.trim())
    return res.status(400).json({ message: "Email is required." });

  try {
    const [result] = await pool.query(
      `UPDATE dept_users SET Email=? WHERE Sno=?`,
      [Email.trim().toLowerCase(), sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "User updated successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// toggle status
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status value." });

  try {
    await pool.query(`UPDATE dept_users SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
