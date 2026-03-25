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
      "SELECT COUNT(*) AS cnt FROM sales_contact WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM sales_contact WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              sales_contact_name AS salescontactname,
              email,
              mobile,
              landline,
              status
       FROM sales_contact ORDER BY sales_contact_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check", authMiddleware, async (req, res) => {
  const { name, email } = req.query;
  try {
    if (name) {
      const [rows] = await pool.query(
        `SELECT sales_contact_name FROM sales_contact
         WHERE LOWER(TRIM(sales_contact_name)) = ?`,
        [name.toLowerCase().trim()],
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
        `SELECT email FROM sales_contact
         WHERE LOWER(TRIM(email)) = ?`,
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
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { salescontactname, email, mobile, landline } = req.body;

  if (!salescontactname || !salescontactname.trim())
    return res.status(400).json({ message: "Name is required." });

  salescontactname = salescontactname.trim();

  try {
    const [nameCheck] = await pool.query(
      `SELECT sales_contact_name FROM sales_contact
       WHERE LOWER(TRIM(sales_contact_name)) = ?`,
      [salescontactname.toLowerCase()],
    );
    if (nameCheck.length > 0)
      return res.status(409).json({
        message: "This Name already exists. Please enter a different one.",
      });

    if (email) {
      const [emailCheck] = await pool.query(
        `SELECT email FROM sales_contact
         WHERE LOWER(TRIM(email)) = ?`,
        [email.trim().toLowerCase()],
      );
      if (emailCheck.length > 0)
        return res.status(409).json({
          message: "This Email already exists. Please enter a different one.",
        });
    }

    await pool.query(
      `INSERT INTO sales_contact
        (sales_contact_name, email, mobile, landline, status)
       VALUES (?, ?, ?, ?, 'Active')`,
      [
        salescontactname,
        email?.trim().toLowerCase() || null,
        mobile?.trim() || null,
        landline?.trim() || null,
      ],
    );
    res.json({ success: true, message: "Sales Contact added successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { email, mobile, landline } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE sales_contact SET email=?, mobile=?, landline=? WHERE Sno=?`,
      [
        email?.trim().toLowerCase() || null,
        mobile?.trim() || null,
        landline?.trim() || null,
        sno,
      ],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Sales Contact updated successfully!" });
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
    await pool.query("UPDATE sales_contact SET status=? WHERE Sno=?", [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
