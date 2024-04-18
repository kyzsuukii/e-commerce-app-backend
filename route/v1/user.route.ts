import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import bcrypt from "bcrypt";
import { reCaptcha } from "../../lib/reCaptha";
import { isAdmin } from "../../lib/utils";
import { prisma } from "../../lib/db";

const router = express.Router();

router.get("/all", passport.authenticate("jwt", { session: false }), isAdmin, async (req, res) => {

  const currentId = req.user?.id;

  try {
    const users = await prisma.users.findMany({
      where: {
        NOT: {
          id: currentId
        }
      }
    });
    return res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
  } finally {
    await prisma.$disconnect();
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
    const id = req.user?.id;

    try {
      const user = await prisma.users.update({
        where: {
          id
        },
        data: {
          address
        }
      })

      res.json({ msg: "Address updated successfully" });
    } catch (error) {
      console.error("Error updating address:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      await prisma.$disconnect();
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
    
    const { id, role } = req.body;

    try {

      await prisma.users.update({
        where: {
          id
        },
        data: {
          role
        }
      })

      return res.status(200).json({ msg: 'User updated successfully' });

    } catch (error) {
      console.error("Error updating user:", error);
      return res
        .status(500)
        .json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await prisma.$disconnect();
    }
  }
);

router.delete('/delete', passport.authenticate('jwt', { session: false }), isAdmin, body('id').isInt().notEmpty(), async (req, res) => {

  const { id } = req.body;

  try {
    await prisma.users.delete({ where: { id } });
    return res.status(200).json({ msg: 'User deleted successfully' });
  } catch (error) {
    console.error("Error updating product:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
  } finally {
    await prisma.$disconnect();
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
  async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const id = req.user?.id;
    
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({ errors: result.array() });
    }
    
    try {
      const users = await prisma.users.findFirst({
        where: {
          id
        },
        select: {
          password: true
        }
      })

      const isMatch = bcrypt.compare(oldPassword, users?.password as string);
      if (!isMatch) {
        return res
          .status(401)
          .json({ errors: [{ msg: "Incorrect password" }] });
      }

      const salt = await bcrypt.genSalt();
      const hashedNewPassword = await bcrypt.hash(newPassword, salt);

      await prisma.users.update({
        where: {
          id
        },
        data: {
          password: hashedNewPassword
        }
      })

      return res.json({ msg: "Password updated successfully" });
    } catch (error) {
      console.error("Error updating password:", error);
      return res.status(500).json({ errors: [{ msg: "Internal Server Error" }] });
    } finally {
      await prisma.$disconnect();
    }
  },
);

export default router;
