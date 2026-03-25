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
      `SELECT COUNT(*) AS cnt FROM quote_data
       WHERE Type = 'Customertype' AND Status = 'Active'`,
    );
    const [[inactive]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM quote_data
       WHERE Type = 'Customertype' AND Status = 'Inactive'`,
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// all customer types
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Data AS CustomerType, Status AS status
       FROM quote_data
       WHERE Type = 'Customertype'
       ORDER BY Data ASC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate check
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.val || "").trim().toUpperCase();
  if (!val) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      `SELECT Sno FROM quote_data
       WHERE Type = 'Customertype' AND UPPER(TRIM(Data)) = ?`,
      [val],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message:
          "This Customer Type already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADD customer type
router.post("/", authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { CustomerType } = req.body;
  if (!CustomerType || !CustomerType.trim())
    return res.status(400).json({ message: "Customer Type is required." });

  CustomerType = CustomerType.trim().toUpperCase();

  try {
    const [existing] = await pool.query(
      `SELECT Sno FROM quote_data
       WHERE Type = 'Customertype' AND UPPER(TRIM(Data)) = ?`,
      [CustomerType],
    );
    if (existing.length > 0)
      return res.status(409).json({
        message:
          "This Customer Type already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO quote_data (Data, Type, Description, Status)
       VALUES (?, 'Customertype', NULL, 'Active')`,
      [CustomerType],
    );
    res.json({ success: true, message: "Customer Type added successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// toggle status
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const { role } = req.user;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query(
      `UPDATE quote_data SET Status=? WHERE Sno=? AND Type='Customertype'`,
      [status, sno],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
