import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import bcrypt from "bcrypt";
import { conn } from "../../lib/db";
import { reCaptcha } from "../../lib/reCaptha";
import { isAdmin } from "../../lib/utils";

const router = express.Router();

router.get("/all", passport.authenticate("jwt", { session: false }), isAdmin, async (req, res) => {
  
  const db = await conn();

  try {
    const [users]: any = await db.query('SELECT id, email, role FROM auth WHERE id != ?', [req.user?.id]);
    return res.status(200).json({ users });
  } catch (error) {
    console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
  } finally {
    await db.end();
  }
})

router.patch(
  "/address",
  passport.authenticate("jwt", { session: false }),
  body("address").isString().notEmpty(),
  async (req, res) => {
    const result = validationResult(req);

    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }

    const { address } = req.body;
    const userId = req.user?.id;

    const db = await conn();

    try {
      await db.query("UPDATE auth SET address = ? WHERE id = ?", [
        address,
        userId,
      ]);

      res.json({ msg: "Address updated successfully" });
    } catch (error) {
      console.error("Error updating address:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

router.patch(
  "/role",
  passport.authenticate("jwt", { session: false }),
  isAdmin,
  body("id").isInt().notEmpty(),
  body("role").isString().isIn(["CUSTOMER", "ADMIN"]).notEmpty(),
  async (req, res) => {
    const db = await conn();

    try {
      const { id, role } = req.body;

      const [result]: any = await db.query("UPDATE auth SET role = ? WHERE id = ?", [role, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ errors: [{ msg: "User not found" }] });
      }

      return res.status(200).json({ msg: 'User updated successfully' });

    } catch (error) {
      console.error("Error updating product:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  }
);

router.delete('/delete', passport.authenticate('jwt', { session: false }), isAdmin, body('id').isInt().notEmpty(), async (req, res) => {

  const db = await conn();

  try {
    const { id } = req.body;

    const [result]: any = await db.query('DELETE FROM auth WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ errors: [{ msg: "User not found" }] });
    }

    return res.status(200).json({ msg: 'User deleted successfully' });
  } catch (error) {
    console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
  } finally {
    await db.end();
  }
})

router.get(
  "/me",
  passport.authenticate("jwt", { session: false }),
  (req: any, res) => {
    const { id, email, role, address } = req.user;
    return res.json({ id, email, role, address });
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

      return res.json({ msg: "Password updated successfully" });
    } catch (error) {
      console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await db.end();
    }
  },
);

export default router;
