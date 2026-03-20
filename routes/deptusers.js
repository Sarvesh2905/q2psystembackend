const express = require("express");
const router = express.Router();
const pool = require("../db");

// ── Middleware: verify JWT ────────────────────────────────────────────────────
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
// ── GET counts ────────────────────────────────────────────────────────────────
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]]   = await pool.query("SELECT COUNT(*) AS cnt FROM deptusers WHERE status='Active'");
    const [[inactive]] = await pool.query("SELECT COUNT(*) AS cnt FROM deptusers WHERE status='Inactive'");
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ── GET all dept users (sorted A-Z by deptuserid) ────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT Sno, deptuserid, Username, Email, status FROM deptusers ORDER BY deptuserid ASC",
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate deptuserid ────────────────────────────────────────────────
router.get("/check-deptuserid", authMiddleware, async (req, res) => {
  const { deptuserid } = req.query;
  if (!deptuserid) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      'SELECT deptuserid FROM deptusers WHERE LOWER(REPLACE(TRIM(deptuserid)," ","")) = ?',
      [deptuserid.toLowerCase().replace(/\s/g, "")],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message: "The Application Engineer ID already exists.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD dept user ─────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { deptuserid, Username, Email } = req.body;
  if (!deptuserid || !Username || !Email)
    return res
      .status(400)
      .json({ message: "ID, Name and Email are required." });

  // Capitalize like original Flask code
  deptuserid = deptuserid.toUpperCase();
  Username = Username.trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  try {
    // Reorder Sno to maintain sequence
    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM deptusers",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      "INSERT INTO deptusers (Sno, deptuserid, Username, Email, status) VALUES (?, ?, ?, ?, ?)",
      [newSno, deptuserid, Username, Email, "Active"],
    );
    res.json({ success: true, message: "User added successfully!" });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      if (err.message.includes("deptuserid"))
        return res
          .status(409)
          .json({ message: "Application Engineer ID already exists." });
      if (err.message.includes("Username"))
        return res.status(409).json({ message: "Name already exists." });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// ── EDIT dept user ────────────────────────────────────────────────────────────
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
      "UPDATE deptusers SET Username = ?, Email = ? WHERE deptuserid = ?",
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

// ── TOGGLE status ─────────────────────────────────────────────────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;

  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status value." });

  try {
    await pool.query("UPDATE deptusers SET status = ? WHERE Sno = ?", [
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
