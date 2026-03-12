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

// ── GET all GE References (A-Z by Customerpartno) ────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Customerpartno, Cftipartno, status
       FROM partnoreference
       ORDER BY Customerpartno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET active CFTI part numbers from price table (for dropdown) ─────────────
router.get("/cftiparts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Cftipartno FROM price
       WHERE status='Active'
       AND (ExpDate IS NULL OR ExpDate >= CURDATE())
       ORDER BY Cftipartno ASC`,
    );
    res.json(rows.map((r) => r.Cftipartno));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate combination (Customerpartno + Cftipartno) ────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const { custpartno, cftipartno } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partnoreference
       WHERE Customerpartno=? AND Cftipartno=?`,
      [custpartno, cftipartno],
    );
    if (rows[0].cnt > 0) {
      return res.json({
        exists: true,
        message:
          "The Reference for this Part No already exists. Please create a different one.",
      });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD GE Reference ──────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Customerpartno, Cftipartno } = req.body;

  if (!Customerpartno || !Cftipartno)
    return res
      .status(400)
      .json({ message: "Customer Part No. and CFTI Part No. are required." });

  Customerpartno = Customerpartno.trim().toUpperCase();
  Cftipartno = Cftipartno.trim().toUpperCase();

  try {
    // Duplicate check
    const [exists] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partnoreference WHERE Customerpartno=? AND Cftipartno=?`,
      [Customerpartno, Cftipartno],
    );
    if (exists[0].cnt > 0)
      return res
        .status(409)
        .json({
          message:
            "The Reference for this Part No already exists. Please create a different one.",
        });

    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM partnoreference",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    // Insert into partnoreference
    await pool.query(
      `INSERT INTO partnoreference (Sno, Customerpartno, Cftipartno, status)
       VALUES (?, ?, ?, 'Active')`,
      [newSno, Customerpartno, Cftipartno],
    );

    // Also update price table: SET Customerpartno='Y' where Cftipartno matches (same as original)
    await pool.query(`UPDATE price SET Customerpartno='Y' WHERE Cftipartno=?`, [
      Cftipartno,
    ]);

    res.json({ success: true, message: "Reference created successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT GE Reference (only Customerpartno is editable; Cftipartno locked) ───
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Customerpartno, Cftipartno } = req.body;

  if (!Customerpartno)
    return res.status(400).json({ message: "Customer Part No. is required." });

  Customerpartno = Customerpartno.trim().toUpperCase();

  try {
    // Check if new combination already exists for a different row
    const [exists] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partnoreference
       WHERE Customerpartno=? AND Cftipartno=? AND Sno!=?`,
      [Customerpartno, Cftipartno, sno],
    );
    if (exists[0].cnt > 0)
      return res
        .status(409)
        .json({
          message:
            "The Reference already exists. Please create a different one.",
        });

    await pool.query(
      `UPDATE partnoreference SET Customerpartno=? WHERE Sno=?`,
      [Customerpartno, sno],
    );
    res.json({ success: true, message: "Reference updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TOGGLE status (check open quotes before going Inactive) ──────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    if (status === "Inactive") {
      // Check for open quotes via Customerpartno of this reference
      const [refRows] = await pool.query(
        `SELECT Customerpartno FROM partnoreference WHERE Sno=?`,
        [sno],
      );
      if (refRows.length > 0) {
        const custPartno = refRows[0].Customerpartno;
        try {
          const [openQuotes] = await pool.query(
            `SELECT DISTINCT d.Quotenumber
             FROM pricescheduledetails d
             JOIN quoteregister q ON q.Quotenumber = d.Quotenumber
             WHERE d.CustomerPartNo = ?
             AND q.Opportunitystage IN (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))`,
            [custPartno],
          );
          if (openQuotes.length > 0) {
            const qnos = openQuotes.map((q) => q.Quotenumber).join(", ");
            return res.json({
              success: false,
              openquote: true,
              message: `There are Open Quotes with this Part Number: ${qnos}`,
            });
          }
        } catch (_) {
          // pricescheduledetails may not exist yet — allow toggle
        }
      }
    }

    await pool.query(`UPDATE partnoreference SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
