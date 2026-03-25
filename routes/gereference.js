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

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Customer_partno AS Customerpartno,
              Cfti_partno AS Cftipartno, status
       FROM partno_reference ORDER BY Customer_partno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/cftiparts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Cfti_partno FROM cost_price
       WHERE status='Active' ORDER BY Cfti_partno ASC`,
    );
    res.json(rows.map((r) => r.Cfti_partno));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.customerpartno || "").toLowerCase().trim();
  if (!val) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Customer_partno)) as nm FROM partno_reference`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message:
          "This Customer Part No. already exists. Please enter a different one.",
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

  let { Customerpartno, Cftipartno } = req.body;
  if (!Customerpartno || !Customerpartno.trim())
    return res.status(400).json({ message: "Customer Part No. is required." });
  if (!Cftipartno || !Cftipartno.trim())
    return res.status(400).json({ message: "CFTI Part No. is required." });

  Customerpartno = Customerpartno.trim().toUpperCase();
  Cftipartno = Cftipartno.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Customer_partno)) as nm FROM partno_reference`,
    );
    if (rows.some((r) => r.nm === Customerpartno.toLowerCase()))
      return res.status(409).json({
        message:
          "This Customer Part No. already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO partno_reference (Customer_partno, Cfti_partno, status)
       VALUES (?, ?, 'Active')`,
      [Customerpartno, Cftipartno],
    );
    res.json({ success: true, message: "GE Reference added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Cftipartno } = req.body;
  if (!Cftipartno || !Cftipartno.trim())
    return res.status(400).json({ message: "CFTI Part No. is required." });

  Cftipartno = Cftipartno.trim().toUpperCase();

  try {
    const [result] = await pool.query(
      `UPDATE partno_reference SET Cfti_partno=? WHERE Sno=?`,
      [Cftipartno, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "GE Reference updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query("UPDATE partno_reference SET status=? WHERE Sno=?", [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
