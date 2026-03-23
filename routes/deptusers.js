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
      `SELECT Sno, dept_user_id, Username, Email, status
       FROM dept_users
       ORDER BY dept_user_id ASC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// check duplicate dept_user_id
router.get("/check-deptuserid", authMiddleware, async (req, res) => {
  const { deptuserid } = req.query;
  if (!deptuserid) return res.json({ exists: false });

  try {
    const norm = deptuserid.toLowerCase().replace(/\s/g, "");
    const [rows] = await pool.query(
      `SELECT dept_user_id
       FROM dept_users
       WHERE LOWER(REPLACE(TRIM(dept_user_id), ' ', '')) = ?`,
      [norm],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message: "The Application Engineer ID already exists.",
      });
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// add dept user
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { deptuserid, Username, Email } = req.body;
  if (!deptuserid || !Username || !Email)
    return res
      .status(400)
      .json({ message: "ID, Name and Email are required." });

  deptuserid = deptuserid.toUpperCase();
  Username = Username.trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    await pool.query(
      `INSERT INTO dept_users (dept_user_id, Username, Email, status)
       VALUES (?, ?, ?, ?)`,
      [deptuserid, Username, Email, "Active"],
    );
    res.json({ success: true, message: "User added successfully!" });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      if (err.message.includes("dept_user_id"))
        return res
          .status(409)
          .json({ message: "Application Engineer ID already exists." });
      if (err.message.includes("Username"))
        return res.status(409).json({ message: "Name already exists." });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// edit dept user
router.put("/:deptuserid", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { deptuserid } = req.params;
  let { Username, Email } = req.body;

  if (!Username || !Email)
    return res.status(400).json({ message: "Name and Email are required." });

  Username = Username.trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    const [result] = await pool.query(
      `UPDATE dept_users SET Username = ?, Email = ?
       WHERE dept_user_id = ?`,
      [Username, Email, deptuserid],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "User not found." });
    res.json({ success: true, message: "User updated successfully!" });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Name already exists." });
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
    await pool.query("UPDATE dept_users SET status = ? WHERE Sno = ?", [
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
