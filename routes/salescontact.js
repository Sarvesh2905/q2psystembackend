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
      "SELECT COUNT(*) AS cnt FROM sales_contact WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM sales_contact WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// all sales contacts
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, sales_contact_name, email, mobile, landline, status
       FROM sales_contact
       ORDER BY sales_contact_name ASC`,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate checks
router.get("/check", authMiddleware, async (req, res) => {
  const { name, email, mobile, landline } = req.query;
  try {
    if (name) {
      const norm = name.toLowerCase().replace(/\s/g, "");
      const [rows] = await pool.query(
        `SELECT sales_contact_name FROM sales_contact
         WHERE LOWER(REPLACE(TRIM(sales_contact_name), ' ', '')) = ?`,
        [norm],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "name",
          message: "Sales Contact name already exists.",
        });
    }

    if (email) {
      const [rows] = await pool.query(
        "SELECT email FROM sales_contact WHERE LOWER(TRIM(email)) = ?",
        [email.toLowerCase().trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "email",
          message: "Email already exists.",
        });
    }

    if (mobile) {
      const [rows] = await pool.query(
        "SELECT mobile FROM sales_contact WHERE mobile = ?",
        [mobile.trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "mobile",
          message: "Mobile number already exists.",
        });
    }

    if (landline) {
      const [rows] = await pool.query(
        "SELECT landline FROM sales_contact WHERE landline = ?",
        [landline.trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "landline",
          message: "Landline already exists.",
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

  let { salescontactname, email, mobile, landline } = req.body;
  if (!salescontactname || !email)
    return res.status(400).json({ message: "Name and Email are required." });

  salescontactname = salescontactname
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  mobile = mobile?.trim() || null;
  landline = landline?.trim() || null;

  try {
    await pool.query(
      `INSERT INTO sales_contact
         (sales_contact_name, email, mobile, landline, status)
       VALUES (?, ?, ?, ?, ?)`,
      [salescontactname, email, mobile, landline, "Active"],
    );
    res.json({ success: true, message: "Sales contact added successfully!" });
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "Sales Contact name already exists." });
    res.status(500).json({ message: "Server error" });
  }
});

// edit
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { mobile, landline } = req.body;
  mobile = mobile?.trim() || null;
  landline = landline?.trim() || null;

  try {
    const [result] = await pool.query(
      `UPDATE sales_contact SET mobile=?, landline=? WHERE Sno=?`,
      [mobile, landline, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Sales contact updated successfully!" });
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
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query("UPDATE sales_contact SET status=? WHERE Sno=?", [
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
