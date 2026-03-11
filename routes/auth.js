const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── GET all active sites ────────────────────────────────────────────────────
router.get("/sites", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT sitename FROM sites WHERE status = 'Active' ORDER BY sitename",
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching sites." });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password, site } = req.body;

  if (!username || !password || !site)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? AND password = ? AND site = ?",
      [username, password, site],
    );

    if (rows.length === 0)
      return res
        .status(401)
        .json({ message: "Invalid username, password, or site." });

    const user = rows[0];
    const token = jwt.sign(
      {
        username: user.username,
        role: user.Role,
        firstname: user.Firstname,
        lastname: user.Lastname,
        site: user.site,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.json({
      token,
      user: {
        username: user.username,
        role: user.Role,
        firstname: user.Firstname,
        lastname: user.Lastname,
        site: user.site,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// ─── CHECK IF USERNAME EXISTS ────────────────────────────────────────────────
router.get("/check-username", async (req, res) => {
  const { username } = req.query;
  if (!username)
    return res.status(400).json({ message: "Username is required." });

  try {
    const [rows] = await pool.query(
      "SELECT username FROM users WHERE username = ?",
      [username],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message: "This email is already registered.",
      });
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ─── SEND OTP ────────────────────────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Email is required." });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await pool.query("DELETE FROM otp_store WHERE email = ?", [email]);
    await pool.query("INSERT INTO otp_store (email, otp) VALUES (?, ?)", [
      email,
      otp,
    ]);

    await transporter.sendMail({
      from: `"Q2P System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Q2P System — Email Verification OTP",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;
                    border:1px solid #ddd;border-radius:8px;padding:28px;">
          <h2 style="color:#800000;text-align:center;margin-bottom:4px;">Q2P System</h2>
          <p style="text-align:center;color:#555;font-size:13px;">CircorFlow</p>
          <hr style="border-color:#eee;"/>
          <p>Hello,</p>
          <p>Your OTP verification code is:</p>
          <h1 style="text-align:center;letter-spacing:10px;
                     color:#800000;font-size:40px;">${otp}</h1>
          <p style="text-align:center;color:#777;font-size:13px;">
            Valid for <strong>10 minutes</strong>. Do not share this code with anyone.
          </p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "OTP sent successfully to your email.",
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Failed to send OTP. Try again." });
  }
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required." });

  try {
    const [rows] = await pool.query(
      `SELECT * FROM otp_store
       WHERE email = ? AND otp = ?
       AND created_at >= NOW() - INTERVAL 10 MINUTE`,
      [email, otp],
    );

    if (rows.length === 0)
      return res.json({
        success: false,
        message: "Invalid or expired OTP. Try again.",
      });

    await pool.query("DELETE FROM otp_store WHERE email = ?", [email]);
    res.json({ success: true, message: "OTP verified successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ─── CHECK EMPLOYEE ID UNIQUENESS ────────────────────────────────────────────
router.get("/check-employeeid", async (req, res) => {
  const { employeeid } = req.query;
  if (!employeeid)
    return res.status(400).json({ message: "Employee ID is required." });

  try {
    const [rows] = await pool.query(
      "SELECT username FROM users WHERE EmployeeID = ?",
      [employeeid],
    );
    if (rows.length > 0)
      return res.json({
        exists: true,
        message: "This Employee ID is already registered.",
      });
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ─── REGISTER / CREATE ACCOUNT ───────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const {
    username,
    password,
    site,
    Firstname,
    Lastname,
    EmployeeID,
    Email,
    Role,
  } = req.body;

  // All fields mandatory
  if (
    !username ||
    !password ||
    !site ||
    !Firstname ||
    !Lastname ||
    !EmployeeID ||
    !Email ||
    !Role
  )
    return res.status(400).json({ message: "All fields are required." });

  try {
    // Double-check username uniqueness
    const [userCheck] = await pool.query(
      "SELECT username FROM users WHERE username = ?",
      [username],
    );
    if (userCheck.length > 0)
      return res
        .status(409)
        .json({ message: "This email is already registered." });

    // Double-check Employee ID uniqueness
    const [empCheck] = await pool.query(
      "SELECT username FROM users WHERE EmployeeID = ?",
      [EmployeeID],
    );
    if (empCheck.length > 0)
      return res
        .status(409)
        .json({ message: "This Employee ID is already registered." });

    // Insert — plain text password as per requirement
    await pool.query(
      `INSERT INTO users (username, password, site, Firstname, Lastname, EmployeeID, Email, Role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, password, site, Firstname, Lastname, EmployeeID, Email, Role],
    );

    res.json({ success: true, message: "Account created successfully!" });
  } catch (err) {
    console.error(err);
    // Handle DB-level unique constraint violations
    if (err.code === "ER_DUP_ENTRY") {
      if (err.message.includes("EmployeeID"))
        return res.status(409).json({ message: "Employee ID already exists." });
      return res.status(409).json({ message: "Username already exists." });
    }
    res.status(500).json({ message: "Server error during registration." });
  }
});

module.exports = router;
