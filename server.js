require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Database helper
async function query(text, params = []) {
  return pool.query(text, params);
}

// Create PostgreSQL tables
async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dept TEXT,
      role TEXT,
      salary NUMERIC DEFAULT 0,
      phone TEXT,
      email TEXT,
      joining_date TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id SERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      reason TEXT,
      status TEXT DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id SERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL,
      month TEXT NOT NULL,
      allowance NUMERIC DEFAULT 0,
      deduction NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'Pending',
      UNIQUE(employee_id, month)
    );
    CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
  `);
    await query(`
    INSERT INTO departments (name)
    VALUES
      ('HR'),
      ('IT'),
      ('Finance'),
      ('Sales'),
      ('Marketing')
    ON CONFLICT (name) DO NOTHING;
  `);

  console.log("PostgreSQL database tables ready.");
}
// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { fullName, username, email, password } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    const existingUser = await query(
      `SELECT id FROM users
       WHERE username = $1 OR email = $2`,
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Username or email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      `INSERT INTO users
       (full_name, username, email, password)
       VALUES ($1, $2, $3, $4)`,
      [fullName, username, email, hashedPassword]
    );

    res.json({
      ok: true,
      message: "Account created successfully"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Signup failed"
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Old admin login bhi chalta rahe
    if (username === "admin" && password === "ayush123") {
      return res.json({
        ok: true,
        username: "admin"
      });
    }

    // Registered user database se find karo
    const result = await query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    const user = result.rows[0];

    // Hashed password verify karo
    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    return res.json({
      ok: true,
      username: user.username,
      fullName: user.full_name
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed"
    });
  }
});

// Employees
app.get("/api/employees", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM employees ORDER BY name"
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const {
      id,
      name,
      dept,
      role,
      salary,
      phone,
      email,
      joining_date
    } = req.body;

    await query(
      `INSERT INTO employees
       (id, name, dept, role, salary, phone, email, joining_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        name,
        dept,
        role,
        Number(salary) || 0,
        phone || "",
        email || "",
        joining_date || ""
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/employees/:id", async (req, res) => {
  try {
    const {
      name,
      dept,
      role,
      salary,
      phone,
      email,
      joining_date
    } = req.body;

    await query(
      `UPDATE employees
       SET name=$1,
           dept=$2,
           role=$3,
           salary=$4,
           phone=$5,
           email=$6,
           joining_date=$7
       WHERE id=$8`,
      [
        name,
        dept,
        role,
        Number(salary) || 0,
        phone || "",
        email || "",
        joining_date || "",
        req.params.id
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/employees/:id", async (req, res) => {
  try {
    await query(
      "DELETE FROM employees WHERE id=$1",
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Departments
app.get("/api/departments", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM departments ORDER BY name"
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/departments", async (req, res) => {
  try {
    await query(
      "INSERT INTO departments(name) VALUES($1)",
      [req.body.name]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/departments/:id", async (req, res) => {
  try {
    await query(
      "UPDATE departments SET name=$1 WHERE id=$2",
      [req.body.name, req.params.id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/departments/:id", async (req, res) => {
  try {
    await query(
      "DELETE FROM departments WHERE id=$1",
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Attendance
app.get("/api/attendance", async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, e.name
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.date LIKE $1
       ORDER BY a.date DESC`,
      [`${req.query.month}-%`]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/attendance", async (req, res) => {
  try {
    await query(
      `INSERT INTO attendance(employee_id,date,status)
       VALUES($1,$2,$3)
       ON CONFLICT(employee_id,date)
       DO UPDATE SET status=EXCLUDED.status`,
      [
        req.body.employee_id,
        req.body.date,
        req.body.status
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/attendance/:id", async (req, res) => {
  try {
    await query(
      "DELETE FROM attendance WHERE id=$1",
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
// Reset attendance for a selected month
app.delete("/api/attendance/month/:month", async (req, res) => {
  try {
    const month = req.params.month;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format"
      });
    }

    await query(
      `DELETE FROM attendance
       WHERE date LIKE $1`,
      [`${month}-%`]
    );

    res.json({
      ok: true,
      message: "Attendance reset successfully"
    });

  } catch (error) {
    console.error("Reset attendance error:", error);

    res.status(500).json({
      message: error.message
    });
  }
});

// Leaves
app.get("/api/leaves", async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, e.name
       FROM leaves l
       JOIN employees e ON e.id = l.employee_id
       ORDER BY l.id DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/leaves", async (req, res) => {
  try {
    await query(
      `INSERT INTO leaves
       (employee_id,from_date,to_date,reason,status)
       VALUES($1,$2,$3,$4,$5)`,
      [
        req.body.employee_id,
        req.body.from_date,
        req.body.to_date,
        req.body.reason,
        req.body.status || "Pending"
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/leaves/:id", async (req, res) => {
  try {
    await query(
      `UPDATE leaves
       SET employee_id=$1,
           from_date=$2,
           to_date=$3,
           reason=$4,
           status=$5
       WHERE id=$6`,
      [
        req.body.employee_id,
        req.body.from_date,
        req.body.to_date,
        req.body.reason,
        req.body.status,
        req.params.id
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/leaves/:id", async (req, res) => {
  try {
    await query(
      "DELETE FROM leaves WHERE id=$1",
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Payroll
app.get("/api/payroll", async (req, res) => {
  try {
    const month = req.query.month;

    const employeesResult = await query(
      "SELECT * FROM employees ORDER BY name"
    );

    const employees = employeesResult.rows;

    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5));

    const daysInMonth = new Date(
      year,
      monthNumber,
      0
    ).getDate();

    const payrollData = [];

    for (const employee of employees) {
      const presentResult = await query(
        `SELECT COUNT(*) AS count
         FROM attendance
         WHERE employee_id=$1
         AND date LIKE $2
         AND status='Present'`,
        [employee.id, `${month}-%`]
      );

      const absentResult = await query(
        `SELECT COUNT(*) AS count
         FROM attendance
         WHERE employee_id=$1
         AND date LIKE $2
         AND status='Absent'`,
        [employee.id, `${month}-%`]
      );

      const payrollResult = await query(
        `SELECT *
         FROM payroll
         WHERE employee_id=$1
         AND month=$2`,
        [employee.id, month]
      );

      const payroll = payrollResult.rows[0] || {
        allowance: 0,
        deduction: 0,
        status: "Pending"
      };

      const present = Number(
        presentResult.rows[0].count
      );

      const absent = Number(
        absentResult.rows[0].count
      );

      const basic = Math.round(
        (Number(employee.salary) / daysInMonth) * present
      );

      const allowance = Number(payroll.allowance) || 0;
      const deduction = Number(payroll.deduction) || 0;

      const net = Math.round(
        basic + allowance - deduction
      );

      payrollData.push({
        ...employee,
        days: daysInMonth,
        present,
        absent,
        basic,
        allowance,
        deduction,
        net,
        status: payroll.status,
        month
      });
    }

    res.json(payrollData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/api/payroll/:id", async (req, res) => {
  try {
    const {
      month,
      allowance,
      deduction,
      status
    } = req.body;

    await query(
      `INSERT INTO payroll
       (employee_id,month,allowance,deduction,status)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(employee_id,month)
       DO UPDATE SET
         allowance=EXCLUDED.allowance,
         deduction=EXCLUDED.deduction,
         status=EXCLUDED.status`,
      [
        req.params.id,
        month,
        Number(allowance) || 0,
        Number(deduction) || 0,
        status || "Pending"
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Dashboard
app.get("/api/dashboard", async (req, res) => {
  try {
    const employees = await query(
      "SELECT COUNT(*) AS count FROM employees"
    );

    const departments = await query(
      "SELECT COUNT(*) AS count FROM departments"
    );

    const pendingLeaves = await query(
      `SELECT COUNT(*) AS count
       FROM leaves
       WHERE status='Pending'`
    );
    const presentToday = await query(`
      SELECT COUNT(*) AS count
      FROM attendance
      WHERE date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
      AND status ILIKE '%Present%'
    `);

    res.json({
      employees: Number(employees.rows[0].count),
      departments: Number(departments.rows[0].count),
      pendingLeaves: Number(pendingLeaves.rows[0].count),
      presentToday: Number(presentToday.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`EMS server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();