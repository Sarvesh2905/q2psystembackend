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

router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[total]] = await pool.query("SELECT COUNT(*) AS cnt FROM reason");
    res.json({ total: total.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Reason_Code AS ReasonCode, Description
       FROM reason ORDER BY Reason_Code ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.reasoncode || "").toLowerCase().trim();
  if (!val) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Reason_Code)) as nm FROM reason`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message:
          "This Reason Code already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { ReasonCode, Description } = req.body;
  if (!ReasonCode || !ReasonCode.trim())
    return res.status(400).json({ message: "Reason Code is required." });

  ReasonCode = ReasonCode.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Reason_Code)) as nm FROM reason`,
    );
    if (rows.some((r) => r.nm === ReasonCode.toLowerCase()))
      return res.status(409).json({
        message:
          "This Reason Code already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO reason (Reason_Code, Description) VALUES (?, ?)`,
      [ReasonCode, Description?.trim() || null],
    );
    res.json({ success: true, message: "Reason added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Description } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE reason SET Description=? WHERE Sno=?`,
      [Description?.trim() || null, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Reason updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
