import express from "express";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";
import { conn } from "../../lib/db";
import { generateJwt } from "../../lib/jwt";
import { reCaptcha } from "../../lib/reCaptha";

const router = express.Router();

router.post(
  "/register",
  reCaptcha,
  body("email")
    .isEmail()
    .custom(async (value) => {
      const db = await conn();
      const [rows]: any = await db.execute(
        "SELECT email FROM auth WHERE email = ? LIMIT 1",
        [value],
      );
      if (rows[0]) {
        throw new Error("Email already exists");
      }
    }),
  body("password").isString().isLength({ min: 8 }),
  body("confirmPassword")
    .isString()
    .isLength({ min: 8 })
    .custom(async (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password do not match");
      }
    }),
  async (req, res) => {
    const { email, password } = req.body;
    
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const db = await conn();

    try {
      const salt = await bcrypt.genSalt();
      const hashPassword = await bcrypt.hash(password, salt);
      
      await db.execute(
        "INSERT INTO auth (email, password) VALUE (?, ?)",
        [email, hashPassword],
      );

      res.json({ msg: "Register success" });
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  },
);

router.post(
  "/login",
  reCaptcha,
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
  async (req, res) => {
    const { email, password } = req.body;

    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const db = await conn();

    try {
      const [rows]: any = await db.execute(
        "SELECT id, password, role FROM auth WHERE email = ? LIMIT 1",
        [email],
      );
      if (!rows[0]) {
        return res.status(404).json({ errors: [{ msg: "Email not found" }] });
      }
      const data = rows[0];
      const isPasswordMatch = await bcrypt.compare(password, data.password);
      if (!isPasswordMatch) {
        return res.status(401).json({ errors: [{ msg: "Wrong password" }] });
      }

      const payload = {
        id: data.id,
      };

      const jwt = generateJwt(
        JSON.stringify(payload),
        `${process.env.JWT_SECRET_KEY}`,
      );

      if (data.role === "ADMIN") {
        res.json({ msg: "Login success", token: jwt, isAdmin: true });
      } else {
        res.json({ msg: "Login success", token: jwt });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  },
);

export default router;
