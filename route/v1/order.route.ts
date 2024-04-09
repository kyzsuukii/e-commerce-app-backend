import express from "express";
import { body, validationResult } from "express-validator";
import passport from "passport";
import { conn } from "../../lib/db";

const route = express.Router();

route.post(
  "/create",
  passport.authenticate("jwt", { session: false }),
  body("totalAmount").isFloat({ min: 0 }).notEmpty(),
  body("address").isString().notEmpty(),
  body("items").isArray({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const customerId = req.user?.id;

    const { totalAmount, address, items } = req.body;

    const db = await conn();

    try {
      await db.beginTransaction();

      const [orderResult]: any = await db.execute(
        "INSERT INTO orders (customer_id, total_amount, address) VALUES (?, ?, ?)",
        [customerId, totalAmount, address]
      );
      const orderId = orderResult.insertId;

      for (const item of items) {
        const { id, quantity, price } = item;

        if (id !== undefined && quantity !== undefined && price !== undefined) {
          await db.execute(
            "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
            [orderId, id, quantity, price]
          );

          await db.execute(
            "UPDATE products SET stock = stock - ? WHERE id = ?",
            [quantity, id]
          );
        } else {
          console.error("One or more item properties are undefined:", item);
        }
      }

      await db.commit();
      return res
        .status(200)
        .json({ msg: "Order created successfully", orderId });
    } catch (error) {
      await db.rollback();
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      await db.end();
    }
  }
);

export default route;
