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
      "SELECT COUNT(*) AS cnt FROM partno_reference WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM partno_reference WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all GE references
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Customer_partno, Cfti_partno, status
       FROM partno_reference
       ORDER BY Customer_partno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// active CFTI parts from price
router.get("/cftiparts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Cfti_partno FROM price
       WHERE status='Active'
         AND (Exp_Date IS NULL OR Exp_Date >= CURDATE())
       ORDER BY Cfti_partno ASC`,
    );
    res.json(rows.map((r) => r.Cfti_partno));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate combination check
router.get("/check", authMiddleware, async (req, res) => {
  const { custpartno, cftipartno } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partno_reference
       WHERE Customer_partno=? AND Cfti_partno=?`,
      [custpartno, cftipartno],
    );
    if (rows[0].cnt > 0)
      return res.json({
        exists: true,
        message:
          "The Reference for this Part No already exists. Please create a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ADD GE Reference
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Customerpartno, Cftipartno } = req.body;

  if (!Customerpartno || !Cftipartno)
    return res.status(400).json({
      message: "Customer Part No. and CFTI Part No. are required.",
    });

  Customerpartno = Customerpartno.trim().toUpperCase();
  Cftipartno = Cftipartno.trim().toUpperCase();

  try {
    const [exists] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partno_reference
       WHERE Customer_partno=? AND Cfti_partno=?`,
      [Customerpartno, Cftipartno],
    );
    if (exists[0].cnt > 0)
      return res.status(409).json({
        message:
          "The Reference for this Part No already exists. Please create a different one.",
      });

    await pool.query(
      `INSERT INTO partno_reference (Customer_partno, Cfti_partno, status)
       VALUES (?, ?, 'Active')`,
      [Customerpartno, Cftipartno],
    );

    res.json({ success: true, message: "Reference created successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// EDIT GE Reference (Customer_partno only)
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
    const [exists] = await pool.query(
      `SELECT COUNT(*) as cnt FROM partno_reference
       WHERE Customer_partno=? AND Cfti_partno=? AND Sno!=?`,
      [Customerpartno, Cftipartno, sno],
    );
    if (exists[0].cnt > 0)
      return res.status(409).json({
        message: "The Reference already exists. Please create a different one.",
      });

    const [result] = await pool.query(
      `UPDATE partno_reference SET Customer_partno=? WHERE Sno=?`,
      [Customerpartno, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Reference updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// TOGGLE status
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
      const [refRows] = await pool.query(
        `SELECT Customer_partno FROM partno_reference WHERE Sno=?`,
        [sno],
      );
      if (refRows.length > 0) {
        const custPartno = refRows[0].Customer_partno;
        try {
          const [openQuotes] = await pool.query(
            `SELECT DISTINCT Quote_number FROM quote_register
             WHERE RFQ_reference LIKE ?
               AND Opportunity_stage IN (
                 SELECT Data FROM quote_data WHERE Sno IN (22,24,27,29,30)
               )`,
            [`%${custPartno}%`],
          );
          if (openQuotes.length > 0) {
            const qnos = openQuotes.map((q) => q.Quote_number).join(", ");
            return res.json({
              success: false,
              openquote: true,
              message: `There are Open Quotes with this Part Number: ${qnos}`,
            });
          }
        } catch {
          // allow toggle if check fails
        }
      }
    }

    await pool.query(`UPDATE partno_reference SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
