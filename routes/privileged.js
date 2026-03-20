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

const PRIVILEGE_VALUES = ["Allowmaster", "Restrictmaster"];
router.get("/counts", authMiddleware, async (req, res) => {
  const [[a]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM privileges WHERE status='Active'",
  );
  const [[i]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM privileges WHERE status='Inactive'",
  );
  res.json({ active: a.cnt, inactive: i.cnt });
});
// ── GET all (A-Z by Program) ──────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Program, Privilege, status
       FROM program ORDER BY Program ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Program ────────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.program || "").toLowerCase().trim();
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Program)) as nm FROM program`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message: "This Program name already exists.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD ───────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Program, Privilege } = req.body;

  if (!Program || !Program.trim())
    return res.status(400).json({ message: "Program name is required." });
  if (!Privilege || !PRIVILEGE_VALUES.includes(Privilege))
    return res
      .status(400)
      .json({ message: "Privilege must be Allowmaster or Restrictmaster." });

  Program = Program.trim();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Program)) as nm FROM program`,
    );
    if (rows.some((r) => r.nm === Program.toLowerCase()))
      return res
        .status(409)
        .json({ message: "This Program name already exists." });

    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM program");
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO program (Sno, Program, Privilege, status)
       VALUES (?, ?, ?, 'Active')`,
      [newSno, Program, Privilege],
    );
    res.json({ success: true, message: "Program added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "This Program name already exists." });
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (Program = LOCKED, only Privilege can change) ────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Privilege } = req.body;

  if (!Privilege || !PRIVILEGE_VALUES.includes(Privilege))
    return res
      .status(400)
      .json({ message: "Privilege must be Allowmaster or Restrictmaster." });

  try {
    await pool.query(`UPDATE program SET Privilege=? WHERE Sno=?`, [
      Privilege,
      sno,
    ]);
    res.json({ success: true, message: "Program updated successfully!" });
  } catch (err) {
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
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query(`UPDATE program SET status=? WHERE Sno=?`, [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
