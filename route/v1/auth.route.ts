import express from "express";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";
import { generateJwt } from "../../lib/jwt";
import { reCaptcha } from "../../lib/reCaptha";
import { prisma } from "../../lib/db";

const router = express.Router();

router.post(
  "/register",
  reCaptcha,
  body("email")
    .isEmail()
    .custom(async (value) => {
      const email = await prisma.users.findUnique({
        where: {
          email: value,
        },
        select: {
          email: true,
        },
      });

      if (email) {
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

    try {
      const salt = await bcrypt.genSalt();
      const hashPassword = await bcrypt.hash(password, salt);

      await prisma.users.create({
        data: {
          email,
          password: hashPassword,
        },
      })
      
      res.json({ msg: "Register success" });
    } catch (error) {
      console.error("Error creating user:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await prisma.$disconnect();
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

    try {
      const user = await prisma.users.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
          email: true,
          password: true,
          role: true,
        },
      })

      if (!user) {
        return res.status(404).json({ errors: [{ msg: "Account not found" }] });
      }

      if (!user?.email) {
        return res.status(404).json({ errors: [{ msg: "Email not found" }] });
      }
      const isPasswordMatch = await bcrypt.compare(password, user.password);
      if (!isPasswordMatch) {
        return res.status(401).json({ errors: [{ msg: "Wrong password" }] });
      }

      const payload = {
        id: user?.id,
      };

      const jwt = generateJwt(
        JSON.stringify(payload),
        `${process.env.JWT_SECRET_KEY}`,
      );

      if (user?.role === "ADMIN") {
        res.json({ msg: "Login success", token: jwt, isAdmin: true });
      } else {
        res.json({ msg: "Login success", token: jwt });
      }
    } catch (error) {
      console.error("Error logging in:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await prisma.$disconnect();
    }
  },
);

export default router;
