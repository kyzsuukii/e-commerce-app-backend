import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import bcrypt from "bcrypt";
import { conn } from "../../lib/db";
import { reCaptcha } from "../../lib/reCaptha";

const router = express.Router();

router.get(
  "/me",
  passport.authenticate("jwt", { session: false }),
  (req: any, res) => {
    const { id, email, role } = req.user;
    res.json({ id, email, role });
  },
);

router.put(
  "/change-password",
  reCaptcha,
  passport.authenticate("jwt", { session: false }),
  body("oldPassword").isString().isLength({ min: 8 }),
  body("newPassword").isString().isLength({ min: 8 }),
  async (req: any, res) => {
    const { oldPassword, newPassword } = req.body;
    const { id: userId } = req.user;
    
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }
    
    const db = await conn();
    
    try {
      const [rows]: any = await db.execute(
        "SELECT password FROM auth WHERE id = ? LIMIT 1",
        [userId],
      );

      if (!rows[0]) {
        return res.status(404).json({ errors: [{ msg: "User not found" }] });
      }

      const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ errors: [{ msg: "Incorrect password" }] });
      }

      const salt = await bcrypt.genSalt();
      const hashedNewPassword = await bcrypt.hash(newPassword, salt);

      await db.execute("UPDATE auth SET password = ? WHERE id = ?", [
        hashedNewPassword,
        userId,
      ]);

      res.json({ msg: "Password updated successfully" });
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  },
);

export default router;
